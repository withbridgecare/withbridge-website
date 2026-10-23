-- ============================================================================
-- 케어 중단/현장 이슈 처리 — 부분 환불(출장비 차감) + 패키지 회차 조정 + 현장 이슈 접수 + 처리 이력
--
--   서류 미비, 어르신 진료 거부, 보호자 사정 등으로 현장에서 케어가 중단됐을 때:
--     1) 일반 결제 건 : 관리자가 출장비(위약금)만 남기고 나머지를 PortOne으로 부분 취소합니다
--        (supabase/functions/cancel-payment 가 PortOne API 를 호출한 뒤에만 이 파일의
--        admin_apply_partial_refund() 를 호출 — 돈이 실제로 돌아간 뒤에만 DB를 바꾸는, 이 프로젝트
--        전체에 깔린 원칙과 동일합니다).
--     2) 패키지로 접수된 건 : PortOne 결제 자체가 없으므로(이미 선결제된 회차를 차감했을 뿐) 그
--        회차를 되돌려주는 것으로 처리합니다 — admin_adjust_package_session() 이 user_packages 를
--        직접 조정합니다(PortOne 호출 없음).
--   두 경우 모두 care_schedules 를 'completed' 로 닫아(진행 중 목록에서 제거) 70:30 정산 집계가
--   남은 값(출장비 또는 0.5회분 가치)만으로 다시 계산되게 하고, admin_care_adjustments 테이블에
--   사유 메모와 함께 이력을 남깁니다.
--
--   보호자 쪽 "현장 이슈 발생/긴급 문의"(mypage.html)는 care_issue_reports 에 접수만 하고(실시간
--   알림톡 연동은 카카오 비즈니스 계정이 없어 이 작업에서는 구현하지 않음 — TODO 로 표시), 관리자
--   콘솔에 새 "현장 이슈 접수" 카드로 노출해 운영자가 확인하고 위 1)/2) 처리로 이어가게 합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/payment_confirmation_functions.sql(expected_service_price()) →
--             sql/matching_expiry_auto_refund.sql(payment_status/refunded_at 컬럼) →
--             sql/manager_settlement_70_30.sql(payment_amount/manager_payout + 70:30 트리거) →
--             sql/user_packages_system.sql(user_packages/package_id/is_package_used) → 이 파일.
-- ============================================================================


-- ============================================================================
-- 1) service_applications 확장 — 부분 환불 금액/사유
-- ============================================================================
alter table public.service_applications add column if not exists refund_amount integer;
alter table public.service_applications add column if not exists refund_memo   text;
-- refunded_at, payment_status 는 sql/matching_expiry_auto_refund.sql 에서 이미 추가되어 있습니다
-- (이 파일에서는 payment_status/status 에 'PARTIALLY_REFUNDED' 값만 새로 쓰기 시작합니다 — 두 컬럼
-- 모두 하드 CHECK 제약이 없는 자유 텍스트라 스키마 변경 없이 바로 쓸 수 있습니다).

alter table public.service_applications drop constraint if exists service_applications_refund_amount_check;
alter table public.service_applications add constraint service_applications_refund_amount_check
  check (refund_amount is null or refund_amount >= 0);


-- ============================================================================
-- 2) user_packages.remaining_count/total_count — 0.5회 단위 조정을 지원하기 위해 numeric 으로 확장
--    (지금까지는 정수만 허용했습니다 — sql/user_packages_system.sql)
--
--    user_packages_sync_status 트리거(sql/user_packages_system.sql)가 "update of remaining_count" 로
--    그 컬럼에 의존하고 있어, Postgres는 ALTER COLUMN ... TYPE 을 바로 허용하지 않습니다
--    (ERROR 0A000: cannot alter type of column used in a trigger definition). 그래서 트리거를 먼저
--    지우고, 두 컬럼 타입을 바꾼 뒤, 같은 정의로 다시 만듭니다 — sql/user_packages_system.sql 의
--    원본과 정확히 같은 트리거/함수라 동작은 전혀 바뀌지 않습니다.
-- ============================================================================
drop trigger if exists user_packages_sync_status on public.user_packages;

alter table public.user_packages alter column total_count     type numeric(5,1) using total_count::numeric(5,1);
alter table public.user_packages alter column remaining_count type numeric(5,1) using remaining_count::numeric(5,1);
-- 기존 체크 제약(총 횟수>0, 잔여>=0, 잔여<=총)은 컬럼 타입과 무관하게 그대로 유효하므로 다시 만들
-- 필요가 없습니다.

create trigger user_packages_sync_status
  before insert or update of remaining_count on public.user_packages
  for each row execute function public.sync_user_package_status();


-- ============================================================================
-- 3) 처리 이력 — 모든 부분 환불/패키지 조정에 사유 메모와 함께 기록합니다(요구사항 3).
-- ============================================================================
create table if not exists public.admin_care_adjustments (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.service_applications(id) on delete set null,
  schedule_id    uuid references public.care_schedules(id) on delete set null,
  admin_id       uuid references public.profiles(id),
  action_type    text not null check (action_type in ('partial_refund', 'package_restore', 'package_partial_deduct')),
  amount         numeric(10,2) not null, -- 환불 건은 원화 금액, 패키지 건은 회차(1 또는 0.5)
  memo           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists admin_care_adjustments_application_idx
  on public.admin_care_adjustments (application_id);

alter table public.admin_care_adjustments enable row level security;

drop policy if exists admin_care_adjustments_select_admin on public.admin_care_adjustments;
create policy admin_care_adjustments_select_admin on public.admin_care_adjustments
  for select to authenticated using (public.is_admin());

-- insert/update/delete 는 전부 아래 SECURITY DEFINER 함수를 통해서만 — 관리자도 이 표를 직접 손으로
-- 고치지 못하게 해 이력이 사후에 조작되지 않도록 합니다.
revoke insert, update, delete on public.admin_care_adjustments from anon, authenticated;
grant  select on public.admin_care_adjustments to authenticated;
revoke select on public.admin_care_adjustments from anon;


-- ============================================================================
-- 4) 일반 결제 건 — 부분 취소(출장비 차감 환불) 반영
--    supabase/functions/cancel-payment 가 PortOne 부분 취소 API 호출에 성공한 뒤에만 호출합니다.
--    p_refund_amount : 보호자에게 실제로 돌아간 금액(PortOne 취소 금액)
--    p_retained_amount : 회사/매니저가 남긴 금액(출장비 등) — care_schedules.payment_amount 에
--      반영되어 70:30 트리거가 그 금액만으로 manager_payout/platform_fee 를 다시 계산합니다.
-- ============================================================================
drop function if exists public.admin_apply_partial_refund(uuid, integer, integer, text);

create or replace function public.admin_apply_partial_refund(
  p_schedule_id     uuid,
  p_refund_amount   integer,
  p_retained_amount integer,
  p_memo            text
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row   public.care_schedules;
  v_next  text;
  v_admin uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_refund_amount is null or p_refund_amount < 0 then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023';
  end if;
  if p_retained_amount is null or p_retained_amount < 0 then
    raise exception 'INVALID_RETAINED_AMOUNT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_memo), '') = '' then
    raise exception 'MEMO_REQUIRED' using errcode = '22004';
  end if;

  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status = 'completed' then
    raise exception 'SCHEDULE_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  v_admin := auth.uid();

  -- 결제액을 "실제로 남긴 금액(출장비 등)"으로 맞춥니다 — 트리거(compute_manager_settlement_split,
  -- sql/manager_settlement_70_30.sql)가 바로 70%/30% 를 다시 계산합니다.
  update public.care_schedules
     set payment_amount = p_retained_amount
   where id = p_schedule_id
  returning * into v_row;

  -- 남은 단계를 순서대로 밀어 'completed' 로 닫습니다(admin_force_complete_care() 와 같은 패턴,
  -- sql/admin_care_actions.sql) — 중단된 케어를 '진행 중' 목록에 남기지 않고 정산 집계에 포함시킵니다.
  while v_row.status is distinct from 'completed' loop
    v_next := case v_row.status
      when 'pending'        then 'assigned'
      when 'assigned'       then 'departed'
      when 'departed'       then 'arrived'
      when 'arrived'        then 'treatment_done'
      when 'treatment_done' then 'returning'
      when 'returning'      then 'completed'
      else null
    end;
    if v_next is null then
      raise exception 'CANNOT_CLOSE_FROM_STATUS' using errcode = 'P0001';
    end if;
    update public.care_schedules set status = v_next where id = v_row.id returning * into v_row;
  end loop;

  if v_row.application_id is not null then
    update public.service_applications
       set status = 'PARTIALLY_REFUNDED',
           payment_status = 'PARTIALLY_REFUNDED',
           refund_amount = p_refund_amount,
           refund_memo = p_memo,
           refunded_at = now()
     where id = v_row.application_id;
  end if;

  insert into public.admin_care_adjustments (application_id, schedule_id, admin_id, action_type, amount, memo)
  values (v_row.application_id, p_schedule_id, v_admin, 'partial_refund', p_refund_amount, p_memo);

  return v_row;
end $$;

revoke all on function public.admin_apply_partial_refund(uuid, integer, integer, text) from public, anon, authenticated;


-- ============================================================================
-- 5) 패키지 결제 건 — 회차 원복(+1회) 또는 0.5회 부분 차감 처리
--    PortOne 결제가 없는 건이라(이미 선결제된 회차를 차감했을 뿐) 외부 API 호출 없이 바로 처리합니다.
--    p_restore_amount 는 반드시 0.5 또는 1 이어야 합니다:
--      1   : 회차를 완전히 돌려줍니다(아무 서비스도 제공되지 못한 경우) — care_schedules.payment_amount
--            를 0으로 맞춰 이 건에 대한 매니저 정산금도 0이 됩니다.
--      0.5 : 절반만 돌려줍니다(일부라도 현장에 나가 대응한 경우) — care_schedules.payment_amount 를
--            서비스 정가의 절반으로 맞춰, 매니저가 그 절반에 대한 70% 만큼은 정산받습니다.
-- ============================================================================
drop function if exists public.admin_adjust_package_session(uuid, numeric, text);

create or replace function public.admin_adjust_package_session(
  p_application_id uuid,
  p_restore_amount numeric,
  p_memo text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_app          public.service_applications;
  v_pkg          public.user_packages;
  v_schedule_id  uuid;
  v_schedule     public.care_schedules;
  v_next         text;
  v_full_price   integer;
  v_new_payment  integer;
  v_admin        uuid;
  v_action       text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_restore_amount is null or p_restore_amount not in (0.5, 1) then
    raise exception 'INVALID_RESTORE_AMOUNT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_memo), '') = '' then
    raise exception 'MEMO_REQUIRED' using errcode = '22004';
  end if;

  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_app.is_package_used or v_app.package_id is null then
    raise exception 'NOT_A_PACKAGE_BOOKING' using errcode = 'P0001';
  end if;

  v_admin := auth.uid();
  v_action := case when p_restore_amount = 1 then 'package_restore' else 'package_partial_deduct' end;

  update public.user_packages
     set remaining_count = least(remaining_count + p_restore_amount, total_count)
   where id = v_app.package_id
  returning * into v_pkg;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select id into v_schedule_id from public.care_schedules where application_id = p_application_id;

  if v_schedule_id is not null then
    v_full_price := coalesce(public.expected_service_price(v_app.service_type), 0);
    v_new_payment := case when p_restore_amount = 1 then 0 else round(v_full_price * 0.5)::integer end;

    update public.care_schedules set payment_amount = v_new_payment where id = v_schedule_id
    returning * into v_schedule;

    while v_schedule.status is distinct from 'completed' loop
      v_next := case v_schedule.status
        when 'pending'        then 'assigned'
        when 'assigned'       then 'departed'
        when 'departed'       then 'arrived'
        when 'arrived'        then 'treatment_done'
        when 'treatment_done' then 'returning'
        when 'returning'      then 'completed'
        else null
      end;
      if v_next is null then
        raise exception 'CANNOT_CLOSE_FROM_STATUS' using errcode = 'P0001';
      end if;
      update public.care_schedules set status = v_next where id = v_schedule.id returning * into v_schedule;
    end loop;
  end if;

  update public.service_applications
     set status = 'PARTIALLY_REFUNDED',
         refund_memo = p_memo,
         refunded_at = now()
   where id = p_application_id;

  insert into public.admin_care_adjustments (application_id, schedule_id, admin_id, action_type, amount, memo)
  values (p_application_id, v_schedule_id, v_admin, v_action, p_restore_amount, p_memo);

  return v_pkg;
end $$;

revoke all on function public.admin_adjust_package_session(uuid, numeric, text) from public, anon, authenticated;
grant  execute on function public.admin_adjust_package_session(uuid, numeric, text) to authenticated;


-- ============================================================================
-- 6) 현장 이슈 접수 (mypage.html '현장 이슈 발생 / 긴급 문의' 버튼)
--    실시간 알림(카카오 알림톡 등)은 비즈니스 발신프로필·템플릿 승인이 필요한 외부 연동이라 이번
--    작업에서는 구현하지 않습니다 — 대신 관리자 콘솔에 즉시 노출되는 조회 큐로 받습니다(아래 8번).
-- ============================================================================
create table if not exists public.care_issue_reports (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.service_applications(id) on delete cascade,
  schedule_id    uuid references public.care_schedules(id) on delete set null,
  user_id        uuid references public.profiles(id),
  issue_type     text not null check (issue_type in ('documents_missing', 'health_refusal', 'other')),
  detail         text,
  status         text not null default 'open' check (status in ('open', 'resolved')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists care_issue_reports_open_idx
  on public.care_issue_reports (created_at) where status = 'open';

alter table public.care_issue_reports enable row level security;

-- 보호자: 본인이 접수한 이슈만 조회, 본인 신청에 대해서만 insert(허위로 남의 신청에 이슈를 걸 수 없게)
drop policy if exists care_issue_reports_select_own on public.care_issue_reports;
create policy care_issue_reports_select_own on public.care_issue_reports
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.service_applications a
      where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
    )
  );

drop policy if exists care_issue_reports_insert_own on public.care_issue_reports;
create policy care_issue_reports_insert_own on public.care_issue_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.service_applications a
      where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
    )
  );

-- 관리자: 전체 조회 + 처리 완료 표시
drop policy if exists care_issue_reports_select_admin on public.care_issue_reports;
create policy care_issue_reports_select_admin on public.care_issue_reports
  for select to authenticated using (public.is_admin());

grant select, insert on public.care_issue_reports to authenticated;
revoke select, insert on public.care_issue_reports from anon;


-- ----------------------------------------------------------------------------
-- 7) 관리자: 현장 이슈 처리 완료 표시
-- ----------------------------------------------------------------------------
create or replace function public.admin_resolve_care_issue(p_issue_id uuid)
returns public.care_issue_reports
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_issue_reports;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.care_issue_reports
     set status = 'resolved', resolved_at = now()
   where id = p_issue_id
     and status = 'open'
  returning * into v_row;

  if not found then
    select * into v_row from public.care_issue_reports where id = p_issue_id;
    if v_row.id is null then
      raise exception 'ISSUE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_row;
end $$;

revoke all on function public.admin_resolve_care_issue(uuid) from public, anon;
grant  execute on function public.admin_resolve_care_issue(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
