-- ============================================================================
-- service_applications 취소/환불 → care_schedules 상태 자동 동기화
--
--   지금까지 취소/환불은 오직 service_applications.status('CANCELLED'/'EXPIRED_CANCELLED')·
--   payment_status('REFUNDED')에만 기록되고, 연결된 care_schedules 행은 그 어떤 기존 경로
--   (guardian_cancel_application.sql, payment_confirmation_functions.sql,
--   admin.js cancelApplication/admin_mark_refund_completed 등)로도 전혀 건드려지지 않았습니다 —
--   그래서 "케어가 이미 completed 로 끝난 뒤 나중에 취소/환불된" 건은 care_schedules.status 가
--   영원히 'completed' 로 남아 정산(admin_manager_monthly_settlements)에 계속 잘못 집계됐습니다
--   (sql/admin_settlement_fixes_v3.sql 에서 service_applications 조인으로 임시 방어했던 바로 그 증상).
--
--   이 파일은 그 임시 방어를 "원천 차단"으로 바꿉니다 — service_applications 가 취소/환불로 바뀌는
--   순간, 연결된 care_schedules 를 자동으로 'cancelled' 로 동기화합니다:
--     1) care_schedules.status CHECK 제약에 'cancelled' 추가
--     2) enforce_care_status_flow() 가 (어떤 단계에서든) → 'cancelled' 전환을 허용하도록 확장
--        ('cancelled' 에서 다른 상태로는 못 돌아감 — 'completed' 와 같은 종착 상태)
--     3) care_schedules → service_applications 역방향 미러 트리거(sync_application_status_from_schedule,
--        sql/supabase_schema_latest.sql)가, 신청서가 이미 CANCELLED/EXPIRED_CANCELLED/
--        PARTIALLY_REFUNDED 로 확정된 뒤에는 더 이상 그 값을 덮어쓰지 않도록 가드 추가
--        (바로 아래 4번이 care_schedules.status 를 'cancelled' 로 바꾸면 이 역방향 트리거가
--        다시 호출되는데, 가드가 없으면 방금 세팅한 'CANCELLED'/'PARTIALLY_REFUNDED' 를 소문자
--        'cancelled' 로 즉시 덮어써 버립니다)
--     4) 새 트리거(service_applications → care_schedules): status 가 CANCELLED/EXPIRED_CANCELLED 로
--        바뀌거나 payment_status 가 REFUNDED 로 바뀌면, 연결된 care_schedules 를 'cancelled' 로 바꾸고
--        payment_amount 를 0으로 맞춥니다(70:30 트리거가 manager_payout/platform_fee 도 즉시 0으로
--        재계산 — sql/manager_settlement_70_30.sql). PARTIALLY_REFUNDED(부분 환불)는 일부러 건드리지
--        않습니다 — sql/care_interruption_refund_system.sql 의 admin_apply_partial_refund() 가 이미
--        payment_amount 를 "남긴 금액"으로 정확히 맞춰 둔 뒤 completed 로 닫으므로, 그 경로를 되돌리면
--        안 됩니다.
--     5) 이미 쌓여 있는 "completed 인데 신청서는 취소/환불된" 기존 행을 한 번 정리(백필)합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/manager_settlement_70_30.sql →
--             sql/matching_expiry_auto_refund.sql → sql/care_interruption_refund_system.sql →
--             sql/admin_settlement_fixes_v3.sql → 이 파일.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) care_schedules.status CHECK 제약에 'cancelled' 추가
-- ----------------------------------------------------------------------------
alter table public.care_schedules drop constraint if exists care_schedules_status_check;
alter table public.care_schedules add constraint care_schedules_status_check
  check (status in ('pending', 'assigned', 'departed', 'arrived', 'treatment_done', 'returning', 'completed', 'cancelled'));


-- ----------------------------------------------------------------------------
-- 2) enforce_care_status_flow() — 5단계 순서 강제는 그대로 두고, "어느 단계에서든 → cancelled" 전환만
--    추가로 허용합니다. 'cancelled' 에서 다른 상태로 다시 바꾸는 것은 허용하지 않습니다(완료처럼
--    종착 상태로 취급).
-- ----------------------------------------------------------------------------
create or replace function public.enforce_care_status_flow() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'        and new.status = 'assigned')
            or (old.status = 'assigned'       and new.status = 'departed')
            or (old.status = 'departed'       and new.status = 'arrived')
            or (old.status = 'arrived'        and new.status = 'treatment_done')
            or (old.status = 'treatment_done' and new.status = 'returning')
            or (old.status = 'returning'      and new.status = 'completed')
            or (old.status <> 'cancelled'     and new.status = 'cancelled')) then
      raise exception 'invalid status transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

-- 트리거 자체(care_schedules_status_flow)는 sql/supabase_schema_latest.sql 에 이미 만들어져 있고
-- 함수만 create or replace 하면 됩니다 — 다시 만들 필요 없습니다.


-- ----------------------------------------------------------------------------
-- 3) sync_application_status_from_schedule() 보강 — 신청서가 이미 취소/환불로 "확정"된 뒤에는
--    care_schedules 쪽 상태 변화(바로 아래 4번이 'cancelled' 로 바꾸는 것 포함)가 그 확정값을
--    다시 덮어쓰지 못하게 막습니다. 평소(정상 진행 중)에는 전혀 영향이 없습니다 — 이 세 값은
--    cancel/refund 전용 함수들만 쓰고, care_schedules 진행에 따라 자연스럽게 생기는 값이 아닙니다.
-- ----------------------------------------------------------------------------
create or replace function public.sync_application_status_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_current_status text;
begin
  if new.application_id is not null and new.status is distinct from old.status then
    select status into v_current_status from public.service_applications where id = new.application_id;
    if v_current_status in ('CANCELLED', 'EXPIRED_CANCELLED', 'PARTIALLY_REFUNDED') then
      return new;
    end if;
    update public.service_applications
       set status = new.status
     where id = new.application_id
       and status is distinct from new.status;
  end if;
  return new;
end;
$$;
-- 트리거(trg_sync_application_status)도 이미 존재하므로 다시 만들 필요 없습니다.


-- ----------------------------------------------------------------------------
-- 4) service_applications → care_schedules 동기화(새 트리거) — 취소/전액환불만 대상입니다.
--    PARTIALLY_REFUNDED 는 admin_apply_partial_refund() 가 이미 올바르게 처리하므로 건드리지 않습니다.
-- ----------------------------------------------------------------------------
create or replace function public.sync_care_schedule_on_cancellation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.status in ('CANCELLED', 'EXPIRED_CANCELLED') or new.payment_status = 'REFUNDED')
     and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    update public.care_schedules
       set status = 'cancelled',
           payment_amount = 0
     where application_id = new.id
       and status is distinct from 'cancelled';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_care_schedule_on_cancellation on public.service_applications;
create trigger trg_sync_care_schedule_on_cancellation
  after update of status, payment_status on public.service_applications
  for each row execute function public.sync_care_schedule_on_cancellation();


-- ----------------------------------------------------------------------------
-- 5) 백필 — 이미 'completed' 로 남아 있는데 신청서는 취소/전액환불인 기존 행을 한 번 정리합니다
--    (재실행해도 안전 — 이미 'cancelled' 인 행은 where 조건에서 자연히 빠집니다).
-- ----------------------------------------------------------------------------
update public.care_schedules cs
   set status = 'cancelled',
       payment_amount = 0
 where cs.status = 'completed'
   and exists (
     select 1 from public.service_applications sa
      where sa.id = cs.application_id
        and (sa.status in ('CANCELLED', 'EXPIRED_CANCELLED') or sa.payment_status = 'REFUNDED')
   );


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
