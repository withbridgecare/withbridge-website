-- ============================================================================
-- guardian_care_reports view 에 application_id 노출 (하단 '이용 내역' 리포트 매칭 버그 수정)
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql 5번이 view 를 최초로 만들고, supabase-fix-status-sync.sql 이
--  care_schedules.application_id 컬럼을 추가해 둔 상태여야 합니다. CREATE OR REPLACE 로만 작성되어
--  여러 번 실행해도 안전합니다)
--
-- ▶ 증상: mypage.html 우측 '케어 리포트' 사이드바에는 리포트가 보이는데, 하단 '이용 내역 & 케어 리포트'
--   달력에서 같은 건을 클릭하면 "아직 케어 리포트가 작성되지 않았어요."로 나옴.
--
-- ▶ 원인: 달력 쪽(reportForSchedule())은 신청(application)과 리포트를 schedule_id 하나로만 연결합니다 —
--   즉 service_applications.schedule_id → care_schedules.id → care_reports.schedule_id 로 이어지는 체인이
--   어딘가에서 끊기면(예: 예전 데이터라 schedule_id 링크가 비어 있거나, care_schedules 조회가 RLS/네트워크
--   문제로 일시적으로 비어 있는 경우) 리포트가 실제로 있어도 못 찾습니다. 반면 사이드바 목록은 이 매칭 없이
--   리포트를 그대로 나열하기만 하므로 항상 정상으로 보입니다.
--
-- ▶ 수정: care_schedules 에는 이미 application_id 컬럼(신청 id)이 있으므로, view 에 그대로 노출해 mypage.html
--   이 application.id 로도(스케줄 체인을 안 거치고) 곧바로 매칭할 수 있게 합니다. application_id 가 가장
--   먼저 있는 값이므로 이걸 1순위로, 혹시 비어 있는 옛 데이터를 위해 schedule_id 매칭을 그대로 2순위 fallback
--   으로 남겨 둡니다.
--
-- ▶ 주의: PostgreSQL 의 CREATE OR REPLACE VIEW 는 기존 컬럼 이름·순서를 바꿀 수 없고 새 컬럼은 반드시 맨
--   끝에만 추가할 수 있습니다 — 그래서 이전 순서(report_id, schedule_id, submitted_at, physician_notes,
--   senior_condition, senior_name, origin, destination, scheduled_at, completed_at, manager_name, read_at)
--   그대로 두고 application_id 를 맨 끝에 덧붙입니다.
-- ============================================================================

create or replace view public.guardian_care_reports
with (security_barrier = true) as
select
  r.id               as report_id,
  r.schedule_id      as schedule_id,
  r.created_at       as submitted_at,
  r.physician_notes  as physician_notes,
  r.senior_condition as senior_condition,
  s.senior_name      as senior_name,
  s.origin           as origin,
  s.destination      as destination,
  s.scheduled_at     as scheduled_at,
  s.completed_at     as completed_at,
  p.name             as manager_name,         -- 담당 매니저 이름만 (연락처·정산 정보 없음)
  r.read_at          as read_at,
  s.application_id   as application_id        -- 새 컬럼은 반드시 맨 끝에 (mypage.html 의 신청 id 직접 매칭용)
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule(s.guardian_id, s.guardian_email);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   1) 컬럼이 맨 끝에 추가됐는지:
--        select column_name, ordinal_position from information_schema.columns
--        where table_schema = 'public' and table_name = 'guardian_care_reports' order by ordinal_position;
--   2) 실제 리포트 건의 application_id 가 채워져 있는지 (비어 있으면 옛 데이터라 schedule_id 로만 매칭됩니다):
--        select r.id as report_id, r.schedule_id, s.application_id
--        from public.care_reports r join public.care_schedules s on s.id = r.schedule_id
--        order by r.created_at desc limit 20;
