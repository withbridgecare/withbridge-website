-- ============================================================================
-- admin_active_manager_enhancements.sql
-- admin.html '04. 활동 중인 케어 매니저' 카드 고도화에 필요한 서버 쪽 추가분입니다.
--
--   1) 배정된 케어 건수 — admin_manager_care_overview() RPC 가 care_schedules 를 매니저별로
--      집계해, "현재 배정되어 대기 중이거나 진행 중인 건수"(assigned_care_count, sql/
--      manager_duty_status.sql 의 enforce_manager_break_guard() 가 '휴식 전환 불가'로 보는
--      것과 똑같은 상태 집합)와 완료 건수(completed_care_count), 평균 평점/리뷰 건수
--      (care_reviews, sql/care_reviews.sql)를 한 번에 돌려줍니다. 같은 함수가 가입/로그인
--      계정 이메일(auth.users.email)도 함께 돌려줍니다 — profiles 에는 email 컬럼이 없고
--      auth 스키마는 PostgREST 에 노출되지 않으므로, admin_list_members()(sql/
--      admin_user_management.sql)와 같은 패턴으로 SECURITY DEFINER 함수 안에서만 auth.users 를
--      직접 조회합니다(함수 맨 앞의 is_admin() 체크가 유일한 방어선, fail closed).
--   2) 활동 가능 지역 — 이미 manager_applications.activity_areas(sql/manager_applications_v2.sql)
--      에 지원 시점 값이 있으므로 새 컬럼을 만들지 않습니다. admin.js 가 이름/연락처 보조 조회에
--      쓰던 fetchActiveManagersWithNames() 의 manager_applications 쿼리에 이 컬럼만 추가해서
--      그대로 재사용합니다 — 이 SQL 파일에서는 할 일이 없습니다(스키마 변경 없음).
--   3) 근무 상태 수동 변경 — admin_set_manager_activity_status() RPC. UPDATE 문 자체는
--      managers_break_guard 트리거(sql/manager_duty_status.sql)를 그대로 통과하므로, 진행 중인
--      케어가 있는 매니저를 관리자가 '휴식 중'으로 강제 전환하는 것도 똑같이 막힙니다 — 관리자
--      전용이라고 해서 현장 안전장치를 우회하지 않습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/manager_duty_status.sql → sql/care_reviews.sql → 이 파일.
--   create/drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) + 3) 매니저별 배정/완료 건수 + 평균 평점 요약
-- ----------------------------------------------------------------------------
drop function if exists public.admin_manager_care_overview();

create or replace function public.admin_manager_care_overview()
returns table (
  manager_id           uuid,
  email                text,
  assigned_care_count  integer,
  completed_care_count integer,
  avg_rating           numeric,
  review_count         integer
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
    select
      m.id,
      u.email::text,
      coalesce(active.cnt, 0)::integer,
      coalesce(done.cnt, 0)::integer,
      round(rv.avg_rating, 1),
      coalesce(rv.review_count, 0)::integer
    from public.managers m
    left join auth.users u on u.id = m.id
    left join (
      select cs.manager_id, count(*) as cnt
        from public.care_schedules cs
       where cs.status in ('assigned', 'departed', 'arrived', 'treatment_done', 'returning')
       group by cs.manager_id
    ) active on active.manager_id = m.id
    left join (
      select cs.manager_id, count(*) as cnt
        from public.care_schedules cs
       where cs.status = 'completed'
       group by cs.manager_id
    ) done on done.manager_id = m.id
    left join (
      select cs.manager_id, avg(cr.rating) as avg_rating, count(*) as review_count
        from public.care_reviews cr
        join public.care_schedules cs on cs.id = cr.schedule_id
       group by cs.manager_id
    ) rv on rv.manager_id = m.id
   where m.certification_verified = true;
end $$;

revoke all on function public.admin_manager_care_overview() from public, anon;
grant  execute on function public.admin_manager_care_overview() to authenticated;

-- ----------------------------------------------------------------------------
-- 2) 근무 상태 수동 변경 — admin.html '활동 중인 케어 매니저' 카드의 [근무 중으로 전환] /
--    [휴식 중으로 전환] 버튼에서 호출합니다. UPDATE 한 줄이지만, 그 자체로 managers_break_guard
--    트리거를 그대로 통과시켜(우회하지 않음) 진행 중인 케어가 있으면 '휴식 중' 전환이 실패합니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_set_manager_activity_status(uuid, text);

create or replace function public.admin_set_manager_activity_status(p_manager_id uuid, p_status text)
returns public.managers
language plpgsql security definer set search_path = public as $$
declare
  v_row public.managers;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  if p_status not in ('online', 'break') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  update public.managers
     set activity_status = p_status
   where id = p_manager_id
  returning * into v_row;

  if not found then
    raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.admin_set_manager_activity_status(uuid, text) from public, anon;
grant  execute on function public.admin_set_manager_activity_status(uuid, text) to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
