-- ============================================================================
-- apply.html 결제 시 유저 보유 적립금(포인트) 사용/차감
--   - profiles.points_balance  : 사용자별 현재 보유 적립금 (apply.html 이 조회해 입력란 위에 보여줌)
--   - service_applications.points_used : 신청 시점에 사용자가 입력한 "이번 결제에 쓰겠다"는 적립금
--     (화면이 보낸 값일 뿐 — 실제 차감은 결제가 'PAID' 로 확인된 뒤에만, 그 시점의 실제 잔액을 기준으로
--     이뤄집니다. sql/payment_confirmation_functions.sql 의 mark_payment_matching_pending() 과 똑같이,
--     브라우저가 보낸 값은 결코 그대로 믿지 않고 PortOne 재조회 금액과 비교해 검증합니다.)
--   - point_transactions       : 적립금 차감/적립 내역(감사 추적용) — 지금은 결제 차감만 기록합니다.
--
--   핵심 설계: expected_service_price(service_type) - 실제_사용_가능한_적립금 = PortOne 실제 승인 금액
--   이 정확히 일치해야만 결제를 승인합니다. "실제_사용_가능한_적립금"은 신청서에 적힌 points_used 와
--   '그 시점(결제 확인 시점)의 실제 잔액' 중 더 작은 값입니다 — 그래야 신청서 저장 이후 잔액이 줄어들어도
--   (동시에 다른 결제에서 먼저 써버린 경우 등) 가진 것보다 더 많이 깎아주는 사고가 나지 않습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/payment_confirmation_functions.sql → 이 파일.
--   (이 파일이 mark_payment_matching_pending() 을 적립금 로직이 포함된 버전으로 다시 덮어씁니다 —
--    두 함수의 매개변수 시그니처가 같아 create or replace 만으로 안전하게 교체됩니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) profiles.points_balance — 보유 적립금. 클라이언트는 직접 쓸 수 없고(기존 profiles 정책이 이미
--    anon/authenticated 의 insert/update/delete 를 막아 둠 — sql/supabase_schema_latest.sql 1번),
--    아래 mark_payment_matching_pending() 같은 SECURITY DEFINER 함수를 통해서만 바뀝니다.
--    조회는 기존 profiles_select_own 정책이 이미 모든 컬럼을 허용하므로 추가 정책이 필요 없습니다.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists points_balance integer not null default 0;


-- ----------------------------------------------------------------------------
-- 2) service_applications.points_used — apply.html 제출 시점에 "이번 결제에 쓰겠다"고 적은 금액.
--    이 테이블은 이미 anon/authenticated 가 insert 할 수 있어(기존 service_applications_insert_linked
--    정책) 이 컬럼도 함께 저장되지만, 실제 차감은 결제 확인 시점에만 이뤄지므로 여기 적힌 값 자체가
--    돈이 되는 건 아닙니다 — 그냥 "사용자가 요청한 금액"의 스냅샷입니다.
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists points_used integer not null default 0;


-- ----------------------------------------------------------------------------
-- 3) point_transactions — 적립금 차감/적립 감사 로그 (지금은 결제 차감만 기록). 클라이언트는 자기 내역만
--    조회할 수 있고, 쓰기는 SECURITY DEFINER 함수만 합니다.
-- ----------------------------------------------------------------------------
create table if not exists public.point_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.service_applications(id) on delete set null,
  amount         integer not null,                  -- 음수 = 차감(사용), 양수 = 적립
  reason         text not null,                      -- 예: 'service_payment'
  created_at     timestamptz not null default now()
);
create index if not exists point_transactions_user_idx on public.point_transactions (user_id, created_at desc);

alter table public.point_transactions enable row level security;
drop policy if exists point_transactions_select_own on public.point_transactions;
create policy point_transactions_select_own on public.point_transactions
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.point_transactions from anon, authenticated;
grant  select on public.point_transactions to authenticated;


-- ----------------------------------------------------------------------------
-- 4) mark_payment_matching_pending() 재정의 — sql/payment_confirmation_functions.sql 의 버전에
--    적립금 검증·차감을 추가합니다. 매개변수 시그니처가 같으므로 create or replace 로 안전하게 덮어씁니다.
--
--    변경점:
--    a) 결제 금액 검증 기준을 expected_service_price(service_type) 에서
--       expected_service_price(service_type) - 실제 사용 가능한 적립금 으로 바꿨습니다.
--    b) PAYMENT_PENDING → MATCHING_PENDING 전환을 "원자적 선점"(UPDATE ... WHERE status =
--       'PAYMENT_PENDING' RETURNING *, FOUND 확인)으로 먼저 하고, 그 UPDATE가 실제로 행을 바꿨을 때만
--       가상계좌 입금 처리/적립금 차감을 실행하도록 순서를 바꿨습니다 — issue-virtual-account 와
--       portone-webhook 이 같은 결제를 거의 동시에 처리해도(둘 다 PortOne 재조회에서 PAID 를 보는 경우)
--       행 잠금으로 직렬화되어 적립금이 두 번 차감되지 않습니다(이전 버전은 상태 전환을 맨 마지막에만
--       조건부로 했어서, 금액 관련 부수효과가 없던 그때는 문제가 없었지만 적립금 차감이 생긴 지금은
--       이 순서가 꼭 필요합니다).
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app           public.service_applications;
  v_price         integer;
  v_points_to_use integer;
  v_expected      integer;
  v_balance       integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    -- 이미 처리된 건에 대한 재호출(webhook 중복 전송 등) — 멱등 처리, 그대로 돌려줌.
    return v_app;
  end if;

  -- 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한합니다 — 신청서 저장과
  -- 결제 확인 사이에 잔액이 줄었을 가능성(다른 결제에서 먼저 씀 등)을 반영합니다.
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price - v_points_to_use;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리와 적립금 차감을 실행합니다.
  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    -- 그 사이 다른 호출(issue-virtual-account ↔ portone-webhook 경합)이 먼저 전환을 마쳤습니다 —
    -- 적립금은 그쪽에서 이미 처리했으므로 여기서는 다시 건드리지 않고 현재 행을 그대로 돌려줍니다.
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      -- 위에서 잔액을 확인한 시점과 이 UPDATE 사이에 잔액이 또 바뀐 극히 드문 경우 — 결제 승인 자체는
      -- 이미 금액 검증을 통과했으므로 막지 않고, 차감 없이 경고만 남겨 운영자가 point_transactions로 추적합니다.
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
