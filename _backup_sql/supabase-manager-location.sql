-- ============================================================================
-- 실시간 케어 트래킹: 매니저가 '이동 중'일 때 위도/경도를 주기적으로 기록하고,
-- 보호자 마이페이지(mypage.html)가 그 위치를 지도 위 매니저 마커로 실시간 표시합니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-care-verification.sql 을 먼저 실행했다고 가정합니다 — care_schedules.status 의 'departed' 값을 그대로 씁니다)
--
-- 실시간 전달 방식: 위치는 DB 폴링이 아니라 Supabase Realtime의 "Broadcast" 채널로 오갑니다.
--   * 매니저(mypage-manager.html) → 채널 'care-location:<care_schedules.id>' 로 { lat, lng, at } 를 15초마다 전송
--   * 보호자(mypage.html) → 같은 채널을 구독해 받은 좌표로 지도 마커를 부드럽게 이동
--   * 채널 이름에 일정의 UUID(추측 불가능한 값)를 써서 사실상 그 일정 당사자만 채널명을 알 수 있지만,
--     Broadcast 채널 자체는 DB 테이블처럼 RLS 로 보호되지 않습니다 — 더 강한 접근 제어가 필요하면 Supabase
--     대시보드에서 Realtime Authorization(= realtime.messages 에 대한 RLS 정책)을 추가로 설정하세요.
--   * 이 SQL 은 Broadcast 자체를 설정하지 않습니다(테이블 발행/replication 과 무관하게 그냥 동작합니다) —
--     아래 1)~3) 은 '마지막으로 알려진 위치'를 DB에도 남겨서, 페이지를 새로고침했거나 아직 첫 Broadcast를
--     받기 전에도 보여 줄 초기 위치를 확보하기 위한 것입니다.
--
--   1) care_schedules 에 매니저의 마지막 위치 컬럼 추가 (manager_lat, manager_lng, manager_location_at)
--   2) update_manager_location(): 매니저가 위치를 기록할 때 호출하는 함수. status = 'departed' 일 때만 허용합니다
--      (배정만 됐거나 이미 도착한 뒤에는 위치를 계속 남길 이유가 없어 막습니다).
--   3) my_application_schedules() 를 다시 만들어(반환 컬럼이 늘어나 DROP 후 재생성 필요) 보호자가 일정의
--      실제 UUID(schedule_id, Broadcast 채널명에 필요)와 마지막 위치까지 함께 받도록 합니다.
--
-- ▶ (추가) scheduled_at 컬럼: 매니저/보호자 마이페이지 달력 조회 기준을 통일하면서, mypage.html 이 이
--   RPC(테이블 직접 조회가 RLS 등으로 실패했을 때만 쓰는 rescue 경로)로 일정을 읽어도 신청 서비스 날짜를
--   알 수 있도록 scheduled_at 을 반환값에 추가했습니다. DROP 후 재생성이라 이미 이 파일을 실행했던
--   프로젝트도 그냥 이 파일 전체를 다시 실행하면 안전하게 반영됩니다.
-- ============================================================================

-- 1) 위치 컬럼 추가 ----------------------------------------------------------
alter table public.care_schedules add column if not exists manager_lat         double precision;
alter table public.care_schedules add column if not exists manager_lng         double precision;
alter table public.care_schedules add column if not exists manager_location_at timestamptz;

-- 2) 위치 기록 (매니저 전용, '이동 중'일 때만) --------------------------------
create or replace function public.update_manager_location(
  p_schedule_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED' using errcode = '22023';
  end if;

  update public.care_schedules set
    manager_lat = p_lat, manager_lng = p_lng, manager_location_at = now()
  where id = p_schedule_id and manager_id = auth.uid() and status = 'departed';

  if not found then
    -- 내 일정이 아니거나(다른 매니저) '이동 중' 상태가 아님(아직 출발 전 · 이미 도착 후) — 조용히 무시하지 않고
    -- 알려서, 매니저 화면이 추적을 계속 돌리고 있는데 저장이 안 되는 상황을 콘솔에서 바로 알아챌 수 있게 합니다.
    raise exception 'SCHEDULE_UNAVAILABLE' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.update_manager_location(uuid, double precision, double precision) from public, anon;
grant  execute on function public.update_manager_location(uuid, double precision, double precision) to authenticated;

-- 3) 보호자용: 내 신청에 연결된 일정의 실시간 상태 + 인증 정보 + 마지막 위치 -------
--    반환 컬럼 구성이 바뀌므로(RETURNS TABLE 의 OUT 파라미터 변경은 CREATE OR REPLACE 만으로 안 됩니다) 먼저 지우고 다시 만듭니다.
drop function if exists public.my_application_schedules();
create or replace function public.my_application_schedules()
returns table (
  application_id      uuid,
  schedule_id          uuid,        -- care_schedules.id: 보호자가 'care-location:' + schedule_id 채널을 구독하는 데 씀
  schedule_status      text,
  scheduled_at         timestamptz, -- 신청 서비스 날짜: mypage.html 하단 달력이 mypage-manager.html 과 같은 기준으로 뱃지를 매기는 데 씀
  departed_at          timestamptz,
  departed_location    jsonb,
  departed_photo       text,
  arrived_at           timestamptz,
  arrived_location     jsonb,
  arrived_photo        text,
  completed_at         timestamptz,
  manager_lat          double precision,
  manager_lng          double precision,
  manager_location_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id as application_id, s.id as schedule_id,
         s.status, s.scheduled_at, s.departed_at, s.departed_location, s.departed_photo,
         s.arrived_at, s.arrived_location, s.arrived_photo, s.completed_at,
         s.manager_lat, s.manager_lng, s.manager_location_at
  from public.service_applications a
  join public.care_schedules s on s.id = a.schedule_id
  where auth.uid() is not null and a.user_id = auth.uid() and a.schedule_id is not null
$$;

revoke all on function public.my_application_schedules() from public, anon;
grant  execute on function public.my_application_schedules() to authenticated;

-- ★ 확인용 (SQL Editor)
--   함수/컬럼이 이 프로젝트에 등록됐는지 확인 (0행이면 위 블록이 아직 실행되지 않은 것 → 이 파일을 다시 실행):
--     select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where proname in ('update_manager_location', 'my_application_schedules') and pronamespace = 'public'::regnamespace;
--     select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'care_schedules' and column_name like 'manager_l%';
--   특정 일정의 마지막 위치 확인:
--     select id, status, manager_lat, manager_lng, manager_location_at from public.care_schedules where id = '<일정 UUID>';
--   보호자 계정으로 로그인한 상태를 흉내내려면 대시보드가 아니라 실제 로그인 세션(anon key + 로그인)으로 rpc 호출을 테스트하세요
--   (SQL Editor 는 auth.uid() 가 없어 이 함수가 빈 결과만 돌려줍니다).
