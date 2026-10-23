-- ============================================================================
-- '현장 이슈 발생 / 긴급 문의' 접수를 보호자 마이페이지(mypage.html)에서 케어 매니저 마이페이지
-- (mypage-manager.html)로 옮기면서, care_issue_reports 의 RLS가 "신청서의 보호자 본인
-- (service_applications.user_id = auth.uid())"만 insert/select 할 수 있게 짜여 있던 것을 매니저도
--쓸 수 있게 확장합니다 — 그대로 두면 매니저가 접수를 눌러도 RLS 위반(42501)으로 전부 막힙니다.
--
--   reporter_role 컬럼을 추가해 "누가 접수했는지"(guardian/manager)를 명시적으로 남깁니다 — 기존
--   행은 전부 보호자가 접수한 것이므로 default 'guardian'으로 백필됩니다. 어드민 콘솔(admin.js)이
--   이 값으로 "보호자 접수"/"매니저 접수" 배지를 구분해 보여줍니다.
--
--   보호자 쪽 UI는 이제 이 기능을 쓰지 않지만(운영팀 문의 안내로 대체), DB 정책 자체는 지우지 않고
--   매니저 경로를 OR로 추가만 합니다 — 혹시 남아있는 다른 경로(또는 나중에 되돌릴 경우)를 깨지
--   않기 위함입니다.
-- ============================================================================

alter table public.care_issue_reports
  add column if not exists reporter_role text not null default 'guardian'
    check (reporter_role in ('guardian', 'manager'));

drop policy if exists care_issue_reports_select_own on public.care_issue_reports;
create policy care_issue_reports_select_own on public.care_issue_reports
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.service_applications a
      where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.care_schedules cs
      where cs.id = care_issue_reports.schedule_id and cs.manager_id = auth.uid()
    )
  );

drop policy if exists care_issue_reports_insert_own on public.care_issue_reports;
create policy care_issue_reports_insert_own on public.care_issue_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.service_applications a
        where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
      )
      or exists (
        select 1 from public.care_schedules cs
        where cs.id = care_issue_reports.schedule_id and cs.manager_id = auth.uid()
      )
    )
  );

-- select_admin 정책(전체 조회)은 그대로 유지 — 변경 없음.

notify pgrst, 'reload schema';
