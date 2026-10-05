-- ============================================================================
-- 관리자가 service_applications 전체를 조회(+ Realtime 구독)할 수 있게 하는 RLS 정책
--
--   지금까지 service_applications 의 SELECT 정책은 두 개뿐이었습니다(sql/supabase_schema_latest.sql):
--     - service_applications_select_own    : auth.uid() = user_id (신청한 보호자 본인)
--     - service_applications_select_managers: is_manager() AND manager_id is null AND 접수 대기 상태
--   관리자(profiles.role = 'admin')를 위한 SELECT 정책은 한 번도 추가된 적이 없습니다.
--   admin_rls_policies.sql 이 만든 service_applications_update_admin 은 UPDATE(수동 배정)만 열어주고
--   SELECT 는 열어주지 않아서, 지금까지 admin.html의 '오늘의 케어 신청 · 수동 배정' 목록이 조회되던 건
--   관리자 계정이 '우연히' certification_verified=true 인 매니저이기도 해서 service_applications_select_managers
--   정책에 걸쳐 보였을 뿐입니다 — 관리자가 매니저가 아니면 이 목록은 통째로 비어 보이고, 매니저인 경우에도
--   '아직 수락 안 한 신청만' 보이는 매니저용 정책이라 배정된/완료된 신청은 애초에 안 보여서(의도한 필터링이 아니라
--   우연한 결과), 두 화면(admin.html / mypage-manager.html)이 서로 다른 신청 건을 보게 될 수 있었습니다.
--
--   이 파일은 is_admin() 전용 SELECT 정책을 명시적으로 추가해 이 우연한 의존을 없애고, Supabase Realtime
--   (postgres_changes)도 SELECT RLS 를 그대로 따르므로 관리자가 매니저의 '수락하기' 액션을 실시간으로
--   받아볼 수 있게 합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop policy if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists service_applications_select_admin on public.service_applications;
create policy service_applications_select_admin on public.service_applications
  for select to authenticated
  using (public.is_admin());

-- Realtime: admin.js 가 매니저의 '수락하기'/관리자의 '수동 배정'을 postgres_changes 로 직접 구독
-- (mypage.html 이 care_schedules 에 쓰는 것과 같은 패턴 — sql/supabase_schema_latest.sql 참고).
-- service_applications 는 지금까지 이 publication 에 추가된 적이 없어 Realtime 이벤트가 전혀 오지 않았습니다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_applications'
  ) then
    alter publication supabase_realtime add table public.service_applications;
  end if;
end $$;
alter table public.service_applications replica identity full;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
