-- ============================================================================
-- 이동 인증(GPS/사진) 데이터를 매니저 화면(mypage-manager.html)에서
-- 보호자 화면(mypage.html)으로 연결하기 위한 스키마입니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-applications-to-manager.sql 을 먼저 실행했다고 가정합니다)
--
-- ▶ 매니저 화면에서 '출발'/'병원 도착' 버튼을 눌렀을 때 아래 오류가 뜬다면, 이 파일이 이 Supabase 프로젝트에
--   아직 실행되지 않은 것입니다 (함수 시그니처는 mypage-manager.html 의 호출부와 이미 정확히 일치합니다) —
--   이 파일 전체를 (다시) 실행하면 해결됩니다. create or replace function / add column if not exists 로 작성돼
--   이미 적용된 상태에서 다시 실행해도 안전합니다.
--     "Could not find the function public.record_care_verification(p_location, p_photo, p_schedule_id, p_status)
--      in the schema cache"
--   RPC 가 배포되기 전까지는 mypage-manager.html 이 자동으로 status 컬럼만 업데이트하는 방식으로 대체 동작하지만
--   (verifyAdvance() 의 fallback 참고), 이 경우 위치/사진 인증 데이터는 저장되지 않으므로 이 파일 실행이 필요합니다.
--
--   1) care_schedules 에 '출발/병원 도착' 인증 정보 컬럼 추가
--      (시각은 서버 시간으로 기록, 단계별 위치는 jsonb { lat, lng, accuracy }, 사진은 축소된 data URL 문자열)
--      + verification_location / verification_photo (text): "column 'verification_location' does not exist"
--      오류를 겪었다면 이 컬럼들이 아직 없는 것입니다 — 이 파일을 실행하면 추가됩니다. 매 호출마다 '가장 최근'
--      인증 위치/사진을 담는 범용 컬럼으로, 단계별 이력이 필요하면 departed_*/arrived_* 를 그대로 쓰세요.
--   2) record_care_verification(): 매니저가 '출발' · '병원 도착'을 누를 때 호출하는 함수.
--      status 컬럼은 update 권한이 있지만(grant update(status)), 인증 컬럼들은 이 함수(SECURITY DEFINER)로만 바꿀 수 있습니다.
--      상태 순서(assigned → departed → arrived)는 기존 enforce_care_status_flow 트리거가 그대로 검사합니다.
--   3) my_application_schedules(): 보호자 마이페이지가 '내 신청에 연결된 일정'의 실시간 상태 + 인증 정보를 읽는 함수.
--      (보호자는 care_schedules 테이블에 직접 접근할 수 없으므로, my_application_managers() 와 같은 방식으로 우회합니다)
-- ============================================================================

-- 1) 인증 컬럼 추가 --------------------------------------------------------
alter table public.care_schedules add column if not exists departed_at       timestamptz;
alter table public.care_schedules add column if not exists departed_location jsonb;
alter table public.care_schedules add column if not exists departed_photo    text;
alter table public.care_schedules add column if not exists arrived_at        timestamptz;
alter table public.care_schedules add column if not exists arrived_location  jsonb;
alter table public.care_schedules add column if not exists arrived_photo     text;
-- 범용 '최근 인증' 컬럼(text): 단계 구분 없이 가장 최근 출발/도착 인증 때 넘어온 위치·사진을 그대로 담아 둡니다.
-- departed_location/arrived_location(jsonb, 단계별 이력)과 별개로, 이 값만 단순 조회하려는 외부 연동을 위한 컬럼입니다.
alter table public.care_schedules add column if not exists verification_location text;
alter table public.care_schedules add column if not exists verification_photo    text;

-- 2) 인증 기록 + 상태 전환 (매니저 전용) -------------------------------------
create or replace function public.record_care_verification(
  p_schedule_id uuid,
  p_status      text,          -- 'departed' | 'arrived' 만 허용
  p_location    jsonb default null,   -- { lat, lng, accuracy } (GPS 인증 시)
  p_photo       text  default null    -- 축소된 이미지 data URL (사진 인증 시)
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_status not in ('departed', 'arrived') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if p_location is null and p_photo is null then
    raise exception 'VERIFICATION_REQUIRED' using errcode = '22023'; -- GPS 또는 사진 중 최소 하나는 있어야 함
  end if;

  update public.care_schedules set
    status               = p_status,
    departed_at          = case when p_status = 'departed' then now()       else departed_at end,
    departed_location    = case when p_status = 'departed' then p_location  else departed_location end,
    departed_photo       = case when p_status = 'departed' then p_photo     else departed_photo end,
    arrived_at           = case when p_status = 'arrived'  then now()       else arrived_at end,
    arrived_location     = case when p_status = 'arrived'  then p_location  else arrived_location end,
    arrived_photo        = case when p_status = 'arrived'  then p_photo     else arrived_photo end,
    -- 단계와 무관하게 '가장 최근' 인증 위치/사진도 함께 갱신 (범용 조회용 컬럼, 위 1)번 참고)
    verification_location = p_location::text,
    verification_photo    = p_photo
  where id = p_schedule_id and manager_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'SCHEDULE_UNAVAILABLE' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

revoke all on function public.record_care_verification(uuid, text, jsonb, text) from public, anon;
grant  execute on function public.record_care_verification(uuid, text, jsonb, text) to authenticated;

-- 3) 보호자용: 내 신청에 연결된 일정의 실시간 상태 + 인증 정보 ------------------
--  * service_applications.schedule_id 는 매니저가 웹 신청서를 수락할 때(accept_service_application) 채워집니다.
--  * 운영자가 구글폼을 보고 care_schedules 에 직접 입력만 한 건(신청서 자체가 없는 건)은 이 함수로는 보이지 않고,
--    기존 guardian_care_reports view(완료 후 리포트)로만 보입니다 — 이 함수는 '신청서 카드'에 실시간 상태를 붙이는 용도입니다.
create or replace function public.my_application_schedules()
returns table (
  application_id    uuid,
  schedule_status   text,
  departed_at       timestamptz,
  departed_location jsonb,
  departed_photo    text,
  arrived_at        timestamptz,
  arrived_location  jsonb,
  arrived_photo     text,
  completed_at      timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id as application_id,
         s.status, s.departed_at, s.departed_location, s.departed_photo,
         s.arrived_at, s.arrived_location, s.arrived_photo, s.completed_at
  from public.service_applications a
  join public.care_schedules s on s.id = a.schedule_id
  where auth.uid() is not null and a.user_id = auth.uid() and a.schedule_id is not null
$$;

revoke all on function public.my_application_schedules() from public, anon;
grant  execute on function public.my_application_schedules() to authenticated;

-- ★ 확인용 (SQL Editor)
--   함수가 이 프로젝트에 등록됐는지 확인 (0행이면 위 2)번 블록이 아직 실행되지 않은 것 → 이 파일을 다시 실행):
--     select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where proname = 'record_care_verification' and pronamespace = 'public'::regnamespace;
--   verification_location / verification_photo 컬럼이 있는지 확인 (0행이면 위 1)번 블록이 아직 실행되지 않은 것):
--     select column_name, data_type from information_schema.columns
--     where table_schema = 'public' and table_name = 'care_schedules'
--       and column_name in ('verification_location', 'verification_photo');
--   특정 일정의 인증 데이터 확인:
--     select id, status, departed_at, departed_location, arrived_at, arrived_location,
--            verification_location, verification_photo
--     from public.care_schedules where id = '<일정 UUID>';
--   보호자 계정으로 로그인한 상태를 흉내내려면 대시보드가 아니라 실제 로그인 세션(anon key + 로그인)으로 rpc 호출을 테스트하세요
--   (SQL Editor 는 auth.uid() 가 없어 이 함수가 빈 결과만 돌려줍니다).
