-- ============================================================================
-- 보호자 마이페이지(mypage.html)가 care_schedules 의 status 변경을 Supabase Realtime
-- "Postgres Changes"로 직접 구독할 수 있게, 본인 일정만 보이는 SELECT 정책을 추가합니다.
--
-- ▶ 왜 필요한가 (실시간 업데이트가 안 되던 원인)
--   지금까지 보호자는 care_schedules 테이블에 SELECT 권한이 전혀 없고(감독자가 공감), 오직
--   my_application_schedules() RPC(SECURITY DEFINER)로만 우회해서 읽었습니다 (supabase-care-verification.sql).
--   그런데 Supabase Realtime의 Postgres Changes 구독은 테이블의 RLS를 그대로 적용합니다 — 그래서 보호자가
--   care_schedules 의 UPDATE 이벤트를 구독해도, RLS가 막고 있으니 에러도 없이 이벤트가 하나도 오지 않았고
--   (매니저가 상태를 '이동 중'으로 바꿔도) 화면이 30초 폴링 전까지는 그대로 있었습니다.
--   이 파일은 care_schedules.guardian_id(이미 존재하는 컬럼, accept_service_application() 이 채워 줌)를
--   기준으로 '내 일정만' 보이는 SELECT 정책을 추가해 이 경로를 열어 줍니다.
--
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-applications-to-manager.sql 을 먼저 실행했다고 가정합니다 — guardian_id 컬럼 필요)
-- ============================================================================

-- 1) 보호자 전용 SELECT 정책: 내 계정이 guardian_id 로 연결된 일정만 볼 수 있습니다.
--    (기존 care_schedules_select_own 정책은 manager_id = auth.uid() 기준이라 매니저용이고, 이 정책과 OR 로 합쳐집니다)
drop policy if exists care_schedules_select_guardian on public.care_schedules;
create policy care_schedules_select_guardian on public.care_schedules
  for select to authenticated using (guardian_id = auth.uid());

-- 2) Realtime이 이 테이블의 변경 사항을 방송하도록 publication에 포함되어 있는지 보장합니다 (이미 있으면 아무 일도 안 함).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'care_schedules'
  ) then
    alter publication supabase_realtime add table public.care_schedules;
  end if;
end $$;

-- 3) UPDATE 이벤트의 payload.old 에 변경 전 전체 컬럼(특히 status)이 담기게 합니다. 기본값(REPLICA IDENTITY
--    DEFAULT)은 old 레코드에 기본키만 담아 보내서, mypage.html 콘솔 로그에 'undefined → departed'처럼
--    변경 전 상태가 안 찍히는 원인이 됩니다 (동작 자체에는 영향 없고 디버깅 로그만 비어 보임).
alter table public.care_schedules replica identity full;

-- ★ 확인용 (SQL Editor)
--   정책이 등록됐는지 확인:
--     select policyname, cmd, qual from pg_policies
--     where schemaname = 'public' and tablename = 'care_schedules';
--   이 테이블이 Realtime publication 에 있는지 확인 (0행이면 위 2)번이 아직 반영되지 않은 것):
--     select * from pg_publication_tables
--     where pubname = 'supabase_realtime' and tablename = 'care_schedules';
--   보호자 계정으로 로그인한 세션(anon key + 로그인, SQL Editor 아님)에서 아래가 내 일정만 반환하는지 확인:
--     select id, status, guardian_id from public.care_schedules;
