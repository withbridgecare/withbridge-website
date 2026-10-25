-- ============================================================================
-- 어드민 콘솔 '이름 미등록 / 연락처 미등록' 진단 + 재적용
--
--   점검 결과: admin.js/admin.html 쪽 코드는 문제가 없습니다.
--     - 컬럼명 불일치 없음: profiles.name/phone, managers.id(=profiles.id), user_packages 의
--       profiles(name, phone) embed, care_schedules.guardian_name/guardian_phone 모두 실제
--       스키마(sql/supabase_schema_latest.sql)와 정확히 일치합니다.
--     - RLS 정책도 레포 안에 이미 전부 올바르게 작성돼 있습니다 — sql/admin_profiles_select.sql
--       (profiles_select_admin, managers_select_admin), sql/admin_package_management.sql
--       (user_packages_select_admin), sql/admin_care_schedules_select.sql
--       (care_schedules_select_admin), sql/manager_applications.sql(관리자는 처음부터 전체 조회 허용).
--
--   즉 "코드"가 아니라 "이 정책들이 실제 Supabase 프로젝트에 적용됐는지"가 문제일 가능성이 가장
--   큽니다(파일은 레포에 있지만 SQL Editor에서 실행된 적이 없거나, 일부만 실행된 경우). 아래
--   0번 진단 블록을 먼저 실행해 원인을 확인한 뒤, 1~4번(= 기존 세 파일의 내용을 한 번에 모은
--   재적용분)을 실행하세요. 전부 create or replace / drop ... if exists 기반이라 이미 적용돼
--   있어도 다시 실행해 안전합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 붙여넣고 Run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) 진단 — 결과를 그대로 복사해서 알려주시면 정확한 원인을 짚어 드릴 수 있습니다.
--    a) 지금 이 SQL Editor 세션이 "로그인한 사용자"가 아니라 service_role/postgres 로 돌기 때문에
--       auth.uid() 는 보통 null 로 나옵니다 — 이건 정상이고, admin.html 을 브라우저에 로그인한 채로
--       열었을 때의 세션 기준으로는 아래 b) 가 더 중요합니다.
--    b) 관리자로 로그인했던 계정의 profiles.role 이 정확히 'admin' 인지 — 'admin' 이 아니면(공백,
--       대문자, 'Admin' 등) is_admin() 이 전부 false 가 되어 이번 글 전체가 의미 없어집니다.
--    c) 지금 이 테이블들에 '관리자용' 정책이 실제로 존재하는지.
-- ----------------------------------------------------------------------------

-- b) 관리자로 쓰고 있는 계정을 이메일로 찾아 role 을 확인하세요 (이메일을 알고 있다면 아래 바꿔서 실행)
-- select u.email, p.id, p.role, p.name, p.phone
--   from auth.users u join public.profiles p on p.id = u.id
--  where u.email = '여기에 관리자 로그인 이메일';

-- role 이 'admin' 인 행이 지금 몇 개나 있는지(0이면 그게 원인입니다)
select count(*) as admin_profile_count from public.profiles where role = 'admin';

-- c) 세 테이블에 지금 걸려 있는 모든 SELECT 정책 목록 (policyname 에 '_admin' 이 없으면 아직 미적용)
select schemaname, tablename, policyname, cmd, qual
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles', 'managers', 'manager_applications', 'user_packages', 'care_schedules')
   and cmd = 'SELECT'
 order by tablename, policyname;


-- ----------------------------------------------------------------------------
-- 1) profiles / managers 관리자 전체 조회 (sql/admin_profiles_select.sql 과 동일 — 재적용)
-- ----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant select on public.managers to authenticated;

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists managers_select_admin on public.managers;
create policy managers_select_admin on public.managers
  for select to authenticated
  using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 2) user_packages 관리자 전체 조회 (sql/admin_package_management.sql 2번과 동일 — 재적용)
-- ----------------------------------------------------------------------------
drop policy if exists user_packages_select_admin on public.user_packages;
create policy user_packages_select_admin on public.user_packages
  for select to authenticated using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 3) care_schedules 관리자 전체 조회 (sql/admin_care_schedules_select.sql 과 동일 — 재적용)
-- ----------------------------------------------------------------------------
drop policy if exists care_schedules_select_admin on public.care_schedules;
create policy care_schedules_select_admin on public.care_schedules
  for select to authenticated
  using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 4) manager_applications — 원래부터 "본인 또는 관리자 전체 조회"였는지 재확인(사고로 덮어써졌을
--    경우를 대비해 재적용). 이 정책이 없으면 '매니저 이름/연락처 보조 조회'(admin.js
--    fetchActiveManagersWithNames) 가 다른 매니저의 신청서를 못 읽어 fallback 도 실패합니다.
-- ----------------------------------------------------------------------------
drop policy if exists manager_applications_select on public.manager_applications;
create policy manager_applications_select on public.manager_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
