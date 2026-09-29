-- ============================================================================
-- service_applications ↔ care_schedules 연결 유실 수정
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-applications-to-manager.sql 을 먼저 실행했다고 가정합니다)
--
-- ▶ 증상: 보호자 마이페이지 콘솔에 `[Guardian] Fetched status: matched | ... | care_schedules 연결: false`
--   가 찍힘 — 신청서 status 는 'matched'(배정 완료)까지 갔는데, service_applications.schedule_id 가
--   비어 있어서(NULL) 보호자 화면이 care_schedules 를 못 찾고 계속 "배정 완료"에 멈춰 있는 것입니다.
--
-- ▶ 근본 원인: 지금까지는 service_applications → care_schedules 로 가는 링크(schedule_id)만 있고,
--   반대 방향(care_schedules → service_applications)에는 아무 컬럼도 없었습니다. accept_service_application()
--   이 두 테이블을 만들고 나서 마지막에 schedule_id 를 UPDATE 하는 한 문장이 혹시라도 안 걸리면(오래된 버전의
--   함수가 배포돼 있었다거나, 대시보드에서 수기로 짝을 지은 경우 등) 이 연결을 되살릴 방법이 전혀 없었습니다.
--
-- ▶ 이 파일이 하는 일
--   1) care_schedules 에 application_id 컬럼을 추가해 양방향 연결을 만듭니다.
--   2) accept_service_application() 을 다시 만들어, 앞으로는 care_schedules 를 만들 때 application_id 를
--      바로 채우고, service_applications.schedule_id 도 여전히 채웁니다 (둘 중 하나가 실패해도 다른 쪽으로 복구 가능).
--   3) 지금 이미 끊어져 있는 기존 데이터를 안전하게(서로가 서로의 가장 그럴듯한 짝일 때만) 한 번 복구합니다.
-- ============================================================================

-- 1) 양방향 연결 컬럼 ---------------------------------------------------------
alter table public.care_schedules add column if not exists application_id uuid references public.service_applications(id) on delete set null;
create index if not exists care_schedules_application_idx on public.care_schedules(application_id);

-- 2) 신청 수락: 이제 care_schedules.application_id 도 함께 채웁니다 -------------
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
     senior_name, origin, destination, scheduled_at, notes, status, payout_amount, application_id)
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
    v_app.id  -- ★ care_schedules → service_applications 역방향 링크 (신규)
  )
  returning * into v_row;

  -- service_applications → care_schedules 순방향 링크는 그대로 유지 (기존 화면·쿼리 호환)
  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;

-- 3) 기존에 이미 끊어진 데이터 복구 (딱 한 번, 안전하게) --------------------------
--    "서로가 서로의 가장 그럴듯한 짝"일 때만 연결합니다 (같은 manager_id 를 가진 후보가 여러 건이면 건드리지
--    않고 건너뜁니다 — 잘못 짝지어 엉뚱한 보호자에게 남의 진행 상태를 보여주는 사고를 막기 위함입니다).
with candidates as (
  select
    a.id as application_id,
    s.id as schedule_id,
    row_number() over (
      partition by a.id
      order by abs(extract(epoch from (s.created_at - coalesce(a.accepted_at, a.created_at))))
    ) as rank_for_application,
    row_number() over (
      partition by s.id
      order by abs(extract(epoch from (s.created_at - coalesce(a.accepted_at, a.created_at))))
    ) as rank_for_schedule
  from public.service_applications a
  join public.care_schedules s
    on s.manager_id = a.manager_id
   and s.application_id is null
  where a.schedule_id is null
    and a.manager_id is not null
)
update public.service_applications a
   set schedule_id = c.schedule_id
  from candidates c
 where a.id = c.application_id
   and c.rank_for_application = 1
   and c.rank_for_schedule = 1;

-- 위에서 새로 이어진 만큼 care_schedules.application_id 도 채워 앞으로는 이 컬럼만으로 바로 역조회됩니다.
update public.care_schedules s
   set application_id = a.id
  from public.service_applications a
 where a.schedule_id = s.id
   and s.application_id is null;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   여전히 끊어진 채 남은 신청이 있는지 (0행이 이상적 — 남아 있다면 매니저당 후보가 여러 건이라 자동 복구를
--   건너뛴 경우이니, 아래로 직접 살펴보고 수동으로 이어 주세요):
--     select a.id as application_id, a.manager_id, a.status, a.accepted_at
--     from public.service_applications a
--     where a.schedule_id is null and a.manager_id is not null;
--   후보를 눈으로 비교: select id, manager_id, guardian_id, status, created_at from public.care_schedules
--     where manager_id = '<위에서 찾은 manager_id>' and application_id is null;
--   수동 연결(위에서 직접 찾은 application_id/schedule_id 로):
--     update public.service_applications set schedule_id = '<schedule_id>' where id = '<application_id>';
--     update public.care_schedules set application_id = '<application_id>' where id = '<schedule_id>';
