-- ============================================================================
-- 관리자가 care_schedules 전체를 조회할 수 있게 하는 RLS 정책
--
--   지금까지 care_schedules 의 SELECT 정책은 두 종류뿐이었습니다(sql/supabase_schema_latest.sql):
--     - care_schedules_select_own                    : manager_id = auth.uid() (담당 매니저 본인)
--                                                        또는 미배정+대기 건(매니저 전체)
--     - care_schedules_select_guardian / _via_application : guardian_id = auth.uid() (신청한 보호자 본인)
--   관리자(profiles.role = 'admin')가 "배정 완료(진행 중) 케어 건 현황판"에서 다른 사람에게 배정된
--   일정까지 전부 봐야 하는데, 지금까지는 그걸 허용하는 정책이 없어 관리자 자신이 매니저가 아닌 한
--   아무것도 안 보였습니다. (admin_service_applications_select.sql 때 겪었던 것과 같은 종류의 공백입니다.)
--
--   기존 정책은 그대로 두고 is_admin() 만 확인하는 정책을 하나 더 추가합니다 — permissive 정책은
--   OR 로 합쳐지므로 기존 접근 권한은 전혀 줄어들지 않습니다.
--
--   realtime(postgres_changes) 발행 등록은 이미 sql/supabase_schema_latest.sql 에서 care_schedules 를
--   supabase_realtime publication 에 추가하고 replica identity full 로 설정해 뒀으므로 이 파일에서는
--   RLS 정책만 추가하면 충분합니다 — admin.js 의 실시간 구독도 바로 이 테이블을 그대로 탑니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop policy if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists care_schedules_select_admin on public.care_schedules;
create policy care_schedules_select_admin on public.care_schedules
  for select to authenticated
  using (public.is_admin());

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
