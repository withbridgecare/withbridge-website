-- ============================================================================
-- care_reports : "permission denied for table care_reports" 긴급 복구
--
--   증상: mypage-manager.html 에서 매니저가 케어 리포트를 제출하면(submitReport() →
--         care_reports.insert) "permission denied for table care_reports" 로 실패.
--
--   원인 ①(테이블 권한): sql/supabase_schema_latest.sql 에 care_reports 권한을 아래 순서로
--         적용해 둔 게 버그였습니다.
--           1) revoke insert, update, delete on care_reports from anon, authenticated;
--           2) grant  select, insert on care_reports to authenticated;
--           3) revoke all on care_reports from anon, authenticated;   ← 바로 위 2) 의 grant 를
--                                                                        그 자리에서 다시 취소함
--         보호자도 매니저와 똑같은 Postgres 역할("authenticated")로 로그인하기 때문에, 테이블 단위
--         GRANT로는 둘을 구분할 수 없습니다. 보호자가 care_reports 를 직접 못 보게 막는 건 이미
--         RLS 정책(manager_id = auth.uid())이 하고 있어서, 3)의 revoke all 은 보호자를 막는 대신
--         매니저의 insert/select 권한까지 통째로 없애버렸습니다.
--
--   원인 ②(RLS 조건, ①을 고쳐도 바로 다음에 또 막히는 잠재 버그): care_reports_insert_own 정책이
--         "연결된 care_schedules.status = 'completed'" 를 요구했는데, mypage-manager.html 의
--         completeSubmitBtn 핸들러는 리포트를 먼저 insert 한 뒤에야 advance_care_status() 로 상태를
--         'completed' 로 넘깁니다(리포트 없이 완료 처리되는 걸 막으려는 의도적 순서). 즉 insert 시점의
--         실제 상태는 아직 'returning' 이라서, ①만 고치면 "permission denied" 대신 "new row violates
--         row-level security policy for table care_reports" 로 또 막힙니다. status 가 'returning'
--         또는 'completed' 일 때 모두 허용하도록 조건을 넓혔습니다('completed' 는 저장 실패 후 재시도하는
--         openReportModal 경로를 위해 유지).
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   같은 내용을 sql/supabase_schema_latest.sql 의 "4) care_reports" 절에도 반영해 뒀으니,
--   스키마를 처음부터 새로 적용하는 환경이라면 이 파일을 따로 실행하지 않아도 됩니다.
--   grant/revoke/create policy 는 모두 멱등이라 여러 번 실행해도 안전합니다.
-- ============================================================================

revoke insert, update, delete on public.care_reports from anon, authenticated;
grant  select, insert on public.care_reports to authenticated;

-- RLS 정책도 혹시 비어 있다면(최초 배포 당시 적용이 안 됐을 경우) 함께 복구합니다.
alter table public.care_reports enable row level security;

drop policy if exists care_reports_select_own on public.care_reports;
create policy care_reports_select_own on public.care_reports
  for select to authenticated using (manager_id = auth.uid());

drop policy if exists care_reports_insert_own on public.care_reports;
create policy care_reports_insert_own on public.care_reports
  for insert to authenticated with check (
    manager_id = auth.uid()
    and exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.manager_id = auth.uid()
        and s.status in ('returning', 'completed')
    )
  );

notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- 점검 쿼리 (실행 후 Supabase SQL Editor 에서 결과를 눈으로 확인하는 용도 — 둘 다 2행이어야 정상)
-- ----------------------------------------------------------------------------
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'care_reports' and grantee = 'authenticated';
--   -- SELECT, INSERT 두 줄이 나와야 합니다 (UPDATE/DELETE 는 없어야 정상).
--
-- select policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'care_reports';
--   -- care_reports_select_own(SELECT), care_reports_insert_own(INSERT) 두 정책이 있어야 합니다.
