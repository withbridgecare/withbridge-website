-- ============================================================================
-- one_hour_light_care_service.sql
-- 신규 상품 '1시간 라이트 케어'(30,000원 / 기본 1시간) 추가에 따른 서버 측 정가 반영.
--
--   index.html(히어로 하단 배너 / 요금 안내 강조 카드 / 계산기)와 apply.html(SERVICES 객체,
--   신청서 '서비스 선택' 카드)에는 이미 '1시간 라이트 케어' = 30,000원이 반영돼 있습니다. 하지만
--   결제 승인은 클라이언트가 보낸 금액을 그대로 믿지 않고, 아래 expected_service_price() /
--   expected_overtime_rate_per_30min()(sql/payment_confirmation_functions.sql)이 서버에서
--   다시 계산한 "정답"과 비교해 다르면 AMOUNT_MISMATCH 로 거부합니다(mark_payment_matching_pending).
--   이 함수들에 새 서비스를 추가하지 않으면, '1시간 라이트 케어'로 신청한 결제가 전부
--   AMOUNT_MISMATCH 로 막힙니다 — 반드시 apply.html 과 같이 실행하세요.
--
--   추가로, report_care_duration_and_bill_extra()(sql/user_packages_system.sql)가 지금까지
--   "기본 포함 시간은 모든 서비스가 2시간(120분)"이라고 하드코딩돼 있던 부분을, 서비스별로 다른
--   기본 시간을 돌려주는 expected_base_minutes()를 거쳐 계산하도록 바꿉니다 — 이게 없으면 '1시간
--   라이트 케어'는 실제로 90분을 써도(이미 1시간을 30분 초과했는데) 2시간 미만이라는 이유로 초과
--   요금이 전혀 청구되지 않습니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   전부 create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 서비스별 정가 카탈로그에 '1시간 라이트 케어' 추가 (기존 세 값은 그대로 유지)
-- ----------------------------------------------------------------------------
create or replace function public.expected_service_price(p_service_type text)
returns integer
language sql immutable as $$
  select case p_service_type
    when '1시간 라이트 케어' then 30000
    when '시니어 병원 동행' then 50000
    when '생활 편의 대행' then 40000
    when '복합 매칭 서비스 (동행 + 생활편의)' then 60000
    else null
  end;
$$;

grant execute on function public.expected_service_price(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) 서비스별 초과 요금(30분당) 카탈로그에도 '1시간 라이트 케어' 추가 — 30,000원/1시간을 2시간
--    기준 서비스들과 같은 방식(기본요금 ÷ 기본시간 ÷ 2)으로 환산하면 30,000 ÷ 1시간 ÷ 2 = 15,000원.
-- ----------------------------------------------------------------------------
create or replace function public.expected_overtime_rate_per_30min(p_service_type text)
returns integer
language sql immutable as $$
  select case p_service_type
    when '1시간 라이트 케어' then 15000
    when '시니어 병원 동행' then 12500
    when '생활 편의 대행' then 10000
    when '복합 매칭 서비스 (동행 + 생활편의)' then 15000
    else 10000 -- 알 수 없는(또는 신청서와 연결되지 않은) 서비스 유형은 기존 기본값으로 안전하게 처리
  end;
$$;

grant execute on function public.expected_overtime_rate_per_30min(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) 서비스별 "기본 요금에 포함된 시간(분)" — report_care_duration_and_bill_extra()가 이 분을
--    넘긴 실제 소요 시간에만 초과 요금을 청구합니다. 지금까지는 전부 120분(2시간) 고정이었는데,
--    '1시간 라이트 케어'만 60분입니다. 알 수 없는 서비스 유형(연결된 신청서가 없는 수기 배정 등)은
--    기존 동작과 같은 120분으로 안전하게 처리합니다.
-- ----------------------------------------------------------------------------
create or replace function public.expected_base_minutes(p_service_type text)
returns integer
language sql immutable as $$
  select case p_service_type
    when '1시간 라이트 케어' then 60
    else 120
  end;
$$;

grant execute on function public.expected_base_minutes(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4) report_care_duration_and_bill_extra() — 하드코딩된 v_base_minutes constant 120 을
--    expected_base_minutes(v_service_type) 호출로 교체. v_service_type 을 먼저 구한 뒤에
--    기본 시간을 계산해야 하므로 변수 선언에서 constant 를 떼고 그 아래로 대입 위치를 옮깁니다.
--    나머지 로직(초과 요금 계산/누적, service_applications 반영)은 기존과 완전히 동일합니다.
-- ----------------------------------------------------------------------------
create or replace function public.report_care_duration_and_bill_extra(
  p_schedule_id uuid,
  p_actual_duration_minutes integer
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.care_schedules;
  v_extra_fee integer;
  v_service_type text;
  v_unit_fee     integer;
  v_base_minutes integer;
begin
  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_row.manager_id = auth.uid() or public.is_admin()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_actual_duration_minutes is null or p_actual_duration_minutes < 0 then
    raise exception 'INVALID_DURATION' using errcode = '22023';
  end if;
  if v_row.extra_charge_status = 'PAID' then
    raise exception 'EXTRA_CHARGE_ALREADY_PAID' using errcode = 'P0001';
  end if;

  if v_row.application_id is not null then
    select service_type into v_service_type from public.service_applications where id = v_row.application_id;
  end if;
  v_unit_fee := public.expected_overtime_rate_per_30min(v_service_type);
  v_base_minutes := public.expected_base_minutes(v_service_type);

  v_extra_fee := greatest(0, ceil((p_actual_duration_minutes - v_base_minutes) / 30.0)::integer) * v_unit_fee;

  if v_extra_fee > 0 then
    -- 패키지 차감 예약에 선택 추가 옵션이 있으면(consume_package_on_application/accept_service_application
    -- 이 이미 extra_charge_amount 를 그 추가 옵션 금액으로 'REQUESTED' 해 둠) 여기서 금액을 통째로
    -- 덮어쓰면 그 미결제 추가 옵션 금액이 사라집니다 — 아직 PAID 가 아닌 기존 금액에는 더하고, 메모도
    -- 이어 붙입니다(amount=0/메모 없음인 'NONE' 상태에서는 coalesce(..,0)+v_extra_fee 가 그냥 v_extra_fee 와 같음).
    update public.care_schedules
       set extra_charge_amount = coalesce(extra_charge_amount, 0) + v_extra_fee,
           extra_charge_memo = case when extra_charge_memo is not null
             then extra_charge_memo || E'\n' || '기본 ' || v_base_minutes || '분 초과 자동 산정 (실제 소요 ' || p_actual_duration_minutes || '분)'
             else '기본 ' || v_base_minutes || '분 초과 자동 산정 (실제 소요 ' || p_actual_duration_minutes || '분)' end,
           extra_charge_status = 'REQUESTED',
           extra_charge_payment_id = coalesce(extra_charge_payment_id, gen_random_uuid()),
           extra_charge_requested_at = coalesce(extra_charge_requested_at, now())
     where id = p_schedule_id
    returning * into v_row;
    -- TODO(카카오 알림톡): 여기서 보호자에게 추가 요금 발생을 알립니다. 카카오 비즈니스 발신프로필·
    -- 템플릿 승인이 끝나면 이 지점에서 알림톡 발송 API를 호출하세요(현재는 외부 계정이 없어 결제
    -- 링크 안내만 제공합니다 — mypage.html '추가 요금 결제 안내' 섹션이 그 결제 링크 역할을 합니다).
  end if;

  if v_row.application_id is not null then
    -- v_row.extra_charge_amount 를 그대로 씁니다(위에서 pending 추가 옵션 금액에 이번 초과 요금을 더한
    -- 합계일 수 있음) — v_extra_fee(이번 초과 요금만)를 쓰면 패키지 차감 예약의 추가 옵션 pending 금액이
    -- service_applications 쪽 표시에서는 사라져 보입니다(실제 결제 레일인 care_schedules 쪽은 이미 합산됨).
    update public.service_applications
       set actual_duration_minutes = p_actual_duration_minutes,
           extra_fee = v_row.extra_charge_amount,
           extra_fee_status = case when coalesce(v_row.extra_charge_amount, 0) > 0 then 'pending_payment' else null end
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.report_care_duration_and_bill_extra(uuid, integer) from public, anon;
grant  execute on function public.report_care_duration_and_bill_extra(uuid, integer) to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
