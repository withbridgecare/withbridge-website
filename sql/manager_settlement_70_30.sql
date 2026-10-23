-- ============================================================================
-- 매니저 정산(70:30 수수료) 시스템
--
--   정산 구조: 건별 결제 금액(기본 요금 + 승인된 추가 요금)의 70%는 케어매니저 정산금, 30%는
--   플랫폼 수수료로 자동 분배합니다. 매월 말일 마감 후 익월 10일에 그 달 완료 건을 모아 일괄
--   지급하며, 지급 시 3.3%(소득세 3% + 지방소득세 0.3%, 사업소득 원천징수) 를 뗀 금액을 입금합니다.
--
--   왜 care_schedules 인가(service_applications 가 아니라): service_applications 은 "신청/결제"
--   시점의 테이블로 아직 매니저가 배정되지 않았거나 취소될 수도 있는 건까지 포함합니다. 반면
--   care_schedules 는 "실제로 특정 매니저가 수행하는 건"(매니저 1명 1:1) 이고, 이미 매니저 정산
--   예정액을 담아 온 payout_amount 컬럼이 있었습니다(다만 지금까지 삽입 코드들이 전부 0 을 하드코딩해
--   실제로는 쓰이지 않던 자리였습니다). 매니저별/월별 정산 집계는 "누가 수행했는지"가 기준이므로
--   care_schedules 가 정산의 자연스러운 단위입니다.
--
--   추가되는 컬럼(care_schedules):
--     payment_amount  결제액(이 건에 대해 실제로 받은 금액 = 기본 요금 + PAID 된 추가 요금)
--     manager_payout  매니저 정산금 = payment_amount 의 70% (자동 계산, 직접 수정 금지)
--     platform_fee    플랫폼 수수료 = payment_amount 의 30% (자동 계산, 직접 수정 금지)
--   기존 payout_amount 컬럼은 그대로 두되, 트리거가 manager_payout 과 항상 같은 값으로 맞춰
--   mypage-manager.html 등 이미 payout_amount 를 읽고 있는 화면이 수정 없이 올바른 70% 금액을
--   보여주게 합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/reservations_virtual_accounts.sql(accept_service_application()) →
--             sql/admin_manual_assignment.sql(admin_assign_manager()) →
--             sql/payment_confirmation_functions.sql(expected_service_price()) →
--             sql/extra_charge_billing.sql(confirm_extra_charge_payment()) → 이 파일.
--   전부 create or replace / add column if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.care_schedules add column if not exists payment_amount integer not null default 0;
alter table public.care_schedules add column if not exists manager_payout integer not null default 0;
alter table public.care_schedules add column if not exists platform_fee   integer not null default 0;

alter table public.care_schedules drop constraint if exists care_schedules_payment_amount_check;
alter table public.care_schedules add constraint care_schedules_payment_amount_check
  check (payment_amount >= 0);


-- ----------------------------------------------------------------------------
-- 2) 70:30 자동 분배 트리거 — payment_amount 가 insert/update 될 때마다 manager_payout(70%) /
--    platform_fee(30%) 을 다시 계산합니다. manager_payout 은 반올림하고 platform_fee 는
--    "결제액 - manager_payout"으로 계산해, 두 금액의 합이 항상 payment_amount 와 정확히 일치하도록
--    합니다(각자 따로 반올림하면 1원 단위로 어긋날 수 있음). payout_amount(기존 컬럼)도 항상
--    manager_payout 과 같게 맞춰 하위 호환을 지킵니다.
-- ----------------------------------------------------------------------------
create or replace function public.compute_manager_settlement_split() returns trigger
language plpgsql as $$
begin
  new.manager_payout := round(coalesce(new.payment_amount, 0) * 0.7)::integer;
  new.platform_fee   := coalesce(new.payment_amount, 0) - new.manager_payout;
  new.payout_amount   := new.manager_payout;
  return new;
end $$;

drop trigger if exists care_schedules_settlement_split on public.care_schedules;
create trigger care_schedules_settlement_split
  before insert or update of payment_amount on public.care_schedules
  for each row execute function public.compute_manager_settlement_split();


-- ----------------------------------------------------------------------------
-- 3) 기존 행 백필 — 이미 쌓여 있던 care_schedules 행 중 payment_amount 가 아직 0인 건을, 연결된
--    service_applications.service_type 의 정가(expected_service_price)로 채웁니다. 신청서 연결이
--    없는 옛 방식(구글폼 등) 행은 기존 payout_amount 를 결제액으로 간주합니다. 이미 PAID 된 추가
--    요금이 있으면 더해 줍니다. payment_amount 를 SET 하므로 위 트리거가 같은 UPDATE 안에서 바로
--    manager_payout/platform_fee/payout_amount 를 다시 계산합니다 — 여러 번 실행해도 이미 0이 아닌
--    행은 건드리지 않아 안전합니다(재실행 멱등).
-- ----------------------------------------------------------------------------
update public.care_schedules cs
   set payment_amount = coalesce(
         (select public.expected_service_price(a.service_type)
            from public.service_applications a
           where a.id = cs.application_id),
         cs.payout_amount,
         0
       ) + case when cs.extra_charge_status = 'PAID' then coalesce(cs.extra_charge_amount, 0) else 0 end
 where cs.payment_amount = 0
   and (cs.payout_amount > 0 or cs.application_id is not null or cs.extra_charge_status = 'PAID');


-- ----------------------------------------------------------------------------
-- 4) accept_service_application() — 매니저가 "접수 대기" 건을 직접 수락할 때 care_schedules 행을
--    만드는 함수(sql/reservations_virtual_accounts.sql 원본)에 payment_amount 계산만 추가합니다.
--    나머지 로직/컬럼 순서는 원본과 동일합니다.
-- ----------------------------------------------------------------------------
create or replace function public.accept_service_application(p_application_id uuid, p_scheduled_at timestamptz)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app           public.service_applications;
  v_row           public.care_schedules;
  v_phone_re      constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep           int;
  v_pending_addon boolean;
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

  -- 패키지 차감 예약에 선택 추가 옵션이 함께 있으면(consume_package_on_application, sql/
  -- user_packages_system.sql 이 extra_fee/extra_fee_status='pending_payment' 로 남겨 둔 금액) 지금
  -- care_schedules 가 처음 생기는 시점에 그 금액을 기존 '추가 요금 결제 안내' 결제 레일(extra_charge_*,
  -- sql/extra_charge_billing.sql)에 그대로 올려 보호자가 결제할 수 있게 합니다.
  v_pending_addon := coalesce(v_app.is_package_used, false)
    and v_app.extra_fee_status = 'pending_payment'
    and coalesce(v_app.extra_fee, 0) > 0;

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount,
     payment_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng,
     extra_charge_amount, extra_charge_memo, extra_charge_status, extra_charge_payment_id, extra_charge_requested_at)
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
    coalesce(public.expected_service_price(v_app.service_type), 0),
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng,
    case when v_pending_addon then v_app.extra_fee else null end,
    case when v_pending_addon then '선택 추가 옵션 금액 (보유 패키지 차감 예약)' else null end,
    case when v_pending_addon then 'REQUESTED' else 'NONE' end,
    case when v_pending_addon then gen_random_uuid() else null end,
    case when v_pending_addon then now() else null end
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;


-- ----------------------------------------------------------------------------
-- 5) admin_assign_manager() — 관리자가 수동 배정할 때 care_schedules 행을 만드는 함수
--    (sql/admin_manual_assignment.sql 원본)에 payment_amount 계산만 추가합니다. 나머지 로직은 동일합니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_assign_manager(p_application_id uuid, p_manager_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app           public.service_applications;
  v_is_active     boolean;
  v_schedule_id   uuid;
  v_phone_re      constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep           int;
  v_pending_addon boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.managers m where m.id = p_manager_id and m.certification_verified = true
  ) into v_is_active;
  if not v_is_active then
    raise exception 'MANAGER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.service_applications
     set manager_id  = p_manager_id,
         accepted_at = coalesce(accepted_at, now()),
         status      = 'MATCHED'
   where id = p_application_id
     and manager_id is null
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  update public.virtual_accounts
     set is_paid = true
   where application_id = v_app.id
     and is_paid = false;

  if v_app.schedule_id is not null then
    update public.care_schedules set manager_id = p_manager_id where id = v_app.schedule_id;
    select * into v_app from public.service_applications where id = v_app.id;
    return v_app;
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  -- accept_service_application() 과 같은 이유로, 패키지 차감 예약에 선택 추가 옵션이 함께 있으면
  -- (consume_package_on_application 이 남긴 extra_fee/extra_fee_status='pending_payment') 지금
  -- care_schedules 가 처음 생기는 시점에 그 금액을 '추가 요금 결제 안내' 결제 레일에 올립니다.
  v_pending_addon := coalesce(v_app.is_package_used, false)
    and v_app.extra_fee_status = 'pending_payment'
    and coalesce(v_app.extra_fee, 0) > 0;

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount,
     payment_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng,
     extra_charge_amount, extra_charge_memo, extra_charge_status, extra_charge_payment_id, extra_charge_requested_at)
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
    coalesce(public.parse_desired_datetime_kst(v_app.request_details, v_app.created_at), now()),
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    coalesce(public.expected_service_price(v_app.service_type), 0),
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng,
    case when v_pending_addon then v_app.extra_fee else null end,
    case when v_pending_addon then '선택 추가 옵션 금액 (보유 패키지 차감 예약)' else null end,
    case when v_pending_addon then 'REQUESTED' else 'NONE' end,
    case when v_pending_addon then gen_random_uuid() else null end,
    case when v_pending_addon then now() else null end
  )
  returning id into v_schedule_id;

  update public.service_applications set schedule_id = v_schedule_id where id = v_app.id;
  select * into v_app from public.service_applications where id = v_app.id;
  return v_app;
end $$;

revoke all on function public.admin_assign_manager(uuid, uuid) from public, anon;
grant  execute on function public.admin_assign_manager(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 6) confirm_extra_charge_payment() — 추가 요금이 결제 완료(PAID)되는 순간, 그 금액을
--    payment_amount 에 더합니다(sql/extra_charge_billing.sql 원본에 한 줄만 추가). 이렇게 하면
--    "건별 결제 금액"이 기본 요금 + 승인된 추가 요금의 합으로 맞춰지고, 위 트리거가 그 전체 금액의
--    70%/30% 를 다시 계산합니다.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_extra_charge_payment(p_payment_id uuid, p_paid_amount integer)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  select * into v_row from public.care_schedules where extra_charge_payment_id = p_payment_id;
  if v_row.id is null then
    raise exception 'EXTRA_CHARGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.extra_charge_status = 'PAID' then
    return v_row; -- 중복 웹훅/재시도 — 조용히 현재 행 그대로 반환 (멱등)
  end if;
  if v_row.extra_charge_status <> 'REQUESTED' then
    raise exception 'EXTRA_CHARGE_NOT_REQUESTED' using errcode = 'P0001';
  end if;
  if p_paid_amount is distinct from v_row.extra_charge_amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_row.extra_charge_amount, p_paid_amount
      using errcode = 'P0003';
  end if;

  update public.care_schedules
     set extra_charge_status = 'PAID',
         extra_charge_paid_at = now(),
         payment_amount = payment_amount + v_row.extra_charge_amount
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.confirm_extra_charge_payment(uuid, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7) 관리자 정산 집계 RPC — admin.html '매니저 정산' 탭이 호출합니다. 월별로 완료(completed) 건만
--    모아 매니저별 [완료 건수 / 정산대상액(70%) 합계 / 3.3% 원천세 / 실지급액]을 계산합니다.
--    raw 테이블 대신 반드시 이 RPC(SECURITY DEFINER + is_admin() 체크)를 통해서만 조회하게 해
--    일반 사용자가 다른 매니저의 정산 내역을 직접 조회하지 못하도록 막습니다(fail closed).
--    p_month 는 해당 월의 아무 날짜나 넘기면 됩니다(예: '2026-10-01') — 그 달 1일~말일(KST)만 봅니다.
--    3.3%(소득세 3% + 지방소득세 0.3%) 원천세는 원 단위로 내림(floor) 처리합니다(과다 공제 방지).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    select
      cs.manager_id,
      coalesce(p.name, '이름 미등록')  as manager_name,
      coalesce(p.phone, '-')          as manager_phone,
      count(*)::bigint                as completed_count,
      coalesce(sum(cs.manager_payout), 0)::bigint as payout_subtotal,
      floor(coalesce(sum(cs.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(cs.manager_payout), 0)
        - floor(coalesce(sum(cs.manager_payout), 0) * 0.033))::bigint as net_payout
    from public.care_schedules cs
    left join public.profiles p on p.id = cs.manager_id
    where cs.status = 'completed'
      and cs.manager_id is not null
      and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
        = date_trunc('month', p_month::timestamp)
    group by cs.manager_id, p.name, p.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
