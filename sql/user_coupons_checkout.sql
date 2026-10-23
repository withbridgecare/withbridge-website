-- ============================================================================
-- apply.html 결제 시 유저 쿠폰(user_coupons) + 적립금(profiles.points_balance) 동시 적용
--   sql/welcome_coupons.sql (user_coupons 테이블) 과 sql/user_points.sql (points_balance, points_used,
--   첫 버전의 마크 함수) 을 전제로, 신청서에 쿠폰 선택까지 더해 결제 확인 시점에 함께 검증/반영합니다.
--
--   - service_applications.coupon_id       : apply.html 쿠폰 드롭다운에서 고른 user_coupons.id (희망값)
--   - service_applications.coupon_discount : 그 쿠폰의 할인액 스냅샷(제출 시점)
--   - service_applications.discount_amount : coupon_discount + points_used (제출 시점 희망 총 할인액)
--     → 결제가 'PAID' 로 확인되면 아래 mark_payment_matching_pending() 이 "실제로 적용된" 값으로 덮어씁니다.
--   - service_applications.final_amount    : 서비스 정가 - discount_amount (제출/확정 시점 최종 결제 금액)
--
--   핵심 설계(이전 버전과 동일한 원칙 — sql/user_points.sql 의 의도를 쿠폰까지 확장):
--     expected_service_price(service_type) - (실제 사용 가능한 쿠폰 할인 + 실제 사용 가능한 적립금)
--     이 PortOne 재조회 실제 승인 금액과 정확히 일치해야만 결제를 승인합니다. "실제 사용 가능한"은
--     신청서에 적힌 희망값과, 결제 확인 시점의 실제 쿠폰 상태/적립금 잔액 중 더 작은(또는 유효한) 쪽입니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/welcome_coupons.sql → sql/user_points.sql → 이 파일.
--   (매개변수 시그니처가 이전과 같아 mark_payment_matching_pending() 을 create or replace 로 안전하게 덮어씁니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) service_applications 에 쿠폰/확정 금액 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists coupon_id uuid references public.user_coupons(id);
alter table public.service_applications add column if not exists coupon_discount integer not null default 0;
alter table public.service_applications add column if not exists discount_amount integer not null default 0;
alter table public.service_applications add column if not exists final_amount integer;

-- 1-1) 선택 추가 옵션(Add-on) — 긴급 매칭/차량 이동 지원 (2026 마진율 개편. '상세 건강&복약 리포트'
--      유료 옵션은 폐지 — 진료 피드백 리포트는 모든 서비스에 기본 무료로 제공됩니다).
--      addon_codes 는 apply.html 체크박스에서 고른 코드 배열(희망값 스냅샷), addon_total 은 그 코드들의
--      합계 스냅샷(화면 표시용) — coupon_id/coupon_discount 와 같은 패턴입니다. 실제 검증은 아래
--      expected_addon_total() 이 addon_codes 로부터 금액을 다시 계산해서만 이뤄지고, 클라이언트가 보낸
--      addon_total 자체는 신뢰하지 않습니다.
alter table public.service_applications add column if not exists addon_codes text[] not null default '{}';
alter table public.service_applications add column if not exists addon_total integer not null default 0;

create or replace function public.expected_addon_total(p_addon_codes text[])
returns integer
language sql immutable as $$
  -- 'DETAILED_REPORT' 는 폐지된 옵션 — 과거에 저장된 신청서가 그 코드를 여전히 들고 있어도
  -- else 0 으로 떨어져 더 이상 금액이 합산되지 않습니다(결제 금액 검증을 깨뜨리지 않는 안전한 폐지).
  select coalesce(sum(case code
    when 'URGENT_MATCHING' then 10000 -- 긴급 매칭 서비스 (이용 24시간 이내 긴급 예약 요청)
    when 'VEHICLE_SUPPORT' then 10000 -- 차량 이동 지원 (매니저 자차 이동 지원 또는 보호자 차량 대리 운행)
    else 0
  end), 0)
  from unnest(coalesce(p_addon_codes, '{}'::text[])) as code;
$$;

grant execute on function public.expected_addon_total(text[]) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) mark_payment_matching_pending() 재정의 — 쿠폰 검증/사용 처리 + discount_amount/final_amount 확정 기록 추가.
--
--    변경점(sql/user_points.sql 버전 대비):
--    a) coupon_id 가 있으면: 그 쿠폰이 "이 신청서의 user_id 소유 + status='active' + 아직 미만료"일 때만
--       유효한 것으로 보고 할인액을 반영합니다. 조건에 맞지 않으면(이미 썼거나, 다른 사람 쿠폰이거나,
--       만료됨 — 신청서 저장과 결제 확인 사이에 그렇게 됐을 수 있음) 쿠폰 할인 없이(0원) 진행합니다.
--    b) 상태 전환(원자적 선점)에 성공한 뒤, 적립금 차감과 같은 자리에서 쿠폰도 status='active' 조건을 다시
--       건 UPDATE 로 'used' 처리합니다 — 두 결제가 같은 쿠폰을 동시에 쓰려 해도 먼저 UPDATE 를 성공시킨
--       쪽만 쿠폰을 가져가고(행 잠금으로 직렬화), 진 쪽은 쿠폰 없이(할인 0원) 처리되어 AMOUNT_MISMATCH 로
--       막힙니다(그 결제가 쿠폰 할인을 전제로 금액을 보냈을 것이므로) — 안전한 실패입니다.
--    c) discount_amount/final_amount 를 "실제로 적용된" 값으로 service_applications 에 기록합니다 —
--       제출 시점 희망값이 아니라 이 함수가 검증을 마친 뒤의 확정값입니다.
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app            public.service_applications;
  v_price          integer;
  v_addon_total    integer;
  v_coupon_discount integer;
  v_coupon_valid   boolean;
  v_points_to_use  integer;
  v_discount       integer;
  v_expected       integer;
  v_balance        integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    return v_app; -- 이미 처리됨(멱등)
  end if;

  -- 쿠폰: 지금 이 순간에도 "이 사람 것 + 아직 유효(active, 미만료)" 인지 다시 확인
  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  -- 적립금: 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price + v_addon_total - v_discount;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, addon=%, coupon=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_addon_total, v_coupon_discount, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리, 쿠폰 사용 처리, 적립금 차감, 확정 금액 기록을 실행합니다 — issue-virtual-account 와
  -- portone-webhook 이 같은 결제를 거의 동시에 처리해도 전부 한 번씩만 적용됩니다.
  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      -- 거의 동시에 다른 결제가 먼저 이 쿠폰을 써버린 극히 드문 경우 — 이미 위에서 AMOUNT_MISMATCH 검증을
      -- 통과했다는 것은 이 쿠폰 할인이 반영된 금액으로 결제가 승인됐다는 뜻이라 쿠폰 없이는 금액이 맞지
      -- 않습니다. 결제 자체를 되돌리지는 않고(이미 PG 승인 완료) 경고만 남겨 운영자가 수동으로 확인합니다.
      raise warning '[mark_payment_matching_pending] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, public.expected_service_price(v_app.service_type)) + v_addon_total - v_discount
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
