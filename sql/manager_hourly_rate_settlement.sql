-- ============================================================================
-- 매니저 정산: 결제액 70% 비율제 → 매니저 시급제로 전환
--
--   기존(sql/manager_settlement_70_30.sql)에는 건별 결제 금액의 70%를 매니저 정산금으로 자동
--   분배했습니다. 이 파일은 그 분배 공식 자체를 "수행 시간(시간) × 매니저 시급"으로 바꿉니다.
--
--   - 매니저 시급: manager_applications(그 매니저의 승인된 최신 행).hourly_rate 가 설정돼 있으면
--     그 값, 없으면 기본 시급(default_manager_hourly_rate(), 15,000원/시간 = 기본 2시간 30,000원)을
--     씁니다. 매니저별 시급을 다르게 주려면 manager_applications.hourly_rate 컬럼을 관리자가
--     직접(Supabase 테이블 편집기 등으로) 채우면 됩니다 — 이 파일은 그 값을 "읽는" 계산 로직만
--     만듭니다. 어드민 콘솔에서 시급을 편집하는 UI/RPC는 아직 없습니다(필요하면 별도 요청해 주세요).
--
--   - 수행 시간: service_applications.actual_duration_minutes(매니저가 '케어 완료' 모달에서
--     보고한 실제 소요 시간, sql/user_packages_system.sql 의 report_care_duration_and_bill_extra
--     참고)가 있으면 그 값, 없으면(아직 보고 전, 또는 신청서 연결 없는 수기 배정) 기본 2시간(120분)
--     으로 봅니다 — 패키지/단건 모두 "기본 2시간부터" 계약이라 최소 2시간分은 항상 보장합니다.
--
--   care_schedules.manager_payout/platform_fee/payout_amount 컬럼은 그대로 두고 트리거 내부
--   계산식만 바꿉니다 — admin_manager_monthly_settlements()/admin_manager_monthly_settlement_details()
--   (sql/admin_settlement_fixes_v4_restore_and_rpc.sql, sql/admin_settlement_detail_rpc.sql)와
--   mypage-manager.html(매니저 본인 화면의 "예상 정산 금액")이 전부 이미 이 컬럼들을 그대로 읽고
--   있으므로, 이 트리거 함수만 바꾸면 어드민 집계와 매니저 화면이 자동으로 같은 수치를 보여줍니다
--   (두 RPC는 수정할 필요가 없습니다).
--
--   ⚠ 소급 적용 안 함: 이미 존재하는 care_schedules 행은 이 마이그레이션만으로는 재계산되지
--   않습니다 — payment_amount(또는 manager_id)가 다시 쓰여지는 다음 이벤트(완료 후 초과요금
--   결제 확정 등)에만 새 공식이 적용됩니다. 이미 지난 달에 70% 공식으로 정산·지급을 마친 건,
--   그리고 sql/admin_settlement_fixes_v4_restore_and_rpc.sql 이 수기로 보정해 둔 과거 특정 건의
--   금액을 이번 변경이 조용히 덮어써 과거 지급 내역과 어긋나게 만들지 않기 위해서입니다. 이번
--   달처럼 아직 지급 전인 진행 중 건까지 지금 바로 새 공식으로 다시 계산해 보고 싶다면, 아래를
--   참고해 필요한 범위만 선택해 실행하세요(과거 수기 보정 건까지 덮어쓰지 않도록 주의):
--     update public.care_schedules set payment_amount = payment_amount
--      where status not in ('completed', 'cancelled');
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 매니저별 시급 컬럼 — null 이면 기본 시급(아래 2번)을 씁니다. 실적에 따른 개별 인상은
--    이 값을 직접 채우면 됩니다.
-- ----------------------------------------------------------------------------
alter table public.manager_applications add column if not exists hourly_rate integer;
alter table public.manager_applications drop constraint if exists manager_applications_hourly_rate_check;
alter table public.manager_applications add constraint manager_applications_hourly_rate_check
  check (hourly_rate is null or hourly_rate > 0);


-- ----------------------------------------------------------------------------
-- 2) 기본 시급 — 15,000원/시간(기본 2시간 기준 30,000원). 사이트 전체에서 "시급 기본값"을
--    참조할 곳은 전부 이 함수 하나만 쓰도록 해, 나중에 기본값을 바꿀 때 한 곳만 고치면 됩니다.
-- ----------------------------------------------------------------------------
create or replace function public.default_manager_hourly_rate()
returns integer
language sql immutable as $$
  select 15000;
$$;

grant execute on function public.default_manager_hourly_rate() to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) 정산 분배 트리거 재정의 — manager_payout = 수행 시간(시간) × 매니저 시급(반올림).
--    payment_amount 가 0 이면(취소/환불, sql/care_schedule_cancellation_sync.sql 이 payment_amount
--    를 0으로 맞추는 경로) 시급 계산을 건너뛰고 정산금도 0으로 맞춥니다 — 그 동기화 로직이
--    "취소되면 정산금도 즉시 0" 이라는 전제로 짜여 있어, 시급제로 바뀌어도 이 전제는 그대로
--    지켜야 합니다.
--    platform_fee 는 "결제액 - 정산금"으로 그대로 두되, 시급제에서는 더 이상 결제액의 고정
--    비율이 아니라 건마다 달라지는 실제 마진입니다(초과요금이 적거나 시급이 높으면 음수가 될
--    수도 있음 — 집계용 참고값일 뿐 화면에 노출되지 않으므로 별도 하한 처리는 하지 않습니다).
-- ----------------------------------------------------------------------------
create or replace function public.compute_manager_settlement_split() returns trigger
language plpgsql as $$
declare
  v_duration_minutes integer;
  v_hourly_rate       integer;
begin
  if coalesce(new.payment_amount, 0) = 0 then
    new.manager_payout := 0;
    new.platform_fee   := 0;
    new.payout_amount   := 0;
    return new;
  end if;

  select coalesce(
    (select sa.actual_duration_minutes from public.service_applications sa where sa.id = new.application_id),
    120
  ) into v_duration_minutes;

  select coalesce(
    (select a.hourly_rate
       from public.manager_applications a
      where a.user_id = new.manager_id and a.status = 'approved'
      order by a.reviewed_at desc nulls last
      limit 1),
    public.default_manager_hourly_rate()
  ) into v_hourly_rate;

  new.manager_payout := round(v_duration_minutes / 60.0 * v_hourly_rate)::integer;
  new.platform_fee   := coalesce(new.payment_amount, 0) - new.manager_payout;
  new.payout_amount   := new.manager_payout;
  return new;
end $$;

-- manager_id 재배정도 이제 정산액에 영향을 주므로(매니저마다 시급이 다를 수 있음), payment_amount
-- 뿐 아니라 manager_id 가 바뀔 때도 다시 계산하도록 트리거 대상 컬럼을 넓힙니다.
drop trigger if exists care_schedules_settlement_split on public.care_schedules;
create trigger care_schedules_settlement_split
  before insert or update of payment_amount, manager_id on public.care_schedules
  for each row execute function public.compute_manager_settlement_split();


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
