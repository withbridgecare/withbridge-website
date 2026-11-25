-- ============================================================================
-- 어드민 '케어 중단 · 부분 취소/환불'이 안 되던 문제 수정
--
--   화면: 어드민 → 배정 완료 케어 현황 → [중단/부분 취소] → 출장비 입력 → 부분 취소
--   흐름: cancel-payment Edge Function → PortOne 부분 취소 → admin_apply_partial_refund() 로 DB 반영
--
--   원인 1) admin_apply_partial_refund() 가 is_admin()(= 로그인한 관리자 auth.uid())만 허용하는데,
--           cancel-payment 는 관리자 확인을 마친 뒤 service_role 키로 이 함수를 부릅니다. service_role 에는
--           auth.uid() 가 없어 항상 NOT_ADMIN 으로 실패 → PortOne 환불은 이미 됐는데 DB 는 그대로(케어가
--           '진행 중'으로 남고 신청서에 환불 기록이 안 남음).
--           → service_role 호출도 허용하고, 처리한 관리자 id 는 p_admin_id 로 받아 이력에 남깁니다.
--
--   원인 2) 매니저가 텔레그램 [동행 수락하기]로 수락한 건(accept_service_application_as)은
--           care_schedules.payment_amount 를 채우지 않아 0원으로 저장됩니다(마이페이지 수락·관리자 배정은
--           정가로 채움). 그래서 부분 취소 팝업에 '현재 결제액 0원'이 떠 진행할 수 없었습니다.
--           → 텔레그램 수락도 다른 경로와 같은 기준(서비스 정가)으로 payment_amount 를 채우고,
--             이미 0원으로 저장된 진행 중 일정은 같은 기준으로 보정합니다.
--
--   함께 배포: supabase functions deploy cancel-payment
--             (실제 환불 가능액을 신청서 결제액 기준으로 다시 확인하고, PortOne 거절 사유를 화면에 전달)
--
--   개발 프로젝트에서 먼저 실행해 확인한 뒤 운영 프로젝트 SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--   데이터: 3) 보정 UPDATE 가 진행 중(완료 전)인 일정 중 payment_amount = 0 인 결제 건만 바꿉니다.
--           실행 전에 맨 아래 [미리 보기]로 대상을 확인하세요.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) admin_apply_partial_refund — service_role(cancel-payment) 호출 허용 + 처리 관리자 기록
--    (기존 4개 인자 호출도 그대로 동작하도록 p_admin_id 는 기본값 null)
-- ----------------------------------------------------------------------------
drop function if exists public.admin_apply_partial_refund(uuid, integer, integer, text);

create or replace function public.admin_apply_partial_refund(
  p_schedule_id     uuid,
  p_refund_amount   integer,
  p_retained_amount integer,
  p_memo            text,
  p_admin_id        uuid default null
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row   public.care_schedules;
  v_next  text;
  v_admin uuid;
begin
  -- 관리자 본인 호출 또는, 관리자 확인을 이미 마친 Edge Function(service_role) 호출만 허용
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
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

  v_admin := coalesce(p_admin_id, auth.uid());

  -- 결제액을 "실제로 남긴 금액(출장비 등)"으로 맞춥니다 — 정산 트리거가 70%/30% 를 다시 계산합니다.
  update public.care_schedules
     set payment_amount = p_retained_amount
   where id = p_schedule_id
  returning * into v_row;

  -- 남은 단계를 순서대로 밀어 'completed' 로 닫습니다(admin_force_complete_care() 와 같은 패턴).
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
           refund_amount = coalesce(refund_amount, 0) + p_refund_amount,
           refund_memo = p_memo,
           refunded_at = now()
     where id = v_row.application_id;
  end if;

  insert into public.admin_care_adjustments (application_id, schedule_id, admin_id, action_type, amount, memo)
  values (v_row.application_id, p_schedule_id, v_admin, 'partial_refund', p_refund_amount, p_memo);

  return v_row;
end $$;

revoke all on function public.admin_apply_partial_refund(uuid, integer, integer, text, uuid) from public, anon;
grant execute on function public.admin_apply_partial_refund(uuid, integer, integer, text, uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2) accept_service_application_as — 텔레그램 수락 시 payment_amount 를 서비스 정가로 채움
--    (sql/telegram_care_request_notifications.sql 원본과 같고, payment_amount 한 칸만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.accept_service_application_as(
  p_application_id uuid,
  p_manager_id     uuid,
  p_scheduled_at    timestamptz
) returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app      public.service_applications;
  v_row      public.care_schedules;
  v_phone_re constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep      int;
begin
  if p_manager_id is null then
    raise exception 'MANAGER_REQUIRED' using errcode = '22004';
  end if;
  if not exists (select 1 from public.managers where id = p_manager_id and certification_verified) then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;
  if p_scheduled_at is null then
    raise exception 'SCHEDULE_TIME_REQUIRED' using errcode = '22004';
  end if;

  update public.service_applications
     set manager_id = p_manager_id, accepted_at = now(), status = 'matched'
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
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount,
     payment_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    p_manager_id,
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
    coalesce(public.expected_service_price(v_app.service_type), 0),
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application_as(uuid, uuid, timestamptz) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) 이미 0원으로 저장된 '진행 중' 결제 일정 보정 — 다른 수락 경로와 같은 기준(서비스 정가)
--    · 완료된 일정, 패키지 차감 신청, 결제되지 않은 신청은 건드리지 않습니다.
--    · payment_amount 를 SET 하므로 정산 트리거가 매니저 정산액도 함께 다시 계산합니다.
-- ----------------------------------------------------------------------------
update public.care_schedules cs
   set payment_amount = coalesce(public.expected_service_price(a.service_type), 0)
  from public.service_applications a
 where a.id = cs.application_id
   and cs.payment_amount = 0
   and cs.status is distinct from 'completed'
   and coalesce(a.is_package_used, false) = false
   and upper(coalesce(a.payment_status, '')) = 'PAID'
   and coalesce(public.expected_service_price(a.service_type), 0) > 0;

notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- [미리 보기 — 읽기만 함] 3) 보정 대상 (위 내용을 실행하기 전에 따로 실행해 확인)
-- ----------------------------------------------------------------------------
-- select cs.id, cs.status, cs.payment_amount, a.service_type, a.final_amount,
--        public.expected_service_price(a.service_type) as will_be
--   from public.care_schedules cs
--   join public.service_applications a on a.id = cs.application_id
--  where cs.payment_amount = 0
--    and cs.status is distinct from 'completed'
--    and coalesce(a.is_package_used, false) = false
--    and upper(coalesce(a.payment_status, '')) = 'PAID';
