-- ============================================================================
-- 1회성 복구: suseung396@gmail.com 계정의 role 을 'admin' 으로 되돌립니다
--
--   매니저 승인 함수가 profiles.role 을 조건 없이 'manager' 로 덮어쓰던 버그(이제
--   sql/protect_admin_role.sql 로 고쳤습니다) 때문에 강등된 계정을 지금 바로 복구합니다.
--   이 파일은 정규 마이그레이션 체인(순서대로 반복 실행하는 파일들)이 아니라 한 번만 실행하는
--   복구용 스크립트입니다 — 실행 후 지워도 됩니다.
--
--   실행 순서: 이 파일을 먼저 실행해 계정을 복구한 뒤, sql/protect_admin_role.sql 을 실행해
--   앞으로 다시는 이 계정이(또는 다른 admin 계정이) 강등되지 않도록 막으세요.
-- ============================================================================

update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where lower(email) = 'suseung396@gmail.com');

-- 확인: 아래 조회 결과의 role 이 'admin' 으로 보이면 복구가 성공한 것입니다.
select id, role from public.profiles
 where id = (select id from auth.users where lower(email) = 'suseung396@gmail.com');
