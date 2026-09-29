-- =====================================================================
-- 위드브릿지: 새로 만드는 매니저 계정은 certification_verified = true 로 시작하도록 기본값 변경
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 이 파일이 하는 일
--   1) managers.certification_verified 의 기본값을 false → true 로 바꿉니다.
--      앞으로 대시보드/SQL 로 managers 에 행을 추가할 때 값을 생략하면 '인증 완료'로 저장됩니다.
--        insert into public.managers (id, certification) values ('<계정 UUID>', '요양보호사');   -- → certification_verified = true
--      인증 전 상태로 등록하고 싶으면 값을 직접 false 로 적으세요:
--        insert into public.managers (id, certification, certification_verified) values ('<계정 UUID>', '요양보호사', false);
--   2) (안전장치) 브라우저의 로그인 사용자가 managers 에 행을 추가·수정·삭제하지 못하도록 권한을 다시 회수합니다.
--
-- ⚠ 왜 2번이 꼭 필요한가
--   certification_verified = true 는 곧 '신청서에 적힌 이름·연락처·주소를 볼 수 있는 자격'입니다
--   (supabase-applications-to-manager.sql 의 조회 정책이 is_manager() = 이 값이 true 를 기준으로 합니다).
--   기본값이 true 인데 일반 로그인 사용자가 managers 에 스스로 행을 만들 수 있다면, 누구나 '인증된 매니저'가 되어
--   다른 사람의 신청 정보를 읽을 수 있게 됩니다. 그래서 행 추가는 반드시 운영자(대시보드 / 서비스 키)만 할 수 있어야 합니다.
--   (참고: 2번은 새 사용자 화면 코드가 아니라 DB 권한 설정이며, 매니저의 활동 상태(온라인/휴식) 변경은 그대로 됩니다)
-- =====================================================================

-- 1) 기본값 변경 (이미 있는 행의 값은 바뀌지 않습니다)
alter table public.managers alter column certification_verified set default true;

-- 2) 안전장치: 로그인 사용자·비로그인 방문자는 managers 를 '조회'와 '본인 활동 상태 변경'만 가능
revoke insert, update, delete on public.managers from anon, authenticated;
grant  select on public.managers to authenticated;
grant  update (activity_status) on public.managers to authenticated;   -- 자격/인증 여부는 본인이 못 바꿈

-- ★ 확인 (각각 실행)
--   1) 기본값이 true 인지:
--        select column_default from information_schema.columns
--         where table_schema = 'public' and table_name = 'managers' and column_name = 'certification_verified';
--   2) 일반 사용자에게 INSERT/DELETE 권한이 없는지 (authenticated·anon 에 INSERT, DELETE 가 보이면 안 됩니다):
--        select grantee, privilege_type from information_schema.role_table_grants
--         where table_schema = 'public' and table_name = 'managers' and grantee in ('anon', 'authenticated');
--   3) 정책 확인 (managers_select_own, managers_update_own 만 보여야 합니다):
--        select policyname, cmd, roles from pg_policies where tablename = 'managers';
--
-- ★ 이미 등록된 매니저(예: 인증 전 상태로 남아 있는 테스트 계정)를 인증 완료로 바꾸려면 별도로 실행하세요:
--        update public.managers set certification_verified = true where id = '<계정 UUID>';
