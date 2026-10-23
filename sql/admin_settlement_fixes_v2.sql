-- ============================================================================
-- 관리자 정산(매니저 월별) "완료 건수 6건/200,200원" vs 매니저 캘린더 "1건" 불일치 조사 + 방어적 재작성
--
--   먼저 결론: admin_manager_monthly_settlements() 를 다시 처음부터 읽어봤는데, service_applications나
--   다른 자식 테이블을 1:N 으로 조인하는 부분은 원래 없었습니다 — care_schedules 한 테이블만 보고,
--   거기 붙는 profiles/manager_applications 조인은 전부 "행 1개당 최대 1개"만 매칭되는 조인(profiles.id
--   는 PK, manager_applications 쪽은 LATERAL ... LIMIT 1)이라 수학적으로 건수를 불려 보낼 수 없는
--   구조였습니다. 그래서 COUNT(DISTINCT ...) 로 바꿔도 지금 당장 숫자가 달라지지는 않을 가능성이
--   높습니다 — 다만 요청하신 대로 "앞으로 조인이 추가되어도 건수가 절대 안 불어나는" 구조로 아래
--   2)에서 다시 작성해 두었습니다(완료 건을 먼저 CTE로 확정한 뒤에만 표시용 조인을 붙임).
--
--   실제로 "6건/200,200원"이 나오는 더 흔한 원인은 두 화면이 완료 건을 서로 다른 "달"기준으로 나누기
--   때문입니다:
--     - admin_manager_monthly_settlements(): completed_at(실제 완료 처리 시각) 기준으로 그 달을 나눔
--       — 정산은 "언제 일을 끝냈는지"로 마감해야 하므로(매월 말일 마감 → 익월 10일 지급) 이게
--       재무적으로 맞는 기준입니다.
--     - mypage-manager.html 의 캘린더 탭: scheduled_at(원래 예약했던 날짜) 기준으로 날짜 칸에 배치
--       (groupScheduleByDay, calDateKey) — "언제 케어를 수행했는지" 보여주는 화면이라 일부러 이렇게
--       만들어 둔 것입니다.
--   즉 "9월에 예약됐지만 처리(완료)는 10월에 된" 건이 있으면, 캘린더의 10월 페이지에는 안 보이고
--   (9월 페이지에 있음) admin 집계에는 10월 완료로 정확히 잡힙니다 — 반대로 이런 건이 여러 개 있으면
--   "캘린더 1건 vs admin 6건"처럼 크게 벌어질 수 있습니다. 1)의 진단 쿼리로 실제로 그런지 바로 확인할
--   수 있습니다.
--
--   실행 순서: sql/manager_settlement_70_30.sql → sql/admin_settlement_fixes.sql → 이 파일.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 진단 쿼리 — 어드민 화면에 뜨는 "그 매니저·그 달" 원본 행을 그대로 펼쳐 봅니다. 함수가 아니라
--    바로 실행하는 SELECT 문입니다. :manager_id 와 :month 를 실제 값으로 바꿔서 Supabase SQL Editor에서
--    실행해 보세요(예: 관리자 화면에 뜬 이름의 매니저 uuid, '2026-10-01').
--    scheduled_at 과 completed_at 의 월(月)이 서로 다른 행이 있는지 바로 눈으로 확인할 수 있습니다.
-- ----------------------------------------------------------------------------
-- select
--   cs.id, cs.application_id, cs.status,
--   cs.scheduled_at, cs.completed_at,
--   to_char(cs.scheduled_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as scheduled_kst,
--   to_char(cs.completed_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as completed_kst,
--   cs.payment_amount, cs.manager_payout, cs.extra_charge_amount, cs.extra_charge_status
-- from public.care_schedules cs
-- where cs.manager_id = '<여기에 매니저 uuid>'
--   and cs.status = 'completed'
--   and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul') = date_trunc('month', '2026-10-01'::timestamp)
-- order by cs.completed_at;


-- ----------------------------------------------------------------------------
-- 2) admin_manager_monthly_settlements() 재작성 — 완료 건을 먼저 CTE(completed_rows)로 "딱 1번씩만"
--    확정한 뒤, 그 결과에만 이름 표시용 조인을 붙입니다. 이렇게 구조를 나누면 나중에 누가 실수로
--    1:N 조인을 추가해도 건수가 불어나는 게 아니라 중복된 "이름 조회 행"만 생기고, 바로 다음 줄의
--    group by + count(distinct completed_rows.id) 가 이를 다시 1건으로 되돌립니다 — 즉 조인 종류와
--    무관하게 건수가 절대 두 번 세어지지 않는 구조입니다(요청하신 COUNT(DISTINCT ...) 요구사항을
--    구조적으로 강제).
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
    with completed_rows as (
      -- '완료' 집계의 유일한 기준 테이블. 여기서 한 번 더 명시적으로 status='completed' 만 고르고
      -- (요청 1), manager_id 가 없는 행(이례적인 레거시 데이터)은 애초에 배제합니다(요청 2).
      -- id 는 care_schedules 의 PK 이므로 이 CTE 안에서 이미 "건당 정확히 1행"이 보장됩니다.
      select cs.id, cs.manager_id, cs.manager_payout
        from public.care_schedules cs
       where cs.status = 'completed'
         and cs.manager_id is not null
         and cs.completed_at is not null
         and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
           = date_trunc('month', p_month::timestamp)
    )
    select
      c.manager_id,
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      -- 표시용 조인(profiles/manager_applications)은 전부 "1행당 최대 1개"만 붙는 조인(profiles.id는 PK,
      -- manager_applications 쪽은 LATERAL ... LIMIT 1)이라 completed_rows 를 늘리지 않습니다. 그래도
      -- 요청하신 대로 COUNT(DISTINCT ...)/합계 모두 completed_rows.id 기준 중복 제거를 명시적으로 강제합니다.
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
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
