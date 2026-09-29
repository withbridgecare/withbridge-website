-- ============================================================================
-- 매니저-보호자 케어 상태 동기화 : 한 번에 복구 + 이중 안전장치
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-applications-to-manager.sql, supabase-care-verification.sql 이
--  먼저 실행되어 있다고 가정합니다. 이 파일은 이전에 나눠 드렸던
--  supabase-fix-schedule-links.sql / supabase-fix-rls-and-join.sql 의 내용을 전부 포함하고 이어서
--  이번 요청사항까지 더한 것이라, 이 파일 하나만 실행하면 됩니다 — 이미 그 파일들을 실행했어도
--  전부 IF NOT EXISTS / CREATE OR REPLACE 로 작성되어 다시 실행해도 안전합니다)
--
-- ▶ 증상: 매니저가 [출발하기]/[병원 도착]/[케어 완료]를 눌러도 보호자 화면이 "배정 완료(2단계)"에서 안 바뀜.
--
-- ▶ 이 파일이 고치는 것 두 가지
--   A) 기존에 끊어진 service_applications ↔ care_schedules 양방향 매핑을 한 번에 복구 (application_id 컬럼
--      + FK + UNIQUE + RLS + 데이터 백필). → "care_schedules 연결: false" 문제.
--   B) 매니저가 상태를 바꿀 때 care_schedules.status 뿐 아니라 연결된 service_applications.status 에도
--      같은 값을 함께 남기는 RPC(advance_care_status/record_care_verification)로 교체. → 위 A) 가 아직
--      뭔가 어긋나 있어도(RLS 를 새로 또 못 미더워하는 상황 대비), 보호자 화면은 이미 항상 읽고 있던
--      service_applications.status 만 보고도 3~5단계를 그릴 수 있게 되는 이중 안전장치입니다
--      (mypage.html 의 normalizeCareStep 이 이제 a.status 와 a._schedule.schedule_status 둘 다 보고
--      더 진행된 쪽을 신뢰합니다).
-- ============================================================================


-- ============================================================================
-- A) service_applications ↔ care_schedules 양방향 매핑 복구
-- ============================================================================

-- A-1) 양방향 연결 컬럼 + 이름 있는 FK + UNIQUE(1:1) -----------------------------
alter table public.care_schedules add column if not exists application_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_schedules_application_id_fkey') then
    alter table public.care_schedules
      add constraint care_schedules_application_id_fkey
      foreign key (application_id) references public.service_applications(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_schedules_application_id_key') then
    alter table public.care_schedules add constraint care_schedules_application_id_key unique (application_id);
  end if;
end $$;

-- A-2) 보호자 RLS: guardian_id 스냅샷 기준(기존) + service_applications.user_id 기준(신규, EXISTS) 둘 다 ---
drop policy if exists care_schedules_select_guardian on public.care_schedules;
create policy care_schedules_select_guardian on public.care_schedules
  for select to authenticated using (guardian_id = auth.uid());

drop policy if exists care_schedules_select_guardian_via_application on public.care_schedules;
create policy care_schedules_select_guardian_via_application on public.care_schedules
  for select to authenticated using (
    exists (
      select 1 from public.service_applications a
      where a.id = care_schedules.application_id
        and a.user_id = auth.uid()
    )
  );

-- A-3) 신청 수락 시 양방향으로 채움 (앞으로 수락하는 건은 절대 안 끊어지도록) -----------
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
    v_app.id
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;

-- A-4) 기존에 이미 끊어진 데이터 복구 (한 번만, 서로가 서로의 가장 그럴듯한 짝일 때만 안전하게) ------
with candidates as (
  select
    a.id as application_id, s.id as schedule_id,
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

update public.care_schedules s
   set application_id = a.id
  from public.service_applications a
 where a.schedule_id = s.id
   and s.application_id is null;


-- ============================================================================
-- B) 매니저가 상태를 바꿀 때 service_applications.status 도 함께 남기기 (이중 안전장치)
-- ============================================================================

-- B-1) 출발/병원 도착(GPS·사진 인증 포함) — 기존 함수에 미러링 한 줄만 추가 -----------
create or replace function public.record_care_verification(
  p_schedule_id uuid,
  p_status      text,
  p_location    jsonb default null,
  p_photo       text  default null
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

  update public.care_schedules set
    status               = p_status,
    departed_at          = case when p_status = 'departed' then now()       else departed_at end,
    departed_location    = case when p_status = 'departed' then p_location  else departed_location end,
    departed_photo       = case when p_status = 'departed' then p_photo     else departed_photo end,
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

  -- ★ 이중 안전장치: care_schedules 를 보호자가 못 읽는 상황이어도(RLS/조인 문제) 이미 항상 읽고 있는
  -- service_applications.status 만으로도 mypage.html 의 normalizeCareStep() 이 3~4단계를 그릴 수 있게 합니다.
  if v_row.application_id is not null then
    update public.service_applications set status = p_status where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.record_care_verification(uuid, text, jsonb, text) from public, anon;
grant  execute on function public.record_care_verification(uuid, text, jsonb, text) to authenticated;

-- B-2) 그 밖의 단순 상태 전환(케어 완료 등) — 지금까지 매니저 페이지가 care_schedules 를
--      직접 update 하던 것을 이 RPC 하나로 바꿉니다 (managers 는 service_applications 에 UPDATE 권한이
--      없으므로, 미러링을 하려면 SECURITY DEFINER RPC 를 거쳐야 합니다).
create or replace function public.advance_care_status(p_schedule_id uuid, p_status text)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.care_schedules
     set status = p_status
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

revoke all on function public.advance_care_status(uuid, text) from public, anon;
grant  execute on function public.advance_care_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   여전히 끊어진 채 남은 신청 (0행이 이상적):
--     select a.id, a.manager_id, a.status from public.service_applications a
--     where a.schedule_id is null and a.manager_id is not null;
--   RPC 가 정상 등록됐는지:
--     select proname from pg_proc
--     where proname in ('advance_care_status', 'record_care_verification', 'accept_service_application')
--       and pronamespace = 'public'::regnamespace;
--   미러링이 실제로 되는지, 매니저가 상태를 바꾼 뒤 확인:
--     select id, status, application_id from public.care_schedules where id = '<schedule uuid>';
--     select id, status, schedule_id from public.service_applications where id = '<application uuid>';
--     (두 status 값이 서로 같아야 정상)
