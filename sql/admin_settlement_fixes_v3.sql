-- ============================================================================
-- 관리자 정산(매니저 월별) — 취소/환불된 건이 완료 건수로 잘못 집계되는 버그 수정
--
--   실제 원인: admin_manager_monthly_settlements() 는 처음부터 care_schedules.status = 'completed'
--   만 보고 있었지만(sql/admin_settlement_fixes_v2.sql), 그건 "그 케어가 끝까지 수행됐는지"만 알려줄
--   뿐 "그 건의 결제가 나중에 취소/환불됐는지"는 care_schedules 에 전혀 반영되지 않습니다 — 취소/환불은
--   오직 service_applications.status('CANCELLED'/'EXPIRED_CANCELLED')·payment_status('REFUNDED') 에만
--   기록되고(guardian_cancel_application.sql, payment_confirmation_functions.sql,
--   service_application_status_standardization.sql, admin.js cancelApplication/
--   admin_mark_refund_completed), 그 어떤 기존 취소/환불 경로도 연결된 care_schedules 행의 status나
--   payment_amount 를 되돌리지 않습니다. 그래서 "케어는 끝까지 수행된 뒤 나중에(예: 보호자 분쟁,
--   중복결제 등으로) 취소·환불된" 건은 care_schedules.status 가 여전히 'completed' 로 남아 있고,
--   기존 쿼리가 이걸 그대로 정산 대상에 포함시켰습니다 — "정상 완료 1건 + 취소/환불 5건 = 6건" 증상이
--   정확히 이 경로로 설명됩니다.
--
--   (참고: sql/care_interruption_refund_system.sql 의 "부분 환불/패키지 조정"은 이 버그와 다릅니다 —
--   그 경로는 care_schedules.payment_amount 를 "남긴 금액"으로 직접 맞춘 뒤 completed 로 닫으므로,
--   이미 올바른 금액만 정산에 들어갑니다. 이번 수정은 그 경로가 아니라 "완전 취소/전액 환불"인데
--   care_schedules 쪽에 아무 반영이 없는 경우를 막는 것입니다.)
--
--   수정: completed_rows CTE에 care_schedules.application_id 로 연결된 service_applications 를 확인해,
--   status 가 CANCELLED/EXPIRED_CANCELLED 이거나 payment_status 가 REFUNDED 인 건은 제외합니다.
--   application_id 가 없는 레거시 건(구글폼 경유 등, service_applications 연결 자체가 없음)은 확인할
--   방법이 없으므로 그대로 포함합니다(기존 동작 유지). PARTIALLY_REFUNDED(부분 환불)는 일부러
--   제외하지 않습니다 — 그 경우 payment_amount 가 이미 "남긴 금액"으로 정확히 맞춰져 있어, 그 금액의
--   70%를 매니저에게 정산하는 것이 맞습니다.
--
--   실행 순서: sql/manager_settlement_70_30.sql → sql/admin_settlement_fixes.sql →
--             sql/admin_settlement_fixes_v2.sql → sql/care_interruption_refund_system.sql → 이 파일.
-- ============================================================================

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
    with completed_rows as (
      -- '완료' 집계의 유일한 기준. 두 조건을 모두 통과해야만 정산 대상입니다:
      --   ① care_schedules.status = 'completed' (요청 1·2) — pending/assigned/departed/arrived/
      --      treatment_done/returning 등 완료되지 않은 상태는 전부 여기서 배제됩니다.
      --   ② 연결된 신청서가 취소/전액환불 상태가 아님(이번 수정) — CANCELLED/EXPIRED_CANCELLED/
      --      payment_status=REFUNDED 인 건은 care_schedules.status 가 'completed' 로 남아 있어도 제외합니다.
      select cs.id, cs.manager_id, cs.manager_payout
        from public.care_schedules cs
       where cs.status = 'completed'
         and cs.manager_id is not null
         and cs.completed_at is not null
         and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
           = date_trunc('month', p_month::timestamp)
         and not exists (
           select 1 from public.service_applications sa
            where sa.id = cs.application_id
              and (sa.status in ('CANCELLED', 'EXPIRED_CANCELLED') or sa.payment_status = 'REFUNDED')
         )
    )
    select
      c.manager_id,
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(distinct c.id)::bigint                as completed_count,
      coalesce(sum(c.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(c.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(c.manager_payout), 0)
        - floor(coalesce(sum(c.manager_payout), 0) * 0.033))::bigint as net_payout
    from completed_rows c
    left join public.profiles p on p.id = c.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = c.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    group by c.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- 진단 쿼리 — 특정 매니저·달에 왜 제외됐는지(또는 왜 아직도 포함되는지) 바로 확인하고 싶을 때.
-- scheduled_at/completed_at 월이 다른 경우(이전 admin_settlement_fixes_v2.sql 참고)와, 이번에 새로
-- 걸러낸 취소/환불 상태를 한 화면에서 같이 봅니다. :manager_id 와 월을 실제 값으로 바꿔서 실행하세요.
-- ============================================================================
-- select
--   cs.id as schedule_id, cs.status as schedule_status, cs.completed_at, cs.manager_payout,
--   sa.id as application_id, sa.status as application_status, sa.payment_status
-- from public.care_schedules cs
-- left join public.service_applications sa on sa.id = cs.application_id
-- where cs.manager_id = '<여기에 매니저 uuid>'
--   and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul') = date_trunc('month', '2026-10-01'::timestamp)
-- order by cs.completed_at;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
