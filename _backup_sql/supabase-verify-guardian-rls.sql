-- ============================================================================
-- 보호자(guardian)의 care_schedules / care_reports 읽기 권한 점검 + 재확인
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- 지금까지 이 정책들은 여러 파일(supabase-guardian-realtime.sql, supabase-fix-status-sync.sql,
-- supabase-manager-schema.sql)에 나뉘어 있었습니다 — 이 파일은 그 정책들을 한 곳에 모아 다시 한번
-- 확실하게 적용합니다. 전부 DROP POLICY IF EXISTS → CREATE POLICY 로만 되어 있어 몇 번을 실행해도
-- 안전합니다(기존 정책을 지우고 같은 내용으로 다시 만들 뿐, 데이터는 건드리지 않습니다).
--
-- ▶ 결론부터: care_schedules 는 보호자가 "직접" SELECT 할 수 있어야 하고(아래 1번), care_reports 는
--   보호자가 직접 SELECT 할 수 없는 것이 정상 설계입니다(아래 2번 — guardian_care_reports 뷰로만 읽습니다).
--   즉 "care_reports 에도 보호자용 RLS 정책이 있어야 하는 것 아닌가?"라는 의심이 들 수 있는데, 그 테이블에는
--   정산 금액이 없어 상대적으로 덜 민감하긴 해도 여전히 매니저 개인 정보가 없기 때문에 view 하나로 충분하고,
--   오히려 원본 테이블에 보호자 SELECT 를 열면 view 가 일부러 숨기는 컬럼까지 다 보이게 되어 후퇴입니다.
-- ============================================================================

-- 1) care_schedules: 보호자가 자신의 일정을 직접 읽을 수 있는 정책 두 개 (OR 로 합쳐짐) ----------------------
alter table public.care_schedules enable row level security;

-- 1-A) guardian_id 로 직접 연결된 일정 (구글폼으로 운영자가 직접 입력한 옛 방식 포함)
drop policy if exists care_schedules_select_guardian on public.care_schedules;
create policy care_schedules_select_guardian on public.care_schedules
  for select to authenticated using (guardian_id = auth.uid());

-- 1-B) service_applications.user_id 로 연결된 일정 (앱에서 신청 → 매니저가 수락한 신식 흐름)
drop policy if exists care_schedules_select_guardian_via_application on public.care_schedules;
create policy care_schedules_select_guardian_via_application on public.care_schedules
  for select to authenticated using (
    exists (
      select 1 from public.service_applications a
      where a.id = care_schedules.application_id
        and a.user_id = auth.uid()
    )
  );

-- 2) care_reports: 보호자는 이 테이블에 직접 접근하지 않습니다 (의도된 설계) -------------------------------
--    care_reports_select_own(manager_id = auth.uid())만 있고 보호자용 정책은 없습니다 — 대신
--    guardian_care_reports 뷰(security_barrier, is_my_care_schedule() 로 필터링)가 SECURITY DEFINER 처럼
--    뷰 소유자 권한으로 실행되어, 보호자가 원본 테이블 권한 없이도 '내 것'만 읽을 수 있게 해 줍니다.
--    아래는 그 권한 설정을 다시 한번 명확히(이미 되어 있어도 무해) 합니다.
revoke all on public.care_reports from anon, authenticated;
revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- ★ 진단 쿼리 (SQL Editor, 순서대로 실행해 보세요)
-- ============================================================================

-- A) 두 정책이 실제로 등록됐는지 (2행 나와야 정상)
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'care_schedules'
  and policyname like 'care_schedules_select_guardian%';

-- B) care_reports 에는 보호자용 정책이 '없는 게' 정상입니다 (manager 용 2개만 나와야 함)
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'care_reports';

-- C) guardian_care_reports 뷰의 실제 컬럼 구성 (read_at 이 마지막 컬럼으로 있어야 정상 —
--    없다면 supabase-care-report-read-tracking.sql 을 아직 안 돌렸거나 그 실행이 중간에 실패한 것입니다)
select column_name, ordinal_position
from information_schema.columns
where table_schema = 'public' and table_name = 'guardian_care_reports'
order by ordinal_position;

-- D) 특정 보호자 계정으로 직접 연결이 되어 있는지 확인 (이메일로 auth.users 에서 id 를 먼저 찾으세요):
--      select id, email, email_confirmed_at from auth.users where email ilike '%보호자이메일%';
--    그 id 로 아래를 실행해, 그 사람의 일정이 guardian_id 또는 application_id 경로 중 하나로 걸리는지 확인:
--      select s.id, s.status, s.guardian_id, s.guardian_email, s.application_id, a.user_id as app_user_id
--      from public.care_schedules s
--      left join public.service_applications a on a.id = s.application_id
--      where s.guardian_id = '<보호자 uuid>' or a.user_id = '<보호자 uuid>'
--      order by s.scheduled_at desc;
--    0행이면 이 보호자의 일정이 guardian_id 로도 application_id 로도 전혀 연결되지 않은 것입니다
--    (운영자가 guardian_id 를 안 채웠거나, service_applications.user_id 가 다른 계정으로 잘못 들어간 경우) —
--    supabase-fix-guardian-visibility.sql 의 수동 연결 방법을 참고하세요.

-- E) 400 Bad Request 가 브라우저 콘솔/네트워크 탭에 계속 보인다면, RLS 문제가 아니라 "쿼리가 존재하지 않는
--    컬럼을 요청"하는 스키마 불일치일 가능성이 훨씬 큽니다(RLS 는 보통 결과를 조용히 0행으로 줄일 뿐, 400 을
--    내지 않습니다). mypage.html 은 이미 이런 상황에 대비해 없는 컬럼만 하나씩 빼고 재시도하도록 되어 있으니
--    (care_schedules 는 querySched(), guardian_care_reports 는 queryReports()) 브라우저 콘솔에서
--    "[동행 진행 현황] care_schedules 컬럼 일부가 없습니다" 또는 "[케어 리포트] guardian_care_reports 컬럼
--    일부가 없습니다" 경고가 찍히는지 확인해 어떤 컬럼이 문제인지 바로 알 수 있습니다.
