-- ============================================================================
-- 추가 요금 정산(기본 요금 선결제 + 초과 시 추가 요금) — care_schedules 1건당 추가 청구 1건
--
--   결제 구조: apply.html 결제는 서비스별 "기본 요금"(2시간 기준, SERVICES 카탈로그)만 선결제합니다.
--   현장에서 기본 시간을 초과하면, 관리자가 케어 완료 후 admin.html에서 초과분 금액을 직접 입력해
--   추가 청구를 올리고(산정 방식: 관리자 수기 입력 — 자동 계산 아님), 보호자가 mypage.html 에서
--   PortOne 결제창으로 그 금액만 다시 결제합니다(2차 결제 — 기존 가상계좌/기본결제와는 별도의
--   paymentId를 새로 발급해 PortOne에 전달합니다. 기본 결제 paymentId = application_id 규칙과 섞이지
--   않도록, 추가 청구 전용 paymentId는 extra_charge_payment_id 컬럼에 새 uuid로 발급합니다).
--
--   흐름:
--     1) admin.html '추가 요금 청구' 버튼 → admin_request_extra_charge() : status NONE → REQUESTED,
--        amount/memo 저장, extra_charge_payment_id 새로 발급
--     2) mypage.html 가 REQUESTED 건을 보여주고, 보호자가 결제 버튼 클릭 → PortOne.requestPayment()
--        (paymentId = extra_charge_payment_id, totalAmount = extra_charge_amount)
--     3) supabase/functions/confirm-extra-charge-payment 가 PortOne API 를 서버에서 재조회해
--        실제 승인 금액이 extra_charge_amount 와 정확히 일치할 때만 confirm_extra_charge_payment() 호출
--        → status REQUESTED → PAID (issue-virtual-account/mark_payment_matching_pending 과 완전히 같은
--        "클라이언트 응답을 믿지 않고 서버가 PortOne 을 재조회" 원칙)
--     4) portone-webhook 도 같은 confirm_extra_charge_payment() 를 호출하도록 분기 추가(이 파일 적용 후
--        supabase/functions/portone-webhook 도 함께 배포해야 합니다)
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/admin_care_actions.sql → 이 파일. create or replace / add column if not exists
--             기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가 — 신청 1건(케어 1건)당 "현재 활성화된" 추가 청구 1건만 추적합니다(여러 번 청구해야
--    하면 이전 건이 PAID 로 끝난 뒤 새로 청구하는 것을 전제로 합니다 — 동시에 두 건을 걸지 않음).
-- ----------------------------------------------------------------------------
alter table public.care_schedules add column if not exists extra_charge_amount     integer;
alter table public.care_schedules add column if not exists extra_charge_memo       text;
alter table public.care_schedules add column if not exists extra_charge_status     text not null default 'NONE';
alter table public.care_schedules add column if not exists extra_charge_payment_id uuid;
alter table public.care_schedules add column if not exists extra_charge_requested_at timestamptz;
alter table public.care_schedules add column if not exists extra_charge_paid_at      timestamptz;

alter table public.care_schedules drop constraint if exists care_schedules_extra_charge_status_check;
alter table public.care_schedules add constraint care_schedules_extra_charge_status_check
  check (extra_charge_status in ('NONE', 'REQUESTED', 'PAID'));

alter table public.care_schedules drop constraint if exists care_schedules_extra_charge_amount_check;
alter table public.care_schedules add constraint care_schedules_extra_charge_amount_check
  check (extra_charge_amount is null or extra_charge_amount > 0);

create unique index if not exists care_schedules_extra_charge_payment_id_key
  on public.care_schedules (extra_charge_payment_id) where extra_charge_payment_id is not null;

-- portone-webhook 이 들어온 paymentId 가 "추가 청구"인지부터 빠르게 판별할 때 씀
create index if not exists care_schedules_extra_charge_requested_idx
  on public.care_schedules (extra_charge_payment_id) where extra_charge_status = 'REQUESTED';


-- ----------------------------------------------------------------------------
-- 2) 관리자: 추가 요금 청구 — 케어가 완료(completed)된 건에만 걸 수 있습니다(진행 중에는 아직 초과
--    여부를 확정할 수 없음). 이미 REQUESTED/PAID 인 건을 다시 부르면 — PAID 는 덮어쓰지 않고 거부,
--    REQUESTED 는 금액/메모를 고쳐서 다시 청구(paymentId 는 그대로 유지 — 보호자가 이미 그 paymentId 로
--    결제창을 열어 둔 상태일 수 있어 괜히 새로 발급하지 않습니다)하는 것으로 둡니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_request_extra_charge(uuid, integer, text);

create or replace function public.admin_request_extra_charge(
  p_schedule_id uuid,
  p_amount integer,
  p_memo text default null
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;

  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status <> 'completed' then
    raise exception 'SCHEDULE_NOT_COMPLETED' using errcode = 'P0001';
  end if;
  if v_row.extra_charge_status = 'PAID' then
    raise exception 'EXTRA_CHARGE_ALREADY_PAID' using errcode = 'P0001';
  end if;

  update public.care_schedules
     set extra_charge_amount = p_amount,
         extra_charge_memo = p_memo,
         extra_charge_status = 'REQUESTED',
         extra_charge_payment_id = coalesce(extra_charge_payment_id, gen_random_uuid()),
         extra_charge_requested_at = now()
   where id = p_schedule_id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.admin_request_extra_charge(uuid, integer, text) from public, anon;
grant  execute on function public.admin_request_extra_charge(uuid, integer, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) 관리자: 추가 요금 청구 취소 — 잘못 입력했을 때 결제 전(REQUESTED)에만 되돌립니다. 이미 PAID 인
--    건은 취소가 아니라 환불 절차(수동/PortOne 콘솔)로 처리해야 하므로 여기서 막습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_cancel_extra_charge(uuid);

create or replace function public.admin_cancel_extra_charge(p_schedule_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.care_schedules
     set extra_charge_amount = null,
         extra_charge_memo = null,
         extra_charge_status = 'NONE',
         extra_charge_payment_id = null,
         extra_charge_requested_at = null
   where id = p_schedule_id
     and extra_charge_status = 'REQUESTED'
  returning * into v_row;

  if not found then
    raise exception 'EXTRA_CHARGE_NOT_CANCELLABLE' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.admin_cancel_extra_charge(uuid) from public, anon;
grant  execute on function public.admin_cancel_extra_charge(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) 추가 요금 결제 확인 — supabase/functions/confirm-extra-charge-payment, portone-webhook 이
--    PortOne API 재조회 결과만 가지고 호출합니다(클라이언트가 직접 부르지 못하도록 service_role 전용).
--    p_paid_amount 는 반드시 extra_charge_amount 와 정확히 일치해야 PAID 로 전환됩니다 — 금액이 다르면
--    AMOUNT_MISMATCH 로 거부하고 상태를 바꾸지 않습니다(결제 모듈이 극단적으로 늦게 금액을 바꿔 보낼
--    가능성은 거의 없지만, sql/payment_confirmation_functions.sql 의 mark_payment_matching_pending() 과
--    같은 원칙을 지킵니다 — "브라우저가 보낸 금액이 아니라 PortOne 서버 재조회 금액만 신뢰").
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_extra_charge_payment(uuid, integer);

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
         extra_charge_paid_at = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.confirm_extra_charge_payment(uuid, integer) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
