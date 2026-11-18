-- ============================================================================
-- departure_geofence_auth : 출발 인증 — 지오펜싱 자동 인증 + 3단계 예외 처리(Fallback) 하이브리드
--
--   mypage-manager.html '출발 (이동 중)' 인증을 "매니저가 수동으로 GPS 버튼을 누르는" 방식에서,
--   매니저가 출발지 반경 안에 들어오면 배너로 원탭 확정할 수 있는 지오펜싱 자동 인증으로 업그레이드
--   하면서, 이 출발 건이 실제로 어떤 방식(자동/확장/수동/사진)으로 인증됐는지 기록할 두 컬럼을
--   추가합니다. 좌표·사진·시각은 이미 있는 departed_location/departed_photo/departed_at 를 그대로
--   재사용합니다(중복 컬럼을 새로 만들지 않음).
--     1) departure_auth_method text — 'auto_gps'(반경 100m 자동 감지) | 'expanded_gps'(10분 전부터
--        반경 300m까지 확장해서 감지) | 'manual_gps_fallback'(배너 없이 매니저가 직접 위치 측정 버튼을
--        눌러 통과) | 'photo_fallback'(GPS 실패/거부 → 현장 사진으로 대체). null 이면 이 기능을 타기
--        전(과거 데이터) 출발 건입니다.
--     2) departure_auth_reason text — 위 방식을 고른 이유/근거를 사람이 읽을 수 있는 한 줄로 남긴
--        로그(예: 'GPS 자동 감지 성공(거리 약 62m)', '위치 권한 거부 → 현장 사진으로 대체').
--
--   record_care_verification() 에 p_auth_method/p_auth_reason 파라미터 두 개를 추가합니다 — 기존
--   파라미터 순서/타입은 그대로 두고 끝에만 덧붙였고 둘 다 기본값 null 이라, 이 두 값을 모르는(또는
--   'arrived' 등 다른 상태를 저장하는) 기존 호출은 전혀 수정할 필요가 없습니다. 'departed' 상태를
--   저장할 때만 두 컬럼을 채우고, 'arrived' 쪽은 지금처럼 손대지 않습니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   같은 내용을 sql/supabase_schema_latest.sql 에도 반영해 뒀습니다.
--   alter ... add column if not exists / create or replace 는 모두 멱등이라 여러 번 실행해도 안전합니다.
-- ============================================================================

alter table public.care_schedules add column if not exists departure_auth_method text;
alter table public.care_schedules drop constraint if exists care_schedules_departure_auth_method_check;
alter table public.care_schedules add constraint care_schedules_departure_auth_method_check
  check (departure_auth_method is null or departure_auth_method in ('auto_gps', 'expanded_gps', 'manual_gps_fallback', 'photo_fallback'));
alter table public.care_schedules add column if not exists departure_auth_reason text;

create or replace function public.record_care_verification(
  p_schedule_id  uuid,
  p_status       text,
  p_location     jsonb default null,
  p_photo        text  default null,
  p_auth_method  text  default null,
  p_auth_reason  text  default null
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
    raise exception 'VERIFICATION_REQUIRED' using errcode = '22023';
  end if;
  if p_auth_method is not null and p_auth_method not in ('auto_gps', 'expanded_gps', 'manual_gps_fallback', 'photo_fallback') then
    raise exception 'INVALID_AUTH_METHOD' using errcode = '22023';
  end if;

  update public.care_schedules set
    status               = p_status,
    departed_at          = case when p_status = 'departed' then now()       else departed_at end,
    departed_location    = case when p_status = 'departed' then p_location  else departed_location end,
    departed_photo       = case when p_status = 'departed' then p_photo     else departed_photo end,
    -- 출발 인증 전용 — 'arrived' 를 저장하는 호출(기존 병원 도착 흐름)은 그대로 두고 건드리지 않습니다.
    departure_auth_method = case when p_status = 'departed' then p_auth_method else departure_auth_method end,
    departure_auth_reason = case when p_status = 'departed' then p_auth_reason else departure_auth_reason end,
    arrived_at           = case when p_status = 'arrived'  then now()       else arrived_at end,
    arrived_location     = case when p_status = 'arrived'  then p_location  else arrived_location end,
    arrived_photo        = case when p_status = 'arrived'  then p_photo     else arrived_photo end,
    verification_location = p_location::text,
    verification_photo    = p_photo
  where id = p_schedule_id and manager_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'SCHEDULE_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if v_row.application_id is not null then
    update public.service_applications set status = p_status where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.record_care_verification(uuid, text, jsonb, text, text, text) from public, anon;
grant  execute on function public.record_care_verification(uuid, text, jsonb, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 현장 사진 대체 인증(fallback ③) 전용 Storage 버킷 — 출발 인증에서만 쓰며, 지하주차장/엘리베이터처럼
-- GPS 자체가 안 잡히는 음영 지역에서 촬영한 사진을 (기존처럼 data URL로 DB에 박아 넣는 대신) 실제
-- Storage 에 올리고 공개 URL만 departed_photo 에 저장합니다. public 버킷으로 두는 이유는 이 프로젝트의
-- 다른 인증 사진들도 어차피 DB RLS(리포트/일정 조회 권한)로만 접근을 통제하고 사진 자체의 비밀성에는
-- 기대지 않기 때문입니다(sql/care_report_rich_fields.sql 등과 같은 보안 수준).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('care-departure-photos', 'care-departure-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists care_departure_photos_insert_authenticated on storage.objects;
create policy care_departure_photos_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'care-departure-photos');

drop policy if exists care_departure_photos_select_public on storage.objects;
create policy care_departure_photos_select_public on storage.objects
  for select to public
  using (bucket_id = 'care-departure-photos');

notify pgrst, 'reload schema';
