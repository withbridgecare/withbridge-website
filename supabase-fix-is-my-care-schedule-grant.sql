-- ============================================================================
-- "permission denied for function is_my_care_schedule" 오류 수정
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-care-report-read-tracking.sql 이 먼저 실행되어
--  있다고 가정합니다 — is_my_care_schedule() 함수와 guardian_care_reports view 를 그 파일들이 만듭니다)
--
-- ▶ 원인: supabase-manager-schema.sql 이 is_my_care_schedule() 을 만들면서
--     revoke all on function public.is_my_care_schedule(uuid, text) from public, anon, authenticated;
--   를 실행해 뒀습니다. 이 함수가 SECURITY DEFINER 라서 "내부에서" 하는 일(다른 사람 일정 열람 등)은
--   안전하지만, PostgreSQL 은 SECURITY DEFINER 여부와 무관하게 "함수를 호출할 수 있는지"(EXECUTE 권한)는
--   별도로 검사합니다. 그리고 guardian_care_reports view 는 함수가 아니라 '뷰'이기 때문에, 뷰 안의
--   where 절에서 is_my_care_schedule() 을 호출할 때는 (뷰 소유자가 아니라) 뷰를 조회하는 로그인 사용자
--   권한으로 그 EXECUTE 검사가 이뤄집니다. 그래서 authenticated 사용자가 guardian_care_reports 를
--   select 하기만 해도(즉 mypage.html / mypage-manager.html 이 그 view 를 걸치는 어떤 조회를 해도)
--   "permission denied for function is_my_care_schedule" 로 막힙니다.
--   (반면 mark_care_report_read() 처럼 그 자체가 SECURITY DEFINER 함수 안에서 호출하는 경우는 함수
--   소유자 권한으로 실행되어 이 문제가 없었습니다 — 그래서 지금까지 완전히 드러나지 않았던 것입니다)
--
-- ▶ 조치: is_my_care_schedule() 은 내부적으로 auth.uid() 로만 판단하고 인자로 받은 값과 비교할 뿐이라
--   authenticated/anon 에게 EXECUTE 를 열어줘도 다른 사람의 데이터가 새지 않습니다(그 함수 자체가
--   '이 일정이 로그인한 나의 것인가?' 라는 boolean 만 돌려줄 뿐, 데이터를 읽어오지 않습니다).
--   anon 에게도 권한을 열어 두는 이유는 로그아웃 상태에서 guardian_care_reports 를 계획(plan)하거나
--   에러 메시지가 role 에 따라 달라지는 걸 막기 위함이며, 실제로는 auth.uid() 가 null 이라 항상 false 를
--   돌려주므로 안전합니다.
grant execute on function public.is_my_care_schedule(uuid, text) to authenticated, anon;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   1) 권한이 실제로 부여됐는지:
--        select grantee, privilege_type
--        from information_schema.routine_privileges
--        where routine_name = 'is_my_care_schedule';
--      grantee 목록에 authenticated, anon 이 보여야 정상입니다.
--   2) 보호자 계정으로 로그인한 세션(anon key + 로그인)에서 guardian_care_reports 를 select 해
--      더 이상 permission denied 가 나지 않는지 확인하세요 (SQL Editor 는 auth.uid() 가 없어
--      결과가 항상 0건이라 이 오류 자체는 재현되지 않습니다 — 실제 로그인 세션에서 테스트해야 합니다).
