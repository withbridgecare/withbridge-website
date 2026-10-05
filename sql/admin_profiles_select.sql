-- ============================================================================
-- 관리자가 profiles / managers 테이블을 다른 유저 행까지 조회할 수 있게 하는 SELECT 정책
--
--   지금까지 profiles/managers 는 둘 다 '내 행만'(id = auth.uid()) 조회하는 정책만 있었습니다
--   (sql/supabase_schema_latest.sql 의 profiles_select_own / managers_select_own).
--   어드민 콘솔의 '활동 중인 케어 매니저' 목록이 managers.id 로 profiles(name, phone) 를 직접
--   embed 조인해서 보여주려면, 관리자 세션이 본인 소유가 아닌 다른 유저의 profiles/managers 행도
--   읽을 수 있어야 합니다 — 지금은 그게 안 돼서 다른 사람 행을 조인하면 RLS 에 막혀 null 로
--   돌아오고(이름 '미등록', 연락처 자리에 UUID 대체) 있었습니다.
--
--   기존 *_select_own 정책은 그대로 두고, is_admin() 만 확인하는 정책을 하나씩 더 추가합니다.
--   같은 테이블에 permissive 정책이 여러 개면 OR 로 합쳐지므로, 본인 조회 조건(id = auth.uid())은
--   그대로 유지되면서 관리자에게만 전체 조회 권한이 추가로 열립니다.
--
--   ⚠ 이 정책은 is_admin() = true 일 때만 열립니다. 즉 "활동 중인 케어 매니저 목록이 안 보인다"는
--   증상은 이 파일이 아니라 보통 내 계정의 profiles.role 이 'admin'이 아니게 된 경우입니다
--   (매니저 승인 함수가 role 을 잘못 덮어쓰던 버그 — sql/protect_admin_role.sql 이 그걸 막습니다).
--   이 파일과 protect_admin_role.sql 은 세트로 함께 실행하세요: 권한 보호(누가 admin인지) 는
--   protect_admin_role.sql, 그 admin 에게 조회 권한을 실제로 열어주는 건 이 파일입니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요)
--             → sql/protect_admin_role.sql → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop ... if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 테이블 단위 SELECT 권한을 다시 한번 명시적으로 보장합니다 (supabase_schema_latest.sql 에서 이미
-- grant 했지만, 혹시라도 다른 스크립트가 revoke 했을 경우까지 대비해 이 파일만 실행해도 완전히
-- 복구되도록 재확인합니다). RLS 정책이 '누구의 행을 볼 수 있는지'를 결정하고, 이 GRANT 는 그보다
-- 앞서 '이 역할이 이 테이블에 SELECT 자체를 시도할 수 있는지'를 결정하는 더 바깥쪽 권한 체크입니다.
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

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
