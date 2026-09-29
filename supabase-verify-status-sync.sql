-- ============================================================================
-- supabase-fix-status-sync.sql 이 실제로 이 프로젝트에 반영됐는지 한 번에 확인하는 진단 스크립트입니다.
-- Supabase 대시보드 → SQL Editor 에서 아래 5개 쿼리를 하나씩(또는 전체) 실행해 결과를 확인하세요.
-- 이 파일은 아무것도 바꾸지 않습니다(전부 select) — 안전하게 여러 번 실행해도 됩니다.
-- ============================================================================

-- 1) RPC 가 실제로 등록돼 있는가? (3행이 나와야 정상 — 1~2행만 나오면 supabase-fix-status-sync.sql 을
--    아직 이 프로젝트에 실행 안 한 것입니다. 다시 실행하세요.)
select proname as function_name
from pg_proc
where proname in ('advance_care_status', 'record_care_verification', 'accept_service_application')
  and pronamespace = 'public'::regnamespace
order by proname;

-- 2) FK/UNIQUE 제약이 등록돼 있는가? (2행이 나와야 정상)
select conname, contype
from pg_constraint
where conname in ('care_schedules_application_id_fkey', 'care_schedules_application_id_key');

-- 3) 보호자용 RLS 정책이 등록돼 있는가? (care_schedules_select_guardian, care_schedules_select_guardian_via_application
--    두 개가 보여야 정상)
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'care_schedules';

-- 4) ★ 핵심 진단: 최근 상태가 바뀐 일정 10건의 두 테이블 status 가 실제로 같은 값인지 나란히 비교합니다.
--    in_sync 열이 전부 true 면 미러링이 정상 동작 중인 것이고, false 인 행이 있다면 바로 그 application_id 가
--    문제입니다(예전에 만들어진 일정이라 아직 한 번도 advance_care_status/record_care_verification 을
--    안 거쳤을 수 있음 — 매니저가 그 건에서 상태 버튼을 한 번만 더 누르면 그 순간부터 미러링됩니다).
select
  s.id as schedule_id,
  s.application_id,
  s.status as care_schedules_status,
  a.status as service_applications_status,
  (s.status = a.status) as in_sync,
  s.created_at as schedule_created_at
from public.care_schedules s
left join public.service_applications a on a.id = s.application_id
where s.status <> 'pending'
order by s.created_at desc
limit 10;

-- 5) application_id 가 아예 비어 있는 배정된 일정이 남아 있는가? (0행이 이상적 — 남아 있다면 supabase-fix-status-sync.sql
--    의 A-4 백필이 그 건을 못 이었다는 뜻이니, application_id 를 아래처럼 수동으로 채워 주세요)
select s.id as schedule_id, s.manager_id, s.status, s.created_at
from public.care_schedules s
where s.application_id is null and s.manager_id is not null
order by s.created_at desc;
--   수동 연결 예시(위에서 찾은 schedule_id 와, 그 매니저가 수락한 신청의 application_id 로):
--     update public.care_schedules set application_id = '<application_id>' where id = '<schedule_id>';
--     update public.service_applications set schedule_id = '<schedule_id>' where id = '<application_id>';
