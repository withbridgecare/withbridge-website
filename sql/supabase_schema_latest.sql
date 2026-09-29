-- ============================================================================
-- 위드브릿지(WithBridge) 통합 스키마 — supabase-*.sql 27개 파일을 하나로 정리한 참고용 파일
-- ============================================================================
-- ★★★ 중요: 이 파일은 실제 운영 중인 Supabase 프로젝트에 접속해 검증한 것이 아니라, 저장소에 남아 있던
-- 27개의 supabase-*.sql 파일(원본은 ../_backup_sql/ 에 그대로 보관)을 읽고 "가장 나중에 작성되었거나,
-- 다른 파일이 명시적으로 대체한다고 밝힌 버전"을 기준으로 재구성한 참고용 통합본입니다. 실제 프로덕션
-- 스키마와 다를 수 있으니, 새 프로젝트에 처음 적용하기 전에는 반드시 Supabase 대시보드에서 현재 상태와
-- 비교해 보세요. 기존 프로젝트에 다시 실행해도 안전하도록 전부 IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS 패턴으로만 작성했습니다(원본 파일들의 관례를 그대로 따름).
--
-- ★ 이 스크립트가 만들지 않는 테이블(=Supabase 대시보드에서 이미 만들어져 있다고 가정):
--     public.service_applications, public.seniors
--   두 테이블 모두 저장소 어디에도 CREATE TABLE 문이 없어(대시보드에서 직접 만든 것으로 추정), 정확한
--   원본 컬럼 타입/기본값을 알 수 없습니다. 이 파일은 그 두 테이블에 대한 ALTER TABLE / RLS / 함수만
--   포함합니다 — 두 테이블이 이미 있다는 전제하에 실행하세요.
--
-- ── 어떤 파일이 무엇을 대체했는지 (백업 폴더에서 원본을 다시 찾아볼 때 참고) ──────────────────────
--   base:   supabase-manager-schema.sql (profiles/managers/care_schedules/care_reports/guardian view 최초 정의)
--   최종본으로 채택한 파일:
--     - accept_service_application()      ← supabase-address-coordinates.sql (좌표 복사 추가, 가장 최신)
--     - record_care_verification()        ← supabase-fix-status-sync.sql (service_applications 미러링 추가)
--     - advance_care_status()             ← supabase-fix-status-sync.sql
--     - my_application_schedules()        ← supabase-manager-location.sql (위치 컬럼 추가, DROP 후 재생성)
--     - is_my_care_schedule_id() / guardian_care_reports / mark_care_report_read()
--                                          ← supabase-guardian-care-reports-fix-visibility.sql
--     - care_schedules_select_guardian, care_schedules_select_guardian_via_application 정책
--                                          ← supabase-fix-status-sync.sql (supabase-verify-guardian-rls.sql 이 같은 내용 재확인)
--     - sync_application_status_from_schedule() 트리거 ← supabase-sync-status-trigger.sql (가장 나중에 추가된 안전장치)
--   완전히 대체되어 이 파일에 포함하지 않은 것(내용이 100% 동일하게 다른 파일에 흡수됨):
--     - supabase-lockdown-managers.sql          (→ manager-schema.sql 에 이미 동일하게 포함)
--     - supabase-manager-default-verified.sql   (→ manager-schema.sql 에 이미 동일하게 포함)
--     - supabase-fix-is-my-care-schedule-grant.sql (→ manager-schema.sql 에 이미 동일한 grant 포함)
--     - supabase-fix-schedule-links.sql         (→ fix-status-sync.sql 이 전체 포함한다고 명시)
--     - supabase-fix-rls-and-join.sql           (→ fix-status-sync.sql 이 전체 포함한다고 명시)
--     - supabase-guardian-care-reports-application-id.sql (→ fix-visibility.sql 이 상위 호환)
--     - supabase-confirm-application.sql        (→ guardian-confirm-completion.sql 과 완전히 동일한 함수, 하나만 채택)
--   진단/테스트 전용이라 스키마에 포함하지 않은 것(백업 폴더에 원본 보존):
--     - supabase-verify-status-sync.sql, supabase-verify-guardian-rls.sql (전부 SELECT 진단 쿼리)
--     - supabase-test-insert-care-checkpoints.sql (테스트 데이터 삽입 스크립트)
-- ============================================================================


-- ============================================================================
-- 1) profiles : auth.users 와 1:1, 역할 보관
-- ============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text default 'guardian',
  name       text,
  phone      text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists role  text default 'guardian';
alter table public.profiles add column if not exists name  text;
alter table public.profiles add column if not exists phone text;

alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant  select on public.profiles to authenticated;

-- 신규 가입자는 자동으로 guardian 프로필 생성 (카카오 이름 복사)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'guardian',
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, role)
select id, 'guardian' from auth.users
on conflict (id) do nothing;


-- ============================================================================
-- 2) managers : 매니저 전용 정보 (자격 / 활동 상태)
--    ※ supabase-lockdown-managers.sql + supabase-manager-default-verified.sql 내용이 이미 합쳐져 있습니다.
-- ============================================================================
create table if not exists public.managers (
  id                     uuid primary key references public.profiles(id) on delete cascade,
  certification          text,
  certification_verified boolean not null default true,
  activity_status        text not null default 'break'
                         check (activity_status in ('online', 'break'))
);
alter table public.managers alter column certification_verified set default true;

-- is_manager(): 지금 로그인한 사용자가 '인증된 매니저'인지 (RLS·수락 함수가 사용)
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.managers m
    where m.id = auth.uid() and m.certification_verified
  );
$$;
revoke all on function public.is_manager() from public, anon;
grant  execute on function public.is_manager() to authenticated;

alter table public.managers enable row level security;
drop policy if exists managers_select_own on public.managers;
drop policy if exists managers_update_own on public.managers;
create policy managers_select_own on public.managers
  for select to authenticated using (id = auth.uid());
create policy managers_update_own on public.managers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.managers from anon, authenticated;
grant  select on public.managers to authenticated;
grant  update (activity_status) on public.managers to authenticated;


-- ============================================================================
-- 3) care_schedules : 동행 신청/일정
--    status 흐름: pending(신청 대기) → assigned(수락·배정) → departed(출발) → arrived(병원 도착) → completed(케어 완료)
-- ============================================================================
create table if not exists public.care_schedules (
  id             uuid primary key default gen_random_uuid(),
  manager_id     uuid references public.profiles(id),
  guardian_id    uuid references public.profiles(id),
  guardian_name  text,
  guardian_phone text,
  guardian_email text,
  senior_name    text not null,
  origin         text,
  destination    text not null,
  scheduled_at   timestamptz not null,
  notes          text,
  status         text not null default 'pending',
  payout_amount  integer not null default 0,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.care_schedules alter column manager_id drop not null;
alter table public.care_schedules add column if not exists notes text;
alter table public.care_schedules add column if not exists guardian_email text;
alter table public.care_schedules alter column status set default 'pending';
alter table public.care_schedules drop constraint if exists care_schedules_status_check;
alter table public.care_schedules add constraint care_schedules_status_check
  check (status in ('pending', 'assigned', 'departed', 'arrived', 'completed'));
alter table public.care_schedules drop constraint if exists care_schedules_pending_unassigned_check;
alter table public.care_schedules add constraint care_schedules_pending_unassigned_check
  check ((status = 'pending') = (manager_id is null));

-- 출발/병원 도착 GPS·사진 인증 (supabase-care-verification.sql)
alter table public.care_schedules add column if not exists departed_at       timestamptz;
alter table public.care_schedules add column if not exists departed_location jsonb;
alter table public.care_schedules add column if not exists departed_photo    text;
alter table public.care_schedules add column if not exists arrived_at        timestamptz;
alter table public.care_schedules add column if not exists arrived_location  jsonb;
alter table public.care_schedules add column if not exists arrived_photo     text;
alter table public.care_schedules add column if not exists verification_location text;
alter table public.care_schedules add column if not exists verification_photo    text;

-- 신청서(service_applications) 연결 (supabase-fix-status-sync.sql)
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

-- 실시간 매니저 위치 추적 (supabase-manager-location.sql)
alter table public.care_schedules add column if not exists manager_lat         double precision;
alter table public.care_schedules add column if not exists manager_lng         double precision;
alter table public.care_schedules add column if not exists manager_location_at timestamptz;

-- 출발지/목적지 좌표 캐시 (supabase-address-coordinates.sql)
alter table public.care_schedules add column if not exists origin_lat double precision;
alter table public.care_schedules add column if not exists origin_lng double precision;
alter table public.care_schedules add column if not exists destination_lat double precision;
alter table public.care_schedules add column if not exists destination_lng double precision;

create index if not exists care_schedules_manager_time_idx
  on public.care_schedules (manager_id, scheduled_at);
create index if not exists care_schedules_manager_completed_idx
  on public.care_schedules (manager_id, completed_at) where status = 'completed';
create index if not exists care_schedules_pending_idx
  on public.care_schedules (scheduled_at) where status = 'pending' and manager_id is null;
create index if not exists care_schedules_application_idx on public.care_schedules(application_id);

alter table public.care_schedules enable row level security;

-- 매니저용: 내가 맡은 일정 + 아직 아무도 수락하지 않은 신청 대기 건
drop policy if exists care_schedules_select_own on public.care_schedules;
create policy care_schedules_select_own on public.care_schedules
  for select to authenticated using (
    manager_id = auth.uid()
    or (manager_id is null and status = 'pending' and public.is_manager())
  );
drop policy if exists care_schedules_update_own on public.care_schedules;
create policy care_schedules_update_own on public.care_schedules
  for update to authenticated using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- 보호자용: guardian_id 직접 연결(옛 방식) + service_applications.user_id 경유(신식 웹 신청 흐름)
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

revoke insert, update, delete on public.care_schedules from anon, authenticated;
grant  select on public.care_schedules to authenticated;
grant  update (status) on public.care_schedules to authenticated;

-- Realtime: 보호자 화면이 상태 변경을 postgres_changes 로 직접 구독 (supabase-guardian-realtime.sql)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'care_schedules'
  ) then
    alter publication supabase_realtime add table public.care_schedules;
  end if;
end $$;
alter table public.care_schedules replica identity full;

-- 상태 진행 순서 강제 + 완료 시각 서버 기록
create or replace function public.enforce_care_status_flow() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'  and new.status = 'assigned')
            or (old.status = 'assigned' and new.status = 'departed')
            or (old.status = 'departed' and new.status = 'arrived')
            or (old.status = 'arrived'  and new.status = 'completed')) then
      raise exception 'invalid status transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists care_schedules_status_flow on public.care_schedules;
create trigger care_schedules_status_flow before update on public.care_schedules
  for each row execute function public.enforce_care_status_flow();

-- 신청 수락 (매니저 직접 수락, 구글폼 경유 옛 방식) — 한 문장 UPDATE 로 동시 클릭 시 한 명만 성공
create or replace function public.accept_care_request(p_schedule_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_manager() then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;

  update public.care_schedules
     set manager_id = auth.uid(), status = 'assigned'
   where id = p_schedule_id and status = 'pending' and manager_id is null
  returning * into v_row;

  if not found then
    raise exception 'REQUEST_UNAVAILABLE' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

revoke all on function public.accept_care_request(uuid) from public, anon;
grant  execute on function public.accept_care_request(uuid) to authenticated;

-- 출발/병원 도착 인증 (GPS/사진) — service_applications.status 미러링까지 포함한 최종본 (fix-status-sync.sql)
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

  if v_row.application_id is not null then
    update public.service_applications set status = p_status where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.record_care_verification(uuid, text, jsonb, text) from public, anon;
grant  execute on function public.record_care_verification(uuid, text, jsonb, text) to authenticated;

-- 그 밖의 단순 상태 전환(케어 완료 등) — service_applications.status 미러링 포함
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

-- 실시간 위치 기록 (매니저 전용, '이동 중'일 때만)
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
    raise exception 'SCHEDULE_UNAVAILABLE' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.update_manager_location(uuid, double precision, double precision) from public, anon;
grant  execute on function public.update_manager_location(uuid, double precision, double precision) to authenticated;

-- 보호자용: 내 신청에 연결된 일정의 실시간 상태 + 인증 정보 + 마지막 위치 (최종본, manager-location.sql)
drop function if exists public.my_application_schedules();
create or replace function public.my_application_schedules()
returns table (
  application_id      uuid,
  schedule_id          uuid,
  schedule_status      text,
  scheduled_at         timestamptz,
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


-- ============================================================================
-- 4) care_reports : 매니저가 제출하는 케어 리포트
-- ============================================================================
create table if not exists public.care_reports (
  id               uuid primary key default gen_random_uuid(),
  schedule_id      uuid not null unique references public.care_schedules(id) on delete cascade,
  manager_id       uuid not null references public.profiles(id),
  physician_notes  text not null,
  senior_condition text not null,
  created_at       timestamptz not null default now()
);
-- 보호자 '읽음' 추적 (supabase-care-report-read-tracking.sql)
alter table public.care_reports add column if not exists read_at timestamptz;

alter table public.care_reports enable row level security;
drop policy if exists care_reports_select_own on public.care_reports;
drop policy if exists care_reports_insert_own on public.care_reports;
create policy care_reports_select_own on public.care_reports
  for select to authenticated using (manager_id = auth.uid());
create policy care_reports_insert_own on public.care_reports
  for insert to authenticated with check (
    manager_id = auth.uid()
    and exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.manager_id = auth.uid() and s.status = 'completed'
    )
  );

revoke insert, update, delete on public.care_reports from anon, authenticated;
grant  select, insert on public.care_reports to authenticated;
-- 보호자는 이 테이블에 직접 접근하지 않습니다 (의도된 설계) — guardian_care_reports 뷰로만 읽습니다.
revoke all on public.care_reports from anon, authenticated;


-- ============================================================================
-- 5) 보호자 계정 연결 + 보호자용 케어 리포트 조회
--    (A) care_schedules.guardian_email = 보호자 인증 이메일   (B) care_schedules.guardian_id = 보호자 UUID
--    (C) service_applications.application_id 경유 (신식 웹 신청 흐름)
-- ============================================================================
create or replace function public.my_verified_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(btrim(u.email))
  from auth.users u
  where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
$$;
revoke all on function public.my_verified_email() from public, anon, authenticated;

-- (A)/(B) 경로만 확인하는 원래 헬퍼 — mark_care_report_read() 등 다른 곳에서도 쓰이므로 시그니처 유지
create or replace function public.is_my_care_schedule(p_guardian_id uuid, p_guardian_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() is not null and (
      p_guardian_id = auth.uid()
      or (p_guardian_email is not null and lower(btrim(p_guardian_email)) = public.my_verified_email())
    ),
    false
  )
$$;
revoke all on function public.is_my_care_schedule(uuid, text) from public, anon, authenticated;
grant  execute on function public.is_my_care_schedule(uuid, text) to authenticated, anon;

-- (A)/(B)/(C) 모두 확인하는 최종 헬퍼 (schedule_id 하나로 판단, fix-visibility.sql)
create or replace function public.is_my_care_schedule_id(p_schedule_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() is not null and exists (
      select 1 from public.care_schedules s
      where s.id = p_schedule_id
        and (
          public.is_my_care_schedule(s.guardian_id, s.guardian_email)
          or exists (
            select 1 from public.service_applications a
            where a.id = s.application_id and a.user_id = auth.uid()
          )
        )
    ),
    false
  )
$$;
revoke all on function public.is_my_care_schedule_id(uuid) from public, anon;
grant  execute on function public.is_my_care_schedule_id(uuid) to authenticated, anon;

-- 보호자용 케어 리포트 view — 최종 컬럼 구성 (fix-visibility.sql, application_id 까지 포함)
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
  p.name             as manager_name,
  r.read_at          as read_at,
  s.application_id   as application_id
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule_id(s.id);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

-- 보호자가 리포트를 열 때 '읽음' 처리 — 최종본 (application_id 경로까지 인정)
create or replace function public.mark_care_report_read(p_schedule_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.is_my_care_schedule_id(p_schedule_id) then
    raise exception 'NOT_YOUR_SCHEDULE' using errcode = '42501';
  end if;

  update public.care_reports set read_at = now()
  where schedule_id = p_schedule_id and read_at is null;
end $$;

revoke all on function public.mark_care_report_read(uuid) from public, anon;
grant  execute on function public.mark_care_report_read(uuid) to authenticated;


-- ============================================================================
-- 6) service_applications (apply.html) — 테이블 자체는 Supabase 대시보드에 이미 존재한다고 가정합니다.
--    apply.html 이 저장하는 컬럼: service_type, user_relation, user_contact, address, request_details,
--    privacy_agreed (+ 서버가 채우는 id/created_at/user_id/status)
-- ============================================================================
alter table public.service_applications alter column user_id set default auth.uid();
alter table public.service_applications alter column status  set default 'pending';

alter table public.service_applications add column if not exists manager_id  uuid references public.profiles(id);
alter table public.service_applications add column if not exists accepted_at timestamptz;
alter table public.service_applications add column if not exists schedule_id uuid references public.care_schedules(id) on delete set null;

-- 좌표 캐시 (supabase-address-coordinates.sql)
alter table public.service_applications add column if not exists origin_lat double precision;
alter table public.service_applications add column if not exists origin_lng double precision;
alter table public.service_applications add column if not exists destination_lat double precision;
alter table public.service_applications add column if not exists destination_lng double precision;

create index if not exists service_applications_open_idx
  on public.service_applications (created_at) where manager_id is null;

alter table public.service_applications enable row level security;

-- 보호자: 내 신청만
drop policy if exists service_applications_select_own on public.service_applications;
create policy service_applications_select_own on public.service_applications
  for select to authenticated using (auth.uid() = user_id);

-- 매니저: 아직 아무도 수락하지 않은 접수 대기 신청만 (인증된 매니저 한정)
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in ('', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' then true
    else false
  end
$$;

drop policy if exists service_applications_select_managers on public.service_applications;
create policy service_applications_select_managers on public.service_applications
  for select to authenticated
  using (
    public.is_manager()
    and manager_id is null
    and public.is_pending_application_status(status)
  );

-- 로그인한 사용자가 '내 id 로' 신청서를 저장 (claim-applications.sql — 기존 비로그인용 INSERT 정책과 OR로 합쳐짐)
grant insert on public.service_applications to authenticated;
drop policy if exists service_applications_insert_linked on public.service_applications;
create policy service_applications_insert_linked on public.service_applications
  for insert to authenticated
  with check (privacy_agreed = true and user_id = auth.uid());

grant  select on public.service_applications to authenticated;
revoke select on public.service_applications from anon;

-- 신청 수락 — 최종본 (address-coordinates.sql: 좌표 복사까지 포함)
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

-- 상태 일관성 트리거: manager_id 가 채워지면 대기 상태를 자동으로 'matched'로, 접수 시 위조 방지
create or replace function public.sync_application_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and current_user in ('anon', 'authenticated') then
    new.manager_id := null;
    new.accepted_at := null;
    new.schedule_id := null;
  end if;
  if new.manager_id is not null then
    if new.accepted_at is null then
      if tg_op = 'INSERT' then
        new.accepted_at := now();
      elsif old.manager_id is distinct from new.manager_id then
        new.accepted_at := now();
      end if;
    end if;
    if public.is_pending_application_status(new.status) then
      new.status := 'matched';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists service_applications_sync_status on public.service_applications;
create trigger service_applications_sync_status
  before insert or update of manager_id, status on public.service_applications
  for each row execute function public.sync_application_status();

-- care_schedules.status 변경을 service_applications.status 에 무조건 미러링 (코드 경로에 의존하지 않는 안전장치)
create or replace function public.sync_application_status_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.application_id is not null and new.status is distinct from old.status then
    update public.service_applications
       set status = new.status
     where id = new.application_id
       and status is distinct from new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_application_status on public.care_schedules;
create trigger trg_sync_application_status
after update of status on public.care_schedules
for each row
execute function public.sync_application_status_from_schedule();

-- 보호자가 '내 신청을 맡은 매니저'의 이름·연락처를 볼 수 있게
create or replace function public.my_application_managers()
returns table (application_id uuid, manager_name text, manager_phone text, manager_certification text)
language sql stable security definer set search_path = public as $$
  select a.id,
         coalesce(nullif(btrim(p.name), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')),
         nullif(btrim(p.phone), ''),
         nullif(btrim(m.certification), '')
    from public.service_applications a
    left join public.profiles p on p.id = a.manager_id
    left join public.managers m on m.id = a.manager_id
    left join auth.users u      on u.id = a.manager_id
   where a.user_id = auth.uid()
     and a.manager_id is not null
$$;

revoke all on function public.my_application_managers() from public, anon;
grant  execute on function public.my_application_managers() to authenticated;

-- 보호자 [확인 및 이용 완료] — service_applications.status 에만 'guardian_confirmed' 를 남김
-- (care_schedules.status 는 CHECK 제약상 이 값을 허용하지 않으므로 의도적으로 분리)
create or replace function public.confirm_service_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_row public.service_applications;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.service_applications
     set status = 'guardian_confirmed'
   where id = p_application_id
     and user_id = auth.uid()
     and (
       lower(btrim(coalesce(status, ''))) in ('completed', 'complete', 'done', 'finished', 'care_completed')
       or coalesce(status, '') ~ '케어\s*완료'
     )
  returning * into v_row;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.confirm_service_application(uuid) from public, anon;
grant  execute on function public.confirm_service_application(uuid) to authenticated;

-- 비로그인 상태로 낸 신청을 로그인 후 계정에 연결
create or replace function public.claim_service_applications(p_ids uuid[])
returns setof uuid
language sql security definer set search_path = public as $$
  with claimed as (
    update public.service_applications a
       set user_id = auth.uid()
     where auth.uid() is not null
       and a.id = any (p_ids[1:20])
       and a.user_id is null
       and a.created_at > now() - interval '14 days'
    returning a.id, a.schedule_id
  ), backfill as (
    update public.care_schedules s
       set guardian_id = auth.uid()
      from claimed c
     where s.id = c.schedule_id and s.guardian_id is null
    returning s.id
  )
  select id from claimed
$$;

revoke all on function public.claim_service_applications(uuid[]) from public, anon;
grant  execute on function public.claim_service_applications(uuid[]) to authenticated;


-- ============================================================================
-- 7) seniors (mypage.html '어르신 프로필 관리') — 테이블 자체는 Supabase 대시보드에 이미 존재한다고 가정
-- ============================================================================
alter table public.seniors enable row level security;

drop policy if exists seniors_select_own on public.seniors;
create policy seniors_select_own on public.seniors
  for select to authenticated using (user_id = auth.uid());

drop policy if exists seniors_insert_own on public.seniors;
create policy seniors_insert_own on public.seniors
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists seniors_update_own on public.seniors;
create policy seniors_update_own on public.seniors
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists seniors_delete_own on public.seniors;
create policy seniors_delete_own on public.seniors
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.seniors from anon;
grant select, insert, update, delete on public.seniors to authenticated;


-- ============================================================================
-- 8) care_checkpoints : 현장 수행 5단계 체크포인트 (출발/미팅 → 병원 도착 → 진료 완료 → 귀가 이동 → 귀가 및 완료)
--    step 값은 mypage.html 의 REPORT_TIMELINE_STEPS, mypage-manager.html 의 CHECKPOINT_STEPS 와 반드시 일치해야 함
-- ============================================================================
create table if not exists public.care_checkpoints (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references public.care_schedules(id) on delete cascade,
  manager_id     uuid not null references public.profiles(id),
  step           text not null check (step in (
                   'departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'
                 )),
  lat            double precision,
  lng            double precision,
  accuracy       double precision,
  photo_url      text,
  checkpoint_at  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists care_checkpoints_schedule_idx on public.care_checkpoints (schedule_id, step, checkpoint_at desc);
create index if not exists care_checkpoints_manager_idx  on public.care_checkpoints (manager_id, created_at desc);

alter table public.care_checkpoints enable row level security;

drop policy if exists care_checkpoints_insert_manager on public.care_checkpoints;
create policy care_checkpoints_insert_manager on public.care_checkpoints
  for insert to authenticated
  with check (
    manager_id = auth.uid()
    and exists (select 1 from public.care_schedules s where s.id = schedule_id and s.manager_id = auth.uid())
  );

drop policy if exists care_checkpoints_select_own on public.care_checkpoints;
create policy care_checkpoints_select_own on public.care_checkpoints
  for select to authenticated
  using (
    manager_id = auth.uid()
    or exists (select 1 from public.care_schedules s where s.id = schedule_id and s.guardian_id = auth.uid())
  );
-- 수정/삭제 정책 없음 — 감사 로그이므로 재인증은 항상 새 행으로 남김

revoke all on public.care_checkpoints from public, anon;
grant select, insert on public.care_checkpoints to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'care_checkpoints'
  ) then
    alter publication supabase_realtime add table public.care_checkpoints;
  end if;
end $$;


-- ============================================================================
-- 9) arrival_verification_logs : 병원 도착 인증 감사 로그 (GPS 지오펜싱 + 사진 워터마크, 시도마다 누적)
-- ============================================================================
create table if not exists public.arrival_verification_logs (
  id                     uuid primary key default gen_random_uuid(),
  schedule_id            uuid not null references public.care_schedules(id) on delete cascade,
  manager_id             uuid not null references public.profiles(id),
  verification_type      text not null check (verification_type in ('GPS', 'PHOTO', 'GPS_PHOTO')),
  status                 text not null check (status in ('SUCCESS', 'PENDING_REVIEW')),
  current_lat            double precision,
  current_lng            double precision,
  gps_accuracy           double precision,
  target_distance_meters double precision,
  watermarked_image_url  text,
  raw_image_url          text,
  created_at             timestamptz not null default now()
);

create index if not exists arrival_verification_logs_schedule_idx on public.arrival_verification_logs (schedule_id, created_at desc);
create index if not exists arrival_verification_logs_manager_idx  on public.arrival_verification_logs (manager_id, created_at desc);

alter table public.arrival_verification_logs enable row level security;

drop policy if exists arrival_verification_logs_insert_manager on public.arrival_verification_logs;
create policy arrival_verification_logs_insert_manager on public.arrival_verification_logs
  for insert to authenticated
  with check (
    manager_id = auth.uid()
    and exists (select 1 from public.care_schedules s where s.id = schedule_id and s.manager_id = auth.uid())
  );

drop policy if exists arrival_verification_logs_select_own on public.arrival_verification_logs;
create policy arrival_verification_logs_select_own on public.arrival_verification_logs
  for select to authenticated
  using (
    manager_id = auth.uid()
    or exists (select 1 from public.care_schedules s where s.id = schedule_id and s.guardian_id = auth.uid())
  );
-- 수정/삭제 정책 없음 — 감사 로그이므로 재시도는 항상 새 행으로 남김

revoke all on public.arrival_verification_logs from public, anon;
grant select, insert on public.arrival_verification_logs to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arrival_verification_logs'
  ) then
    alter publication supabase_realtime add table public.arrival_verification_logs;
  end if;
end $$;


-- ============================================================================
-- 10) 기존에 어긋난 status 데이터 일괄 백필 (sync-status-trigger.sql — 트리거 배포 이전 이력 보정용)
--     이미 맞아떨어지는 프로젝트에서는 0행이 갱신되고 끝나므로 안전합니다.
-- ============================================================================
update public.service_applications a
set status = s.status
from public.care_schedules s
where s.application_id = a.id
  and s.status is distinct from a.status;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침 — 이 스크립트가 바꾼 함수/컬럼/권한을 API 가 바로 인식하도록
-- ============================================================================
notify pgrst, 'reload schema';
