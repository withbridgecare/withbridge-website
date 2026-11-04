-- ============================================================================
-- manager_review_stats.sql
-- mypage-manager.html 프로필 카드(이름/자격 배지 옆)에 매니저 본인의 평균 평점·리뷰 건수를
-- 보여주기 위한 RPC 입니다.
--
--   어드민 쪽 admin_manager_care_overview()(sql/admin_active_manager_enhancements.sql)가 하는
--   것과 똑같은 집계(care_reviews × care_schedules 를 schedule_id 로 묶어 manager_id 별
--   avg(rating)/count(*))지만, 그 함수는 맨 앞에서 is_admin() 을 확인하는 관리자 전용 RPC라
--   매니저 본인은 호출할 수 없습니다. 이 함수는 반대로 '내 것만' 보도록 auth.uid() 로 직접
--   제한하고, SECURITY DEFINER 도 필요 없습니다 — care_schedules_select_own(manager_id =
--   auth.uid(), sql/supabase_schema_latest.sql)과 care_reviews_select(담당 매니저 본인 포함,
--   sql/care_reviews.sql) RLS 가 이미 "내가 맡은 케어의 리뷰"만 보여주므로, 호출자 권한
--   그대로(기본값인 SECURITY INVOKER) 집계해도 다른 매니저의 리뷰가 섞여 들어올 수 없습니다.
--
--   리뷰가 하나도 없는 경우에도 집계 함수(avg/count)는 행 1개를 그대로 돌려줍니다
--   (avg_rating = null, review_count = 0) — 프론트엔드가 이 경우 "★ - (리뷰 없음)"으로 표시합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/care_reviews.sql → 이 파일.
--   create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

create or replace function public.manager_my_review_stats()
returns table (
  avg_rating   numeric,
  review_count integer
)
language sql stable security invoker set search_path = public as $$
  select round(avg(cr.rating), 1), count(*)::integer
    from public.care_reviews cr
    join public.care_schedules cs on cs.id = cr.schedule_id
   where cs.manager_id = auth.uid();
$$;

revoke all on function public.manager_my_review_stats() from public, anon;
grant  execute on function public.manager_my_review_stats() to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
