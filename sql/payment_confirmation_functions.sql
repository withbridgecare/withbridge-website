-- ============================================================================
-- 결제 승인 / 가상계좌 입금 확인 / 만료·취소 처리 (PortOne V2 연동)
--   supabase/functions/issue-virtual-account, portone-webhook 이 PortOne API를 서버에서 재조회한
--   뒤 호출하는 공용 DB 함수들입니다. 함수 이름 자체는 특정 PG사를 가리키지 않게 지어서(마크/취소 전환은
--   어느 PG를 쓰더라도 같은 의미이므로), 나중에 다른 결제대행사로 바꾸더라도 이 파일은 그대로 재사용할 수
--   있습니다.
--
--   service_applications.status 4종 표준값은 그대로입니다(sql/service_application_status_standardization.sql):
--     PAYMENT_PENDING(결제/입금 대기) → MATCHING_PENDING(배정 신청 대기) → MATCHED(배정 완료)
--                                    ↘ CANCELLED(결제 취소/미입금 만료/사용자 취소)
--
--   흐름:
--     1) apply.html 저장 시 기본값 PAYMENT_PENDING (이미 적용됨, 이 스크립트에서 다시 확정만 함)
--     2) issue-virtual-account: 결제창 성공 후 PortOne API 재조회 결과가 'PAID' 면 바로 MATCHING_PENDING,
--                                'VIRTUAL_ACCOUNT_ISSUED' 면 virtual_accounts 에 계좌 정보만 저장(상태는
--                                PAYMENT_PENDING 유지 — 입금 전이므로)
--     3) portone-webhook: PortOne 웹훅 수신 시 재조회한 상태가 'PAID' 면 MATCHING_PENDING,
--     4)                  'CANCELLED'/'FAILED' 면 CANCELLED (가상계좌 입금 기한 만료 시 PortOne이
--                          자동으로 해당 결제를 취소 처리하고 이 상태로 웹훅을 보냅니다)
--     +) cancel_expired_virtual_accounts(): 웹훅이 오지 않은 채로 입금 기한이 지난 건을 주기적으로 쓸어서
--                          CANCELLED 처리 (pg_cron 스케줄 — 파일 맨 아래 참고)
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/service_application_status_standardization.sql
--             → 이 파일. 전부 create or replace / create table·add column if not exists 기반이라
--             여러 번 실행해도 안전하고, sql/reservations_virtual_accounts.sql 을 아직 실행하지 않아
--             public.virtual_accounts 테이블이 없는 환경에서도 이 파일 혼자 실행할 수 있습니다(0번 참고).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) virtual_accounts 테이블 (신청 1건당 가상계좌 1개) — 아직 없으면 생성합니다.
--    sql/reservations_virtual_accounts.sql 이 만드는 정의와 완전히 동일합니다(이미 그 파일을 실행해
--    테이블이 있는 환경에서는 create table if not exists 라 그냥 아무 일도 하지 않습니다).
-- ----------------------------------------------------------------------------
create table if not exists public.virtual_accounts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.service_applications(id) on delete cascade,
  bank_name      text not null,
  account_number text not null,
  amount         integer not null check (amount > 0),
  expired_at     timestamptz not null default (now() + interval '2 hours'),
  is_paid        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 만료된 미입금 건을 주기적으로 정리/취소 처리할 배치 작업(6번 cancel_expired_virtual_accounts)이 조회할 인덱스
create index if not exists virtual_accounts_unpaid_expiry_idx
  on public.virtual_accounts (expired_at) where is_paid = false;

alter table public.virtual_accounts enable row level security;

-- 보호자: 본인 신청(service_applications_select_own 과 동일한 소유권 기준)에 딸린 가상계좌만 조회
drop policy if exists virtual_accounts_select_own on public.virtual_accounts;
create policy virtual_accounts_select_own on public.virtual_accounts
  for select to authenticated using (
    exists (
      select 1 from public.service_applications a
      where a.id = virtual_accounts.application_id
        and (
          a.user_id = auth.uid()
          or (a.applicant_email is not null and lower(btrim(a.applicant_email)) = public.my_verified_email())
        )
    )
  );

grant select on public.virtual_accounts to authenticated;
revoke select on public.virtual_accounts from anon;

-- 계좌 발급(insert)과 입금 확인(update)은 클라이언트가 직접 할 수 없습니다 — 금액 조작·허위 입금 확인을
-- 막기 위해 일부러 authenticated/anon 에 insert/update 권한을 주지 않습니다. issue-virtual-account/
-- portone-webhook Edge Function 이 service_role(admin 클라이언트)로 직접 쓰거나,
-- mark_payment_matching_pending() 등 SECURITY DEFINER 함수를 통해서만 바뀝니다 — service_role 은
-- 그랜트와 무관하게 항상 접근 가능합니다.


-- ----------------------------------------------------------------------------
-- 1) 신규 신청 기본 상태 재확인 (요구사항 1 — 이미 적용돼 있으면 no-op)
-- ----------------------------------------------------------------------------
alter table public.service_applications alter column status set default 'PAYMENT_PENDING';


-- ----------------------------------------------------------------------------
-- 2) virtual_accounts: PG사 결제키 보관 컬럼 추가 (고객센터 문의 시 PortOne 콘솔에서 바로 찾기 위함 —
--    조회/상태 전환 자체는 모두 application_id 로만 하므로 이 컬럼이 없어도 기능은 동작합니다).
--    이전에 sql/toss_payments_integration.sql(삭제됨)을 실행해 toss_payment_key 컬럼이 이미 생겼다면
--    같이 정리합니다 — PortOne 에서는 paymentId 가 application_id 와 같아 별도 보관이 불필요합니다.
-- ----------------------------------------------------------------------------
alter table public.virtual_accounts drop column if exists toss_payment_key;
alter table public.virtual_accounts add column if not exists pg_payment_ref text;


-- ----------------------------------------------------------------------------
-- 3) 더 이상 쓰지 않는 예전 함수 제거 (이름이 이 파일의 범용 함수들과 겹치지 않도록 정리)
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_virtual_account_payment(uuid);


-- ----------------------------------------------------------------------------
-- 4) 결제 승인/입금 완료 시 공통으로 쓰는 상태 전환 — PAYMENT_PENDING 인 건만 MATCHING_PENDING 으로
--    전환합니다(이미 MATCHING_PENDING/MATCHED 로 넘어간 건을 되돌리지 않도록 조건에 PAYMENT_PENDING 명시 —
--    issue-virtual-account 와 portone-webhook 이 같은 건을 거의 동시에 처리해도 멱등합니다). 가상계좌로
--    입금된 경우라면 virtual_accounts.is_paid 도 함께 true 로 맞춥니다(없으면 — 즉시결제 수단이면 — 조용히
--    넘어갑니다). 서버(service_role, Edge Function)만 호출합니다 — 클라이언트 role에는 권한을 주지
--    않습니다(revoke all, service_role 은 그랜트와 무관하게 항상 호출 가능).
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(p_application_id uuid, p_payment_key text default null)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    -- 이미 MATCHING_PENDING/MATCHED 로 넘어간 건에 대한 재호출(webhook 중복 전송, confirm 과 webhook 이
    -- 거의 동시에 들어온 경우 등)은 에러가 아니라 '현재 행 그대로' 조용히 돌려줍니다 — 멱등 처리.
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) 취소/만료 — PAYMENT_PENDING 인 건만 CANCELLED 로 전환(이미 MATCHING_PENDING/MATCHED 로 넘어간 건은
--    취소 웹훅이 뒤늦게 와도 건드리지 않습니다 — 입금 후 이미 배정 절차가 시작된 건을 취소 웹훅 재전송으로
--    되돌리는 사고를 막기 위함).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_unpaid_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  update public.service_applications
     set status = 'CANCELLED'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_app;
end $$;

revoke all on function public.cancel_unpaid_application(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6) 배치 정리 — PortOne 웹훅이 끝내 오지 않은 채로 가상계좌 입금 기한이 지난 PAYMENT_PENDING 건을
--    쓸어서 CANCELLED 처리합니다. pg_cron 이 주기적으로 호출합니다(맨 아래 스케줄 참고).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_expired_virtual_accounts()
returns setof public.service_applications
language sql security definer set search_path = public as $$
  update public.service_applications a
     set status = 'CANCELLED'
   where a.status = 'PAYMENT_PENDING'
     and exists (
       select 1 from public.virtual_accounts v
        where v.application_id = a.id
          and v.is_paid = false
          and v.expired_at < now()
     )
  returning a.*;
$$;

revoke all on function public.cancel_expired_virtual_accounts() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7) pg_cron 스케줄 — 10분마다 만료 건 정리. pg_cron 확장이 이 프로젝트 플랜에서 꺼져 있으면 이
--    create extension 문에서 에러가 날 수 있습니다: 그 경우 이 블록만 건너뛰고(요구사항 1~4의 나머지는
--    모두 pg_cron 과 무관하게 동작합니다), Supabase 대시보드 → Database → Extensions 에서 pg_cron 을
--    켠 뒤 이 블록만 다시 실행하거나, Database → Cron Jobs 화면에서 같은 스케줄을 직접 등록하세요.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'cancel-expired-virtual-accounts';
select cron.schedule(
  'cancel-expired-virtual-accounts',
  '*/10 * * * *',
  $$select public.cancel_expired_virtual_accounts();$$
);


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
