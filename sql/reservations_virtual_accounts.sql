-- ============================================================================
-- 가상계좌 입금 + 케어매니저 매칭 상태 플로우
-- ============================================================================
-- "reservations" 테이블은 이 프로젝트에 따로 존재하지 않고, 예약/신청은 전부 public.service_applications
-- 하나로 다룹니다(apply.html 이 쓰는 테이블). 이 스크립트는 그 테이블에 가상계좌 입금 단계를 끼워 넣습니다.
--
--   PENDING_PAYMENT  : 신청서 작성 완료, 가상계좌 입금 대기 중 (매니저에게 아직 노출되지 않음)
--   WAITING_MATCHING : 입금 완료, 케어매니저 배정 대기 중 (매니저 "접수 대기" 목록에 노출)
--   MATCHED          : 매니저 매칭 완료
--   COMPLETED        : 동행 완료
--
-- service_applications 는 대시보드에서 만들어진 테이블이라 저장소에 CREATE TABLE 문이 없고
-- (supabase_schema_latest.sql 6번 섹션 참고), status 컬럼도 처음부터 하드 CHECK 없이 자유 텍스트 +
-- 느슨한 매칭 함수(is_pending_application_status 등)로 운영돼 왔습니다. 이미 쌓인 'pending' / 'matched' /
-- 'departed' / 'arrived' / 'completed' / 'guardian_confirmed' 값과 그 한글 변형을 깨지 않기 위해 여기서도
-- 같은 패턴을 따르고 하드 CHECK 제약은 추가하지 않습니다 — 새 상태 4개를 기존 함수들이 인식하도록 넓히고,
-- 신규 신청의 기본값만 'PENDING_PAYMENT'로 바꿉니다. 기존에 이미 들어와 있던 'pending' 행은 그대로
-- "매칭 가능" 상태로 남습니다(소급 변경하지 않음 — 이미 입금 개념 없이 접수된 건이므로).
-- ============================================================================


-- ============================================================================
-- 1) service_applications: 신규 신청 기본 상태를 '가상계좌 입금 대기'로 변경
-- ============================================================================
alter table public.service_applications alter column status set default 'PENDING_PAYMENT';

-- 매니저 "접수 대기" 노출 판정(is_pending_application_status)에 'WAITING_MATCHING' 추가.
-- 'PENDING_PAYMENT'는 이 목록·정규식 어디에도 걸리지 않아 그대로 false(매니저에게 비노출) 처리됩니다.
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in ('', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' then true
    else false
  end
$$;

-- manager_id 가 채워질 때 자동으로 찍는 상태값을 'matched' → 'MATCHED' 로 통일
create or replace function public.sync_application_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and current_user in ('anon', 'authenticated') then
    new.manager_id := null;
    new.accepted_at := null;
    new.schedule_id := null;
  end if;
  if new.manager_id is not null then
    if new.accepted_at is null then
      if tg_op = 'INSERT' then
        new.accepted_at := now();
      elsif old.manager_id is distinct from new.manager_id then
        new.accepted_at := now();
      end if;
    end if;
    if public.is_pending_application_status(new.status) then
      new.status := 'MATCHED';
    end if;
  end if;
  return new;
end $$;

-- accept_service_application() 이 신청을 수락할 때 찍는 상태값도 동일하게 'MATCHED' 로 통일
create or replace function public.accept_service_application(p_application_id uuid, p_scheduled_at timestamptz)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app      public.service_applications;
  v_row      public.care_schedules;
  v_phone_re constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep      int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_manager() then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;
  if p_scheduled_at is null then
    raise exception 'SCHEDULE_TIME_REQUIRED' using errcode = '22004';
  end if;

  update public.service_applications
     set manager_id = auth.uid(), accepted_at = now(), status = 'MATCHED'
   where id = p_application_id
     and manager_id is null
     and public.is_pending_application_status(status)
  returning * into v_app;

  if not found then
    raise exception 'REQUEST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    auth.uid(),
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    p_scheduled_at,
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;

-- confirm_service_application() 은 이미 lower(status) 로 비교하므로 'COMPLETED' 가 들어와도
-- 그대로 'completed' 로 걸러져 수정 없이 동작합니다 (care_schedules 미러링 값인 소문자 'completed' 와도 호환).


-- ============================================================================
-- 2) virtual_accounts : 신청 1건당 가상계좌 1개
-- ============================================================================
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

-- 만료된 미입금 건을 주기적으로 정리/취소 처리할 배치 작업이 조회할 인덱스
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
-- 막기 위해 일부러 authenticated/anon 에 insert/update 권한을 주지 않습니다. 실제로는 은행/PG 웹훅을
-- 처리하는 서버(Supabase service_role 키 사용)가 직접 쓰거나, 아래 confirm_virtual_account_payment() 를
-- service_role 로 호출해야 합니다. 이 프로젝트의 service_role 은 이미 스키마 전역 접근 권한이 있으므로
-- 별도 grant 가 필요 없습니다.

-- 입금 확인 처리: 가상계좌를 입금완료로 바꾸고, 아직 PENDING_PAYMENT 인 신청을 WAITING_MATCHING 으로
-- 한 번에 전환합니다(이미 매칭/완료가 진행된 신청을 되돌리지 않도록 조건에 PENDING_PAYMENT 를 명시).
create or replace function public.confirm_virtual_account_payment(p_virtual_account_id uuid)
returns public.virtual_accounts
language plpgsql security definer set search_path = public as $$
declare
  v_row public.virtual_accounts;
begin
  update public.virtual_accounts
     set is_paid = true
   where id = p_virtual_account_id
     and is_paid = false
     and expired_at > now()
  returning * into v_row;

  if not found then
    raise exception 'VIRTUAL_ACCOUNT_UNAVAILABLE' using errcode = 'P0002';
  end if;

  update public.service_applications
     set status = 'WAITING_MATCHING'
   where id = v_row.application_id
     and status = 'PENDING_PAYMENT';

  return v_row;
end $$;

-- 일반 로그인 사용자·비로그인 모두 호출 금지(입금 확인은 은행/PG 웹훅만 수행) — service_role 만 호출 가능.
revoke all on function public.confirm_virtual_account_payment(uuid) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
