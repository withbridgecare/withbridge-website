-- ============================================================================
-- 출발지/목적지 좌표 사전 저장 (Task B) — apply.html 이 신청 접수 시점에 카카오 지오코딩으로 얻은
-- 위경도를 주소 텍스트와 함께 저장해 두고, mypage-manager.html 의 위치 인증(방법 1. GPS)이 매번 실시간
-- Geocoding API 를 호출하지 않고 이 값을 우선 사용하도록 하기 위한 스키마입니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-fix-status-sync.sql 이 먼저 실행되어 있다고 가정합니다 —
--  accept_service_application() 함수를 그 파일의 최신 버전 기준으로 재정의합니다)
--
-- ▶ 이 값들이 없어도(옛날 신청 건, apply.html 지오코딩 실패 등) mypage-manager.html 은 여전히 그 자리에서
--   주소 텍스트로 실시간 지오코딩을 한 번 더 시도합니다 — 이 컬럼은 '있으면 더 빠르고 정확한' 캐시이지,
--   유일한 경로가 아닙니다.
-- ============================================================================

-- 1) 컬럼 추가 -----------------------------------------------------------------
alter table public.service_applications add column if not exists origin_lat double precision;
alter table public.service_applications add column if not exists origin_lng double precision;
alter table public.service_applications add column if not exists destination_lat double precision;
alter table public.service_applications add column if not exists destination_lng double precision;

alter table public.care_schedules add column if not exists origin_lat double precision;
alter table public.care_schedules add column if not exists origin_lng double precision;
alter table public.care_schedules add column if not exists destination_lat double precision;
alter table public.care_schedules add column if not exists destination_lng double precision;

-- ▶ 권한(GRANT) 점검: service_applications/care_schedules 둘 다 이미 테이블 단위로
--   grant select/insert(신청)·grant select(일정) 가 authenticated 에 나 있어서(수퍼base-*.sql 여러 파일 참고),
--   새로 추가한 컬럼도 별도 GRANT 없이 그대로 읽고 쓸 수 있습니다. care_schedules 는
--   'grant update (status) on public.care_schedules' 처럼 컬럼 단위로 제한돼 있지만, 이 좌표 컬럼들은
--   매니저가 직접 UPDATE 하지 않고(신청 접수 시 apply.html → service_applications, 수락 시
--   accept_service_application() 함수가 SECURITY DEFINER 로 채움) 이므로 이대로 충분합니다.

-- 2) 신청 수락 시 좌표도 함께 복사 ------------------------------------------------
--    supabase-fix-status-sync.sql 의 accept_service_application() 와 완전히 동일한 본문에
--    origin_lat/origin_lng/destination_lat/destination_lng 복사만 추가했습니다.
create or replace function public.accept_service_application(p_application_id uuid, p_scheduled_at timestamptz)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app      public.service_applications;
  v_row      public.care_schedules;
  v_phone_re constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep      int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_manager() then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;
  if p_scheduled_at is null then
    raise exception 'SCHEDULE_TIME_REQUIRED' using errcode = '22004';
  end if;

  update public.service_applications
     set manager_id = auth.uid(), accepted_at = now(), status = 'matched'
   where id = p_application_id
     and manager_id is null
     and public.is_pending_application_status(status)
  returning * into v_app;

  if not found then
    raise exception 'REQUEST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, origin, destination, scheduled_at, notes, status, payout_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    auth.uid(),
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
         then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    p_scheduled_at,
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;

-- 3) PostgREST 스키마 캐시 새로고침 (그래야 새 컬럼이 바로 API 에 반영됨)
notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   최근 신청 건에 좌표가 잘 저장됐는지:
--     select id, address, origin_lat, origin_lng, destination_lat, destination_lng, created_at
--     from public.service_applications order by created_at desc limit 10;
--   수락된 일정에도 좌표가 잘 복사됐는지:
--     select id, origin, origin_lat, origin_lng, destination, destination_lat, destination_lng
--     from public.care_schedules order by created_at desc limit 10;
