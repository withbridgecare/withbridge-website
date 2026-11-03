-- ============================================================================
-- schema_clone_dev.sql
-- 위드브릿지 Dev(withbridge-dev) Supabase 프로젝트 부트스트랩용 통합 마이그레이션
--
-- 이 파일은 프로덕션 프로젝트의 sql/*.sql 63개 파일을 전부 읽고, 각 파일 자신의
-- "실행 순서" 주석(서로를 인용하는 명시적 의존관계)을 전부 추적해 하나의 순서로 엮은
-- 것입니다. 전부 create or replace function / create table if not exists /
-- alter table ... add column if not exists / drop policy if exists + create policy
-- 패턴이라 통째로 한 번에 실행해도 안전합니다(이 저장소 전체의 멱등성 원칙).
--
-- [지난 버전에서 수정됨] service_applications / seniors 두 테이블은 이 저장소 어디에도
-- CREATE TABLE 문이 없었습니다 — 원래 Supabase 대시보드에서 직접(수동으로) 만들어졌기
-- 때문입니다(42P01 undefined_table 에러의 원인). 바로 아래 "0) 기초 테이블" 섹션에 그 두
-- 테이블을 실제로 만드는 CREATE TABLE 문을 추가했습니다 — 각 테이블에 꼭 있어야 하는
-- "원래부터 있었을" 기본 컬럼만 최소로 만들고, 나머지 모든 컬럼(payment_status, final_amount,
-- gender, mobility_level 등)은 뒤에 이어지는 각 파일의 'alter table ... add column if not
-- exists' 문이 그대로 채웁니다 — 즉 이 파일은 이제 그 자체로 완결됩니다.
--
-- ⚠️⚠️⚠️ 그래도 실행 전에 꼭 읽어주세요 ⚠️⚠️⚠️
--
-- 1) 아래 0)번의 CREATE TABLE은 이 저장소의 모든 ALTER TABLE 문 + 실제 앱 코드
--    (apply.html/mypage.html의 insert/select 호출)를 역추적해 재구성한 것이라 바로
--    실행되지만, "컬럼 타입/제약이 100% 운영 DB와 동일하다"는 보장까지는 아닙니다.
--    더 정확하게 맞추고 싶다면 prod 프로젝트에서 그 두 테이블만 schema-only로 추출해
--    대조하세요:
--      pg_dump "<PROD_DB_CONNECTION_STRING>" --schema-only --no-owner --no-privileges \
--        -t public.service_applications -t public.seniors > prod_schema_check.sql
--    (연결 문자열은 prod 대시보드 → Project Settings → Database → Connection string)
--
-- 2) pg_cron이 호출하는 Edge Function URL이 프로덕션 프로젝트 주소로 하드코딩돼
--    있습니다(아래 11번 섹션, matching_expiry_auto_refund.sql 유래) — dev 프로젝트
--    주소로 바꿔야 합니다. 파일 안의 '>>> DEV_PROJECT_URL 로 교체 <<<' 표시를 찾아 고치세요.
--
-- 3) vault.create_secret('...', 'service_role_key')는 평문 서비스 롤 키가 필요해
--    이 파일에 넣을 수 없습니다 — Dev 프로젝트의 SQL Editor에서 별도로 한 번 실행해야
--    합니다:
--      select vault.create_secret('<DEV 프로젝트의 SUPABASE_SERVICE_ROLE_KEY>', 'service_role_key');
--
-- 4) Edge Functions(supabase/functions/*)는 SQL이 아니라 Supabase CLI로 별도 배포해야
--    합니다 — 이 파일은 DB(테이블/함수/트리거/RLS/pg_cron)만 다룹니다.
--
-- 5) Storage 버킷 중 manager-id-cards는 이 파일(23b, 23f)이 INSERT 로 만들지만, RLS만
--    보고 실제 파일 업로드 권한이 필요한 다른 버킷(프로필 사진 등)이 대시보드에 수동으로
--    추가돼 있었다면 이 파일에는 없습니다 — Dev 대시보드의 Storage 탭에서 직접 대조하세요.
--
-- 6) pg_cron/pg_net 확장이 이 Dev 프로젝트 플랜에서 꺼져 있다면 Database → Extensions
--    에서 미리 켜 두세요(꺼져 있으면 각 파일의 'create extension' 문에서 에러가 나지만,
--    DB 함수 자체는 그와 무관하게 전부 만들어지니 그 블록만 건너뛰어도 됩니다).
-- ============================================================================


-- ============================================================================
-- 0) 기초 테이블 (이 저장소에 CREATE TABLE 문이 없던 두 테이블 — 42P01 에러의 원인)
-- ============================================================================

create table if not exists public.service_applications (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid references auth.users(id),      -- 비로그인 신청 폴백 경로가 있어 not null 아님
  status          text,                                  -- 자유 텍스트, CHECK 없음(느슨한 매칭) — 아래 파일들이 default/표준값 추가
  service_type    text,
  user_relation   text,
  user_contact    text,
  address         text,
  request_details text,
  privacy_agreed  boolean not null default false
);

create table if not exists public.seniors (
  senior_id    uuid primary key default gen_random_uuid(),  -- PK 컬럼명이 senior_id (service_applications.senior_id 의 FK 대상)
  user_id      uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  senior_name  text,
  senior_birth date,
  address      text,
  health_note  text
);

-- RLS 활성화/정책/grant는 이 파일 뒤에 바로 이어지는 sql/supabase_schema_latest.sql
-- 6)/7)번 섹션이 두 테이블 모두에 대해 이미 만듭니다 — 여기서는 테이블 생성만 합니다.


-- ==============================================================================
-- [0. 기본 스키마 (profiles/managers/care_schedules/care_reports/care_checkpoints/arrival_verification_logs 등 + RLS + 트리거 + auth.users 연동)]  (원본: sql/supabase_schema_latest.sql)
-- ==============================================================================

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

-- 최근 활동일시(관리자 콘솔 필터용) + '휴식' 전환 가드 (manager_duty_status.sql 과 동일)
alter table public.managers add column if not exists last_active_at timestamptz;

create or replace function public.enforce_manager_break_guard() returns trigger
language plpgsql as $$
begin
  if new.activity_status = 'break' and old.activity_status is distinct from new.activity_status then
    if exists (
      select 1 from public.care_schedules cs
      where cs.manager_id = new.id
        and cs.status in ('assigned', 'departed', 'arrived', 'treatment_done', 'returning')
    ) then
      raise exception '현재 진행 중인 동행 예약 건이 있습니다. 일정을 완료한 후 상태를 변경해 주세요.';
    end if;
  end if;
  if new.activity_status is distinct from old.activity_status then
    new.last_active_at := now();
  end if;
  return new;
end $$;

drop trigger if exists managers_break_guard on public.managers;
create trigger managers_break_guard before update on public.managers
  for each row execute function public.enforce_manager_break_guard();

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
-- 보호자의 '어르신 프로필 관리'(seniors 테이블, mypage.html)에서 선택한 어르신의 나이/특이사항 스냅샷.
-- accept_service_application()/admin_assign_manager() 가 service_applications.senior_age/senior_note 를
-- 그대로 옮겨 담습니다(어르신 프로필 연동, sql 아래 7-1번 참고) — seniors 를 직접 조인하지 않는 이유는
-- (1) 보호자가 나중에 프로필을 수정/삭제해도 그 시점 케어 기록은 그대로 남아야 하고, (2) 매니저/관리자
-- RLS 로 seniors 테이블까지 열어줄 필요가 없어서입니다.
alter table public.care_schedules add column if not exists senior_age  integer;
alter table public.care_schedules add column if not exists senior_note text;
alter table public.care_schedules alter column status set default 'pending';
-- 현장 수행 5단계 인증(출발 (이동 중)→병원 도착→진료/대행 완료→귀가 이동→케어 완료)을 care_schedules.status
-- 하나로 실시간 추적할 수 있도록 'treatment_done'·'returning' 을 추가합니다(care_schedule_5step_status.sql 과 동일).
alter table public.care_schedules drop constraint if exists care_schedules_status_check;
alter table public.care_schedules add constraint care_schedules_status_check
  check (status in ('pending', 'assigned', 'departed', 'arrived', 'treatment_done', 'returning', 'completed'));
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

-- 상태 진행 순서 강제 + 완료 시각 서버 기록 — 현장 수행 5단계(출발 (이동 중)→병원 도착→진료/대행 완료→
-- 귀가 이동→케어 완료)를 매니저가 반드시 순서대로 한 단계씩만 밟도록 강제합니다(건너뛰기·되돌리기 금지).
create or replace function public.enforce_care_status_flow() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'        and new.status = 'assigned')
            or (old.status = 'assigned'       and new.status = 'departed')
            or (old.status = 'departed'       and new.status = 'arrived')
            or (old.status = 'arrived'        and new.status = 'treatment_done')
            or (old.status = 'treatment_done' and new.status = 'returning')
            or (old.status = 'returning'      and new.status = 'completed')) then
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

-- 케어 리포트 작성 모달 개선(원클릭 선택 칩 · 증빙 사진 첨부 · 다음 진료 예약일, sql/care_report_rich_fields.sql):
--   condition_tags — 어르신 컨디션 칩 + 보행 상태 칩을 함께 담는 배열(예: ["양호","자립 보행"]). mypage.html
--     보호자 화면(careReportViewConditionTags)이 이미 이 모양(#해시태그 칩)을 기대하도록 만들어져 있었습니다.
--   photos         — 처방전·진료비 영수증·약 봉투 등 증빙 사진의 배열([{url,label}]). url 은 Storage 가 아니라
--     canvas 로 축소한 데이터 URL 그대로 저장합니다 — 이 프로젝트의 다른 현장 사진들(care_checkpoints.photo_url,
--     arrival_verification_logs 의 watermarked_image_url/raw_image_url)과 같은 방식입니다.
--   next_visit_date — 의사가 안내한 다음 병원 방문/예약일(선택).
-- senior_condition 은 이제 칩 선택을 보완하는 짧은 '특이사항' 자유 입력(선택 사항)으로 역할이 바뀌어
-- not null 제약을 풉니다 — physician_notes 는 여전히 필수입니다.
alter table public.care_reports alter column senior_condition drop not null;
alter table public.care_reports add column if not exists condition_tags  jsonb not null default '[]'::jsonb;
alter table public.care_reports add column if not exists photos          jsonb not null default '[]'::jsonb;
alter table public.care_reports add column if not exists next_visit_date date;

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
      where s.id = schedule_id and s.manager_id = auth.uid()
        -- mypage-manager.html 의 completeSubmitBtn 핸들러는 리포트를 먼저 저장한 뒤에야
        -- advance_care_status() 로 상태를 'completed' 로 넘깁니다(리포트 없이 완료 처리되는 걸
        -- 막으려는 의도적 순서) — 그래서 insert 시점의 실제 상태는 아직 'returning' 입니다.
        -- status = 'completed' 만 허용하면 이 정상 흐름 자체가 매번 RLS 위반으로 막힙니다.
        -- status 가 이미 'completed' 인 경우도 허용하는 건 리포트 저장 실패 후 재시도하는
        -- openReportModal 경로(s.status === 'completed' 인데 아직 리포트가 없는 건) 때문입니다.
        and s.status in ('returning', 'completed')
    )
  );

revoke insert, update, delete on public.care_reports from anon, authenticated;
grant  select, insert on public.care_reports to authenticated;
-- 보호자도 매니저와 같은 "authenticated" DB 역할이라 테이블 단위 GRANT로는 둘을 구분할 수 없습니다 —
-- 보호자가 이 테이블에 직접 접근하지 못하게 막는 건 위 RLS 정책(manager_id = auth.uid())이 이미 하고
-- 있으므로(자기 행이 없으면 select/insert 모두 0 rows), 여기서 authenticated 전체의 grant 를 다시
-- revoke all 로 되돌리면 안 됩니다 — 그러면 매니저의 리포트 제출(insert)까지 "permission denied for
-- table care_reports" 로 막힙니다(실제로 겪은 버그, mypage-manager.html submitReport()).
-- 보호자는 care_reports 를 직접 조회하지 않고 guardian_care_reports 뷰로만 읽습니다(의도된 설계).


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
-- ★ 원래는 다른 SECURITY DEFINER 함수(is_my_care_schedule 등) 안에서만 호출돼 함수 소유자 권한으로
-- 실행됐지만, 이제 service_applications 의 RLS 정책 식에서 '조회하는 로그인 사용자' 권한으로 직접 호출하므로
-- EXECUTE 를 authenticated 에 다시 열어야 합니다 — 안 열면 모든 보호자 조회가
-- "permission denied for function my_verified_email" 로 막힙니다(is_my_care_schedule 때 겪었던 것과 같은
-- 종류의 문제, supabase-fix-is-my-care-schedule-grant.sql 참고). auth.uid() 로만 판단하는 함수라 열어도 안전합니다.
grant execute on function public.my_verified_email() to authenticated;

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
  s.application_id   as application_id,
  -- create or replace view 는 기존 컬럼 순서를 바꿀 수 없어 새 컬럼은 항상 끝에 추가합니다
  -- (sql/care_report_rich_fields.sql). mypage.html 의 REPORT_OPTIONAL_COLS 가 이 세 컬럼을 기대합니다.
  r.condition_tags    as condition_tags,
  r.photos            as photos,
  r.next_visit_date   as next_visit_date
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
--    apply.html 이 저장하는 컬럼: service_type, user_relation, senior_name, user_contact, address,
--    request_details, privacy_agreed (+ 서버가 채우는 id/created_at/user_id/status)
-- ============================================================================
alter table public.service_applications alter column user_id set default auth.uid();
alter table public.service_applications alter column status  set default 'pending';

alter table public.service_applications add column if not exists manager_id  uuid references public.profiles(id);
alter table public.service_applications add column if not exists accepted_at timestamptz;
alter table public.service_applications add column if not exists schedule_id uuid references public.care_schedules(id) on delete set null;

-- 어르신 실제 성함 — apply.html 이 '신청자(보호자) 성함'과는 별도로 받는 값입니다. 이 컬럼이 비어 있는
-- (마이그레이션 이전) 신청은 accept_service_application()/admin_assign_manager() 가 여전히
-- '어르신 (관계 신청)' 자리표시자로 대신합니다 — 두 함수의 coalesce(senior_name, ...) 참고.
alter table public.service_applications add column if not exists senior_name text;

-- 로그인한 보호자가 '어르신 프로필 관리'(seniors 테이블)에서 등록된 어르신을 선택해 신청하면, apply.html 이
-- 이 세 컬럼을 함께 채웁니다 — senior_id 는 어느 프로필에서 가져왔는지 추적용(참조만, seniors 가 삭제/수정돼도
-- 이 신청의 스냅샷은 그대로 유지), senior_age/senior_note 는 선택 당시 나이(만 나이)/특이사항 스냅샷입니다.
-- 직접 입력(프로필 미등록 또는 비로그인)인 경우 senior_id/senior_age/senior_note 는 모두 null 로 남습니다.
alter table public.service_applications add column if not exists senior_id   uuid references public.seniors(senior_id) on delete set null;
alter table public.service_applications add column if not exists senior_age  integer;
alter table public.service_applications add column if not exists senior_note text;

-- 좌표 캐시 (supabase-address-coordinates.sql)
alter table public.service_applications add column if not exists origin_lat double precision;
alter table public.service_applications add column if not exists origin_lng double precision;
alter table public.service_applications add column if not exists destination_lat double precision;
alter table public.service_applications add column if not exists destination_lng double precision;

-- 신청자 이메일 스냅샷: user_id 연결이 어떤 이유로든 끊긴 신청(예: DB 권한 문제로 user_id 없이 저장된
-- 폴백 경로)도 로그인한 계정의 '인증된' 이메일로 다시 찾을 수 있도록 하는 보조 식별자입니다.
-- care_schedules.guardian_email 과 같은 목적의 같은 패턴이며, is_my_care_schedule() 이 이미 쓰는
-- my_verified_email() 을 그대로 재사용합니다. apply.html 은 로그인 상태에서만(서버가 확인한 이메일만)
-- 이 값을 채우고, 사용자가 직접 입력한 이메일은 절대 신뢰하지 않습니다.
alter table public.service_applications add column if not exists applicant_email text;

create index if not exists service_applications_open_idx
  on public.service_applications (created_at) where manager_id is null;

alter table public.service_applications enable row level security;

-- 보호자: 내 신청(user_id) + 인증된 이메일이 일치하는 신청(user_id 연결이 끊긴 경우의 보조 경로)
drop policy if exists service_applications_select_own on public.service_applications;
create policy service_applications_select_own on public.service_applications
  for select to authenticated using (
    auth.uid() = user_id
    or (applicant_email is not null and lower(btrim(applicant_email)) = public.my_verified_email())
  );

-- 매니저: 아직 아무도 수락하지 않은 접수 대기 신청만 (인증된 매니저 한정)
--
-- ⚠ sql/service_application_status_standardization.sql 이 이 함수에 추가한 표준 상태값 'matching_pending'
-- 인식을 여기서도 반드시 그대로 들고 와야 합니다 — create or replace 로 다시 정의하는 거라, 이 통합
-- 스키마 파일을 나중에 다시 실행하면 그 인식 없이 함수가 "되돌아가" 버립니다. 그러면 is_admin() SELECT
-- 정책(sql/admin_service_applications_select.sql)이 아직 적용되지 않은 계정이나, admin_manual_assignment.sql
-- 이 의존하는 매니저 대체 정책(service_applications_select_managers)이 'MATCHING_PENDING'(결제 완료,
-- 배정 대기) 건을 전부 숨겨버리는 회귀가 재발합니다 — PAYMENT_PENDING/CANCELLED 는 계속 false 입니다.
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in
      ('matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching') then true
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
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    auth.uid(),
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
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
-- ⚠ sql/manager_applications.sql 이 이 함수를 manager_phone 에 manager_applications.phone 폴백을
-- 추가해 다시 정의합니다(create or replace) — 이 통합 스키마 파일을 그 파일 뒤에 다시 실행하면 그
-- 폴백 없이 "되돌아가" 버려, profiles.phone 을 따로 채우지 않은 매니저의 연락처가 다시 안 보이게 됩니다.
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

-- 보호자 [신청 취소] — 아직 매니저가 배정되지 않은(manager_id IS NULL) 본인 신청만 취소 가능
-- (sql/guardian_cancel_application.sql 과 동일). 소유권 조건은 service_applications_select_own RLS
-- 정책과 완전히 같습니다(user_id 일치 OR 인증된 이메일 일치) — user_id 연결이 끊긴 채 이메일로만
-- 소유권이 확인되는 신청도 화면에는 보이는데 user_id 만 비교하면 취소가 막히는 비대칭 버그가 있어서,
-- 둘을 반드시 같은 기준으로 맞춰야 합니다. UPDATE 가 0행이면 신청 없음/내 신청 아님/이미 배정됨을
-- 구체적으로 가려내 각기 다른 에러 코드로 던집니다(진단용).
create or replace function public.cancel_my_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_row public.service_applications;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.service_applications
     set status = 'CANCELLED'
   where id = p_application_id
     and manager_id is null
     and (
       user_id = auth.uid()
       or (applicant_email is not null and lower(btrim(applicant_email)) = public.my_verified_email())
     )
  returning * into v_row;

  if found then
    return v_row;
  end if;

  select * into v_row from public.service_applications where id = p_application_id;

  if v_row.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    v_row.user_id = auth.uid()
    or (v_row.applicant_email is not null and lower(btrim(v_row.applicant_email)) = public.my_verified_email())
  ) then
    raise exception 'NOT_YOUR_APPLICATION' using errcode = '42501';
  end if;

  if v_row.manager_id is not null then
    raise exception 'ALREADY_ASSIGNED' using errcode = 'P0002';
  end if;

  raise exception 'APPLICATION_NOT_CANCELLABLE' using errcode = 'P0002';
end $$;

revoke all on function public.cancel_my_application(uuid) from public, anon;
grant  execute on function public.cancel_my_application(uuid) to authenticated;

-- 보호자 [신청 취소]의 PG 자동 환불 연동(Edge Function cancel-application + 이 RPC)은 "상태값 수동
-- 처리" 방식으로 되돌리기로 하면서 완전히 걷어냈습니다 — 환불은 이제 관리자가 결제 내역을 확인한 뒤
-- 수동으로 처리합니다(cancel_my_application() 하나로 충분). 두 시그니처 모두 혹시 먼저 이 파일을
-- 실행해 실제 DB에 만들어진 적이 있다면 깨끗이 제거합니다(둘 다 없었다면 그냥 no-op).
drop function if exists public.cancel_paid_application_after_refund(uuid, text);
drop function if exists public.cancel_paid_application_after_refund(uuid, uuid, text);

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

-- 성별 / 어르신 본인 연락처 / 거동 상태 상세 / 자주 가는 병원 / 거주지 상세주소 / 병원 상세위치
-- (sql/seniors_profile_fields.sql 과 동일 — apply.html '어르신 프로필 원클릭 불러오기'가 이 값들을
-- 신청서 입력칸에 그대로 채웁니다)
alter table public.seniors add column if not exists gender text;
alter table public.seniors drop constraint if exists seniors_gender_check;
alter table public.seniors add constraint seniors_gender_check check (gender is null or gender in ('남', '여'));

alter table public.seniors add column if not exists senior_phone text;

alter table public.seniors add column if not exists mobility_level text;
alter table public.seniors drop constraint if exists seniors_mobility_level_check;
alter table public.seniors add constraint seniors_mobility_level_check
  check (mobility_level is null or mobility_level in ('혼자 걸음 가능', '지팡이·보행기 사용', '휠체어 사용', '매니저 부축 필수'));

alter table public.seniors add column if not exists frequent_hospital text;

alter table public.seniors add column if not exists address_detail text;
alter table public.seniors add column if not exists frequent_hospital_detail text;


-- ============================================================================
-- 8) care_checkpoints : 현장 수행 5단계 체크포인트 (출발/미팅 → 병원 도착 → 진료 완료 → 귀가 이동 → 귀가 및 완료)
--    step 값은 mypage.html 의 REPORT_TIMELINE_STEPS, mypage-manager.html 의 CHECKPOINT_STEPS 와 반드시 일치해야 함
-- ============================================================================
create table if not exists public.care_checkpoints (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references public.care_schedules(id) on delete cascade,
  manager_id     uuid not null references public.profiles(id),
  step           text not null,
  checkpoint_at  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
-- "create table if not exists" 는 테이블이 이미(예전 컬럼 구성으로) 존재하면 아무것도 보완하지 않으므로,
-- api.saveCheckpoint() 가 insert 하는 7개 컬럼을 add column if not exists 로 한 번 더 강제합니다
-- (실패 시 증상·상세 원인은 sql/care_checkpoints_hardening.sql 참고).
alter table public.care_checkpoints add column if not exists lat       double precision;
alter table public.care_checkpoints add column if not exists lng       double precision;
alter table public.care_checkpoints add column if not exists accuracy  double precision;
alter table public.care_checkpoints add column if not exists photo_url text;
alter table public.care_checkpoints drop constraint if exists care_checkpoints_step_check;
alter table public.care_checkpoints add constraint care_checkpoints_step_check
  check (step in ('departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'));

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


-- ==============================================================================
-- [1. is_admin() + 관리자 전용 UPDATE 정책/트리거]  (원본: sql/admin_rls_policies.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔(admin.html / admin.js) 전용 RLS 정책
--   profiles.role = 'admin' 인 로그인 사용자가
--     1) managers.certification_verified 를 승인(true)         ← '승인' 버튼
--     2) service_applications.manager_id / status 를 수동 배정 ← '수동 배정' 버튼
--   을 클라이언트에서 직접 UPDATE 할 수 있도록 허용합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   sql/supabase_schema_latest.sql 이 이미 적용돼 있어야 합니다
--   (profiles / managers / service_applications, is_manager() 패턴을 전제로 합니다).
--   모든 문장이 create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) is_admin(): 지금 로그인한 사용자가 profiles.role = 'admin' 인지 (is_manager() 와 같은 패턴)
--    SECURITY DEFINER 로 정의해 profiles 의 RLS(자기 행만 select) 와 무관하게 판정합니다.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 1) profiles : 관리자가 다른 유저의 role / name / phone 을 수정
--    (지금은 profiles 에 다른 UPDATE 정책이 전혀 없으므로, is_admin() 이 아닌 사용자는
--     아래 grant 가 있어도 이 정책 하나 때문에 어떤 행도 고칠 수 없습니다 — fail closed)
-- ----------------------------------------------------------------------------
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update (role, name, phone) on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- 2) managers : 관리자가 매니저 자격 인증 상태를 승인/반려
--    주의: managers_update_own(자기 행, activity_status 컬럼만 grant)이 이미 있어서,
--    certification / certification_verified 컬럼을 authenticated 에 grant 하면 컬럼 권한만으로는
--    매니저 본인도 자기 행에 한해 이 컬럼을 바꿀 수 있게 열리는 셈입니다(컬럼 grant는 정책 단위가
--    아니라 역할 단위라서). 그래서 트리거로 "이 두 컬럼은 is_admin() 세션만 바꿀 수 있다"를
--    한 번 더 강제해 자기 승인(self-approve)을 막습니다.
-- ----------------------------------------------------------------------------
drop policy if exists managers_update_admin on public.managers;
create policy managers_update_admin on public.managers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update (certification, certification_verified) on public.managers to authenticated;

create or replace function public.enforce_managers_admin_only_fields() returns trigger
language plpgsql as $$
begin
  if (new.certification_verified is distinct from old.certification_verified
      or new.certification is distinct from old.certification)
     and not public.is_admin() then
    raise exception 'ADMIN_ONLY_FIELD: certification/certification_verified 는 관리자만 수정할 수 있습니다.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists managers_admin_only_fields on public.managers;
create trigger managers_admin_only_fields before update on public.managers
  for each row execute function public.enforce_managers_admin_only_fields();


-- ----------------------------------------------------------------------------
-- 3) service_applications : 관리자가 수동으로 매니저 배정(manager_id) / 상태(status) 조정
--    이 테이블은 지금까지 UPDATE 정책이 전혀 없었습니다(모든 변경이 accept_service_application() 등
--    SECURITY DEFINER 함수 경유). 이 정책을 추가해도 is_admin() 이 아닌 사용자는 여전히 어떤 행도
--    고치지 못합니다 — fail closed.
--    manager_id 만 채워도 기존 트리거 sync_application_status() 가 accepted_at 과
--    status='matched' 를 자동으로 채우므로, admin.js 는 manager_id 만 보내면 충분합니다.
--    status 컬럼은 관리자가 배정 취소 등으로 직접 조정할 수 있게 함께 열어 둡니다.
-- ----------------------------------------------------------------------------
drop policy if exists service_applications_update_admin on public.service_applications;
create policy service_applications_update_admin on public.service_applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update (manager_id, status) on public.service_applications to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침 — 위에서 추가한 정책/함수/권한을 API 가 바로 인식하도록
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [2a. care_checkpoints 보강]  (원본: sql/care_checkpoints_hardening.sql)
-- ==============================================================================

-- ============================================================================
-- care_checkpoints_hardening.sql
-- "진료/대행 완료"(treatment_done)·"귀가 이동"(returning) 인증 시 매니저 화면에 뜨는
--   '"OOO" 상태로 업데이트했지만, 동행 타임라인 기록(care_checkpoints)은 저장하지 못했어요.' /
--   '위치/사진은 저장하지 못했어요. 관리자에게 DB 설정을 요청해 주세요.'
-- 경고 토스트를 해결합니다 (mypage-manager.html performAdvance()/recordCheckpoint() 참고).
--
-- 원인: public.care_checkpoints 테이블이 "create table if not exists" 로 정의돼 있어서(원본:
-- sql/supabase_schema_latest.sql, _backup_sql/supabase-care-checkpoints.sql), 이 테이블이 예전에
-- 다른 컬럼 구성으로(예: accuracy·photo_url 누락, 또는 step 체크 제약에 'treatment_complete'/
-- 'return_departure' 가 빠진 3단계짜리 구버전으로) 이미 만들어져 있었다면 "if not exists" 때문에
-- 그 뒤로 schema 파일을 다시 돌려도 컬럼/제약이 보완되지 않습니다. 프론트엔드(api.saveCheckpoint,
-- mypage-manager.html)는 schedule_id/manager_id/step/lat/lng/accuracy/photo_url 7개 컬럼을 그대로
-- insert 하므로, 컬럼이 하나라도 없거나 step 제약이 더 좁으면 INSERT 자체가 42703(컬럼 없음) 또는
-- 23514(체크 제약 위반)로 실패하고, 위 경고 토스트만 뜬 채 상태(status)만 업데이트됩니다.
--
-- 이 파일은 "create table if not exists" 대신 컬럼별 "add column if not exists" + 체크 제약
-- "drop constraint if exists / add constraint" 로 테이블을 강제로 최신 모양에 맞춥니다 — 몇 번을
-- 다시 실행해도 안전합니다(완전히 멱등적). 실행 순서: sql/supabase_schema_latest.sql 이후 아무 때나
-- 이 파일만 다시 실행해도 됩니다.
-- ============================================================================

create table if not exists public.care_checkpoints (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references public.care_schedules(id) on delete cascade,
  manager_id     uuid not null references public.profiles(id),
  step           text not null,
  checkpoint_at  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- 혹시 테이블이 더 옛날 버전으로 이미 만들어져 있어 아래 컬럼들이 하나라도 빠져 있었다면 보충합니다
-- (mypage-manager.html api.saveCheckpoint() 가 insert 하는 7개 컬럼과 정확히 일치해야 합니다).
alter table public.care_checkpoints add column if not exists lat       double precision;
alter table public.care_checkpoints add column if not exists lng       double precision;
alter table public.care_checkpoints add column if not exists accuracy  double precision;
-- ⚠ 컬럼명은 _url 이지만, 실제로는 Storage 를 쓰지 않고 축소된 이미지를 data:image/jpeg;base64,... 문자열
--   그대로 저장합니다(verification_photo 등 이 프로젝트의 다른 현장 사진 컬럼과 같은 방식).
alter table public.care_checkpoints add column if not exists photo_url text;

-- step 값 5개(출발/병원 도착/진료·대행 완료/귀가 이동/귀가 및 완료)를 전부 허용하도록 강제로 다시 겁니다 —
-- 예전에 더 좁은 제약으로 만들어져 있었다면 이 ALTER 로 즉시 넓어집니다.
alter table public.care_checkpoints drop constraint if exists care_checkpoints_step_check;
alter table public.care_checkpoints add constraint care_checkpoints_step_check
  check (step in ('departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'));

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

-- 관리자 전체 조회 정책은 sql/admin_care_checkpoints_select.sql 이 별도로 추가합니다(이 파일의 관심사는
-- 매니저 본인의 insert/select 가 막히지 않는 것뿐이라, is_admin() 의존 정책은 여기서 건드리지 않습니다).

revoke all on public.care_checkpoints from public, anon;
grant select, insert on public.care_checkpoints to authenticated;

-- record_care_verification() 이 의존하는 care_schedules 쪽 컬럼도 혹시 빠져 있을 경우를 대비해
-- 함께 보강합니다(출발/병원 도착 인증의 위치·사진을 저장하는 컬럼).
alter table public.care_schedules add column if not exists departed_at           timestamptz;
alter table public.care_schedules add column if not exists departed_location    jsonb;
alter table public.care_schedules add column if not exists departed_photo       text;
alter table public.care_schedules add column if not exists arrived_at           timestamptz;
alter table public.care_schedules add column if not exists arrived_location     jsonb;
alter table public.care_schedules add column if not exists arrived_photo        text;
alter table public.care_schedules add column if not exists verification_location text;
alter table public.care_schedules add column if not exists verification_photo    text;

-- record_care_verification() 을 다시 정의해, 혹시 함수 자체가 아직 배포되지 않았거나(없음) 옛 시그니처로
-- 남아 있다면 지금 프론트엔드(mypage-manager.html api.verifyAdvance)가 호출하는 모양으로 맞춥니다.
create or replace function public.record_care_verification(
  p_schedule_id uuid,
  p_status      text,
  p_location    jsonb default null,
  p_photo       text  default null
) returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if p_status not in ('departed', 'arrived') then
    raise exception 'INVALID_STATUS: record_care_verification 은 departed/arrived 전용입니다 (받은 값: %)', p_status;
  end if;
  if p_location is null and p_photo is null then
    raise exception 'MISSING_VERIFICATION: 위치 또는 사진 중 하나는 반드시 있어야 합니다';
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
    raise exception 'SCHEDULE_UNAVAILABLE: 이 일정을 찾을 수 없거나 담당 매니저가 아닙니다';
  end if;

  if v_row.application_id is not null then
    update public.service_applications set status = p_status where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.record_care_verification(uuid, text, jsonb, text) from public, anon;
grant  execute on function public.record_care_verification(uuid, text, jsonb, text) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- ==============================================================================
-- [2b. 보호자 본인 신청 취소 RPC]  (원본: sql/guardian_cancel_application.sql)
-- ==============================================================================

-- ============================================================================
-- guardian_cancel_application.sql
-- 보호자 마이페이지(mypage.html)에서 아직 매니저가 배정되지 않은(= manager_id IS NULL) 본인 신청을
-- 직접 취소할 수 있게 하는 RPC 입니다.
--
-- ── 버그 수정: "내 신청인데도 APPLICATION_NOT_CANCELLABLE 이 뜨는" 문제 ────────────────────────────
-- 이전 버전은 소유권을 user_id = auth.uid() 하나로만 확인했습니다. 그런데 이 신청 목록을 보여주는
-- SELECT 정책(service_applications_select_own, sql/supabase_schema_latest.sql)은 그보다 넓은 기준을
-- 씁니다:
--     auth.uid() = user_id  OR  (applicant_email 이 로그인 계정의 인증된 이메일과 일치)
-- 즉 user_id 연결이 끊긴 신청(비로그인 신청 폴백 경로 등, applicant_email 컬럼 주석 참고)도 보호자
-- 마이페이지에는 정상적으로 "보이고" [신청 취소하기] 버튼까지 뜨지만, 예전 cancel_my_application() 은
-- user_id 만 비교해서 그런 행은 전부 "내 신청이 아님"으로 처리돼 false 로 막혔습니다 — 화면에 보이는
-- 건 취소할 수 있어야 하는데 못 하는 비대칭이 버그의 실체였습니다.
--
-- 지금은 SELECT 정책과 완전히 같은 기준(user_id 일치 OR 인증된 이메일 일치)으로 소유권을 확인합니다.
--
-- 추가로, UPDATE 가 0행을 바꿔도 예전처럼 뭉뚱그려 APPLICATION_NOT_CANCELLABLE 하나로만 끝내지 않고,
-- 정확히 어떤 조건에서 막혔는지(신청이 없음 / 내 신청이 아님 / 이미 매니저 배정됨) 구체적인 에러
-- 코드로 구분해서 던집니다 — 다음에 같은 문제가 또 생기면 로그만 보고 바로 원인을 알 수 있도록.
-- ============================================================================

create or replace function public.cancel_my_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_row public.service_applications;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- 소유권 조건을 service_applications_select_own RLS 정책과 똑같이 맞춰서 한 번에 시도합니다 —
  -- 화면에 보이는 신청이라면(=이 조건을 만족하니까 보였던 것) 이 UPDATE 도 반드시 성공해야 합니다.
  update public.service_applications
     set status = 'CANCELLED'
   where id = p_application_id
     and manager_id is null
     and (
       user_id = auth.uid()
       or (applicant_email is not null and lower(btrim(applicant_email)) = public.my_verified_email())
     )
  returning * into v_row;

  if found then
    return v_row;
  end if;

  -- 여기부터는 "왜 안 됐는지" 를 구체적으로 가려내기 위한 진단 분기입니다 — 운영 로그에 이 에러 코드만
  -- 남아도 바로 원인을 알 수 있습니다.
  select * into v_row from public.service_applications where id = p_application_id;

  if v_row.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    v_row.user_id = auth.uid()
    or (v_row.applicant_email is not null and lower(btrim(v_row.applicant_email)) = public.my_verified_email())
  ) then
    raise exception 'NOT_YOUR_APPLICATION' using errcode = '42501';
  end if;

  if v_row.manager_id is not null then
    raise exception 'ALREADY_ASSIGNED' using errcode = 'P0002';
  end if;

  -- 소유권도 맞고 manager_id 도 비어 있는데 위 UPDATE 가 실패했다면(동시에 다른 트랜잭션이 막 처리한
  -- 경우 등) 더 구체적으로 설명할 수 없는 일반적인 상태라 기존 에러 코드로 마무리합니다.
  raise exception 'APPLICATION_NOT_CANCELLABLE' using errcode = 'P0002';
end $$;

revoke all on function public.cancel_my_application(uuid) from public, anon;
grant  execute on function public.cancel_my_application(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- ==============================================================================
-- [2c. 24시간 자동 이용완료 확정 + pg_cron]  (원본: sql/guardian_auto_confirm_completion.sql)
-- ==============================================================================

-- ============================================================================
-- 보호자 미확정 자동 완료 — 매니저가 케어 리포트를 제출한 지 24시간이 지나도 보호자가
-- [케어 이용 완료 확정](confirm_service_application() RPC)을 누르지 않은 건을 자동으로
-- 'guardian_confirmed' 로 전환합니다.
--
--   사람이 직접 확정한 것과 똑같은 종착 상태(guardian_confirmed)로 만드는 것뿐이라 외부 API 호출이
--   전혀 없습니다(결제/환불이 걸려 있던 cancel-expired-applications 와는 달리 돈이 움직이지 않음) —
--   그래서 Edge Function 없이 pg_cron 이 이 SQL 함수를 직접 호출하는 가장 단순한 형태로 만듭니다.
--
--   매니저 완료 실적·정산(admin_manager_monthly_settlements)은 이미 care_schedules.status='completed'
--   만 보고 보호자 확정 여부와 무관하게 집계되므로(점검해 재확인함), 이 자동 전환은 보호자 쪽 "확인 대기"
--   목록이 끝없이 쌓이는 UX 문제만 해결하면 됩니다 — 정산 숫자에는 아무 영향이 없습니다.
--
--   확정 기준: confirm_service_application() RPC(supabase-guardian-confirm-completion.sql)가 인정하는
--   것과 완전히 같은 '완료' 문자열 매칭을 그대로 씁니다(완료/complete/done/finished/care_completed/
--   "케어 완료" 포함) — 수동 확정과 자동 확정이 서로 다른 기준으로 갈라지지 않게.
-- ============================================================================

create or replace function public.auto_confirm_overdue_applications()
returns setof uuid
language sql security definer set search_path = public as $$
  update public.service_applications sa
     set status = 'guardian_confirmed'
    from public.care_schedules cs
    join public.care_reports cr on cr.schedule_id = cs.id
   where cs.application_id = sa.id
     and (
       lower(btrim(coalesce(sa.status, ''))) in ('completed', 'complete', 'done', 'finished', 'care_completed')
       or sa.status ~ '케어\s*완료'
     )
     and cr.created_at < now() - interval '24 hours'
  returning sa.id;
$$;

revoke all on function public.auto_confirm_overdue_applications() from public, anon, authenticated;
-- service_role/postgres(pg_cron 실행 주체)는 revoke 와 무관하게 항상 호출 가능 — 다른 cron 전용
-- 함수(list_expired_unmatched_applications 등)와 같은 패턴입니다.


-- ----------------------------------------------------------------------------
-- pg_cron 스케줄 — 매시간 정각에 실행. 외부 HTTP 호출이 없으므로 pg_net/Vault/서비스키가 필요 없고,
-- 이 함수 하나만 직접 부릅니다(cancel-expired-virtual-accounts 와 같은 단순 패턴).
-- ----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'auto-confirm-overdue-applications';
select cron.schedule(
  'auto-confirm-overdue-applications',
  '0 * * * *',
  $$select public.auto_confirm_overdue_applications();$$
);

notify pgrst, 'reload schema';


-- ==============================================================================
-- [2d. 매니저 노출 범위 조정]  (원본: sql/manager_visibility_payment_pending.sql)
-- ==============================================================================

-- ============================================================================
-- [원복] 매니저 '신청 대기 목록'은 PAYMENT_PENDING(결제/입금 확인 전) 건을 다시 숨깁니다
--
--   이전 버전의 이 파일은 PAYMENT_PENDING 건도 매니저에게 노출하도록 RLS를 넓혔습니다. 이후
--   "매니저는 결제가 완료되어 수락 가능한 건만 봐야 한다"는 결정에 따라 그 변경을 되돌립니다 —
--   mypage-manager.html 의 isAwaitingPaymentStatus() 관련 코드도 함께 제거했습니다.
--
--   service_applications_select_managers 정책을 sql/supabase_schema_latest.sql 원본과 똑같이
--   (is_pending_application_status(status) 만 — PAYMENT_PENDING 은 제외) 다시 정의합니다. 이전에
--   PAYMENT_PENDING 도 허용하는 버전을 이미 실행하셨더라도, 이 파일을 다시 실행하면 그 완화분이
--   덮어써져 원래대로(결제 확인 전 신청서는 매니저에게 안 보임) 돌아갑니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → 이 파일. drop policy if exists / create 기반이라
--   여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists service_applications_select_managers on public.service_applications;
create policy service_applications_select_managers on public.service_applications
  for select to authenticated
  using (
    public.is_manager()
    and manager_id is null
    and public.is_pending_application_status(status)
  );

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3a. 관리자 케어 액션(강제완료 등)]  (원본: sql/admin_care_actions.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자 콘솔(admin.html) '배정 완료(진행 중) 케어 현황' 카드 액션 — 매니저 교체 / 강제 완료
--   두 액션 모두 care_schedules 에 대한 admin 전용 UPDATE RLS 정책이 없어도 동작합니다
--   (SECURITY DEFINER 함수는 RLS 를 거치지 않고 함수 소유자 권한으로 실행되기 때문입니다).
--   is_admin() 은 sql/admin_rls_policies.sql 이 이미 만들어 둔 함수를 그대로 재사용합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일.
--   create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
--
--   0번의 DROP FUNCTION 이 필요한 이유: create or replace function 은 매개변수 목록(시그니처)이 같을 때만
--   "교체"로 처리되고, 반환 타입(RETURNS)이나 매개변수 타입이 달라지면 "cannot change return type of
--   existing function"(42P13) 에러로 거부합니다. 이 두 함수를 이전에 다른 반환 타입으로 먼저 만들어 둔
--   적이 있다면(예: void 등) create or replace 만으로는 덮어쓸 수 없으므로, 같은 이름+매개변수 조합의
--   기존 함수를 먼저 완전히 지운 뒤 아래에서 새로 만듭니다. 처음 실행하는 환경에서는 지울 함수가 없으므로
--   IF EXISTS 덕분에 조용히 넘어갑니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) 반환 타입 충돌 방지 — 기존 함수가 있다면(어떤 반환 타입이었든) 먼저 삭제
-- ----------------------------------------------------------------------------
drop function if exists public.admin_force_complete_care(uuid);
drop function if exists public.admin_reassign_care_manager(uuid, uuid);


-- ----------------------------------------------------------------------------
-- 1) 매니저 교체 — 이미 배정된(= manager_id 가 채워진) care_schedules 건의 담당 매니저를
--    다른 활동 중인(certification_verified=true) 매니저로 바꿉니다. 완료된 건은 바꿀 수 없습니다.
--    같은 건이 service_applications 와 연결돼 있으면(application_id) 그 신청서의 manager_id 도
--    함께 맞춰서 두 테이블이 어긋나지 않게 합니다(care_schedules.manager_id 와
--    service_applications.manager_id 는 서로 자동 동기화 트리거가 없는 별개 컬럼이라, 여기서
--    바꾸지 않으면 신청서 쪽은 예전 매니저로 계속 남습니다).
-- ----------------------------------------------------------------------------
create or replace function public.admin_reassign_care_manager(p_schedule_id uuid, p_new_manager_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.care_schedules;
  v_is_active boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.managers m
    where m.id = p_new_manager_id and m.certification_verified = true
  ) into v_is_active;
  if not v_is_active then
    raise exception 'MANAGER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.care_schedules
     set manager_id = p_new_manager_id
   where id = p_schedule_id
     and manager_id is not null
     and status <> 'completed'
  returning * into v_row;

  if not found then
    raise exception 'SCHEDULE_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if v_row.application_id is not null then
    update public.service_applications
       set manager_id = p_new_manager_id
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.admin_reassign_care_manager(uuid, uuid) from public, anon;
grant  execute on function public.admin_reassign_care_manager(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 2) 강제 완료 — care_schedules_status_flow 트리거(enforce_care_status_flow)가 단계를 한 번에
--    건너뛰는 전환(예: assigned → completed)을 막고 있으므로, 관리자가 눌렀을 때는 남은 단계를
--    한 단계씩 순서대로 밀어서 결국 completed 까지 보냅니다(각 단계 전환마다 트리거가 정상적으로
--    같이 돌아 completed_at 기록, care_schedules → service_applications 상태 미러링까지 그대로 적용됨).
--    이미 완료된 건을 다시 호출해도 에러 없이 그대로 반환합니다(멱등).
--
--    아래 CASE는 enforce_care_status_flow(sql/supabase_schema_latest.sql)가 허용하는 전환과 반드시
--    같아야 합니다 — 한쪽만 고치면 "invalid status transition" 으로 다시 막힙니다. care_schedule_5step_status.sql
--    로 arrived 다음 단계가 treatment_done/returning 두 개로 늘었는데 이 함수가 옛 3단계(pending/assigned/
--    departed/arrived→completed) 기준으로 남아 있어 arrived 건에서 "invalid status transition:
--    arrived -> completed" 에러가 났던 것을 고쳤습니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_force_complete_care(p_schedule_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.care_schedules;
  v_next text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  while v_row.status is distinct from 'completed' loop
    v_next := case v_row.status
      when 'pending'        then 'assigned'
      when 'assigned'       then 'departed'
      when 'departed'       then 'arrived'
      when 'arrived'        then 'treatment_done'
      when 'treatment_done' then 'returning'
      when 'returning'      then 'completed'
      else null
    end;
    if v_next is null then
      raise exception 'CANNOT_FORCE_COMPLETE_FROM_STATUS' using errcode = 'P0001';
    end if;
    update public.care_schedules set status = v_next where id = v_row.id returning * into v_row;
  end loop;

  return v_row;
end $$;

revoke all on function public.admin_force_complete_care(uuid) from public, anon;
grant  execute on function public.admin_force_complete_care(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3b. 관리자 체크포인트 조회 정책]  (원본: sql/admin_care_checkpoints_select.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자가 care_checkpoints 전체를 조회할 수 있게 하는 RLS 정책
--
--   care_checkpoints 의 기존 SELECT 정책(sql/supabase_schema_latest.sql)은 한 종류뿐입니다:
--     - care_checkpoints_select_own : manager_id = auth.uid() (기록한 매니저 본인)
--                                      또는 해당 일정의 guardian_id = auth.uid() (그 일정을 신청한 보호자 본인)
--   admin.html 의 "배정 완료(진행 중) 케어 현황" 카드에 추가한 [현장 인증 상세보기] 모달은 관리자가
--   자신이 담당 매니저도, 신청 보호자도 아닌 다른 사람의 일정에 대한 출발/도착 체크포인트(시각·GPS·사진)를
--   조회해야 합니다 — sql/admin_care_schedules_select.sql 때와 똑같은 종류의 공백이라, 이 파일을 실행하지
--   않으면 모달은 열리지만 "아직 인증이 기록되지 않았습니다"만 보이고 실제로는 데이터가 있는 상태로
--   보일 수 있습니다(RLS 가 조용히 0행을 돌려주기 때문에 에러도 나지 않습니다).
--
--   기존 정책은 그대로 두고 is_admin() 만 확인하는 정책을 하나 더 추가합니다 — permissive 정책은
--   OR 로 합쳐지므로 기존 접근 권한은 전혀 줄어들지 않습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop policy if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists care_checkpoints_select_admin on public.care_checkpoints;
create policy care_checkpoints_select_admin on public.care_checkpoints
  for select to authenticated
  using (public.is_admin());

-- 관리자 전용이므로 grant 는 기존 "grant select, insert on public.care_checkpoints to authenticated;"
-- (sql/supabase_schema_latest.sql) 그대로 재사용합니다 — role 단위 grant 는 이미 충분히 열려 있고,
-- 실제 행 단위 접근 제어는 위 RLS 정책이 담당합니다.

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3c. 관리자 케어 일정 조회 정책]  (원본: sql/admin_care_schedules_select.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자가 care_schedules 전체를 조회할 수 있게 하는 RLS 정책
--
--   지금까지 care_schedules 의 SELECT 정책은 두 종류뿐이었습니다(sql/supabase_schema_latest.sql):
--     - care_schedules_select_own                    : manager_id = auth.uid() (담당 매니저 본인)
--                                                        또는 미배정+대기 건(매니저 전체)
--     - care_schedules_select_guardian / _via_application : guardian_id = auth.uid() (신청한 보호자 본인)
--   관리자(profiles.role = 'admin')가 "배정 완료(진행 중) 케어 건 현황판"에서 다른 사람에게 배정된
--   일정까지 전부 봐야 하는데, 지금까지는 그걸 허용하는 정책이 없어 관리자 자신이 매니저가 아닌 한
--   아무것도 안 보였습니다. (admin_service_applications_select.sql 때 겪었던 것과 같은 종류의 공백입니다.)
--
--   기존 정책은 그대로 두고 is_admin() 만 확인하는 정책을 하나 더 추가합니다 — permissive 정책은
--   OR 로 합쳐지므로 기존 접근 권한은 전혀 줄어들지 않습니다.
--
--   realtime(postgres_changes) 발행 등록은 이미 sql/supabase_schema_latest.sql 에서 care_schedules 를
--   supabase_realtime publication 에 추가하고 replica identity full 로 설정해 뒀으므로 이 파일에서는
--   RLS 정책만 추가하면 충분합니다 — admin.js 의 실시간 구독도 바로 이 테이블을 그대로 탑니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop policy if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists care_schedules_select_admin on public.care_schedules;
create policy care_schedules_select_admin on public.care_schedules
  for select to authenticated
  using (public.is_admin());

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3d. 관리자 수동 배정]  (원본: sql/admin_manual_assignment.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자 콘솔(admin.html) '수동 배정' 버튼 — admin_assign_manager() RPC
--
--   이전까지 admin.js 의 [수동 배정] 버튼은 service_applications.manager_id 만 직접 UPDATE 했습니다
--   (sql/admin_rls_policies.sql 의 service_applications_update_admin 정책 + grant update 로 가능했던
--   일입니다). 이 방식에는 두 가지 구멍이 있었습니다:
--
--   1) status 가 'MATCHED' 로 안 바뀔 수 있었습니다 — sync_application_status() 트리거(sql/
--      supabase_schema_latest.sql)는 manager_id 가 채워질 때 "현재 status 가 대기류 동의어일 때만" status 를
--      올려 줍니다(is_pending_application_status()). 그런데 이 함수는 'PAYMENT_PENDING'(대문자 표준값)을
--      대기류로 인식하지 못해서(동의어 목록엔 'pending'/'matching_pending' 등만 있고 'payment_pending'은
--      없음), 아직 입금 확인 전(PAYMENT_PENDING)인 신청을 관리자가 수동 배정하면 manager_id 는 채워져도
--      status 는 PAYMENT_PENDING 에 그대로 멈춰 있었습니다.
--   2) care_schedules 행이 아예 생기지 않았습니다 — care_schedules 행은 매니저가 mypage-manager.html 에서
--      직접 수락할 때(accept_service_application() RPC)만 만들어집니다. 관리자의 수동 배정은 그 RPC를
--      타지 않고 service_applications 테이블만 고쳤으므로, admin.html 의 '배정 완료(진행 중) 케어 현황'
--      카드(care_schedules 기반 조회)에는 수동 배정한 건이 영원히 나타나지 않았습니다 — 이 카드의 쿼리
--      자체에 결제 상태로 거르는 조건은 없었고(원인은 쿼리가 아니라 애초에 행이 없었던 것), manager_id
--      IS NOT NULL AND status <> 'completed' 조건은 그대로 맞는데 행 자체가 없어서 안 보인 것입니다.
--
--   이 파일의 admin_assign_manager() 는 accept_service_application() 과 같은 규칙으로 care_schedules
--   행까지 함께 만들어서 이 두 구멍을 한 번에 막습니다:
--     ① service_applications.manager_id 설정
--     ② status 를 'MATCHED' 로 명시적으로 확정(트리거의 동의어 목록에 기대지 않음)
--     ③ 그 신청이 PAYMENT_PENDING(미입금)이었다면, 수동 배정 자체를 "매칭을 확정한다"는 관리자 선언으로
--        보고 연결된 virtual_accounts.is_paid 도 함께 true 로 맞춤(admin_confirm_manual_payment() 와 같은 처리) —
--        MATCHED 인데 미입금으로 남는 상태 불일치를 막기 위함
--     ④ care_schedules 행 생성(없으면) → '배정 완료(진행 중) 케어 현황' 카드에 즉시 나타남. scheduled_at 은
--        service_applications 에 희망 일시를 담는 전용 컬럼이 없어(apply.html 이 request_details 안에
--        "희망 일시: 9월 25일 (목) 오전 10시 30분" 형식의 한 줄로만 저장함, desired_date/start_time 같은
--        컬럼은 DB에 존재하지 않음) parse_desired_datetime_kst() 로 그 줄을 파싱해 KST 기준으로 복원합니다.
--        파싱에 실패하면(형식이 다르거나 요청사항을 아예 안 썼으면) now() 로 대체합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일.
--   create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop function if exists public.admin_assign_manager(uuid, uuid);


-- ----------------------------------------------------------------------------
-- 0-1) request_details 안의 "희망 일시: N월 N일 (요일) 오전/오후 N시 [N분]" 한 줄을 파싱해 KST 기준
--      timestamptz 로 복원합니다 (apply.html 의 formatDesiredDateTime() 이 만드는 형식과 정확히 맞춤 —
--      그 함수가 포맷을 바꾸면 이 정규식도 같이 고쳐야 합니다). 연도가 문자열에 없으므로 p_reference(보통
--      신청 접수 시각 created_at) 의 연도를 기본으로 쓰고, "접수월보다 파싱된 월이 많이 이르면"(예: 12월에
--      접수하면서 1월을 희망) 해를 넘긴 요청으로 보고 연도를 +1 합니다. 형식이 안 맞거나 범위를 벗어난
--      값(13월, 25시 등)이면 NULL 을 돌려줘서 호출부가 now() 등으로 대체하게 합니다.
-- ----------------------------------------------------------------------------
create or replace function public.parse_desired_datetime_kst(p_request_details text, p_reference timestamptz)
returns timestamptz
language plpgsql stable as $$
declare
  v_m       text[];
  v_month   int;
  v_day     int;
  v_ampm    text;
  v_hour12  int;
  v_minute  int;
  v_hour24  int;
  v_year    int;
  v_ref_month int;
begin
  v_m := regexp_match(
    coalesce(p_request_details, ''),
    '(\d{1,2})월\s*(\d{1,2})일(?:\s*\([^)]*\))?\s*(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?'
  );
  if v_m is null then
    return null;
  end if;

  v_month  := v_m[1]::int;
  v_day    := v_m[2]::int;
  v_ampm   := v_m[3];
  v_hour12 := v_m[4]::int;
  v_minute := coalesce(v_m[5]::int, 0);

  if v_month not between 1 and 12 or v_day not between 1 and 31
     or v_hour12 not between 1 and 12 or v_minute not between 0 and 59 then
    return null;
  end if;

  v_hour24 := case
    when v_ampm = '오후' and v_hour12 <> 12 then v_hour12 + 12
    when v_ampm = '오전' and v_hour12 = 12 then 0
    else v_hour12
  end;

  v_ref_month := extract(month from (coalesce(p_reference, now()) at time zone 'Asia/Seoul'))::int;
  v_year := extract(year from (coalesce(p_reference, now()) at time zone 'Asia/Seoul'))::int;
  if v_month < v_ref_month - 1 then
    v_year := v_year + 1;
  end if;

  return (
    to_char(v_year, 'FM0000') || '-' || to_char(v_month, 'FM00') || '-' || to_char(v_day, 'FM00') ||
    ' ' || to_char(v_hour24, 'FM00') || ':' || to_char(v_minute, 'FM00') || ':00+09:00'
  )::timestamptz;
exception when others then
  -- 2월 30일처럼 달력에 없는 날짜 등 예외적인 입력은 조용히 NULL(= 호출부가 now() 로 대체)로 처리합니다.
  return null;
end $$;

revoke all on function public.parse_desired_datetime_kst(text, timestamptz) from public, anon, authenticated;

create or replace function public.admin_assign_manager(p_application_id uuid, p_manager_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app         public.service_applications;
  v_is_active   boolean;
  v_schedule_id uuid;
  v_phone_re    constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep         int;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.managers m where m.id = p_manager_id and m.certification_verified = true
  ) into v_is_active;
  if not v_is_active then
    raise exception 'MANAGER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  -- ① manager_id 설정 + ② status 명시적으로 'MATCHED' 확정 (트리거의 동의어 판정에 기대지 않음)
  update public.service_applications
     set manager_id  = p_manager_id,
         accepted_at = coalesce(accepted_at, now()),
         status      = 'MATCHED'
   where id = p_application_id
     and manager_id is null
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  -- ③ 결제가 아직 안 끝난 상태였다면(가상계좌 미입금), 수동 배정을 "입금도 확인됐다"는 선언으로 간주해 함께 맞춥니다.
  update public.virtual_accounts
     set is_paid = true
   where application_id = v_app.id
     and is_paid = false;

  -- ④ care_schedules 행 생성 — 이미 있으면(이례적인 재배정 등) manager_id 만 맞추고 끝냅니다.
  if v_app.schedule_id is not null then
    update public.care_schedules set manager_id = p_manager_id where id = v_app.schedule_id;
    select * into v_app from public.service_applications where id = v_app.id;
    return v_app;
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    p_manager_id,
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    coalesce(public.parse_desired_datetime_kst(v_app.request_details, v_app.created_at), now()),
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng
  )
  returning id into v_schedule_id;

  update public.service_applications set schedule_id = v_schedule_id where id = v_app.id;
  select * into v_app from public.service_applications where id = v_app.id;
  return v_app;
end $$;

revoke all on function public.admin_assign_manager(uuid, uuid) from public, anon;
grant  execute on function public.admin_assign_manager(uuid, uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3e. 관리자 profiles/managers 조회 정책]  (원본: sql/admin_profiles_select.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자가 profiles / managers 테이블을 다른 유저 행까지 조회할 수 있게 하는 SELECT 정책
--
--   지금까지 profiles/managers 는 둘 다 '내 행만'(id = auth.uid()) 조회하는 정책만 있었습니다
--   (sql/supabase_schema_latest.sql 의 profiles_select_own / managers_select_own).
--   어드민 콘솔의 '활동 중인 케어 매니저' 목록이 managers.id 로 profiles(name, phone) 를 직접
--   embed 조인해서 보여주려면, 관리자 세션이 본인 소유가 아닌 다른 유저의 profiles/managers 행도
--   읽을 수 있어야 합니다 — 지금은 그게 안 돼서 다른 사람 행을 조인하면 RLS 에 막혀 null 로
--   돌아오고(이름 '미등록', 연락처 자리에 UUID 대체) 있었습니다.
--
--   기존 *_select_own 정책은 그대로 두고, is_admin() 만 확인하는 정책을 하나씩 더 추가합니다.
--   같은 테이블에 permissive 정책이 여러 개면 OR 로 합쳐지므로, 본인 조회 조건(id = auth.uid())은
--   그대로 유지되면서 관리자에게만 전체 조회 권한이 추가로 열립니다.
--
--   ⚠ 이 정책은 is_admin() = true 일 때만 열립니다. 즉 "활동 중인 케어 매니저 목록이 안 보인다"는
--   증상은 이 파일이 아니라 보통 내 계정의 profiles.role 이 'admin'이 아니게 된 경우입니다
--   (매니저 승인 함수가 role 을 잘못 덮어쓰던 버그 — sql/protect_admin_role.sql 이 그걸 막습니다).
--   이 파일과 protect_admin_role.sql 은 세트로 함께 실행하세요: 권한 보호(누가 admin인지) 는
--   protect_admin_role.sql, 그 admin 에게 조회 권한을 실제로 열어주는 건 이 파일입니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요)
--             → sql/protect_admin_role.sql → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop ... if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 테이블 단위 SELECT 권한을 다시 한번 명시적으로 보장합니다 (supabase_schema_latest.sql 에서 이미
-- grant 했지만, 혹시라도 다른 스크립트가 revoke 했을 경우까지 대비해 이 파일만 실행해도 완전히
-- 복구되도록 재확인합니다). RLS 정책이 '누구의 행을 볼 수 있는지'를 결정하고, 이 GRANT 는 그보다
-- 앞서 '이 역할이 이 테이블에 SELECT 자체를 시도할 수 있는지'를 결정하는 더 바깥쪽 권한 체크입니다.
grant select on public.profiles to authenticated;
grant select on public.managers to authenticated;

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists managers_select_admin on public.managers;
create policy managers_select_admin on public.managers
  for select to authenticated
  using (public.is_admin());

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3f. 관리자 service_applications 조회 정책]  (원본: sql/admin_service_applications_select.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자가 service_applications 전체를 조회(+ Realtime 구독)할 수 있게 하는 RLS 정책
--
--   지금까지 service_applications 의 SELECT 정책은 두 개뿐이었습니다(sql/supabase_schema_latest.sql):
--     - service_applications_select_own    : auth.uid() = user_id (신청한 보호자 본인)
--     - service_applications_select_managers: is_manager() AND manager_id is null AND 접수 대기 상태
--   관리자(profiles.role = 'admin')를 위한 SELECT 정책은 한 번도 추가된 적이 없습니다.
--   admin_rls_policies.sql 이 만든 service_applications_update_admin 은 UPDATE(수동 배정)만 열어주고
--   SELECT 는 열어주지 않아서, 지금까지 admin.html의 '오늘의 케어 신청 · 수동 배정' 목록이 조회되던 건
--   관리자 계정이 '우연히' certification_verified=true 인 매니저이기도 해서 service_applications_select_managers
--   정책에 걸쳐 보였을 뿐입니다 — 관리자가 매니저가 아니면 이 목록은 통째로 비어 보이고, 매니저인 경우에도
--   '아직 수락 안 한 신청만' 보이는 매니저용 정책이라 배정된/완료된 신청은 애초에 안 보여서(의도한 필터링이 아니라
--   우연한 결과), 두 화면(admin.html / mypage-manager.html)이 서로 다른 신청 건을 보게 될 수 있었습니다.
--
--   이 파일은 is_admin() 전용 SELECT 정책을 명시적으로 추가해 이 우연한 의존을 없애고, Supabase Realtime
--   (postgres_changes)도 SELECT RLS 를 그대로 따르므로 관리자가 매니저의 '수락하기' 액션을 실시간으로
--   받아볼 수 있게 합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop policy if exists / create 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists service_applications_select_admin on public.service_applications;
create policy service_applications_select_admin on public.service_applications
  for select to authenticated
  using (public.is_admin());

-- Realtime: admin.js 가 매니저의 '수락하기'/관리자의 '수동 배정'을 postgres_changes 로 직접 구독
-- (mypage.html 이 care_schedules 에 쓰는 것과 같은 패턴 — sql/supabase_schema_latest.sql 참고).
-- service_applications 는 지금까지 이 publication 에 추가된 적이 없어 Realtime 이벤트가 전혀 오지 않았습니다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_applications'
  ) then
    alter publication supabase_realtime add table public.service_applications;
  end if;
end $$;
alter table public.service_applications replica identity full;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3g. 관리자 회원 관리 기반]  (원본: sql/admin_user_management.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔(admin.html) '회원 관리' 탭 — 전체 회원 목록 + 검색/필터
--
--   화면에 필요한 컬럼 중 이메일 / 이메일 인증 여부(email_confirmed_at) / 가입 수단(provider) 은
--   profiles 가 아니라 auth.users 에만 있고, auth 스키마는 PostgREST(클라이언트) 에 노출돼 있지
--   않습니다. 그래서 일반 RLS 정책이 아니라, admin_assign_manager() 등이 이미 쓰는 것과 같은
--   패턴(SECURITY DEFINER 함수 안에서 auth.users 를 직접 조회 — sql/admin_manual_assignment.sql
--   참고)으로 admin_list_members() RPC 하나를 추가합니다. 함수 맨 앞에서 is_admin() 을 직접 확인해
--   권한 없는 호출은 거부합니다(fail closed) — RLS 가 아니라 이 체크가 유일한 방어선이므로 반드시
--   필요합니다.
--
--   검색(이름/휴대폰)과 두 필터(가입 수단 · 인증 상태)는 모두 이 함수 안에서 서버 쪽으로 적용합니다
--   — admin.js 의 다른 목록들처럼 "불러온 페이지 안에서만" 걸러지면, 예를 들어 '미인증만' 필터가
--   맨 처음 20명 안에 미인증 회원이 없을 때 빈 목록처럼 보이는 문제가 생기기 때문입니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일.
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   create or replace 기반이라 여러 번 실행해도 안전합니다.
--
--   참고(상세보기 모달의 '예약 내역'): service_applications 는 이미 sql/admin_service_applications_select.sql
--   의 service_applications_select_admin 정책으로 관리자가 user_id 조건 없이 전체 조회할 수 있으므로,
--   특정 회원의 예약 내역은 admin.js 가 `.from('service_applications').eq('user_id', ...)` 로 바로
--   조회합니다 — 이 파일에서 별도 RPC를 추가하지 않습니다.
-- ============================================================================

create or replace function public.admin_list_members(
  p_limit    integer default 21,
  p_offset   integer default 0,
  p_search   text    default null, -- 이름/휴대폰 부분일치(대소문자 무시). null/빈 문자열이면 전체.
  p_provider text    default null, -- 'email' | 'kakao' | null(전체)
  p_verified text    default null  -- 'verified' | 'unverified' | null(전체)
)
returns table (
  id                  uuid,
  name                text,
  phone               text,
  email               text,
  provider            text,
  email_confirmed_at  timestamptz,
  created_at          timestamptz,
  address             text,
  address_detail      text
)
language plpgsql security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    p.name,
    p.phone,
    u.email::text,
    -- Supabase Auth 가 가입 시 자동으로 채우는 필드 — 'email'(이메일/비밀번호) | 'kakao' 등.
    -- 과거 데이터 중 이 값이 비어 있는 경우는 이메일/비밀번호 가입으로 간주합니다.
    coalesce(u.raw_app_meta_data->>'provider', 'email') as provider,
    u.email_confirmed_at,
    u.created_at,
    p.address,
    p.address_detail
  from auth.users u
  left join public.profiles p on p.id = u.id
  where
    (v_search is null
      or p.name  ilike '%' || v_search || '%'
      or p.phone ilike '%' || v_search || '%')
    and (p_provider is null
      or coalesce(u.raw_app_meta_data->>'provider', 'email') = p_provider)
    and (p_verified is null
      or (p_verified = 'verified'   and u.email_confirmed_at is not null)
      or (p_verified = 'unverified' and u.email_confirmed_at is null))
  order by u.created_at desc
  limit p_limit offset p_offset;
end $$;

revoke all on function public.admin_list_members(integer, integer, text, text, text) from public, anon;
grant  execute on function public.admin_list_members(integer, integer, text, text, text) to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [3h. 정산 버그 수정 1차]  (원본: sql/admin_settlement_fixes.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자 정산(매니저 월별) 대시보드 버그 수정 2건
--
--   1) "이름 미등록" 표시 — admin_manager_monthly_settlements() 가 지금까지 매니저 이름을
--      public.profiles.name 에서만 가져왔는데, 이 컬럼은 카카오 로그인 메타데이터가 있을 때만
--      handle_new_user() 트리거가 채우고(sql/supabase_schema_latest.sql), 매니저 승인 절차
--      (approve_manager_application(), sql/manager_applications.sql·manager_applications_v2.sql)는
--      profiles.name/phone 을 전혀 건드리지 않습니다. 실제 매니저 이름/연락처는 매니저가 지원서에
--      직접 적은 manager_applications(status='approved') 에만 있습니다 — admin.js 의
--      fetchActiveManagersWithNames() 가 '활동 중인 매니저' 목록에서 이미 이 보강 조회로 같은 문제를
--      해결해 둔 패턴을 그대로 가져와, profiles.name 이 비어 있으면 승인된 지원서의 이름/연락처로
--      대체합니다.
--
--   2) 완료 건수/금액 불일치 — RPC 자체는 처음부터 completed_at 을 'Asia/Seoul' 기준으로 월 경계를
--      나눠 올바르게 집계하고 있었습니다(변경 없음). 실제 원인은 mypage-manager.html 쪽에 있었습니다 —
--      "이번 달 완료 건수/예상 정산 금액" 카드가 completed_at 을 브라우저의 로컬 시간대 getter
--      (new Date().getFullYear()/getMonth())로 비교하고 있어, KST 가 아닌 기기(또는 서버 환경)에서는
--      월 경계 부근 완료 건이 하루 어긋나 다른 달로 집계될 수 있었습니다 — 이 파일은 그 JS 버그를
--      mypage-manager.html 에서 함께 고칩니다(SQL 변경 없음, 참고용 설명입니다).
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/manager_applications.sql · manager_applications_v2.sql(manager_applications 테이블) →
--             sql/manager_settlement_70_30.sql(이 함수의 원본) → 이 파일.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    select
      cs.manager_id,
      -- profiles.name/phone 이 비어 있으면(매니저 승인 절차가 이 컬럼을 채우지 않아 흔한 경우)
      -- 승인된 지원서(manager_applications)의 이름/연락처로 대체합니다(admin.js
      -- fetchActiveManagersWithNames() 와 같은 보강 순서: profiles 우선, 지원서는 보조).
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(*)::bigint                             as completed_count,
      coalesce(sum(cs.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(cs.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(cs.manager_payout), 0)
        - floor(coalesce(sum(cs.manager_payout), 0) * 0.033))::bigint as net_payout
    from public.care_schedules cs
    left join public.profiles p on p.id = cs.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = cs.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    where cs.status = 'completed'
      and cs.manager_id is not null
      and cs.completed_at is not null
      and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
        = date_trunc('month', p_month::timestamp)
    group by cs.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [4. 가상계좌 입금 + 매칭 상태 플로우(accept_service_application 등)]  (원본: sql/reservations_virtual_accounts.sql)
-- ==============================================================================

-- ============================================================================
-- 가상계좌 입금 + 케어매니저 매칭 상태 플로우
-- ============================================================================
-- "reservations" 테이블은 이 프로젝트에 따로 존재하지 않고, 예약/신청은 전부 public.service_applications
-- 하나로 다룹니다(apply.html 이 쓰는 테이블). 이 스크립트는 그 테이블에 가상계좌 입금 단계를 끼워 넣습니다.
--
--   PENDING_PAYMENT  : 신청서 작성 완료, 가상계좌 입금 대기 중 (매니저에게 아직 노출되지 않음)
--   WAITING_MATCHING : 입금 완료, 케어매니저 배정 대기 중 (매니저 "접수 대기" 목록에 노출)
--   MATCHED          : 매니저 매칭 완료
--   COMPLETED        : 동행 완료
--
-- service_applications 는 대시보드에서 만들어진 테이블이라 저장소에 CREATE TABLE 문이 없고
-- (supabase_schema_latest.sql 6번 섹션 참고), status 컬럼도 처음부터 하드 CHECK 없이 자유 텍스트 +
-- 느슨한 매칭 함수(is_pending_application_status 등)로 운영돼 왔습니다. 이미 쌓인 'pending' / 'matched' /
-- 'departed' / 'arrived' / 'completed' / 'guardian_confirmed' 값과 그 한글 변형을 깨지 않기 위해 여기서도
-- 같은 패턴을 따르고 하드 CHECK 제약은 추가하지 않습니다 — 새 상태 4개를 기존 함수들이 인식하도록 넓히고,
-- 신규 신청의 기본값만 'PENDING_PAYMENT'로 바꿉니다. 기존에 이미 들어와 있던 'pending' 행은 그대로
-- "매칭 가능" 상태로 남습니다(소급 변경하지 않음 — 이미 입금 개념 없이 접수된 건이므로).
-- ============================================================================


-- ============================================================================
-- 1) service_applications: 신규 신청 기본 상태를 '가상계좌 입금 대기'로 변경
-- ============================================================================
alter table public.service_applications alter column status set default 'PENDING_PAYMENT';

-- 매니저 "접수 대기" 노출 판정(is_pending_application_status)에 'WAITING_MATCHING' 추가.
-- 'PENDING_PAYMENT'는 이 목록·정규식 어디에도 걸리지 않아 그대로 false(매니저에게 비노출) 처리됩니다.
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in ('', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' then true
    else false
  end
$$;

-- manager_id 가 채워질 때 자동으로 찍는 상태값을 'matched' → 'MATCHED' 로 통일
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
      new.status := 'MATCHED';
    end if;
  end if;
  return new;
end $$;

-- accept_service_application() 이 신청을 수락할 때 찍는 상태값도 동일하게 'MATCHED' 로 통일
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
     set manager_id = auth.uid(), accepted_at = now(), status = 'MATCHED'
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
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    auth.uid(),
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
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

-- confirm_service_application() 은 이미 lower(status) 로 비교하므로 'COMPLETED' 가 들어와도
-- 그대로 'completed' 로 걸러져 수정 없이 동작합니다 (care_schedules 미러링 값인 소문자 'completed' 와도 호환).


-- ============================================================================
-- 2) virtual_accounts : 신청 1건당 가상계좌 1개
-- ============================================================================
create table if not exists public.virtual_accounts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.service_applications(id) on delete cascade,
  bank_name      text not null,
  account_number text not null,
  amount         integer not null check (amount > 0),
  expired_at     timestamptz not null default (now() + interval '2 hours'),
  is_paid        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 만료된 미입금 건을 주기적으로 정리/취소 처리할 배치 작업이 조회할 인덱스
create index if not exists virtual_accounts_unpaid_expiry_idx
  on public.virtual_accounts (expired_at) where is_paid = false;

alter table public.virtual_accounts enable row level security;

-- 보호자: 본인 신청(service_applications_select_own 과 동일한 소유권 기준)에 딸린 가상계좌만 조회
drop policy if exists virtual_accounts_select_own on public.virtual_accounts;
create policy virtual_accounts_select_own on public.virtual_accounts
  for select to authenticated using (
    exists (
      select 1 from public.service_applications a
      where a.id = virtual_accounts.application_id
        and (
          a.user_id = auth.uid()
          or (a.applicant_email is not null and lower(btrim(a.applicant_email)) = public.my_verified_email())
        )
    )
  );

grant select on public.virtual_accounts to authenticated;
revoke select on public.virtual_accounts from anon;

-- 계좌 발급(insert)과 입금 확인(update)은 클라이언트가 직접 할 수 없습니다 — 금액 조작·허위 입금 확인을
-- 막기 위해 일부러 authenticated/anon 에 insert/update 권한을 주지 않습니다. 실제로는 은행/PG 웹훅을
-- 처리하는 서버(Supabase service_role 키 사용)가 직접 쓰거나, 아래 confirm_virtual_account_payment() 를
-- service_role 로 호출해야 합니다. 이 프로젝트의 service_role 은 이미 스키마 전역 접근 권한이 있으므로
-- 별도 grant 가 필요 없습니다.

-- 입금 확인 처리: 가상계좌를 입금완료로 바꾸고, 아직 PENDING_PAYMENT 인 신청을 WAITING_MATCHING 으로
-- 한 번에 전환합니다(이미 매칭/완료가 진행된 신청을 되돌리지 않도록 조건에 PENDING_PAYMENT 를 명시).
create or replace function public.confirm_virtual_account_payment(p_virtual_account_id uuid)
returns public.virtual_accounts
language plpgsql security definer set search_path = public as $$
declare
  v_row public.virtual_accounts;
begin
  update public.virtual_accounts
     set is_paid = true
   where id = p_virtual_account_id
     and is_paid = false
     and expired_at > now()
  returning * into v_row;

  if not found then
    raise exception 'VIRTUAL_ACCOUNT_UNAVAILABLE' using errcode = 'P0002';
  end if;

  update public.service_applications
     set status = 'WAITING_MATCHING'
   where id = v_row.application_id
     and status = 'PENDING_PAYMENT';

  return v_row;
end $$;

-- 일반 로그인 사용자·비로그인 모두 호출 금지(입금 확인은 은행/PG 웹훅만 수행) — service_role 만 호출 가능.
revoke all on function public.confirm_virtual_account_payment(uuid) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [5. 신청 상태값 표준화(PAYMENT_PENDING/MATCHING_PENDING/MATCHED/CANCELLED/EXPIRED_CANCELLED)]  (원본: sql/service_application_status_standardization.sql)
-- ==============================================================================

-- ============================================================================
-- service_applications.status 4종 표준화
--   PAYMENT_PENDING   : 신청서 작성 완료, 결제/입금 대기 (매니저에게 비노출)
--   MATCHING_PENDING  : 결제 완료(또는 가상계좌 입금 확인 완료), 매니저 배정 신청 대기
--   MATCHED           : 매니저 배정 완료
--   CANCELLED         : 결제 취소 / 미입금 만료 / 사용자 취소
--
--   지금까지 PENDING_PAYMENT / WAITING_MATCHING(sql/reservations_virtual_accounts.sql) 이름을 썼고,
--   그 전에는 'pending' 등 느슨한 동의어로 기본값이 들어가 있었습니다. 이 스크립트는
--     1) 기존 행을 위 4종 값으로 백필
--     2) 신규 신청 기본값 / 결제 확인 함수들이 새 이름을 쓰도록 재정의
--     3) 관리자가 PAYMENT_PENDING 건을 수동으로 입금 확인 처리하는 RPC 추가
--   를 합니다. 전부 update/create or replace 기반이라 여러 번 실행해도 안전합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/reservations_virtual_accounts.sql → 이 파일.
--   실행 후에는 supabase/functions/issue-virtual-account, supabase/functions/portone-webhook 이
--   호출하는 리터럴도 PAYMENT_PENDING / MATCHING_PENDING 으로 함께 바뀌어 있어야 합니다(이번 커밋에서 같이 수정).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 기존 행 백필 (대소문자/구버전 이름 → 표준 4종)
-- ----------------------------------------------------------------------------
update public.service_applications
   set status = 'PAYMENT_PENDING'
 where lower(btrim(coalesce(status, ''))) = 'pending_payment';

update public.service_applications
   set status = 'MATCHING_PENDING'
 where lower(btrim(coalesce(status, ''))) = 'waiting_matching';

-- 결제 개념이 생기기 전(가상계좌 도입 전)에 쌓인 '접수 대기' 동의어 값들은 전부 입금 없이 접수된
-- 건이므로, 매칭 가능한 'MATCHING_PENDING'으로 승격합니다(PENDING_PAYMENT 로 되돌리지 않음).
update public.service_applications
   set status = 'MATCHING_PENDING'
 where manager_id is null
   and status is distinct from 'PAYMENT_PENDING'
   and status is distinct from 'CANCELLED'
   and (
     lower(btrim(coalesce(status, ''))) in ('', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested')
     or status ~ '접수|대기|신청'
   );

-- 취소류 동의어 전부 'CANCELLED' 로 통일
update public.service_applications
   set status = 'CANCELLED'
 where lower(btrim(coalesce(status, ''))) in ('cancelled', 'canceled', 'cancel')
    or status ~ '취소';

-- 매니저가 이미 배정됐는데 과거 소문자 'matched' 로 남아 있는 행만 표준 대문자로 통일
-- (departed/arrived/completed/guardian_confirmed 등 그 이후 진행 단계 값은 care_schedules 진행 상태
--  미러링이므로 건드리지 않습니다 — 이 표준화는 결제/매칭 단계 4종에 대한 것입니다)
update public.service_applications
   set status = 'MATCHED'
 where manager_id is not null
   and lower(btrim(coalesce(status, ''))) = 'matched';


-- ----------------------------------------------------------------------------
-- 2) 신규 신청 기본값
-- ----------------------------------------------------------------------------
alter table public.service_applications alter column status set default 'PAYMENT_PENDING';


-- ----------------------------------------------------------------------------
-- 3) 매니저 "접수 대기" 판정 함수 — 표준 이름 'matching_pending' 추가(기존 느슨한 동의어는
--    구버전 데이터 호환을 위해 유지). PAYMENT_PENDING/CANCELLED 는 계속 false 입니다.
-- ----------------------------------------------------------------------------
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in
      ('matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' then true
    else false
  end
$$;

-- ----------------------------------------------------------------------------
-- 4) 가상계좌 입금 확인(웹훅/서버) 시 전환하는 상태값 이름을 표준으로 교체
-- ----------------------------------------------------------------------------
create or replace function public.confirm_virtual_account_payment(p_virtual_account_id uuid)
returns public.virtual_accounts
language plpgsql security definer set search_path = public as $$
declare
  v_row public.virtual_accounts;
begin
  update public.virtual_accounts
     set is_paid = true
   where id = p_virtual_account_id
     and is_paid = false
     and expired_at > now()
  returning * into v_row;

  if not found then
    raise exception 'VIRTUAL_ACCOUNT_UNAVAILABLE' using errcode = 'P0002';
  end if;

  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = v_row.application_id
     and status = 'PAYMENT_PENDING';

  return v_row;
end $$;

revoke all on function public.confirm_virtual_account_payment(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) 관리자 수동 입금 확인 — admin_confirm_manual_payment() 정의는
--    sql/payment_confirmation_functions.sql 로 옮겼습니다(결제 관련 함수들을 한 파일에 모아 두려고요).
--    "Could not find the function in the schema cache" 오류가 나면 이 파일이 아니라 그 파일을
--    Supabase SQL Editor 에서 실행하세요.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [6. 결제 확인 함수(expected_service_price 등) + 가상계좌 만료 자동취소 pg_cron]  (원본: sql/payment_confirmation_functions.sql)
-- ==============================================================================

-- ============================================================================
-- 결제 승인 / 가상계좌 입금 확인 / 만료·취소 처리 (PortOne V2 연동)
--   supabase/functions/issue-virtual-account, portone-webhook 이 PortOne API를 서버에서 재조회한
--   뒤 호출하는 공용 DB 함수들입니다. 함수 이름 자체는 특정 PG사를 가리키지 않게 지어서(마크/취소 전환은
--   어느 PG를 쓰더라도 같은 의미이므로), 나중에 다른 결제대행사로 바꾸더라도 이 파일은 그대로 재사용할 수
--   있습니다.
--
--   service_applications.status 4종 표준값은 그대로입니다(sql/service_application_status_standardization.sql):
--     PAYMENT_PENDING(결제/입금 대기) → MATCHING_PENDING(배정 신청 대기) → MATCHED(배정 완료)
--                                    ↘ CANCELLED(결제 취소/미입금 만료/사용자 취소)
--
--   흐름:
--     1) apply.html 저장 시 기본값 PAYMENT_PENDING (이미 적용됨, 이 스크립트에서 다시 확정만 함)
--     2) issue-virtual-account: 결제창 성공 후 PortOne API 재조회 결과가 'PAID' 면 바로 MATCHING_PENDING,
--                                'VIRTUAL_ACCOUNT_ISSUED' 면 virtual_accounts 에 계좌 정보만 저장(상태는
--                                PAYMENT_PENDING 유지 — 입금 전이므로)
--     3) portone-webhook: PortOne 웹훅 수신 시 재조회한 상태가 'PAID' 면 MATCHING_PENDING,
--     4)                  'CANCELLED'/'FAILED' 면 CANCELLED (가상계좌 입금 기한 만료 시 PortOne이
--                          자동으로 해당 결제를 취소 처리하고 이 상태로 웹훅을 보냅니다)
--     +) cancel_expired_virtual_accounts(): 웹훅이 오지 않은 채로 입금 기한이 지난 건을 주기적으로 쓸어서
--                          CANCELLED 처리 (pg_cron 스케줄 — 파일 맨 아래 참고)
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/service_application_status_standardization.sql
--             → 이 파일. 전부 create or replace / create table·add column if not exists 기반이라
--             여러 번 실행해도 안전하고, sql/reservations_virtual_accounts.sql 을 아직 실행하지 않아
--             public.virtual_accounts 테이블이 없는 환경에서도 이 파일 혼자 실행할 수 있습니다(0번 참고).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) virtual_accounts 테이블 (신청 1건당 가상계좌 1개) — 아직 없으면 생성합니다.
--    sql/reservations_virtual_accounts.sql 이 만드는 정의와 완전히 동일합니다(이미 그 파일을 실행해
--    테이블이 있는 환경에서는 create table if not exists 라 그냥 아무 일도 하지 않습니다).
-- ----------------------------------------------------------------------------
create table if not exists public.virtual_accounts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.service_applications(id) on delete cascade,
  bank_name      text not null,
  account_number text not null,
  amount         integer not null check (amount > 0),
  expired_at     timestamptz not null default (now() + interval '2 hours'),
  is_paid        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 만료된 미입금 건을 주기적으로 정리/취소 처리할 배치 작업(6번 cancel_expired_virtual_accounts)이 조회할 인덱스
create index if not exists virtual_accounts_unpaid_expiry_idx
  on public.virtual_accounts (expired_at) where is_paid = false;

alter table public.virtual_accounts enable row level security;

-- 보호자: 본인 신청(service_applications_select_own 과 동일한 소유권 기준)에 딸린 가상계좌만 조회
drop policy if exists virtual_accounts_select_own on public.virtual_accounts;
create policy virtual_accounts_select_own on public.virtual_accounts
  for select to authenticated using (
    exists (
      select 1 from public.service_applications a
      where a.id = virtual_accounts.application_id
        and (
          a.user_id = auth.uid()
          or (a.applicant_email is not null and lower(btrim(a.applicant_email)) = public.my_verified_email())
        )
    )
  );

grant select on public.virtual_accounts to authenticated;
revoke select on public.virtual_accounts from anon;

-- 계좌 발급(insert)과 입금 확인(update)은 클라이언트가 직접 할 수 없습니다 — 금액 조작·허위 입금 확인을
-- 막기 위해 일부러 authenticated/anon 에 insert/update 권한을 주지 않습니다. issue-virtual-account/
-- portone-webhook Edge Function 이 service_role(admin 클라이언트)로 직접 쓰거나,
-- mark_payment_matching_pending() 등 SECURITY DEFINER 함수를 통해서만 바뀝니다 — service_role 은
-- 그랜트와 무관하게 항상 접근 가능합니다.


-- ----------------------------------------------------------------------------
-- 1) 신규 신청 기본 상태 재확인 (요구사항 1 — 이미 적용돼 있으면 no-op)
-- ----------------------------------------------------------------------------
alter table public.service_applications alter column status set default 'PAYMENT_PENDING';


-- ----------------------------------------------------------------------------
-- 2) virtual_accounts: PG사 결제키 보관 컬럼 추가 (고객센터 문의 시 PortOne 콘솔에서 바로 찾기 위함 —
--    조회/상태 전환 자체는 모두 application_id 로만 하므로 이 컬럼이 없어도 기능은 동작합니다).
--    이전에 sql/toss_payments_integration.sql(삭제됨)을 실행해 toss_payment_key 컬럼이 이미 생겼다면
--    같이 정리합니다 — PortOne 에서는 paymentId 가 application_id 와 같아 별도 보관이 불필요합니다.
-- ----------------------------------------------------------------------------
alter table public.virtual_accounts drop column if exists toss_payment_key;
alter table public.virtual_accounts add column if not exists pg_payment_ref text;


-- ----------------------------------------------------------------------------
-- 3) 더 이상 쓰지 않는 예전 함수 제거 (이름이 이 파일의 범용 함수들과 겹치지 않도록 정리)
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_virtual_account_payment(uuid);


-- ----------------------------------------------------------------------------
-- 4a) 서비스별 정가 카탈로그 — apply.html의 SERVICES 객체(화면 표시용으로만 쓰이고 DB에는 저장되지 않음)와
--     반드시 같은 값으로 유지해야 합니다. 아래 4b)의 금액 검증이 비교할 "정답"이 이 함수뿐이라서, 여기
--     값을 바꾸면서 apply.html(그리고 index.html의 요금 안내/계산기)을 같이 고치지 않으면 정상 결제까지
--     AMOUNT_MISMATCH 로 막히게 됩니다.
--     (2026 마진율 개편: 기본 2시간 정상가. 첫 이용 할인(정상가-5,000원)은 이 정가가 아니라 웰컴 쿠폰
--     [sql/welcome_coupons.sql]으로 반영되므로 이 함수에는 할인 전 정상가만 둡니다.)
-- ----------------------------------------------------------------------------
create or replace function public.expected_service_price(p_service_type text)
returns integer
language sql immutable as $$
  select case p_service_type
    when '시니어 병원 동행' then 50000
    when '생활 편의 대행' then 40000
    when '복합 매칭 서비스 (동행 + 생활편의)' then 60000
    else null
  end;
$$;

-- 요금표는 index.html/apply.html 에 이미 공개돼 있는 정보라 숨길 이유가 없습니다 — anon/authenticated 모두 호출 가능.
grant execute on function public.expected_service_price(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4a-1) 서비스별 초과 요금(30분당) 카탈로그 — sql/user_packages_system.sql 의
--     report_care_duration_and_bill_extra() 가 기본 2시간을 넘긴 시간에 대해 이 단가를 곱해 자동
--     청구합니다. index.html '기본 서비스 요금 체계' 표의 '초과 요금(30분당)' 열과 반드시 같은 값으로
--     유지해야 합니다.
-- ----------------------------------------------------------------------------
create or replace function public.expected_overtime_rate_per_30min(p_service_type text)
returns integer
language sql immutable as $$
  select case p_service_type
    when '시니어 병원 동행' then 12500
    when '생활 편의 대행' then 10000
    when '복합 매칭 서비스 (동행 + 생활편의)' then 15000
    else 10000 -- 알 수 없는(또는 신청서와 연결되지 않은) 서비스 유형은 기존 기본값으로 안전하게 처리
  end;
$$;

grant execute on function public.expected_overtime_rate_per_30min(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4b) 결제 승인/입금 완료 시 공통으로 쓰는 상태 전환 — PAYMENT_PENDING 인 건만 MATCHING_PENDING 으로
--    전환합니다(이미 MATCHING_PENDING/MATCHED 로 넘어간 건을 되돌리지 않도록 조건에 PAYMENT_PENDING 명시 —
--    issue-virtual-account 와 portone-webhook 이 같은 건을 거의 동시에 처리해도 멱등합니다). 가상계좌로
--    입금된 경우라면 virtual_accounts.is_paid 도 함께 true 로 맞춥니다(없으면 — 즉시결제 수단이면 — 조용히
--    넘어갑니다). 서버(service_role, Edge Function)만 호출합니다 — 클라이언트 role에는 권한을 주지
--    않습니다(revoke all, service_role 은 그랜트와 무관하게 항상 호출 가능).
--
--    p_paid_amount: PortOne API를 서버에서 재조회해 확인한 실제 금액(payment.amount.total) — 결제창
--    totalAmount는 브라우저가 보내는 값이라 조작될 수 있으므로 신뢰하지 않고, 호출자는 반드시 PortOne 재조회
--    결과를 넘겨야 합니다. 신청서의 service_type 기준 정가(4a)와 정확히 일치하지 않으면 AMOUNT_MISMATCH
--    예외를 던지고 상태를 바꾸지 않습니다 — 적게 입금됐거나(사기 의심) 많이 입금된 경우 모두 자동 승인하지
--    않고 운영자 확인(admin_confirm_manual_payment 등)을 거치게 합니다. null 로 넘어오면(과거 호출/정가를
--    모르는 service_type) 검증을 건너뛰고 기존 동작대로 통과시킵니다.
-- ----------------------------------------------------------------------------
drop function if exists public.mark_payment_matching_pending(uuid, text);

create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
  v_expected integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    -- 이미 MATCHING_PENDING/MATCHED 로 넘어간 건에 대한 재호출(webhook 중복 전송, confirm 과 webhook 이
    -- 거의 동시에 들어온 경우 등)은 에러가 아니라 '현재 행 그대로' 조용히 돌려줍니다 — 멱등 처리.
    return v_app;
  end if;

  if p_paid_amount is not null then
    v_expected := public.expected_service_price(v_app.service_type);
    if v_expected is not null and p_paid_amount <> v_expected then
      raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%, paid=%',
        v_app.service_type, v_expected, p_paid_amount using errcode = 'P0003';
    end if;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) 취소/만료 — PAYMENT_PENDING 인 건만 CANCELLED 로 전환(이미 MATCHING_PENDING/MATCHED 로 넘어간 건은
--    취소 웹훅이 뒤늦게 와도 건드리지 않습니다 — 입금 후 이미 배정 절차가 시작된 건을 취소 웹훅 재전송으로
--    되돌리는 사고를 막기 위함).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_unpaid_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  update public.service_applications
     set status = 'CANCELLED'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_app;
end $$;

revoke all on function public.cancel_unpaid_application(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6) 관리자 수동 입금 확인 — admin_confirm_manual_payment() 정의는
--    sql/admin_manual_payment_telegram_notify.sql 로 옮겼습니다(쿠폰/적립금 차감 + 텔레그램 알림까지
--    포함한 최종 버전이 그 파일에 있습니다). 이 파일에서 다시 정의하지 않는 이유: 과거에 이 자리에 있던
--    "상태 전환만 하는" 단순 버전을 실행하면 create or replace 로 더 완전한 버전을 덮어써 텔레그램 알림이
--    조용히 사라지는 회귀가 실제로 발생했습니다(관리자가 '수동 입금 확인'을 눌러도 알림이 안 가는 버그) —
--    이제 이 함수의 정의는 오직 한 파일에만 있어야 하고, 이 파일 실행 순서가 그보다 나중이어도 안전합니다.
--    "Could not find the function in the schema cache" 오류가 나면 sql/admin_manual_payment_telegram_notify.sql
--    을 Supabase SQL Editor 에서 실행하세요.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 7) 배치 정리 — PortOne 웹훅이 끝내 오지 않은 채로 가상계좌 입금 기한이 지난 PAYMENT_PENDING 건을
--    쓸어서 CANCELLED 처리합니다. pg_cron 이 주기적으로 호출합니다(맨 아래 스케줄 참고).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_expired_virtual_accounts()
returns setof public.service_applications
language sql security definer set search_path = public as $$
  update public.service_applications a
     set status = 'CANCELLED'
   where a.status = 'PAYMENT_PENDING'
     and exists (
       select 1 from public.virtual_accounts v
        where v.application_id = a.id
          and v.is_paid = false
          and v.expired_at < now()
     )
  returning a.*;
$$;

revoke all on function public.cancel_expired_virtual_accounts() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 8) pg_cron 스케줄 — 10분마다 만료 건 정리. pg_cron 확장이 이 프로젝트 플랜에서 꺼져 있으면 이
--    create extension 문에서 에러가 날 수 있습니다: 그 경우 이 블록만 건너뛰고(요구사항 1~4의 나머지는
--    모두 pg_cron 과 무관하게 동작합니다), Supabase 대시보드 → Database → Extensions 에서 pg_cron 을
--    켠 뒤 이 블록만 다시 실행하거나, Database → Cron Jobs 화면에서 같은 스케줄을 직접 등록하세요.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'cancel-expired-virtual-accounts';
select cron.schedule(
  'cancel-expired-virtual-accounts',
  '*/10 * * * *',
  $$select public.cancel_expired_virtual_accounts();$$
);


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [7a. 첫 동행 웰컴 쿠폰]  (원본: sql/welcome_coupons.sql)
-- ==============================================================================

-- ============================================================================
-- 랜딩 페이지(index.html) '첫 이용 & 회원가입 특별 혜택' — 첫 동행 웰컴 쿠폰(5,000원) 발급
--   - index.html 의 [쿠폰 받고 시작하기] 버튼이 client.rpc('claim_welcome_coupon') 로 호출합니다.
--   - 사용자당 1회만 발급되도록 (user_id, coupon_code) UNIQUE 제약 + 동시 클릭(race) 시
--     unique_violation 을 already_issued 로 흡수해 중복 발급을 막습니다.
--   - create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
--   - (2026 마진율 개편: 할인액 2,000원 → 5,000원. coupon_code 자체는 내부 식별자일 뿐 화면에 노출되지
--     않아(COUPON_LABELS 가 사람이 읽는 이름으로 바꿔 보여줌) 'WELCOME_2000' 문자열은 그대로 두고
--     금액만 올립니다 — 코드를 바꾸면 이미 발급된 쿠폰과 별개로 새 쿠폰이 또 발급돼 중복 혜택이 생깁니다.
--     이미 발급돼 있지만 아직 쓰지 않은 기존 쿠폰도 5번에서 5,000원으로 함께 올려 둡니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) user_coupons : 사용자별로 발급된 쿠폰
-- ----------------------------------------------------------------------------
create table if not exists public.user_coupons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  coupon_code text not null,
  amount      integer not null,
  status      text not null default 'active' check (status in ('active', 'used', 'expired')),
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  unique (user_id, coupon_code)
);

alter table public.user_coupons enable row level security;
drop policy if exists user_coupons_select_own on public.user_coupons;
create policy user_coupons_select_own on public.user_coupons
  for select to authenticated using (user_id = auth.uid());

-- 발급/사용 처리는 모두 아래 SECURITY DEFINER 함수를 통해서만 이뤄지므로, 클라이언트에는 조회 권한만 줍니다.
revoke insert, update, delete on public.user_coupons from anon, authenticated;
grant  select on public.user_coupons to authenticated;


-- ----------------------------------------------------------------------------
-- 2) claim_welcome_coupon() : 로그인한 사용자에게 '첫 동행 웰컴 쿠폰(5,000원)'을 발급
--    이미 발급받은 적이 있으면 새로 만들지 않고 status='already_issued' 로 기존 쿠폰 정보를 돌려줍니다.
-- ----------------------------------------------------------------------------
drop function if exists public.claim_welcome_coupon();

create or replace function public.claim_welcome_coupon()
returns table (status text, amount integer, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_row         public.user_coupons;
  v_coupon_code constant text := 'WELCOME_2000'; -- 내부 식별자 — 금액 인상과 무관하게 그대로 유지(위 설명 참고)
  v_amount      constant integer := 5000;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_row from public.user_coupons
   where user_id = auth.uid() and coupon_code = v_coupon_code;

  if found then
    return query select 'already_issued'::text, v_row.amount, v_row.expires_at;
    return;
  end if;

  begin
    insert into public.user_coupons (user_id, coupon_code, amount, expires_at)
    values (auth.uid(), v_coupon_code, v_amount, now() + interval '30 days')
    returning * into v_row;
  exception when unique_violation then
    -- 거의 동시에 두 번 클릭된 경우: 두 번째 요청이 중복 삽입 대신 기존 행을 already_issued 로 돌려줍니다.
    select * into v_row from public.user_coupons
     where user_id = auth.uid() and coupon_code = v_coupon_code;
    return query select 'already_issued'::text, v_row.amount, v_row.expires_at;
    return;
  end;

  return query select 'issued'::text, v_row.amount, v_row.expires_at;
end $$;

revoke all on function public.claim_welcome_coupon() from public, anon;
grant  execute on function public.claim_welcome_coupon() to authenticated;


-- ----------------------------------------------------------------------------
-- 3) 기존에 2,000원으로 이미 발급됐지만 아직 쓰지 않은 웰컴 쿠폰을 5,000원으로 소급 인상.
--    (이미 'used' 된 쿠폰은 과거 결제에 실제로 2,000원만 할인됐던 것이라 손대지 않습니다.)
-- ----------------------------------------------------------------------------
update public.user_coupons
   set amount = 5000
 where coupon_code = 'WELCOME_2000'
   and status = 'active'
   and amount <> 5000;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [7b. 웰컴 쿠폰 자동 발급]  (원본: sql/welcome_coupon_auto_issue.sql)
-- ==============================================================================

-- ============================================================================
-- 회원가입 시 웰컴 쿠폰(5,000원) 자동 발급
--   - sql/welcome_coupons.sql 의 user_coupons 테이블을 전제로 합니다.
--   - 기존에는 index.html '쿠폰 받고 시작하기' 버튼을 눌러야만 claim_welcome_coupon() 으로 발급됐지만,
--     이제는 auth.users 에 INSERT 되는 시점(회원가입 완료)에 트리거로 자동 발급합니다.
--   - claim_welcome_coupon() RPC 는 그대로 남겨 둡니다 — 이 트리거가 생기기 전에 가입한 기존 사용자가
--     index.html 버튼으로 쿠폰을 받을 수 있는 경로이자, 혹시 이 트리거가 실패했을 때의 복구 경로입니다.
--   - user_coupons 의 (user_id, coupon_code) UNIQUE 제약 덕분에 on conflict do nothing 만으로
--     중복 발급(재가입 트리거 재실행, 동시 INSERT 등)이 막힙니다.
--
-- 실행 순서: sql/supabase_schema_latest.sql → sql/welcome_coupons.sql → 이 파일.
-- ============================================================================

create or replace function public.issue_welcome_coupon_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_coupons (user_id, coupon_code, amount, expires_at)
  values (new.id, 'WELCOME_2000', 5000, now() + interval '30 days')
  on conflict (user_id, coupon_code) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_welcome_coupon on auth.users;
create trigger on_auth_user_created_welcome_coupon after insert on auth.users
  for each row execute function public.issue_welcome_coupon_on_signup();


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [7c. 적립금]  (원본: sql/user_points.sql)
-- ==============================================================================

-- ============================================================================
-- apply.html 결제 시 유저 보유 적립금(포인트) 사용/차감
--   - profiles.points_balance  : 사용자별 현재 보유 적립금 (apply.html 이 조회해 입력란 위에 보여줌)
--   - service_applications.points_used : 신청 시점에 사용자가 입력한 "이번 결제에 쓰겠다"는 적립금
--     (화면이 보낸 값일 뿐 — 실제 차감은 결제가 'PAID' 로 확인된 뒤에만, 그 시점의 실제 잔액을 기준으로
--     이뤄집니다. sql/payment_confirmation_functions.sql 의 mark_payment_matching_pending() 과 똑같이,
--     브라우저가 보낸 값은 결코 그대로 믿지 않고 PortOne 재조회 금액과 비교해 검증합니다.)
--   - point_transactions       : 적립금 차감/적립 내역(감사 추적용) — 지금은 결제 차감만 기록합니다.
--
--   핵심 설계: expected_service_price(service_type) - 실제_사용_가능한_적립금 = PortOne 실제 승인 금액
--   이 정확히 일치해야만 결제를 승인합니다. "실제_사용_가능한_적립금"은 신청서에 적힌 points_used 와
--   '그 시점(결제 확인 시점)의 실제 잔액' 중 더 작은 값입니다 — 그래야 신청서 저장 이후 잔액이 줄어들어도
--   (동시에 다른 결제에서 먼저 써버린 경우 등) 가진 것보다 더 많이 깎아주는 사고가 나지 않습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/payment_confirmation_functions.sql → 이 파일.
--   (이 파일이 mark_payment_matching_pending() 을 적립금 로직이 포함된 버전으로 다시 덮어씁니다 —
--    두 함수의 매개변수 시그니처가 같아 create or replace 만으로 안전하게 교체됩니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) profiles.points_balance — 보유 적립금. 클라이언트는 직접 쓸 수 없고(기존 profiles 정책이 이미
--    anon/authenticated 의 insert/update/delete 를 막아 둠 — sql/supabase_schema_latest.sql 1번),
--    아래 mark_payment_matching_pending() 같은 SECURITY DEFINER 함수를 통해서만 바뀝니다.
--    조회는 기존 profiles_select_own 정책이 이미 모든 컬럼을 허용하므로 추가 정책이 필요 없습니다.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists points_balance integer not null default 0;


-- ----------------------------------------------------------------------------
-- 2) service_applications.points_used — apply.html 제출 시점에 "이번 결제에 쓰겠다"고 적은 금액.
--    이 테이블은 이미 anon/authenticated 가 insert 할 수 있어(기존 service_applications_insert_linked
--    정책) 이 컬럼도 함께 저장되지만, 실제 차감은 결제 확인 시점에만 이뤄지므로 여기 적힌 값 자체가
--    돈이 되는 건 아닙니다 — 그냥 "사용자가 요청한 금액"의 스냅샷입니다.
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists points_used integer not null default 0;


-- ----------------------------------------------------------------------------
-- 3) point_transactions — 적립금 차감/적립 감사 로그 (지금은 결제 차감만 기록). 클라이언트는 자기 내역만
--    조회할 수 있고, 쓰기는 SECURITY DEFINER 함수만 합니다.
-- ----------------------------------------------------------------------------
create table if not exists public.point_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.service_applications(id) on delete set null,
  amount         integer not null,                  -- 음수 = 차감(사용), 양수 = 적립
  reason         text not null,                      -- 예: 'service_payment'
  created_at     timestamptz not null default now()
);
create index if not exists point_transactions_user_idx on public.point_transactions (user_id, created_at desc);

alter table public.point_transactions enable row level security;
drop policy if exists point_transactions_select_own on public.point_transactions;
create policy point_transactions_select_own on public.point_transactions
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.point_transactions from anon, authenticated;
grant  select on public.point_transactions to authenticated;


-- ----------------------------------------------------------------------------
-- 4) mark_payment_matching_pending() 재정의 — sql/payment_confirmation_functions.sql 의 버전에
--    적립금 검증·차감을 추가합니다. 매개변수 시그니처가 같으므로 create or replace 로 안전하게 덮어씁니다.
--
--    변경점:
--    a) 결제 금액 검증 기준을 expected_service_price(service_type) 에서
--       expected_service_price(service_type) - 실제 사용 가능한 적립금 으로 바꿨습니다.
--    b) PAYMENT_PENDING → MATCHING_PENDING 전환을 "원자적 선점"(UPDATE ... WHERE status =
--       'PAYMENT_PENDING' RETURNING *, FOUND 확인)으로 먼저 하고, 그 UPDATE가 실제로 행을 바꿨을 때만
--       가상계좌 입금 처리/적립금 차감을 실행하도록 순서를 바꿨습니다 — issue-virtual-account 와
--       portone-webhook 이 같은 결제를 거의 동시에 처리해도(둘 다 PortOne 재조회에서 PAID 를 보는 경우)
--       행 잠금으로 직렬화되어 적립금이 두 번 차감되지 않습니다(이전 버전은 상태 전환을 맨 마지막에만
--       조건부로 했어서, 금액 관련 부수효과가 없던 그때는 문제가 없었지만 적립금 차감이 생긴 지금은
--       이 순서가 꼭 필요합니다).
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app           public.service_applications;
  v_price         integer;
  v_points_to_use integer;
  v_expected      integer;
  v_balance       integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    -- 이미 처리된 건에 대한 재호출(webhook 중복 전송 등) — 멱등 처리, 그대로 돌려줌.
    return v_app;
  end if;

  -- 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한합니다 — 신청서 저장과
  -- 결제 확인 사이에 잔액이 줄었을 가능성(다른 결제에서 먼저 씀 등)을 반영합니다.
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price - v_points_to_use;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리와 적립금 차감을 실행합니다.
  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    -- 그 사이 다른 호출(issue-virtual-account ↔ portone-webhook 경합)이 먼저 전환을 마쳤습니다 —
    -- 적립금은 그쪽에서 이미 처리했으므로 여기서는 다시 건드리지 않고 현재 행을 그대로 돌려줍니다.
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      -- 위에서 잔액을 확인한 시점과 이 UPDATE 사이에 잔액이 또 바뀐 극히 드문 경우 — 결제 승인 자체는
      -- 이미 금액 검증을 통과했으므로 막지 않고, 차감 없이 경고만 남겨 운영자가 point_transactions로 추적합니다.
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [7d. 결제 시 쿠폰/적립금 검증·차감]  (원본: sql/user_coupons_checkout.sql)
-- ==============================================================================

-- ============================================================================
-- apply.html 결제 시 유저 쿠폰(user_coupons) + 적립금(profiles.points_balance) 동시 적용
--   sql/welcome_coupons.sql (user_coupons 테이블) 과 sql/user_points.sql (points_balance, points_used,
--   첫 버전의 마크 함수) 을 전제로, 신청서에 쿠폰 선택까지 더해 결제 확인 시점에 함께 검증/반영합니다.
--
--   - service_applications.coupon_id       : apply.html 쿠폰 드롭다운에서 고른 user_coupons.id (희망값)
--   - service_applications.coupon_discount : 그 쿠폰의 할인액 스냅샷(제출 시점)
--   - service_applications.discount_amount : coupon_discount + points_used (제출 시점 희망 총 할인액)
--     → 결제가 'PAID' 로 확인되면 아래 mark_payment_matching_pending() 이 "실제로 적용된" 값으로 덮어씁니다.
--   - service_applications.final_amount    : 서비스 정가 - discount_amount (제출/확정 시점 최종 결제 금액)
--
--   핵심 설계(이전 버전과 동일한 원칙 — sql/user_points.sql 의 의도를 쿠폰까지 확장):
--     expected_service_price(service_type) - (실제 사용 가능한 쿠폰 할인 + 실제 사용 가능한 적립금)
--     이 PortOne 재조회 실제 승인 금액과 정확히 일치해야만 결제를 승인합니다. "실제 사용 가능한"은
--     신청서에 적힌 희망값과, 결제 확인 시점의 실제 쿠폰 상태/적립금 잔액 중 더 작은(또는 유효한) 쪽입니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/welcome_coupons.sql → sql/user_points.sql → 이 파일.
--   (매개변수 시그니처가 이전과 같아 mark_payment_matching_pending() 을 create or replace 로 안전하게 덮어씁니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) service_applications 에 쿠폰/확정 금액 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists coupon_id uuid references public.user_coupons(id);
alter table public.service_applications add column if not exists coupon_discount integer not null default 0;
alter table public.service_applications add column if not exists discount_amount integer not null default 0;
alter table public.service_applications add column if not exists final_amount integer;

-- 1-1) 선택 추가 옵션(Add-on) — 긴급 매칭 서비스 ('차량 이동 지원'·'상세 건강&복약 리포트'
--      유료 옵션은 폐지 — 진료 피드백 리포트는 모든 서비스에 기본 무료로 제공됩니다).
--      addon_codes 는 apply.html 체크박스에서 고른 코드 배열(희망값 스냅샷), addon_total 은 그 코드들의
--      합계 스냅샷(화면 표시용) — coupon_id/coupon_discount 와 같은 패턴입니다. 실제 검증은 아래
--      expected_addon_total() 이 addon_codes 로부터 금액을 다시 계산해서만 이뤄지고, 클라이언트가 보낸
--      addon_total 자체는 신뢰하지 않습니다.
alter table public.service_applications add column if not exists addon_codes text[] not null default '{}';
alter table public.service_applications add column if not exists addon_total integer not null default 0;

create or replace function public.expected_addon_total(p_addon_codes text[])
returns integer
language sql immutable as $$
  -- 'DETAILED_REPORT'·'VEHICLE_SUPPORT' 는 폐지된 옵션 — 과거에 저장된 신청서가 그 코드를 여전히
  -- 들고 있어도 else 0 으로 떨어져 더 이상 금액이 합산되지 않습니다(결제 금액 검증을 깨뜨리지 않는 안전한 폐지).
  select coalesce(sum(case code
    when 'URGENT_MATCHING' then 10000 -- 긴급 매칭 서비스 (이용 24시간 이내 긴급 예약 요청)
    else 0
  end), 0)
  from unnest(coalesce(p_addon_codes, '{}'::text[])) as code;
$$;

grant execute on function public.expected_addon_total(text[]) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) mark_payment_matching_pending() 재정의 — 쿠폰 검증/사용 처리 + discount_amount/final_amount 확정 기록 추가.
--
--    변경점(sql/user_points.sql 버전 대비):
--    a) coupon_id 가 있으면: 그 쿠폰이 "이 신청서의 user_id 소유 + status='active' + 아직 미만료"일 때만
--       유효한 것으로 보고 할인액을 반영합니다. 조건에 맞지 않으면(이미 썼거나, 다른 사람 쿠폰이거나,
--       만료됨 — 신청서 저장과 결제 확인 사이에 그렇게 됐을 수 있음) 쿠폰 할인 없이(0원) 진행합니다.
--    b) 상태 전환(원자적 선점)에 성공한 뒤, 적립금 차감과 같은 자리에서 쿠폰도 status='active' 조건을 다시
--       건 UPDATE 로 'used' 처리합니다 — 두 결제가 같은 쿠폰을 동시에 쓰려 해도 먼저 UPDATE 를 성공시킨
--       쪽만 쿠폰을 가져가고(행 잠금으로 직렬화), 진 쪽은 쿠폰 없이(할인 0원) 처리되어 AMOUNT_MISMATCH 로
--       막힙니다(그 결제가 쿠폰 할인을 전제로 금액을 보냈을 것이므로) — 안전한 실패입니다.
--    c) discount_amount/final_amount 를 "실제로 적용된" 값으로 service_applications 에 기록합니다 —
--       제출 시점 희망값이 아니라 이 함수가 검증을 마친 뒤의 확정값입니다.
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app            public.service_applications;
  v_price          integer;
  v_addon_total    integer;
  v_coupon_discount integer;
  v_coupon_valid   boolean;
  v_points_to_use  integer;
  v_discount       integer;
  v_expected       integer;
  v_balance        integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    return v_app; -- 이미 처리됨(멱등)
  end if;

  -- 쿠폰: 지금 이 순간에도 "이 사람 것 + 아직 유효(active, 미만료)" 인지 다시 확인
  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  -- 적립금: 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price + v_addon_total - v_discount;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, addon=%, coupon=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_addon_total, v_coupon_discount, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리, 쿠폰 사용 처리, 적립금 차감, 확정 금액 기록을 실행합니다 — issue-virtual-account 와
  -- portone-webhook 이 같은 결제를 거의 동시에 처리해도 전부 한 번씩만 적용됩니다.
  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      -- 거의 동시에 다른 결제가 먼저 이 쿠폰을 써버린 극히 드문 경우 — 이미 위에서 AMOUNT_MISMATCH 검증을
      -- 통과했다는 것은 이 쿠폰 할인이 반영된 금액으로 결제가 승인됐다는 뜻이라 쿠폰 없이는 금액이 맞지
      -- 않습니다. 결제 자체를 되돌리지는 않고(이미 PG 승인 완료) 경고만 남겨 운영자가 수동으로 확인합니다.
      raise warning '[mark_payment_matching_pending] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, public.expected_service_price(v_app.service_type)) + v_addon_total - v_discount
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [8. 초과 시간 추가 요금 결제]  (원본: sql/extra_charge_billing.sql)
-- ==============================================================================

-- ============================================================================
-- 추가 요금 정산(기본 요금 선결제 + 초과 시 추가 요금) — care_schedules 1건당 추가 청구 1건
--
--   결제 구조: apply.html 결제는 서비스별 "기본 요금"(2시간 기준, SERVICES 카탈로그)만 선결제합니다.
--   현장에서 기본 시간을 초과하면, 관리자가 케어 완료 후 admin.html에서 초과분 금액을 직접 입력해
--   추가 청구를 올리고(산정 방식: 관리자 수기 입력 — 자동 계산 아님), 보호자가 mypage.html 에서
--   PortOne 결제창으로 그 금액만 다시 결제합니다(2차 결제 — 기존 가상계좌/기본결제와는 별도의
--   paymentId를 새로 발급해 PortOne에 전달합니다. 기본 결제 paymentId = application_id 규칙과 섞이지
--   않도록, 추가 청구 전용 paymentId는 extra_charge_payment_id 컬럼에 새 uuid로 발급합니다).
--
--   흐름:
--     1) admin.html '추가 요금 청구' 버튼 → admin_request_extra_charge() : status NONE → REQUESTED,
--        amount/memo 저장, extra_charge_payment_id 새로 발급
--     2) mypage.html 가 REQUESTED 건을 보여주고, 보호자가 결제 버튼 클릭 → PortOne.requestPayment()
--        (paymentId = extra_charge_payment_id, totalAmount = extra_charge_amount)
--     3) supabase/functions/confirm-extra-charge-payment 가 PortOne API 를 서버에서 재조회해
--        실제 승인 금액이 extra_charge_amount 와 정확히 일치할 때만 confirm_extra_charge_payment() 호출
--        → status REQUESTED → PAID (issue-virtual-account/mark_payment_matching_pending 과 완전히 같은
--        "클라이언트 응답을 믿지 않고 서버가 PortOne 을 재조회" 원칙)
--     4) portone-webhook 도 같은 confirm_extra_charge_payment() 를 호출하도록 분기 추가(이 파일 적용 후
--        supabase/functions/portone-webhook 도 함께 배포해야 합니다)
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/admin_care_actions.sql → 이 파일. create or replace / add column if not exists
--             기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가 — 신청 1건(케어 1건)당 "현재 활성화된" 추가 청구 1건만 추적합니다(여러 번 청구해야
--    하면 이전 건이 PAID 로 끝난 뒤 새로 청구하는 것을 전제로 합니다 — 동시에 두 건을 걸지 않음).
-- ----------------------------------------------------------------------------
alter table public.care_schedules add column if not exists extra_charge_amount     integer;
alter table public.care_schedules add column if not exists extra_charge_memo       text;
alter table public.care_schedules add column if not exists extra_charge_status     text not null default 'NONE';
alter table public.care_schedules add column if not exists extra_charge_payment_id uuid;
alter table public.care_schedules add column if not exists extra_charge_requested_at timestamptz;
alter table public.care_schedules add column if not exists extra_charge_paid_at      timestamptz;

alter table public.care_schedules drop constraint if exists care_schedules_extra_charge_status_check;
alter table public.care_schedules add constraint care_schedules_extra_charge_status_check
  check (extra_charge_status in ('NONE', 'REQUESTED', 'PAID'));

alter table public.care_schedules drop constraint if exists care_schedules_extra_charge_amount_check;
alter table public.care_schedules add constraint care_schedules_extra_charge_amount_check
  check (extra_charge_amount is null or extra_charge_amount > 0);

create unique index if not exists care_schedules_extra_charge_payment_id_key
  on public.care_schedules (extra_charge_payment_id) where extra_charge_payment_id is not null;

-- portone-webhook 이 들어온 paymentId 가 "추가 청구"인지부터 빠르게 판별할 때 씀
create index if not exists care_schedules_extra_charge_requested_idx
  on public.care_schedules (extra_charge_payment_id) where extra_charge_status = 'REQUESTED';


-- ----------------------------------------------------------------------------
-- 2) 관리자: 추가 요금 청구 — 케어가 완료(completed)된 건에만 걸 수 있습니다(진행 중에는 아직 초과
--    여부를 확정할 수 없음). 이미 REQUESTED/PAID 인 건을 다시 부르면 — PAID 는 덮어쓰지 않고 거부,
--    REQUESTED 는 금액/메모를 고쳐서 다시 청구(paymentId 는 그대로 유지 — 보호자가 이미 그 paymentId 로
--    결제창을 열어 둔 상태일 수 있어 괜히 새로 발급하지 않습니다)하는 것으로 둡니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_request_extra_charge(uuid, integer, text);

create or replace function public.admin_request_extra_charge(
  p_schedule_id uuid,
  p_amount integer,
  p_memo text default null
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;

  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status <> 'completed' then
    raise exception 'SCHEDULE_NOT_COMPLETED' using errcode = 'P0001';
  end if;
  if v_row.extra_charge_status = 'PAID' then
    raise exception 'EXTRA_CHARGE_ALREADY_PAID' using errcode = 'P0001';
  end if;

  update public.care_schedules
     set extra_charge_amount = p_amount,
         extra_charge_memo = p_memo,
         extra_charge_status = 'REQUESTED',
         extra_charge_payment_id = coalesce(extra_charge_payment_id, gen_random_uuid()),
         extra_charge_requested_at = now()
   where id = p_schedule_id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.admin_request_extra_charge(uuid, integer, text) from public, anon;
grant  execute on function public.admin_request_extra_charge(uuid, integer, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) 관리자: 추가 요금 청구 취소 — 잘못 입력했을 때 결제 전(REQUESTED)에만 되돌립니다. 이미 PAID 인
--    건은 취소가 아니라 환불 절차(수동/PortOne 콘솔)로 처리해야 하므로 여기서 막습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_cancel_extra_charge(uuid);

create or replace function public.admin_cancel_extra_charge(p_schedule_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.care_schedules
     set extra_charge_amount = null,
         extra_charge_memo = null,
         extra_charge_status = 'NONE',
         extra_charge_payment_id = null,
         extra_charge_requested_at = null
   where id = p_schedule_id
     and extra_charge_status = 'REQUESTED'
  returning * into v_row;

  if not found then
    raise exception 'EXTRA_CHARGE_NOT_CANCELLABLE' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.admin_cancel_extra_charge(uuid) from public, anon;
grant  execute on function public.admin_cancel_extra_charge(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) 추가 요금 결제 확인 — supabase/functions/confirm-extra-charge-payment, portone-webhook 이
--    PortOne API 재조회 결과만 가지고 호출합니다(클라이언트가 직접 부르지 못하도록 service_role 전용).
--    p_paid_amount 는 반드시 extra_charge_amount 와 정확히 일치해야 PAID 로 전환됩니다 — 금액이 다르면
--    AMOUNT_MISMATCH 로 거부하고 상태를 바꾸지 않습니다(결제 모듈이 극단적으로 늦게 금액을 바꿔 보낼
--    가능성은 거의 없지만, sql/payment_confirmation_functions.sql 의 mark_payment_matching_pending() 과
--    같은 원칙을 지킵니다 — "브라우저가 보낸 금액이 아니라 PortOne 서버 재조회 금액만 신뢰").
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_extra_charge_payment(uuid, integer);

create or replace function public.confirm_extra_charge_payment(p_payment_id uuid, p_paid_amount integer)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  select * into v_row from public.care_schedules where extra_charge_payment_id = p_payment_id;
  if v_row.id is null then
    raise exception 'EXTRA_CHARGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.extra_charge_status = 'PAID' then
    return v_row; -- 중복 웹훅/재시도 — 조용히 현재 행 그대로 반환 (멱등)
  end if;
  if v_row.extra_charge_status <> 'REQUESTED' then
    raise exception 'EXTRA_CHARGE_NOT_REQUESTED' using errcode = 'P0001';
  end if;
  if p_paid_amount is distinct from v_row.extra_charge_amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_row.extra_charge_amount, p_paid_amount
      using errcode = 'P0003';
  end if;

  update public.care_schedules
     set extra_charge_status = 'PAID',
         extra_charge_paid_at = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.confirm_extra_charge_payment(uuid, integer) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [9. 매니저 정산 70:30 분배 + 트리거]  (원본: sql/manager_settlement_70_30.sql)
-- ==============================================================================

-- ============================================================================
-- 매니저 정산(70:30 수수료) 시스템
--
--   정산 구조: 건별 결제 금액(기본 요금 + 승인된 추가 요금)의 70%는 케어매니저 정산금, 30%는
--   플랫폼 수수료로 자동 분배합니다. 매월 말일 마감 후 익월 10일에 그 달 완료 건을 모아 일괄
--   지급하며, 지급 시 3.3%(소득세 3% + 지방소득세 0.3%, 사업소득 원천징수) 를 뗀 금액을 입금합니다.
--
--   왜 care_schedules 인가(service_applications 가 아니라): service_applications 은 "신청/결제"
--   시점의 테이블로 아직 매니저가 배정되지 않았거나 취소될 수도 있는 건까지 포함합니다. 반면
--   care_schedules 는 "실제로 특정 매니저가 수행하는 건"(매니저 1명 1:1) 이고, 이미 매니저 정산
--   예정액을 담아 온 payout_amount 컬럼이 있었습니다(다만 지금까지 삽입 코드들이 전부 0 을 하드코딩해
--   실제로는 쓰이지 않던 자리였습니다). 매니저별/월별 정산 집계는 "누가 수행했는지"가 기준이므로
--   care_schedules 가 정산의 자연스러운 단위입니다.
--
--   추가되는 컬럼(care_schedules):
--     payment_amount  결제액(이 건에 대해 실제로 받은 금액 = 기본 요금 + PAID 된 추가 요금)
--     manager_payout  매니저 정산금 = payment_amount 의 70% (자동 계산, 직접 수정 금지)
--     platform_fee    플랫폼 수수료 = payment_amount 의 30% (자동 계산, 직접 수정 금지)
--   기존 payout_amount 컬럼은 그대로 두되, 트리거가 manager_payout 과 항상 같은 값으로 맞춰
--   mypage-manager.html 등 이미 payout_amount 를 읽고 있는 화면이 수정 없이 올바른 70% 금액을
--   보여주게 합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/reservations_virtual_accounts.sql(accept_service_application()) →
--             sql/admin_manual_assignment.sql(admin_assign_manager()) →
--             sql/payment_confirmation_functions.sql(expected_service_price()) →
--             sql/extra_charge_billing.sql(confirm_extra_charge_payment()) → 이 파일.
--   전부 create or replace / add column if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.care_schedules add column if not exists payment_amount integer not null default 0;
alter table public.care_schedules add column if not exists manager_payout integer not null default 0;
alter table public.care_schedules add column if not exists platform_fee   integer not null default 0;

alter table public.care_schedules drop constraint if exists care_schedules_payment_amount_check;
alter table public.care_schedules add constraint care_schedules_payment_amount_check
  check (payment_amount >= 0);


-- ----------------------------------------------------------------------------
-- 2) 70:30 자동 분배 트리거 — payment_amount 가 insert/update 될 때마다 manager_payout(70%) /
--    platform_fee(30%) 을 다시 계산합니다. manager_payout 은 반올림하고 platform_fee 는
--    "결제액 - manager_payout"으로 계산해, 두 금액의 합이 항상 payment_amount 와 정확히 일치하도록
--    합니다(각자 따로 반올림하면 1원 단위로 어긋날 수 있음). payout_amount(기존 컬럼)도 항상
--    manager_payout 과 같게 맞춰 하위 호환을 지킵니다.
-- ----------------------------------------------------------------------------
create or replace function public.compute_manager_settlement_split() returns trigger
language plpgsql as $$
begin
  new.manager_payout := round(coalesce(new.payment_amount, 0) * 0.7)::integer;
  new.platform_fee   := coalesce(new.payment_amount, 0) - new.manager_payout;
  new.payout_amount   := new.manager_payout;
  return new;
end $$;

drop trigger if exists care_schedules_settlement_split on public.care_schedules;
create trigger care_schedules_settlement_split
  before insert or update of payment_amount on public.care_schedules
  for each row execute function public.compute_manager_settlement_split();


-- ----------------------------------------------------------------------------
-- 3) 기존 행 백필 — 이미 쌓여 있던 care_schedules 행 중 payment_amount 가 아직 0인 건을, 연결된
--    service_applications.service_type 의 정가(expected_service_price)로 채웁니다. 신청서 연결이
--    없는 옛 방식(구글폼 등) 행은 기존 payout_amount 를 결제액으로 간주합니다. 이미 PAID 된 추가
--    요금이 있으면 더해 줍니다. payment_amount 를 SET 하므로 위 트리거가 같은 UPDATE 안에서 바로
--    manager_payout/platform_fee/payout_amount 를 다시 계산합니다 — 여러 번 실행해도 이미 0이 아닌
--    행은 건드리지 않아 안전합니다(재실행 멱등).
-- ----------------------------------------------------------------------------
update public.care_schedules cs
   set payment_amount = coalesce(
         (select public.expected_service_price(a.service_type)
            from public.service_applications a
           where a.id = cs.application_id),
         cs.payout_amount,
         0
       ) + case when cs.extra_charge_status = 'PAID' then coalesce(cs.extra_charge_amount, 0) else 0 end
 where cs.payment_amount = 0
   and (cs.payout_amount > 0 or cs.application_id is not null or cs.extra_charge_status = 'PAID');


-- ----------------------------------------------------------------------------
-- 4) accept_service_application() — 매니저가 "접수 대기" 건을 직접 수락할 때 care_schedules 행을
--    만드는 함수(sql/reservations_virtual_accounts.sql 원본)에 payment_amount 계산만 추가합니다.
--    나머지 로직/컬럼 순서는 원본과 동일합니다.
-- ----------------------------------------------------------------------------
create or replace function public.accept_service_application(p_application_id uuid, p_scheduled_at timestamptz)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app           public.service_applications;
  v_row           public.care_schedules;
  v_phone_re      constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep           int;
  v_pending_addon boolean;
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
     set manager_id = auth.uid(), accepted_at = now(), status = 'MATCHED'
   where id = p_application_id
     and manager_id is null
     and public.is_pending_application_status(status)
  returning * into v_app;

  if not found then
    raise exception 'REQUEST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  -- 패키지 차감 예약에 선택 추가 옵션이 함께 있으면(consume_package_on_application, sql/
  -- user_packages_system.sql 이 extra_fee/extra_fee_status='pending_payment' 로 남겨 둔 금액) 지금
  -- care_schedules 가 처음 생기는 시점에 그 금액을 기존 '추가 요금 결제 안내' 결제 레일(extra_charge_*,
  -- sql/extra_charge_billing.sql)에 그대로 올려 보호자가 결제할 수 있게 합니다.
  v_pending_addon := coalesce(v_app.is_package_used, false)
    and v_app.extra_fee_status = 'pending_payment'
    and coalesce(v_app.extra_fee, 0) > 0;

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount,
     payment_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng,
     extra_charge_amount, extra_charge_memo, extra_charge_status, extra_charge_payment_id, extra_charge_requested_at)
  values (
    auth.uid(),
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    p_scheduled_at,
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    coalesce(public.expected_service_price(v_app.service_type), 0),
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng,
    case when v_pending_addon then v_app.extra_fee else null end,
    case when v_pending_addon then '선택 추가 옵션 금액 (보유 패키지 차감 예약)' else null end,
    case when v_pending_addon then 'REQUESTED' else 'NONE' end,
    case when v_pending_addon then gen_random_uuid() else null end,
    case when v_pending_addon then now() else null end
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;


-- ----------------------------------------------------------------------------
-- 5) admin_assign_manager() — 관리자가 수동 배정할 때 care_schedules 행을 만드는 함수
--    (sql/admin_manual_assignment.sql 원본)에 payment_amount 계산만 추가합니다. 나머지 로직은 동일합니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_assign_manager(p_application_id uuid, p_manager_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app           public.service_applications;
  v_is_active     boolean;
  v_schedule_id   uuid;
  v_phone_re      constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep           int;
  v_pending_addon boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.managers m where m.id = p_manager_id and m.certification_verified = true
  ) into v_is_active;
  if not v_is_active then
    raise exception 'MANAGER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.service_applications
     set manager_id  = p_manager_id,
         accepted_at = coalesce(accepted_at, now()),
         status      = 'MATCHED'
   where id = p_application_id
     and manager_id is null
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  update public.virtual_accounts
     set is_paid = true
   where application_id = v_app.id
     and is_paid = false;

  if v_app.schedule_id is not null then
    update public.care_schedules set manager_id = p_manager_id where id = v_app.schedule_id;
    select * into v_app from public.service_applications where id = v_app.id;
    return v_app;
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  -- accept_service_application() 과 같은 이유로, 패키지 차감 예약에 선택 추가 옵션이 함께 있으면
  -- (consume_package_on_application 이 남긴 extra_fee/extra_fee_status='pending_payment') 지금
  -- care_schedules 가 처음 생기는 시점에 그 금액을 '추가 요금 결제 안내' 결제 레일에 올립니다.
  v_pending_addon := coalesce(v_app.is_package_used, false)
    and v_app.extra_fee_status = 'pending_payment'
    and coalesce(v_app.extra_fee, 0) > 0;

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount,
     payment_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng,
     extra_charge_amount, extra_charge_memo, extra_charge_status, extra_charge_payment_id, extra_charge_requested_at)
  values (
    p_manager_id,
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    coalesce(public.parse_desired_datetime_kst(v_app.request_details, v_app.created_at), now()),
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    coalesce(public.expected_service_price(v_app.service_type), 0),
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng,
    case when v_pending_addon then v_app.extra_fee else null end,
    case when v_pending_addon then '선택 추가 옵션 금액 (보유 패키지 차감 예약)' else null end,
    case when v_pending_addon then 'REQUESTED' else 'NONE' end,
    case when v_pending_addon then gen_random_uuid() else null end,
    case when v_pending_addon then now() else null end
  )
  returning id into v_schedule_id;

  update public.service_applications set schedule_id = v_schedule_id where id = v_app.id;
  select * into v_app from public.service_applications where id = v_app.id;
  return v_app;
end $$;

revoke all on function public.admin_assign_manager(uuid, uuid) from public, anon;
grant  execute on function public.admin_assign_manager(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 6) confirm_extra_charge_payment() — 추가 요금이 결제 완료(PAID)되는 순간, 그 금액을
--    payment_amount 에 더합니다(sql/extra_charge_billing.sql 원본에 한 줄만 추가). 이렇게 하면
--    "건별 결제 금액"이 기본 요금 + 승인된 추가 요금의 합으로 맞춰지고, 위 트리거가 그 전체 금액의
--    70%/30% 를 다시 계산합니다.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_extra_charge_payment(p_payment_id uuid, p_paid_amount integer)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  select * into v_row from public.care_schedules where extra_charge_payment_id = p_payment_id;
  if v_row.id is null then
    raise exception 'EXTRA_CHARGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.extra_charge_status = 'PAID' then
    return v_row; -- 중복 웹훅/재시도 — 조용히 현재 행 그대로 반환 (멱등)
  end if;
  if v_row.extra_charge_status <> 'REQUESTED' then
    raise exception 'EXTRA_CHARGE_NOT_REQUESTED' using errcode = 'P0001';
  end if;
  if p_paid_amount is distinct from v_row.extra_charge_amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_row.extra_charge_amount, p_paid_amount
      using errcode = 'P0003';
  end if;

  update public.care_schedules
     set extra_charge_status = 'PAID',
         extra_charge_paid_at = now(),
         payment_amount = payment_amount + v_row.extra_charge_amount
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.confirm_extra_charge_payment(uuid, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7) 관리자 정산 집계 RPC — admin.html '매니저 정산' 탭이 호출합니다. 월별로 완료(completed) 건만
--    모아 매니저별 [완료 건수 / 정산대상액(70%) 합계 / 3.3% 원천세 / 실지급액]을 계산합니다.
--    raw 테이블 대신 반드시 이 RPC(SECURITY DEFINER + is_admin() 체크)를 통해서만 조회하게 해
--    일반 사용자가 다른 매니저의 정산 내역을 직접 조회하지 못하도록 막습니다(fail closed).
--    p_month 는 해당 월의 아무 날짜나 넘기면 됩니다(예: '2026-10-01') — 그 달 1일~말일(KST)만 봅니다.
--    3.3%(소득세 3% + 지방소득세 0.3%) 원천세는 원 단위로 내림(floor) 처리합니다(과다 공제 방지).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    select
      cs.manager_id,
      coalesce(p.name, '이름 미등록')  as manager_name,
      coalesce(p.phone, '-')          as manager_phone,
      count(*)::bigint                as completed_count,
      coalesce(sum(cs.manager_payout), 0)::bigint as payout_subtotal,
      floor(coalesce(sum(cs.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(cs.manager_payout), 0)
        - floor(coalesce(sum(cs.manager_payout), 0) * 0.033))::bigint as net_payout
    from public.care_schedules cs
    left join public.profiles p on p.id = cs.manager_id
    where cs.status = 'completed'
      and cs.manager_id is not null
      and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
        = date_trunc('month', p_month::timestamp)
    group by cs.manager_id, p.name, p.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [9a. 정산 버그 수정 2차]  (원본: sql/admin_settlement_fixes_v2.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자 정산(매니저 월별) "완료 건수 6건/200,200원" vs 매니저 캘린더 "1건" 불일치 조사 + 방어적 재작성
--
--   먼저 결론: admin_manager_monthly_settlements() 를 다시 처음부터 읽어봤는데, service_applications나
--   다른 자식 테이블을 1:N 으로 조인하는 부분은 원래 없었습니다 — care_schedules 한 테이블만 보고,
--   거기 붙는 profiles/manager_applications 조인은 전부 "행 1개당 최대 1개"만 매칭되는 조인(profiles.id
--   는 PK, manager_applications 쪽은 LATERAL ... LIMIT 1)이라 수학적으로 건수를 불려 보낼 수 없는
--   구조였습니다. 그래서 COUNT(DISTINCT ...) 로 바꿔도 지금 당장 숫자가 달라지지는 않을 가능성이
--   높습니다 — 다만 요청하신 대로 "앞으로 조인이 추가되어도 건수가 절대 안 불어나는" 구조로 아래
--   2)에서 다시 작성해 두었습니다(완료 건을 먼저 CTE로 확정한 뒤에만 표시용 조인을 붙임).
--
--   실제로 "6건/200,200원"이 나오는 더 흔한 원인은 두 화면이 완료 건을 서로 다른 "달"기준으로 나누기
--   때문입니다:
--     - admin_manager_monthly_settlements(): completed_at(실제 완료 처리 시각) 기준으로 그 달을 나눔
--       — 정산은 "언제 일을 끝냈는지"로 마감해야 하므로(매월 말일 마감 → 익월 10일 지급) 이게
--       재무적으로 맞는 기준입니다.
--     - mypage-manager.html 의 캘린더 탭: scheduled_at(원래 예약했던 날짜) 기준으로 날짜 칸에 배치
--       (groupScheduleByDay, calDateKey) — "언제 케어를 수행했는지" 보여주는 화면이라 일부러 이렇게
--       만들어 둔 것입니다.
--   즉 "9월에 예약됐지만 처리(완료)는 10월에 된" 건이 있으면, 캘린더의 10월 페이지에는 안 보이고
--   (9월 페이지에 있음) admin 집계에는 10월 완료로 정확히 잡힙니다 — 반대로 이런 건이 여러 개 있으면
--   "캘린더 1건 vs admin 6건"처럼 크게 벌어질 수 있습니다. 1)의 진단 쿼리로 실제로 그런지 바로 확인할
--   수 있습니다.
--
--   실행 순서: sql/manager_settlement_70_30.sql → sql/admin_settlement_fixes.sql → 이 파일.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 진단 쿼리 — 어드민 화면에 뜨는 "그 매니저·그 달" 원본 행을 그대로 펼쳐 봅니다. 함수가 아니라
--    바로 실행하는 SELECT 문입니다. :manager_id 와 :month 를 실제 값으로 바꿔서 Supabase SQL Editor에서
--    실행해 보세요(예: 관리자 화면에 뜬 이름의 매니저 uuid, '2026-10-01').
--    scheduled_at 과 completed_at 의 월(月)이 서로 다른 행이 있는지 바로 눈으로 확인할 수 있습니다.
-- ----------------------------------------------------------------------------
-- select
--   cs.id, cs.application_id, cs.status,
--   cs.scheduled_at, cs.completed_at,
--   to_char(cs.scheduled_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as scheduled_kst,
--   to_char(cs.completed_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as completed_kst,
--   cs.payment_amount, cs.manager_payout, cs.extra_charge_amount, cs.extra_charge_status
-- from public.care_schedules cs
-- where cs.manager_id = '<여기에 매니저 uuid>'
--   and cs.status = 'completed'
--   and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul') = date_trunc('month', '2026-10-01'::timestamp)
-- order by cs.completed_at;


-- ----------------------------------------------------------------------------
-- 2) admin_manager_monthly_settlements() 재작성 — 완료 건을 먼저 CTE(completed_rows)로 "딱 1번씩만"
--    확정한 뒤, 그 결과에만 이름 표시용 조인을 붙입니다. 이렇게 구조를 나누면 나중에 누가 실수로
--    1:N 조인을 추가해도 건수가 불어나는 게 아니라 중복된 "이름 조회 행"만 생기고, 바로 다음 줄의
--    group by + count(distinct completed_rows.id) 가 이를 다시 1건으로 되돌립니다 — 즉 조인 종류와
--    무관하게 건수가 절대 두 번 세어지지 않는 구조입니다(요청하신 COUNT(DISTINCT ...) 요구사항을
--    구조적으로 강제).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    with completed_rows as (
      -- '완료' 집계의 유일한 기준 테이블. 여기서 한 번 더 명시적으로 status='completed' 만 고르고
      -- (요청 1), manager_id 가 없는 행(이례적인 레거시 데이터)은 애초에 배제합니다(요청 2).
      -- id 는 care_schedules 의 PK 이므로 이 CTE 안에서 이미 "건당 정확히 1행"이 보장됩니다.
      select cs.id, cs.manager_id, cs.manager_payout
        from public.care_schedules cs
       where cs.status = 'completed'
         and cs.manager_id is not null
         and cs.completed_at is not null
         and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
           = date_trunc('month', p_month::timestamp)
    )
    select
      c.manager_id,
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      -- 표시용 조인(profiles/manager_applications)은 전부 "1행당 최대 1개"만 붙는 조인(profiles.id는 PK,
      -- manager_applications 쪽은 LATERAL ... LIMIT 1)이라 completed_rows 를 늘리지 않습니다. 그래도
      -- 요청하신 대로 COUNT(DISTINCT ...)/합계 모두 completed_rows.id 기준 중복 제거를 명시적으로 강제합니다.
      count(distinct c.id)::bigint                as completed_count,
      coalesce(sum(c.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(c.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(c.manager_payout), 0)
        - floor(coalesce(sum(c.manager_payout), 0) * 0.033))::bigint as net_payout
    from completed_rows c
    left join public.profiles p on p.id = c.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = c.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    group by c.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [10. 관리자 수동 결제 승인 + 텔레그램 알림]  (원본: sql/admin_manual_payment_telegram_notify.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔 '수동 입금 확인'([입금 확인] 버튼, admin_confirm_manual_payment() RPC)에는 텔레그램
-- 알림이 빠져 있었습니다 — 신규 신청 알림은 issue-virtual-account/portone-webhook Edge Function
-- 안에서만 보내는데, 이 버튼은 admin.js 가 Edge Function을 거치지 않고 이 RPC를 브라우저에서 직접
-- 호출하기 때문입니다(그래서 가상계좌/무통장 입금을 매니저가 관리자에게 알려 수동으로 확인 처리하는
-- 경로는 알림이 영영 발송되지 않고 있었습니다).
--
-- Edge Function을 하나 더 추가하는 대신(admin.js 에 추가 호출/인증 전달이 또 필요해짐), 이미 이 RPC가
-- SECURITY DEFINER로 서버에서 실행되는 점을 이용해 함수 안에서 바로 pg_net 으로 텔레그램 API를
-- 호출합니다 — 이 프로젝트가 이미 쓰고 있는 "SQL에서 pg_net 으로 외부 HTTP 호출" 패턴(sql/
-- matching_expiry_auto_refund.sql 의 cron)과 같은 방식이고, 상태 전환과 같은 트랜잭션 안에서 일어나므로
-- 별도의 "이미 알림을 보냈는지" 중복 방지 로직이 필요 없습니다(이 UPDATE 가 실제로 행을 바꿨을 때만,
-- 즉 이 호출이 PAYMENT_PENDING → MATCHING_PENDING 전환을 "처음" 수행했을 때만 아래까지 도달합니다 —
-- 이미 처리된 건을 다시 누르면 'APPLICATION_NOT_AWAITING_PAYMENT' 예외로 그 전에 끝납니다).
--
-- 텔레그램 봇 토큰/채팅방 id는 Vault에 저장합니다(service_role_key 와 같은 이유로 SQL에 평문으로 남기지
-- 않음). 최초 1회, Supabase SQL Editor에서 아래를 실행해 두세요(이미 저장했다면 건너뛰기):
--   select vault.create_secret('<텔레그램 봇 토큰>', 'telegram_bot_token');
--   select vault.create_secret('<텔레그램 채팅방 id>', 'telegram_chat_id');
-- 메시지 형식은 supabase/functions/_shared/telegram.ts 의 buildNewApplicationMessage() 와 동일하게
-- 맞췄습니다(서비스/지역/일시/신청자 + 매니저 마이페이지 링크).
--
-- ⚠ admin_confirm_manual_payment() 의 유일한 정의입니다 — sql/payment_confirmation_functions.sql,
--   sql/matching_expiry_auto_refund.sql 에 있던 옛 정의는 이 파일로 옮겨 왔고 그 자리엔 포인터
--   주석만 남겼습니다. 다른 어떤 파일에도 이 함수를 create or replace 하는 코드를 다시 추가하지
--   마세요 — 나중에 실행되는 쪽이 이전 정의를 덮어쓰는 Postgres 특성 때문에, 더 단순한 버전이 나중에
--   실행되면 텔레그램 알림이 아무 에러 없이 조용히 사라집니다(실제로 한 번 발생했던 회귀).
--   실행 순서: sql/admin_rls_policies.sql(is_admin) → sql/payment_confirmation_functions.sql
--   (expected_service_price) → sql/user_coupons_checkout.sql(expected_addon_total) → 이 파일.
--   이 파일을 몇 번을 다시 실행해도(create or replace) 안전하고, 오히려 위 파일들을 나중에 다시 실행해야
--   할 일이 생기면 그 뒤에 이 파일을 한 번 더 실행해 주는 것이 안전합니다.
-- ============================================================================

create or replace function public.admin_confirm_manual_payment(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app             public.service_applications;
  v_price           integer;
  v_addon_total     integer;
  v_coupon_discount integer;
  v_coupon_valid    boolean;
  v_points_to_use   integer;
  v_discount        integer;
  v_balance         integer;
  v_desired_at      text;
  v_applicant       text;
  v_when            text;
  v_addon_labels    text;
  v_message         text;
  v_bot_token       text;
  v_chat_id         text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now()
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_NOT_AWAITING_PAYMENT' using errcode = 'P0002';
  end if;

  update public.virtual_accounts
     set is_paid = true
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      raise warning '[admin_confirm_manual_payment] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[admin_confirm_manual_payment] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  v_price := public.expected_service_price(v_app.service_type);
  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, final_amount) + v_addon_total - v_discount
   where id = p_application_id
  returning * into v_app;

  -- ---------------------------------------------------------------------------
  -- 텔레그램 알림 — 여기까지 왔다면(위에서 예외 없이) 이 호출이 PAYMENT_PENDING → MATCHING_PENDING
  -- 전환을 실제로 수행한 것이 확실하므로 바로 보냅니다. 알림 발송이 실패해도(토큰 미설정, 네트워크 등)
  -- 이미 입금 확인/상태 전환은 끝난 뒤이므로 트랜잭션을 되돌리지 않고 경고만 남깁니다.
  -- ---------------------------------------------------------------------------
  begin
    select decrypted_secret into v_bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

    if v_bot_token is not null and v_chat_id is not null then
      v_desired_at := (regexp_match(coalesce(v_app.request_details, ''), '희망\s*일시:\s*([^\n]+)'))[1];
      v_applicant := nullif(btrim(split_part(coalesce(v_app.user_contact, ''), '/', 1)), '');
      v_when := coalesce(
        nullif(btrim(v_desired_at), ''),
        to_char(v_app.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        '협의 필요'
      );

      -- 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, expected_addon_total() 과
      -- 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html/_shared/telegram.ts 에도
      -- 같은 맵이 있습니다 — 함께 고쳐 주세요).
      select coalesce(string_agg(case code
          when 'URGENT_MATCHING' then '긴급 매칭 서비스'
          else code
        end, ', '), '없음')
        into v_addon_labels
        from unnest(coalesce(v_app.addon_codes, '{}'::text[])) as code;

      v_message :=
        '[🔔 위드브릿지 신규 케어 신청 접수]' || chr(10) ||
        '• 서비스: ' || coalesce(v_app.service_type, '동행 서비스') || chr(10) ||
        '• 지역: ' || coalesce(v_app.address, '주소 미입력') || chr(10) ||
        '• 일시: ' || v_when || chr(10) ||
        '• 신청자: ' || coalesce(v_applicant, '고객') || ' 고객님' || chr(10) ||
        '• 선택 옵션: ' || v_addon_labels || chr(10) ||
        '👉 매니저 마이페이지에서 수락하기: mypage-manager.html' || chr(10) ||
        '(관리자 수동 입금 확인)';

      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'disable_web_page_preview', true)
      );
    else
      raise warning '[admin_confirm_manual_payment] telegram_bot_token/telegram_chat_id 가 Vault에 없어 알림을 건너뜁니다.';
    end if;
  exception when others then
    raise warning '[admin_confirm_manual_payment] 텔레그램 알림 발송 중 오류(상태 전환은 이미 완료됨) — %', sqlerrm;
  end;

  return v_app;
end $$;

revoke all on function public.admin_confirm_manual_payment(uuid) from public, anon;
grant  execute on function public.admin_confirm_manual_payment(uuid) to authenticated;

notify pgrst, 'reload schema';


-- ==============================================================================
-- [11. 48시간 미매칭 자동 취소/환불 + pg_cron(Edge Function 호출, URL 수정 필요 — 하단 안내 참고)]  (원본: sql/matching_expiry_auto_refund.sql)
-- ==============================================================================

-- ============================================================================
-- 48시간 미매칭 자동 취소 + 100% 환불 (apply.html 안심 문구에 대응하는 백엔드 로직)
--
--   정책: 결제 완료(MATCHING_PENDING 진입) 후 48시간이 지나도 매니저가 배정되지 않으면(manager_id
--   여전히 null) 신청을 자동 취소하고 결제금액을 100% 환불합니다.
--
--   service_applications 상태값에 'EXPIRED_CANCELLED' 를 새로 추가합니다(표준 4종은
--   sql/service_application_status_standardization.sql 참고) — 사용자가 직접 취소한 CANCELLED/
--   미입금 만료(cancel_unpaid_application/cancel_expired_virtual_accounts)와 구분해, "결제까지는
--   끝났는데 매칭이 안 돼서 환불된 건"만 따로 식별할 수 있게 합니다.
--
--     PAYMENT_PENDING → MATCHING_PENDING → MATCHED
--                                        ↘ EXPIRED_CANCELLED (48시간 초과 미매칭, 이 파일)
--
--   결제 여부/환불 여부는 새 컬럼 service_applications.payment_status 로 추적합니다(PAID/REFUNDED).
--   virtual_accounts 테이블과 달리 "즉시결제(카드 등)"도 있어 신청서 쪽에 바로 둡니다.
--
--   왜 순수 SQL(pg_cron)만으로 끝나지 않는가: sql/payment_confirmation_functions.sql 의
--   cancel_expired_virtual_accounts() 는 "입금 전" 건을 쓸어가므로 PortOne 쪽에 아직 돈이 없어
--   DB 상태만 바꾸면 끝입니다. 반면 이 파일이 다루는 건 이미 결제가 승인된(MATCHING_PENDING) 건이라,
--   실제로 PortOne에 환불(결제 취소) API를 호출해야 "100% 자동 환불" 문구가 거짓이 되지 않습니다.
--   그래서:
--     1) 이 파일 : 대상 조회 함수 + 상태 전환 함수(DB)
--     2) supabase/functions/cancel-expired-applications : 대상을 조회해 PortOne 환불을 호출하고,
--        성공한 건만 위 상태 전환 함수를 호출한 뒤 Resend로 환불 완료 안내 메일까지 보내는 Edge Function
--     3) 맨 아래 pg_cron+pg_net 스케줄 : 그 Edge Function을 주기적으로 깨움
--
--   Edge Function 쪽에 필요한 환경변수(Supabase 대시보드 → Edge Functions → Secrets):
--     PORTONE_API_SECRET   : 이미 issue-virtual-account 등에서 쓰고 있다면 그대로 재사용됩니다.
--     RESEND_API_KEY        : Resend 콘솔에서 발급받은 API 키.
--     RESEND_FROM_EMAIL     : Resend에서 DNS 도메인 인증까지 끝낸 발신 주소(예: '위드브릿지 <no-reply@withbridge.co.kr>').
--                              이 값이 없으면 메일 발송이 실패합니다(_shared/resend.ts 참고) — 환불/상태
--                              전환 자체는 메일 발송 성공 여부와 무관하게 이미 끝난 뒤이므로 영향받지 않습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/payment_confirmation_functions.sql →
--   sql/welcome_coupons.sql → sql/user_points.sql → sql/user_coupons_checkout.sql → 이 파일.
--   (이 파일이 mark_payment_matching_pending/admin_confirm_manual_payment 를 다시 create or replace
--   하므로, 쿠폰/적립금 스크립트보다 반드시 나중에 실행해야 그 로직이 덮어써지지 않습니다 — 아래 두 함수
--   본문에 쿠폰/적립금 로직을 합쳐 넣어 둔 것도 이 순서가 지켜지지 않을 경우를 대비한 것입니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
--    payment_status: 결제/환불 여부 표시용. 기존 행은 전부 null(이 정책 도입 이전 데이터라 추적 안 함).
--      PAID     : mark_payment_matching_pending/admin_confirm_manual_payment 가 설정(결제 승인 완료)
--      REFUNDED : expire_unmatched_application() 이 설정(48시간 초과 자동 환불 완료)
--    matching_started_at: MATCHING_PENDING 으로 전환된 시점 — 48시간 카운트 시작점으로 씁니다
--      (신청서 작성 시각이 아니라 "결제가 끝나서 매칭 대기가 시작된" 시각이 기준입니다).
--    payment_key: PortOne 결제의 실제 transactionId(결제사/PG 쪽 영수증 식별자 — paymentId 는 이미
--      service_applications.id 와 같은 값이라 별도로 저장할 필요가 없지만, transactionId 는 환불 API
--      호출이나 고객센터 문의 대응 시 참조할 PG 쪽 거래번호라 따로 보관해 둡니다). 카드 등 즉시결제는
--      issue-virtual-account 가, 가상계좌 입금 확인은 portone-webhook 이 PortOne 재조회 결과에서 채웁니다.
--    refunded_at: payment_status 가 'REFUNDED' 로 바뀐 시점(expire_unmatched_application()의 48시간
--      자동환불, admin_mark_refund_completed()의 관리자 수동 환불 완료 처리 둘 다 여기서 채웁니다) —
--      mypage.html 이 "환불 완료 후 7일 이내"인 건만 '진행 중인 케어' 탭 상단 안내 배너로 보여주는 데 씁니다
--      (payment_status 하나만으로는 "언제" 환불됐는지 몰라 그 7일 기준을 잴 수 없었습니다).
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists payment_status text;
alter table public.service_applications add column if not exists matching_started_at timestamptz;
alter table public.service_applications add column if not exists payment_key text;
alter table public.service_applications add column if not exists refunded_at timestamptz;

-- 배치(list_expired_unmatched_applications)가 매번 전체 스캔하지 않도록
create index if not exists service_applications_matching_pending_idx
  on public.service_applications (matching_started_at)
  where status = 'MATCHING_PENDING' and manager_id is null;


-- ----------------------------------------------------------------------------
-- 2) 결제 승인 시점에 payment_status / matching_started_at 도 같이 채우도록 기존 함수 재정의
--    (상태 전환 조건·멱등 처리는 기존 로직과 동일하게 유지하고, set 절만 추가합니다)
--
--    ⚠ sql/user_coupons_checkout.sql 이 이 함수에 추가했던 쿠폰 검증/사용 처리 + 적립금 차감 +
--    선택 추가 옵션(addon_total) 반영 로직을 여기서도 반드시 그대로 들고 와야 합니다 — create or
--    replace 로 함수를 다시 정의하는 거라, 이 파일을 나중에 실행하면 그 로직 없이 함수가 "되돌아가"
--    버립니다. (실제로 이 파일이 한동안 addon_total 을 빼놓은 채 배포돼 있어서, 선택 추가 옵션을 고른
--    결제가 전부 AMOUNT_MISMATCH 로 막혔던 사고가 있었습니다 — "expected=50000, paid=60000"처럼
--    옵션 금액 10,000원만큼 정확히 차이 나는 게 이 버그의 특징입니다. 나중에 이 함수를 또 고칠 일이
--    생기면 price/addon/coupon/points 네 가지를 전부 그대로 들고 와야 합니다.)
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app             public.service_applications;
  v_price           integer;
  v_addon_total     integer;
  v_coupon_discount integer;
  v_coupon_valid    boolean;
  v_points_to_use   integer;
  v_discount        integer;
  v_expected        integer;
  v_balance         integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    return v_app; -- 이미 처리됨(멱등)
  end if;

  -- 쿠폰: 지금 이 순간에도 "이 사람 것 + 아직 유효(active, 미만료)" 인지 다시 확인
  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  -- 적립금: 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price + v_addon_total - v_discount;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, addon=%, coupon=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_addon_total, v_coupon_discount, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리, 쿠폰 사용 처리, 적립금 차감, 확정 금액 기록을 실행합니다.
  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now()
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      raise warning '[mark_payment_matching_pending] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, public.expected_service_price(v_app.service_type)) + v_addon_total - v_discount,
         payment_key = coalesce(p_payment_key, payment_key)
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;

-- admin_confirm_manual_payment() 정의는 sql/admin_manual_payment_telegram_notify.sql 로 옮겼습니다
-- (쿠폰/적립금 차감 + 텔레그램 알림까지 포함한 최종 버전). 이 파일에서 다시 정의하면 — create or replace
-- 특성상 나중에 실행되는 쪽이 이기므로 — 그 파일의 텔레그램 알림이 조용히 사라지는 회귀가 실제로
-- 발생했던 적이 있습니다. 이 함수는 이제 그 파일에서만 정의합니다.


-- ----------------------------------------------------------------------------
-- 3) 48시간 초과 미매칭 건 조회 — supabase/functions/cancel-expired-applications 가 호출해
--    대상 목록을 가져간 뒤, 건마다 PortOne 환불 API를 호출합니다. service_role 전용(service_role 은
--    revoke 와 무관하게 항상 호출 가능).
-- ----------------------------------------------------------------------------
create or replace function public.list_expired_unmatched_applications()
returns setof public.service_applications
language sql security definer set search_path = public as $$
  select *
    from public.service_applications
   where status = 'MATCHING_PENDING'
     and manager_id is null
     and matching_started_at is not null
     and matching_started_at < now() - interval '48 hours';
$$;

revoke all on function public.list_expired_unmatched_applications() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4) 상태 전환 — PortOne 환불 API 호출이 성공한 건에 대해서만 Edge Function이 이 함수를 호출합니다.
--    MATCHING_PENDING + manager_id is null 조건을 다시 확인해(멱등 + 그 사이 매칭이 됐으면 보호),
--    환불 호출과 DB 전환 사이에 매니저가 배정돼 버린 경우를 되돌리지 않습니다.
--    p_refund_ref: PortOne 환불 응답의 cancellation id 등 참조값(고객센터 문의 대비 보관, 선택).
-- ----------------------------------------------------------------------------
create or replace function public.expire_unmatched_application(
  p_application_id uuid,
  p_refund_ref text default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  update public.service_applications
     set status = 'EXPIRED_CANCELLED',
         payment_status = 'REFUNDED',
         refunded_at = now()
   where id = p_application_id
     and status = 'MATCHING_PENDING'
     and manager_id is null
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- 이미 매칭됐거나 다른 상태로 넘어간 건에 대한 재호출 — 에러 없이 현재 행을 그대로 돌려줍니다(멱등).
    return v_app;
  end if;

  update public.virtual_accounts
     set pg_payment_ref = coalesce(p_refund_ref, pg_payment_ref)
   where application_id = p_application_id;

  return v_app;
end $$;

revoke all on function public.expire_unmatched_application(uuid, text) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) pg_cron + pg_net — supabase/functions/cancel-expired-applications 를 30분마다 깨웁니다.
--    서비스 role 키를 SQL에 평문으로 남기지 않기 위해 Supabase Vault에 저장한 값을 참조합니다.
--
-- ⚠ 2026-10-15 점검 결과: 이 cron job 은 실제로 스케줄은 등록돼 있었지만 (1) url 의 '<PROJECT_REF>'가
--    끝까지 실제 값으로 바뀌지 않았고 (2) 아래 vault.create_secret() 가 한 번도 실행되지 않아서,
--    30분마다 계속 실패만 하고 있었습니다 — 즉 "48시간 자동 환불" 안심 문구(apply.html)가 실제로는
--    전혀 동작하지 않는 상태였습니다. url 은 이번에 바로 고쳤습니다(아래 실제 프로젝트 ref로 교체 완료).
--    vault.create_secret() 은 service_role 키 평문이 필요해 제가 대신 실행할 수 없으니, 아래 안내대로
--    Supabase SQL Editor에서 꼭 한 번 실행해 주세요 — 그래야 이 cron이 실제로 환불을 수행합니다.
--
--    최초 1회, Supabase SQL Editor에서 아래를 실행해 키를 보관하세요(이미 저장했다면 건너뛰기):
--      select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY 값>', 'service_role_key');
--    (SUPABASE_SERVICE_ROLE_KEY 값은 Supabase 대시보드 → Project Settings → API → service_role 키)
--
--    pg_cron/pg_net 확장이 이 프로젝트 플랜에서 꺼져 있으면 extension 생성 문에서 에러가 날 수 있습니다—
--    그 경우 이 블록만 건너뛰고(1~4의 DB 함수는 pg_cron과 무관하게 바로 쓸 수 있습니다), Supabase
--    대시보드 → Database → Extensions 에서 pg_cron/pg_net 을 켠 뒤 다시 실행하거나, 외부 스케줄러
--    (예: GitHub Actions cron)로 같은 URL을 주기적으로 POST 하도록 대체하세요.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'expire-unmatched-applications';
select cron.schedule(
  'expire-unmatched-applications',
  '*/30 * * * *',
  $$
  select net.http_post(
    -- >>> DEV_PROJECT_URL 로 교체 <<< 바로 아래 줄은 지금 프로덕션 프로젝트 주소입니다.
    -- Dev 프로젝트의 Project Settings → API → Project URL 로 바꾼 뒤 /functions/v1/cancel-expired-applications 를 그대로 붙이세요.
    url := 'https://layvjisfeivkzowopkco.supabase.co/functions/v1/cancel-expired-applications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ----------------------------------------------------------------------------
-- 6) admin_mark_refund_completed() — admin.html '취소된 신청 내역' 카드의 [환불 완료 처리] 버튼.
--    보호자 자가취소(cancel_my_application)/관리자 취소(admin.js cancelApplication, status 만 CANCELLED
--    로 바꿈)는 둘 다 PG 환불까지는 자동으로 하지 않으므로, 결제까지 끝난 뒤(payment_status='PAID')
--    취소된 건은 "PG 콘솔에서 수동 환불 → 여기서 완료 처리" 두 단계가 필요합니다. 이 함수는 그 두 번째
--    단계만 담당합니다 — PG 환불 자체는 이 함수가 호출하지 않고, 관리자가 PG사 콘솔에서 이미 환불을
--    마쳤다는 걸 스스로 확인한 뒤 누르는 것을 전제로 합니다.
--    payment_status='PAID' + status 가 취소류(CANCELLED/EXPIRED_CANCELLED)인 행만 대상으로 삼아(이미
--    REFUNDED 거나, 결제 전에 취소돼 환불할 돈이 없는 건, 아직 취소되지 않은 건은 전부 걸러집니다),
--    grant update(...) 로 열어 둔 (manager_id, status) 컬럼에 payment_status 를 추가하는 대신(그러면
--    관리자가 임의 행의 payment_status 를 아무 값으로나 바꿀 수 있게 됨) SECURITY DEFINER 함수로
--    "이 전환 하나만" 허용합니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_mark_refund_completed(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.service_applications
     set payment_status = 'REFUNDED',
         refunded_at = now()
   where id = p_application_id
     and payment_status = 'PAID'
     and status in ('CANCELLED', 'EXPIRED_CANCELLED')
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- 이미 환불 완료 처리됐거나(멱등 재클릭), 애초에 환불 대상이 아닌 건(결제 전 취소/아직 미취소) —
    -- 둘 다 "지금 바꿀 게 없다"는 뜻이라 에러 대신 현재 행을 그대로 돌려줍니다.
    return v_app;
  end if;

  return v_app;
end $$;

revoke all on function public.admin_mark_refund_completed(uuid) from public, anon;
grant  execute on function public.admin_mark_refund_completed(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [12. 케어 중단 시 부분 환불/패키지 조정]  (원본: sql/care_interruption_refund_system.sql)
-- ==============================================================================

-- ============================================================================
-- 케어 중단/현장 이슈 처리 — 부분 환불(출장비 차감) + 패키지 회차 조정 + 현장 이슈 접수 + 처리 이력
--
--   서류 미비, 어르신 진료 거부, 보호자 사정 등으로 현장에서 케어가 중단됐을 때:
--     1) 일반 결제 건 : 관리자가 출장비(위약금)만 남기고 나머지를 PortOne으로 부분 취소합니다
--        (supabase/functions/cancel-payment 가 PortOne API 를 호출한 뒤에만 이 파일의
--        admin_apply_partial_refund() 를 호출 — 돈이 실제로 돌아간 뒤에만 DB를 바꾸는, 이 프로젝트
--        전체에 깔린 원칙과 동일합니다).
--     2) 패키지로 접수된 건 : PortOne 결제 자체가 없으므로(이미 선결제된 회차를 차감했을 뿐) 그
--        회차를 되돌려주는 것으로 처리합니다 — admin_adjust_package_session() 이 user_packages 를
--        직접 조정합니다(PortOne 호출 없음).
--   두 경우 모두 care_schedules 를 'completed' 로 닫아(진행 중 목록에서 제거) 70:30 정산 집계가
--   남은 값(출장비 또는 0.5회분 가치)만으로 다시 계산되게 하고, admin_care_adjustments 테이블에
--   사유 메모와 함께 이력을 남깁니다.
--
--   보호자 쪽 "현장 이슈 발생/긴급 문의"(mypage.html)는 care_issue_reports 에 접수만 하고(실시간
--   알림톡 연동은 카카오 비즈니스 계정이 없어 이 작업에서는 구현하지 않음 — TODO 로 표시), 관리자
--   콘솔에 새 "현장 이슈 접수" 카드로 노출해 운영자가 확인하고 위 1)/2) 처리로 이어가게 합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/payment_confirmation_functions.sql(expected_service_price()) →
--             sql/matching_expiry_auto_refund.sql(payment_status/refunded_at 컬럼) →
--             sql/manager_settlement_70_30.sql(payment_amount/manager_payout + 70:30 트리거) →
--             sql/user_packages_system.sql(user_packages/package_id/is_package_used) → 이 파일.
-- ============================================================================


-- ============================================================================
-- 1) service_applications 확장 — 부분 환불 금액/사유
-- ============================================================================
alter table public.service_applications add column if not exists refund_amount integer;
alter table public.service_applications add column if not exists refund_memo   text;
-- refunded_at, payment_status 는 sql/matching_expiry_auto_refund.sql 에서 이미 추가되어 있습니다
-- (이 파일에서는 payment_status/status 에 'PARTIALLY_REFUNDED' 값만 새로 쓰기 시작합니다 — 두 컬럼
-- 모두 하드 CHECK 제약이 없는 자유 텍스트라 스키마 변경 없이 바로 쓸 수 있습니다).

alter table public.service_applications drop constraint if exists service_applications_refund_amount_check;
alter table public.service_applications add constraint service_applications_refund_amount_check
  check (refund_amount is null or refund_amount >= 0);


-- ============================================================================
-- 2) user_packages.remaining_count/total_count — 0.5회 단위 조정을 지원하기 위해 numeric 으로 확장
--    (지금까지는 정수만 허용했습니다 — sql/user_packages_system.sql)
--
--    user_packages_sync_status 트리거(sql/user_packages_system.sql)가 "update of remaining_count" 로
--    그 컬럼에 의존하고 있어, Postgres는 ALTER COLUMN ... TYPE 을 바로 허용하지 않습니다
--    (ERROR 0A000: cannot alter type of column used in a trigger definition). 그래서 트리거를 먼저
--    지우고, 두 컬럼 타입을 바꾼 뒤, 같은 정의로 다시 만듭니다 — sql/user_packages_system.sql 의
--    원본과 정확히 같은 트리거/함수라 동작은 전혀 바뀌지 않습니다.
-- ============================================================================
drop trigger if exists user_packages_sync_status on public.user_packages;

alter table public.user_packages alter column total_count     type numeric(5,1) using total_count::numeric(5,1);
alter table public.user_packages alter column remaining_count type numeric(5,1) using remaining_count::numeric(5,1);
-- 기존 체크 제약(총 횟수>0, 잔여>=0, 잔여<=총)은 컬럼 타입과 무관하게 그대로 유효하므로 다시 만들
-- 필요가 없습니다.

create trigger user_packages_sync_status
  before insert or update of remaining_count on public.user_packages
  for each row execute function public.sync_user_package_status();


-- ============================================================================
-- 3) 처리 이력 — 모든 부분 환불/패키지 조정에 사유 메모와 함께 기록합니다(요구사항 3).
-- ============================================================================
create table if not exists public.admin_care_adjustments (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.service_applications(id) on delete set null,
  schedule_id    uuid references public.care_schedules(id) on delete set null,
  admin_id       uuid references public.profiles(id),
  action_type    text not null check (action_type in ('partial_refund', 'package_restore', 'package_partial_deduct')),
  amount         numeric(10,2) not null, -- 환불 건은 원화 금액, 패키지 건은 회차(1 또는 0.5)
  memo           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists admin_care_adjustments_application_idx
  on public.admin_care_adjustments (application_id);

alter table public.admin_care_adjustments enable row level security;

drop policy if exists admin_care_adjustments_select_admin on public.admin_care_adjustments;
create policy admin_care_adjustments_select_admin on public.admin_care_adjustments
  for select to authenticated using (public.is_admin());

-- insert/update/delete 는 전부 아래 SECURITY DEFINER 함수를 통해서만 — 관리자도 이 표를 직접 손으로
-- 고치지 못하게 해 이력이 사후에 조작되지 않도록 합니다.
revoke insert, update, delete on public.admin_care_adjustments from anon, authenticated;
grant  select on public.admin_care_adjustments to authenticated;
revoke select on public.admin_care_adjustments from anon;


-- ============================================================================
-- 4) 일반 결제 건 — 부분 취소(출장비 차감 환불) 반영
--    supabase/functions/cancel-payment 가 PortOne 부분 취소 API 호출에 성공한 뒤에만 호출합니다.
--    p_refund_amount : 보호자에게 실제로 돌아간 금액(PortOne 취소 금액)
--    p_retained_amount : 회사/매니저가 남긴 금액(출장비 등) — care_schedules.payment_amount 에
--      반영되어 70:30 트리거가 그 금액만으로 manager_payout/platform_fee 를 다시 계산합니다.
-- ============================================================================
drop function if exists public.admin_apply_partial_refund(uuid, integer, integer, text);

create or replace function public.admin_apply_partial_refund(
  p_schedule_id     uuid,
  p_refund_amount   integer,
  p_retained_amount integer,
  p_memo            text
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row   public.care_schedules;
  v_next  text;
  v_admin uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_refund_amount is null or p_refund_amount < 0 then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023';
  end if;
  if p_retained_amount is null or p_retained_amount < 0 then
    raise exception 'INVALID_RETAINED_AMOUNT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_memo), '') = '' then
    raise exception 'MEMO_REQUIRED' using errcode = '22004';
  end if;

  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status = 'completed' then
    raise exception 'SCHEDULE_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  v_admin := auth.uid();

  -- 결제액을 "실제로 남긴 금액(출장비 등)"으로 맞춥니다 — 트리거(compute_manager_settlement_split,
  -- sql/manager_settlement_70_30.sql)가 바로 70%/30% 를 다시 계산합니다.
  update public.care_schedules
     set payment_amount = p_retained_amount
   where id = p_schedule_id
  returning * into v_row;

  -- 남은 단계를 순서대로 밀어 'completed' 로 닫습니다(admin_force_complete_care() 와 같은 패턴,
  -- sql/admin_care_actions.sql) — 중단된 케어를 '진행 중' 목록에 남기지 않고 정산 집계에 포함시킵니다.
  while v_row.status is distinct from 'completed' loop
    v_next := case v_row.status
      when 'pending'        then 'assigned'
      when 'assigned'       then 'departed'
      when 'departed'       then 'arrived'
      when 'arrived'        then 'treatment_done'
      when 'treatment_done' then 'returning'
      when 'returning'      then 'completed'
      else null
    end;
    if v_next is null then
      raise exception 'CANNOT_CLOSE_FROM_STATUS' using errcode = 'P0001';
    end if;
    update public.care_schedules set status = v_next where id = v_row.id returning * into v_row;
  end loop;

  if v_row.application_id is not null then
    update public.service_applications
       set status = 'PARTIALLY_REFUNDED',
           payment_status = 'PARTIALLY_REFUNDED',
           refund_amount = p_refund_amount,
           refund_memo = p_memo,
           refunded_at = now()
     where id = v_row.application_id;
  end if;

  insert into public.admin_care_adjustments (application_id, schedule_id, admin_id, action_type, amount, memo)
  values (v_row.application_id, p_schedule_id, v_admin, 'partial_refund', p_refund_amount, p_memo);

  return v_row;
end $$;

revoke all on function public.admin_apply_partial_refund(uuid, integer, integer, text) from public, anon, authenticated;


-- ============================================================================
-- 5) 패키지 결제 건 — 회차 원복(+1회) 또는 0.5회 부분 차감 처리
--    PortOne 결제가 없는 건이라(이미 선결제된 회차를 차감했을 뿐) 외부 API 호출 없이 바로 처리합니다.
--    p_restore_amount 는 반드시 0.5 또는 1 이어야 합니다:
--      1   : 회차를 완전히 돌려줍니다(아무 서비스도 제공되지 못한 경우) — care_schedules.payment_amount
--            를 0으로 맞춰 이 건에 대한 매니저 정산금도 0이 됩니다.
--      0.5 : 절반만 돌려줍니다(일부라도 현장에 나가 대응한 경우) — care_schedules.payment_amount 를
--            서비스 정가의 절반으로 맞춰, 매니저가 그 절반에 대한 70% 만큼은 정산받습니다.
-- ============================================================================
drop function if exists public.admin_adjust_package_session(uuid, numeric, text);

create or replace function public.admin_adjust_package_session(
  p_application_id uuid,
  p_restore_amount numeric,
  p_memo text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_app          public.service_applications;
  v_pkg          public.user_packages;
  v_schedule_id  uuid;
  v_schedule     public.care_schedules;
  v_next         text;
  v_full_price   integer;
  v_new_payment  integer;
  v_admin        uuid;
  v_action       text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_restore_amount is null or p_restore_amount not in (0.5, 1) then
    raise exception 'INVALID_RESTORE_AMOUNT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_memo), '') = '' then
    raise exception 'MEMO_REQUIRED' using errcode = '22004';
  end if;

  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_app.is_package_used or v_app.package_id is null then
    raise exception 'NOT_A_PACKAGE_BOOKING' using errcode = 'P0001';
  end if;

  v_admin := auth.uid();
  v_action := case when p_restore_amount = 1 then 'package_restore' else 'package_partial_deduct' end;

  update public.user_packages
     set remaining_count = least(remaining_count + p_restore_amount, total_count)
   where id = v_app.package_id
  returning * into v_pkg;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select id into v_schedule_id from public.care_schedules where application_id = p_application_id;

  if v_schedule_id is not null then
    v_full_price := coalesce(public.expected_service_price(v_app.service_type), 0);
    v_new_payment := case when p_restore_amount = 1 then 0 else round(v_full_price * 0.5)::integer end;

    update public.care_schedules set payment_amount = v_new_payment where id = v_schedule_id
    returning * into v_schedule;

    while v_schedule.status is distinct from 'completed' loop
      v_next := case v_schedule.status
        when 'pending'        then 'assigned'
        when 'assigned'       then 'departed'
        when 'departed'       then 'arrived'
        when 'arrived'        then 'treatment_done'
        when 'treatment_done' then 'returning'
        when 'returning'      then 'completed'
        else null
      end;
      if v_next is null then
        raise exception 'CANNOT_CLOSE_FROM_STATUS' using errcode = 'P0001';
      end if;
      update public.care_schedules set status = v_next where id = v_schedule.id returning * into v_schedule;
    end loop;
  end if;

  update public.service_applications
     set status = 'PARTIALLY_REFUNDED',
         refund_memo = p_memo,
         refunded_at = now()
   where id = p_application_id;

  insert into public.admin_care_adjustments (application_id, schedule_id, admin_id, action_type, amount, memo)
  values (p_application_id, v_schedule_id, v_admin, v_action, p_restore_amount, p_memo);

  return v_pkg;
end $$;

revoke all on function public.admin_adjust_package_session(uuid, numeric, text) from public, anon, authenticated;
grant  execute on function public.admin_adjust_package_session(uuid, numeric, text) to authenticated;


-- ============================================================================
-- 6) 현장 이슈 접수 (mypage.html '현장 이슈 발생 / 긴급 문의' 버튼)
--    실시간 알림(카카오 알림톡 등)은 비즈니스 발신프로필·템플릿 승인이 필요한 외부 연동이라 이번
--    작업에서는 구현하지 않습니다 — 대신 관리자 콘솔에 즉시 노출되는 조회 큐로 받습니다(아래 8번).
-- ============================================================================
create table if not exists public.care_issue_reports (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.service_applications(id) on delete cascade,
  schedule_id    uuid references public.care_schedules(id) on delete set null,
  user_id        uuid references public.profiles(id),
  issue_type     text not null check (issue_type in ('documents_missing', 'health_refusal', 'other')),
  detail         text,
  status         text not null default 'open' check (status in ('open', 'resolved')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists care_issue_reports_open_idx
  on public.care_issue_reports (created_at) where status = 'open';

alter table public.care_issue_reports enable row level security;

-- 보호자: 본인이 접수한 이슈만 조회, 본인 신청에 대해서만 insert(허위로 남의 신청에 이슈를 걸 수 없게)
drop policy if exists care_issue_reports_select_own on public.care_issue_reports;
create policy care_issue_reports_select_own on public.care_issue_reports
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.service_applications a
      where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
    )
  );

drop policy if exists care_issue_reports_insert_own on public.care_issue_reports;
create policy care_issue_reports_insert_own on public.care_issue_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.service_applications a
      where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
    )
  );

-- 관리자: 전체 조회 + 처리 완료 표시
drop policy if exists care_issue_reports_select_admin on public.care_issue_reports;
create policy care_issue_reports_select_admin on public.care_issue_reports
  for select to authenticated using (public.is_admin());

grant select, insert on public.care_issue_reports to authenticated;
revoke select, insert on public.care_issue_reports from anon;


-- ----------------------------------------------------------------------------
-- 7) 관리자: 현장 이슈 처리 완료 표시
-- ----------------------------------------------------------------------------
create or replace function public.admin_resolve_care_issue(p_issue_id uuid)
returns public.care_issue_reports
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_issue_reports;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.care_issue_reports
     set status = 'resolved', resolved_at = now()
   where id = p_issue_id
     and status = 'open'
  returning * into v_row;

  if not found then
    select * into v_row from public.care_issue_reports where id = p_issue_id;
    if v_row.id is null then
      raise exception 'ISSUE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_row;
end $$;

revoke all on function public.admin_resolve_care_issue(uuid) from public, anon;
grant  execute on function public.admin_resolve_care_issue(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [12a. 현장 이슈 접수(매니저 경로 확장)]  (원본: sql/care_issue_reports_manager_reporting.sql)
-- ==============================================================================

-- ============================================================================
-- '현장 이슈 발생 / 긴급 문의' 접수를 보호자 마이페이지(mypage.html)에서 케어 매니저 마이페이지
-- (mypage-manager.html)로 옮기면서, care_issue_reports 의 RLS가 "신청서의 보호자 본인
-- (service_applications.user_id = auth.uid())"만 insert/select 할 수 있게 짜여 있던 것을 매니저도
--쓸 수 있게 확장합니다 — 그대로 두면 매니저가 접수를 눌러도 RLS 위반(42501)으로 전부 막힙니다.
--
--   reporter_role 컬럼을 추가해 "누가 접수했는지"(guardian/manager)를 명시적으로 남깁니다 — 기존
--   행은 전부 보호자가 접수한 것이므로 default 'guardian'으로 백필됩니다. 어드민 콘솔(admin.js)이
--   이 값으로 "보호자 접수"/"매니저 접수" 배지를 구분해 보여줍니다.
--
--   보호자 쪽 UI는 이제 이 기능을 쓰지 않지만(운영팀 문의 안내로 대체), DB 정책 자체는 지우지 않고
--   매니저 경로를 OR로 추가만 합니다 — 혹시 남아있는 다른 경로(또는 나중에 되돌릴 경우)를 깨지
--   않기 위함입니다.
-- ============================================================================

alter table public.care_issue_reports
  add column if not exists reporter_role text not null default 'guardian'
    check (reporter_role in ('guardian', 'manager'));

drop policy if exists care_issue_reports_select_own on public.care_issue_reports;
create policy care_issue_reports_select_own on public.care_issue_reports
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.service_applications a
      where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.care_schedules cs
      where cs.id = care_issue_reports.schedule_id and cs.manager_id = auth.uid()
    )
  );

drop policy if exists care_issue_reports_insert_own on public.care_issue_reports;
create policy care_issue_reports_insert_own on public.care_issue_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.service_applications a
        where a.id = care_issue_reports.application_id and a.user_id = auth.uid()
      )
      or exists (
        select 1 from public.care_schedules cs
        where cs.id = care_issue_reports.schedule_id and cs.manager_id = auth.uid()
      )
    )
  );

-- select_admin 정책(전체 조회)은 그대로 유지 — 변경 없음.

notify pgrst, 'reload schema';


-- ==============================================================================
-- [13. 보호자 만족도 평가]  (원본: sql/care_reviews.sql)
-- ==============================================================================

-- ============================================================================
-- care_reviews : 보호자가 케어 리포트 모달에서 남기는 만족도 평가(별점 1~5 + 선택 리뷰)
--
--   mypage.html 의 '만족도 평가' 패널(careReportViewRatePanel)은 지금까지 세션 한정(새로고침하면
--   초기화)으로만 동작했습니다 — 이 테이블이 그 백엔드입니다. care_schedules 에 rating/review 컬럼을
--   바로 추가하지 않고 별도 테이블로 분리한 이유: care_schedules 는 지금 매니저만 UPDATE 할 수 있고
--   (care_schedules_update_own, manager_id = auth.uid()) 보호자용 UPDATE 정책이 전혀 없습니다 — 보호자가
--   평가를 쓸 수 있게 하려고 거기에 새 UPDATE 정책을 추가하면, 그 정책이 의도와 달리 payment_amount 같은
--   다른 컬럼까지 보호자가 바꿀 수 있는 문을 여는 위험이 있습니다. care_reports(매니저가 쓰는 리포트)와
--   똑같은 패턴으로 완전히 분리된 테이블 + 좁게 스코프된 RLS 정책을 쓰는 쪽이 안전합니다.
--
--   조회 측 연동:
--     - 관리자: admin_manager_monthly_settlement_details() RPC(sql/admin_settlement_detail_rpc.sql)에
--       rating/review_text 를 추가해, 매니저 정산 상세 모달에서 바로 보입니다.
--     - 매니저: mypage-manager.html 이 care_schedules 를 읽을 때 PostgREST 리소스 임베딩으로
--       care_reviews(rating, review_text) 를 함께 받습니다(schedule_id 가 UNIQUE FK라 1:1로 임베딩됨).
-- ============================================================================

create table if not exists public.care_reviews (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references public.care_schedules(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  review_text text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.care_reviews enable row level security;

drop policy if exists care_reviews_select on public.care_reviews;
drop policy if exists care_reviews_insert_own on public.care_reviews;
drop policy if exists care_reviews_update_own on public.care_reviews;

-- 조회: (1) 이 케어의 보호자 본인, (2) 담당 매니저, (3) 관리자 — 셋 중 하나면 볼 수 있습니다.
create policy care_reviews_select on public.care_reviews
  for select to authenticated using (
    public.is_my_care_schedule_id(schedule_id)
    or exists (select 1 from public.care_schedules s where s.id = schedule_id and s.manager_id = auth.uid())
    or public.is_admin()
  );

-- 작성: 이 케어의 보호자 본인만, 그리고 그 케어가 'completed' 로 끝난 뒤에만 (케어 완료 전에 미리
-- 평가를 남길 수 없게 — mypage.html 카드 흐름상 리포트 모달 자체가 완료 후에만 열리지만, DB 단에서도
-- 한 번 더 막아 둡니다).
create policy care_reviews_insert_own on public.care_reviews
  for insert to authenticated with check (
    public.is_my_care_schedule_id(schedule_id)
    and exists (select 1 from public.care_schedules s where s.id = schedule_id and s.status = 'completed')
  );

-- 수정: 이 케어의 보호자 본인만 자신이 남긴 평가를 고칠 수 있습니다(별점을 잘못 눌렀을 때 재제출 등).
create policy care_reviews_update_own on public.care_reviews
  for update to authenticated using (public.is_my_care_schedule_id(schedule_id))
  with check (public.is_my_care_schedule_id(schedule_id));

revoke all on public.care_reviews from public, anon;
grant select, insert, update on public.care_reviews to authenticated;
-- delete 는 의도적으로 안 엽니다 — 평가를 지우고 싶으면(드묾) 관리자가 직접 처리합니다.

create index if not exists care_reviews_schedule_id_idx on public.care_reviews(schedule_id);


-- ============================================================================
-- admin_manager_monthly_settlement_details() 에 rating/review_text 추가 — 매니저 정산 상세 모달에서
-- "이 케어, 보호자가 몇 점을 줬는지"를 바로 볼 수 있게 합니다. WHERE 조건은 손대지 않습니다(완료 건수/
-- 금액 집계 기준에는 영향 없음) — SELECT 목록에 care_reviews 좌측 조인만 추가합니다.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlement_details(date, uuid);

create or replace function public.admin_manager_monthly_settlement_details(p_month date, p_manager_id uuid)
returns table (
  schedule_id    uuid,
  service_type   text,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  payment_amount bigint,
  manager_payout bigint,
  rating         smallint,
  review_text    text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;
  if p_manager_id is null then
    raise exception 'MANAGER_REQUIRED' using errcode = '22004';
  end if;

  return query
    select
      cs.id,
      sa.service_type,
      cs.scheduled_at,
      cs.completed_at,
      coalesce(cs.payment_amount, 0)::bigint,
      coalesce(cs.manager_payout, 0)::bigint,
      cr.rating,
      cr.review_text
    from public.care_schedules cs
    left join public.service_applications sa on sa.id = cs.application_id
    left join public.care_reviews cr on cr.schedule_id = cs.id
   where cs.status = 'completed'
     and cs.manager_id = p_manager_id
     and cs.completed_at is not null
     and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
       = date_trunc('month', p_month::timestamp)
     and not exists (
       select 1 from public.service_applications x
        where x.id = cs.application_id
          and (x.status in ('CANCELLED', 'EXPIRED_CANCELLED') or x.payment_status = 'REFUNDED')
     )
   order by cs.completed_at desc;
end $$;

revoke all on function public.admin_manager_monthly_settlement_details(date, uuid) from public, anon;
grant  execute on function public.admin_manager_monthly_settlement_details(date, uuid) to authenticated;

notify pgrst, 'reload schema';


-- ==============================================================================
-- [13a. 정산 버그 수정 3차(취소/환불 건 제외)]  (원본: sql/admin_settlement_fixes_v3.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자 정산(매니저 월별) — 취소/환불된 건이 완료 건수로 잘못 집계되는 버그 수정
--
--   실제 원인: admin_manager_monthly_settlements() 는 처음부터 care_schedules.status = 'completed'
--   만 보고 있었지만(sql/admin_settlement_fixes_v2.sql), 그건 "그 케어가 끝까지 수행됐는지"만 알려줄
--   뿐 "그 건의 결제가 나중에 취소/환불됐는지"는 care_schedules 에 전혀 반영되지 않습니다 — 취소/환불은
--   오직 service_applications.status('CANCELLED'/'EXPIRED_CANCELLED')·payment_status('REFUNDED') 에만
--   기록되고(guardian_cancel_application.sql, payment_confirmation_functions.sql,
--   service_application_status_standardization.sql, admin.js cancelApplication/
--   admin_mark_refund_completed), 그 어떤 기존 취소/환불 경로도 연결된 care_schedules 행의 status나
--   payment_amount 를 되돌리지 않습니다. 그래서 "케어는 끝까지 수행된 뒤 나중에(예: 보호자 분쟁,
--   중복결제 등으로) 취소·환불된" 건은 care_schedules.status 가 여전히 'completed' 로 남아 있고,
--   기존 쿼리가 이걸 그대로 정산 대상에 포함시켰습니다 — "정상 완료 1건 + 취소/환불 5건 = 6건" 증상이
--   정확히 이 경로로 설명됩니다.
--
--   (참고: sql/care_interruption_refund_system.sql 의 "부분 환불/패키지 조정"은 이 버그와 다릅니다 —
--   그 경로는 care_schedules.payment_amount 를 "남긴 금액"으로 직접 맞춘 뒤 completed 로 닫으므로,
--   이미 올바른 금액만 정산에 들어갑니다. 이번 수정은 그 경로가 아니라 "완전 취소/전액 환불"인데
--   care_schedules 쪽에 아무 반영이 없는 경우를 막는 것입니다.)
--
--   수정: completed_rows CTE에 care_schedules.application_id 로 연결된 service_applications 를 확인해,
--   status 가 CANCELLED/EXPIRED_CANCELLED 이거나 payment_status 가 REFUNDED 인 건은 제외합니다.
--   application_id 가 없는 레거시 건(구글폼 경유 등, service_applications 연결 자체가 없음)은 확인할
--   방법이 없으므로 그대로 포함합니다(기존 동작 유지). PARTIALLY_REFUNDED(부분 환불)는 일부러
--   제외하지 않습니다 — 그 경우 payment_amount 가 이미 "남긴 금액"으로 정확히 맞춰져 있어, 그 금액의
--   70%를 매니저에게 정산하는 것이 맞습니다.
--
--   실행 순서: sql/manager_settlement_70_30.sql → sql/admin_settlement_fixes.sql →
--             sql/admin_settlement_fixes_v2.sql → sql/care_interruption_refund_system.sql → 이 파일.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    with completed_rows as (
      -- '완료' 집계의 유일한 기준. 두 조건을 모두 통과해야만 정산 대상입니다:
      --   ① care_schedules.status = 'completed' (요청 1·2) — pending/assigned/departed/arrived/
      --      treatment_done/returning 등 완료되지 않은 상태는 전부 여기서 배제됩니다.
      --   ② 연결된 신청서가 취소/전액환불 상태가 아님(이번 수정) — CANCELLED/EXPIRED_CANCELLED/
      --      payment_status=REFUNDED 인 건은 care_schedules.status 가 'completed' 로 남아 있어도 제외합니다.
      select cs.id, cs.manager_id, cs.manager_payout
        from public.care_schedules cs
       where cs.status = 'completed'
         and cs.manager_id is not null
         and cs.completed_at is not null
         and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
           = date_trunc('month', p_month::timestamp)
         and not exists (
           select 1 from public.service_applications sa
            where sa.id = cs.application_id
              and (sa.status in ('CANCELLED', 'EXPIRED_CANCELLED') or sa.payment_status = 'REFUNDED')
         )
    )
    select
      c.manager_id,
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(distinct c.id)::bigint                as completed_count,
      coalesce(sum(c.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(c.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(c.manager_payout), 0)
        - floor(coalesce(sum(c.manager_payout), 0) * 0.033))::bigint as net_payout
    from completed_rows c
    left join public.profiles p on p.id = c.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = c.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    group by c.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- 진단 쿼리 — 특정 매니저·달에 왜 제외됐는지(또는 왜 아직도 포함되는지) 바로 확인하고 싶을 때.
-- scheduled_at/completed_at 월이 다른 경우(이전 admin_settlement_fixes_v2.sql 참고)와, 이번에 새로
-- 걸러낸 취소/환불 상태를 한 화면에서 같이 봅니다. :manager_id 와 월을 실제 값으로 바꿔서 실행하세요.
-- ============================================================================
-- select
--   cs.id as schedule_id, cs.status as schedule_status, cs.completed_at, cs.manager_payout,
--   sa.id as application_id, sa.status as application_status, sa.payment_status
-- from public.care_schedules cs
-- left join public.service_applications sa on sa.id = cs.application_id
-- where cs.manager_id = '<여기에 매니저 uuid>'
--   and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul') = date_trunc('month', '2026-10-01'::timestamp)
-- order by cs.completed_at;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [13b. 매니저 정산 상세 내역 RPC]  (원본: sql/admin_settlement_detail_rpc.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔 '매니저 정산 (월별)' — 매니저 행 [상세보기] 시, 그 달에 집계된 완료 건을
-- 하나씩 펼쳐서 보여주기 위한 상세 내역 RPC.
--
--   admin_manager_monthly_settlements() 의 completed_rows CTE(sql/admin_settlement_fixes_v3.sql)
--   와 완전히 똑같은 WHERE 조건(status='completed', manager_id, completed_at not null, 월 비교,
--   취소/환불 신청서 제외)에 manager_id 필터만 추가한 것이라, 이 함수가 돌려주는 행들의
--   manager_payout 합계는 항상 요약 행의 payout_subtotal과 정확히 같습니다 — 요약 숫자가
--   "왜" 이렇게 나왔는지 건별로 검증할 수 있게 하는 목적이므로, 조건이 한 글자라도 달라지면
--   합계가 안 맞아 보이는 원인이 되니 두 함수의 WHERE 절은 항상 같이 수정하세요.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlement_details(date, uuid);

create or replace function public.admin_manager_monthly_settlement_details(p_month date, p_manager_id uuid)
returns table (
  schedule_id    uuid,
  service_type   text,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  payment_amount bigint,
  manager_payout bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;
  if p_manager_id is null then
    raise exception 'MANAGER_REQUIRED' using errcode = '22004';
  end if;

  return query
    select
      cs.id,
      sa.service_type,
      cs.scheduled_at,
      cs.completed_at,
      coalesce(cs.payment_amount, 0)::bigint,
      coalesce(cs.manager_payout, 0)::bigint
    from public.care_schedules cs
    left join public.service_applications sa on sa.id = cs.application_id
   where cs.status = 'completed'
     and cs.manager_id = p_manager_id
     and cs.completed_at is not null
     and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
       = date_trunc('month', p_month::timestamp)
     and not exists (
       select 1 from public.service_applications x
        where x.id = cs.application_id
          and (x.status in ('CANCELLED', 'EXPIRED_CANCELLED') or x.payment_status = 'REFUNDED')
     )
   order by cs.completed_at desc;
end $$;

revoke all on function public.admin_manager_monthly_settlement_details(date, uuid) from public, anon;
grant  execute on function public.admin_manager_monthly_settlement_details(date, uuid) to authenticated;

notify pgrst, 'reload schema';


-- ==============================================================================
-- [13c. admin_manager_monthly_settlements() 최신 버전 (주의: 원본 파일은 프로덕션 특정 UUID의 데이터 복원 UPDATE 문도 포함하고 있어 그 부분은 제외하고 함수 정의만 추출했습니다)]  (원본: sql/admin_settlement_fixes_v4_restore_and_rpc.sql)
-- ==============================================================================

drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    with completed_rows as (
      select cs.id, cs.manager_id, cs.manager_payout
        from public.care_schedules cs
       where cs.status = 'completed'
         and cs.manager_id is not null
         and cs.completed_at is not null
         and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
           = date_trunc('month', p_month::timestamp)
         and not exists (
           select 1 from public.service_applications sa
            where sa.id = cs.application_id
              and (sa.status in ('CANCELLED', 'EXPIRED_CANCELLED') or sa.payment_status = 'REFUNDED')
         )
    )
    select
      c.manager_id,
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(distinct c.id)::bigint                as completed_count,
      coalesce(sum(c.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(c.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(c.manager_payout), 0)
        - floor(coalesce(sum(c.manager_payout), 0) * 0.033))::bigint as net_payout
    from completed_rows c
    left join public.profiles p on p.id = c.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = c.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    group by c.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;

notify pgrst, 'reload schema';


-- ==============================================================================
-- [14. 취소/환불 → care_schedules 상태 자동 동기화]  (원본: sql/care_schedule_cancellation_sync.sql)
-- ==============================================================================

-- ============================================================================
-- service_applications 취소/환불 → care_schedules 상태 자동 동기화
--
--   지금까지 취소/환불은 오직 service_applications.status('CANCELLED'/'EXPIRED_CANCELLED')·
--   payment_status('REFUNDED')에만 기록되고, 연결된 care_schedules 행은 그 어떤 기존 경로
--   (guardian_cancel_application.sql, payment_confirmation_functions.sql,
--   admin.js cancelApplication/admin_mark_refund_completed 등)로도 전혀 건드려지지 않았습니다 —
--   그래서 "케어가 이미 completed 로 끝난 뒤 나중에 취소/환불된" 건은 care_schedules.status 가
--   영원히 'completed' 로 남아 정산(admin_manager_monthly_settlements)에 계속 잘못 집계됐습니다
--   (sql/admin_settlement_fixes_v3.sql 에서 service_applications 조인으로 임시 방어했던 바로 그 증상).
--
--   이 파일은 그 임시 방어를 "원천 차단"으로 바꿉니다 — service_applications 가 취소/환불로 바뀌는
--   순간, 연결된 care_schedules 를 자동으로 'cancelled' 로 동기화합니다:
--     1) care_schedules.status CHECK 제약에 'cancelled' 추가
--     2) enforce_care_status_flow() 가 (어떤 단계에서든) → 'cancelled' 전환을 허용하도록 확장
--        ('cancelled' 에서 다른 상태로는 못 돌아감 — 'completed' 와 같은 종착 상태)
--     3) care_schedules → service_applications 역방향 미러 트리거(sync_application_status_from_schedule,
--        sql/supabase_schema_latest.sql)가, 신청서가 이미 CANCELLED/EXPIRED_CANCELLED/
--        PARTIALLY_REFUNDED 로 확정된 뒤에는 더 이상 그 값을 덮어쓰지 않도록 가드 추가
--        (바로 아래 4번이 care_schedules.status 를 'cancelled' 로 바꾸면 이 역방향 트리거가
--        다시 호출되는데, 가드가 없으면 방금 세팅한 'CANCELLED'/'PARTIALLY_REFUNDED' 를 소문자
--        'cancelled' 로 즉시 덮어써 버립니다)
--     4) 새 트리거(service_applications → care_schedules): status 가 CANCELLED/EXPIRED_CANCELLED 로
--        바뀌거나 payment_status 가 REFUNDED 로 바뀌면, 연결된 care_schedules 를 'cancelled' 로 바꾸고
--        payment_amount 를 0으로 맞춥니다(70:30 트리거가 manager_payout/platform_fee 도 즉시 0으로
--        재계산 — sql/manager_settlement_70_30.sql). PARTIALLY_REFUNDED(부분 환불)는 일부러 건드리지
--        않습니다 — sql/care_interruption_refund_system.sql 의 admin_apply_partial_refund() 가 이미
--        payment_amount 를 "남긴 금액"으로 정확히 맞춰 둔 뒤 completed 로 닫으므로, 그 경로를 되돌리면
--        안 됩니다.
--     5) 이미 쌓여 있는 "completed 인데 신청서는 취소/환불된" 기존 행을 한 번 정리(백필)합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/manager_settlement_70_30.sql →
--             sql/matching_expiry_auto_refund.sql → sql/care_interruption_refund_system.sql →
--             sql/admin_settlement_fixes_v3.sql → 이 파일.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) care_schedules.status CHECK 제약에 'cancelled' 추가
-- ----------------------------------------------------------------------------
alter table public.care_schedules drop constraint if exists care_schedules_status_check;
alter table public.care_schedules add constraint care_schedules_status_check
  check (status in ('pending', 'assigned', 'departed', 'arrived', 'treatment_done', 'returning', 'completed', 'cancelled'));


-- ----------------------------------------------------------------------------
-- 2) enforce_care_status_flow() — 5단계 순서 강제는 그대로 두고, "어느 단계에서든 → cancelled" 전환만
--    추가로 허용합니다. 'cancelled' 에서 다른 상태로 다시 바꾸는 것은 허용하지 않습니다(완료처럼
--    종착 상태로 취급).
-- ----------------------------------------------------------------------------
create or replace function public.enforce_care_status_flow() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'        and new.status = 'assigned')
            or (old.status = 'assigned'       and new.status = 'departed')
            or (old.status = 'departed'       and new.status = 'arrived')
            or (old.status = 'arrived'        and new.status = 'treatment_done')
            or (old.status = 'treatment_done' and new.status = 'returning')
            or (old.status = 'returning'      and new.status = 'completed')
            or (old.status <> 'cancelled'     and new.status = 'cancelled')) then
      raise exception 'invalid status transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

-- 트리거 자체(care_schedules_status_flow)는 sql/supabase_schema_latest.sql 에 이미 만들어져 있고
-- 함수만 create or replace 하면 됩니다 — 다시 만들 필요 없습니다.


-- ----------------------------------------------------------------------------
-- 3) sync_application_status_from_schedule() 보강 — 신청서가 이미 취소/환불로 "확정"된 뒤에는
--    care_schedules 쪽 상태 변화(바로 아래 4번이 'cancelled' 로 바꾸는 것 포함)가 그 확정값을
--    다시 덮어쓰지 못하게 막습니다. 평소(정상 진행 중)에는 전혀 영향이 없습니다 — 이 세 값은
--    cancel/refund 전용 함수들만 쓰고, care_schedules 진행에 따라 자연스럽게 생기는 값이 아닙니다.
-- ----------------------------------------------------------------------------
create or replace function public.sync_application_status_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_current_status text;
begin
  if new.application_id is not null and new.status is distinct from old.status then
    select status into v_current_status from public.service_applications where id = new.application_id;
    if v_current_status in ('CANCELLED', 'EXPIRED_CANCELLED', 'PARTIALLY_REFUNDED') then
      return new;
    end if;
    update public.service_applications
       set status = new.status
     where id = new.application_id
       and status is distinct from new.status;
  end if;
  return new;
end;
$$;
-- 트리거(trg_sync_application_status)도 이미 존재하므로 다시 만들 필요 없습니다.


-- ----------------------------------------------------------------------------
-- 4) service_applications → care_schedules 동기화(새 트리거) — 취소/전액환불만 대상입니다.
--    PARTIALLY_REFUNDED 는 admin_apply_partial_refund() 가 이미 올바르게 처리하므로 건드리지 않습니다.
-- ----------------------------------------------------------------------------
create or replace function public.sync_care_schedule_on_cancellation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.status in ('CANCELLED', 'EXPIRED_CANCELLED') or new.payment_status = 'REFUNDED')
     and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    update public.care_schedules
       set status = 'cancelled',
           payment_amount = 0
     where application_id = new.id
       and status is distinct from 'cancelled';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_care_schedule_on_cancellation on public.service_applications;
create trigger trg_sync_care_schedule_on_cancellation
  after update of status, payment_status on public.service_applications
  for each row execute function public.sync_care_schedule_on_cancellation();


-- ----------------------------------------------------------------------------
-- 5) 백필 — 이미 'completed' 로 남아 있는데 신청서는 취소/전액환불인 기존 행을 한 번 정리합니다
--    (재실행해도 안전 — 이미 'cancelled' 인 행은 where 조건에서 자연히 빠집니다).
-- ----------------------------------------------------------------------------
update public.care_schedules cs
   set status = 'cancelled',
       payment_amount = 0
 where cs.status = 'completed'
   and exists (
     select 1 from public.service_applications sa
      where sa.id = cs.application_id
        and (sa.status in ('CANCELLED', 'EXPIRED_CANCELLED') or sa.payment_status = 'REFUNDED')
   );


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [15. 관리자 전액/부분 환불 처리(PortOne 연동)]  (원본: sql/admin_application_refund_system.sql)
-- ==============================================================================

-- ============================================================================
-- 취소된 신청 건 — 어드민 콘솔에서 PortOne 전액/부분 환불을 직접 호출
--
--   지금까지 '취소된 신청 내역' 카드는 PG 환불을 관리자가 PortOne 콘솔에서 직접 처리한 뒤, 그 사실만
--   확인하는 [환불 완료 처리] 버튼(admin_mark_refund_completed, sql/matching_expiry_auto_refund.sql —
--   payment_status 만 바꾸고 PortOne을 호출하지 않음)만 있었습니다. 이 파일은 그 대신 실제로 PortOne
--   환불 API를 호출하는 [환불 처리] 버튼의 DB 쪽 절반을 추가합니다 — PortOne 호출은
--   supabase/functions/admin-refund-application 가 맡고, 그 호출이 성공한 뒤에만 아래 RPC로 DB를
--   반영합니다(이 프로젝트 전체에 깔린 "돈이 실제로 움직인 뒤에만 DB를 바꾼다" 원칙과 동일).
--
--   전액 환불을 여러 번에 걸쳐 나눠(부분) 처리할 수 있도록, service_applications.refund_amount
--   (sql/care_interruption_refund_system.sql 에서 추가된 컬럼)를 "이 건에 지금까지 누적으로 돌려준
--   금액"으로 재사용합니다. 그 파일의 admin_apply_partial_refund() 는 '진행 중인 케어'가 현장에서
--   중단됐을 때 한 번만 값을 덮어쓰는 별개의 흐름이라(끝나면 status가 'PARTIALLY_REFUNDED'로 바뀌고
--   care_schedules 가 'completed' 로 닫힘) 서로 겹치지 않습니다 — 이 파일이 다루는 건 이미
--   CANCELLED/EXPIRED_CANCELLED 로 끝난 신청의 payment_status 만 바꿉니다(status는 그대로 유지해야
--   '취소된 신청 내역' 목록 조건(status in ('CANCELLED','EXPIRED_CANCELLED'))에서 사라지지 않습니다).
--
--   payment_status 전이 (총액은 final_amount, sql/user_coupons_checkout.sql 에서 추가된 "최종 결제
--   확정 금액" 컬럼을 기준으로 삼습니다):
--     PAID / PARTIALLY_REFUNDED → (누적 환불액 == final_amount) → REFUNDED
--     PAID / PARTIALLY_REFUNDED → (누적 환불액 <  final_amount) → PARTIALLY_REFUNDED
--
--   실행 순서: sql/matching_expiry_auto_refund.sql(payment_status/refunded_at 컬럼) →
--   sql/user_coupons_checkout.sql(final_amount 컬럼) → sql/care_interruption_refund_system.sql
--   (refund_amount/refund_memo 컬럼) → 이 파일.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 처리 이력 — 전액/부분 환불 호출마다 사유와 PortOne 응답 참조값을 남깁니다(고객센터 문의 대비 +
--    사후 조작 방지). admin_care_adjustments(sql/care_interruption_refund_system.sql)와 같은
--    패턴이지만, 이 건은 care_schedules 와 무관하고 application_id만으로 식별되어 별도 테이블로 둡니다.
-- ----------------------------------------------------------------------------
create table if not exists public.service_application_refund_logs (
  id                      uuid primary key default gen_random_uuid(),
  application_id          uuid not null references public.service_applications(id) on delete cascade,
  admin_id                uuid references public.profiles(id),
  amount                  integer not null check (amount > 0),
  is_full                 boolean not null,
  reason                  text not null,
  portone_cancellation_id text,
  created_at              timestamptz not null default now()
);

create index if not exists service_application_refund_logs_application_idx
  on public.service_application_refund_logs (application_id);

alter table public.service_application_refund_logs enable row level security;

drop policy if exists service_application_refund_logs_select_admin on public.service_application_refund_logs;
create policy service_application_refund_logs_select_admin on public.service_application_refund_logs
  for select to authenticated using (public.is_admin());

-- insert/update/delete 는 전부 아래 SECURITY DEFINER 함수를 통해서만 — 환불 이력이 관리자 손으로
-- 사후 조작되지 않도록 합니다.
revoke insert, update, delete on public.service_application_refund_logs from anon, authenticated;
grant  select on public.service_application_refund_logs to authenticated;
revoke select on public.service_application_refund_logs from anon;


-- ----------------------------------------------------------------------------
-- 2) 환불 적용 — PortOne 환불 API 호출이 성공한 뒤에만
--    supabase/functions/admin-refund-application 가 service_role 로 호출합니다. 호출자 권한 확인은
--    그 Edge Function이 이미 수행하므로(cancel-payment와 같은 패턴 — profiles.role 직접 조회), 이
--    함수는 is_admin() 을 다시 묻지 않고 "service_role만 실행 가능"으로 막습니다(맨 아래 revoke all —
--    list_expired_unmatched_applications/expire_unmatched_application 과 같은 패턴). service_role 로
--    호출되는 요청은 auth.uid() 가 비어 있어(로그인 사용자 JWT가 아님) is_admin() 체크를 넣으면 항상
--    실패하므로, 애초에 넣지 않습니다.
--
--    p_amount: "이번에" 실제로 돌아간 금액(PortOne 취소 응답의 실제 취소 금액) — refund_amount 에
--    누적으로 더해집니다. 이미 누적 환불액이 final_amount 에 도달한 뒤 또 호출되면(중복 클릭 등)
--    REFUND_EXCEEDS_REMAINING 으로 막혀 멱등하게 거부됩니다(0원을 추가로 깎지 않음).
-- ----------------------------------------------------------------------------
create or replace function public.admin_apply_application_refund(
  p_application_id uuid,
  p_amount         integer,
  p_reason         text,
  p_portone_ref    text default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app       public.service_applications;
  v_total     integer;
  v_already   integer;
  v_remaining integer;
  v_new_total integer;
  v_status    text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = '22004';
  end if;

  select * into v_app from public.service_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_app.status not in ('CANCELLED', 'EXPIRED_CANCELLED') then
    raise exception 'NOT_CANCELLED' using errcode = 'P0001';
  end if;

  v_total     := coalesce(v_app.final_amount, 0);
  v_already   := coalesce(v_app.refund_amount, 0);
  v_remaining := v_total - v_already;
  if p_amount > v_remaining then
    raise exception 'REFUND_EXCEEDS_REMAINING: remaining=%, requested=%', v_remaining, p_amount
      using errcode = '22023';
  end if;

  v_new_total := v_already + p_amount;
  v_status    := case when v_new_total >= v_total then 'REFUNDED' else 'PARTIALLY_REFUNDED' end;

  update public.service_applications
     set refund_amount  = v_new_total,
         payment_status = v_status,
         refund_memo    = p_reason,
         refunded_at    = now()
   where id = p_application_id
  returning * into v_app;

  insert into public.service_application_refund_logs
    (application_id, admin_id, amount, is_full, reason, portone_cancellation_id)
  values
    (p_application_id, auth.uid(), p_amount, v_status = 'REFUNDED', p_reason, p_portone_ref);

  return v_app;
end $$;

revoke all on function public.admin_apply_application_refund(uuid, integer, text, text) from public, anon, authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [16. 패키지(시간권) 구매/차감 + 만료 pg_cron]  (원본: sql/user_packages_system.sql)
-- ==============================================================================

-- ============================================================================
-- 선결제 회차 패키지(5회권/10회권) + 유연한 차감 예약 + 초과 시간 후불 과금
--
--   패키지 구매(선결제) → user_packages 충전 → apply.html 에서 결제 없이 회차 차감 예약 →
--   완료 시 매니저가 입력한 실제 소요 시간으로 초과 요금을 자동 산정해 기존 2차 결제
--   레일(sql/extra_charge_billing.sql)에 그대로 올립니다. 70:30 정산(sql/manager_settlement_70_30.sql)은
--   care_schedules.payment_amount 가 바뀔 때마다 이미 자동으로 다시 계산되므로, 패키지 결제건이든
--   후불 초과금이든 추가 코드 없이 똑같이 70%/30% 로 나뉩니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/payment_confirmation_functions.sql(expected_service_price() 참고용) →
--             sql/user_coupons_checkout.sql(expected_addon_total() — 패키지 차감 + 선택 추가 옵션 금액
--             검증에 필요) → sql/extra_charge_billing.sql(extra_charge_* 컬럼/함수) →
--             sql/manager_settlement_70_30.sql(payment_amount/manager_payout/platform_fee + 70:30 트리거) →
--             이 파일.
--   전부 create or replace / add column if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ============================================================================
-- 1) user_packages — 보호자가 선결제한 회차권
-- ============================================================================
create table if not exists public.user_packages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  package_type    text not null check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours')),
  total_count     integer not null check (total_count > 0),
  remaining_count integer not null check (remaining_count >= 0),
  status          text not null default 'active' check (status in ('active', 'exhausted', 'expired')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint user_packages_remaining_le_total check (remaining_count <= total_count)
);

-- 테이블이 이미 있던 환경(이전 버전에서 '5_sessions'/'10_sessions' 만 허용하던 체크 제약)에도 새 패키지
-- 코드('10_hours'/'20_hours')를 쓸 수 있도록 제약을 다시 걸어 둡니다 — create table if not exists 는
-- 이미 존재하는 테이블의 제약을 바꾸지 않으므로 이 ALTER 가 따로 필요합니다.
alter table public.user_packages drop constraint if exists user_packages_package_type_check;
alter table public.user_packages add constraint user_packages_package_type_check
  check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours'));

create index if not exists user_packages_user_active_idx
  on public.user_packages (user_id) where status = 'active' and remaining_count > 0;

alter table public.user_packages enable row level security;

-- 보호자는 본인 패키지만 조회 — 차감/충전은 전부 아래 SECURITY DEFINER 함수/트리거를 통해서만 이뤄지므로
-- authenticated 에 insert/update/delete 권한을 주지 않습니다(결제 없이 회차를 스스로 늘리는 조작을 막음).
drop policy if exists user_packages_select_own on public.user_packages;
create policy user_packages_select_own on public.user_packages
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.user_packages from anon, authenticated;
grant  select on public.user_packages to authenticated;
revoke select on public.user_packages from anon;

-- 잔여 횟수가 0이 되면 자동으로 'exhausted' — 아래 2번 패키지 차감 트리거가 이미 remaining_count=0일 때
-- status 도 같이 바꿔 주지만, 혹시 다른 경로(수동 SQL 등)로 remaining_count 가 바뀌는 경우까지 대비한 이중 안전장치.
create or replace function public.sync_user_package_status() returns trigger
language plpgsql as $$
begin
  if new.remaining_count <= 0 then
    new.status := 'exhausted';
  elsif new.status = 'exhausted' and new.remaining_count > 0 then
    new.status := 'active';
  end if;
  return new;
end $$;

drop trigger if exists user_packages_sync_status on public.user_packages;
create trigger user_packages_sync_status
  before insert or update of remaining_count on public.user_packages
  for each row execute function public.sync_user_package_status();

-- 만료일이 지난 패키지를 'expired' 로 정리 — pg_cron 이 주기적으로 호출합니다(맨 아래 스케줄).
create or replace function public.expire_user_packages() returns void
language sql security definer set search_path = public as $$
  update public.user_packages
     set status = 'expired'
   where status = 'active'
     and expires_at < now();
$$;
revoke all on function public.expire_user_packages() from public, anon, authenticated;


-- ============================================================================
-- 2) package_orders — 패키지 선결제 1건당 주문 1개 (PortOne paymentId = 이 테이블의 id)
-- ============================================================================
create table if not exists public.package_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  package_type text not null check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours')),
  amount       integer not null check (amount > 0),
  status       text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELLED')),
  pg_payment_ref text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);

-- user_packages 와 같은 이유로, 테이블이 이미 있던 환경에도 새 패키지 코드를 쓸 수 있도록 다시 겁니다.
alter table public.package_orders drop constraint if exists package_orders_package_type_check;
alter table public.package_orders add constraint package_orders_package_type_check
  check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours'));

alter table public.package_orders enable row level security;

drop policy if exists package_orders_select_own on public.package_orders;
create policy package_orders_select_own on public.package_orders
  for select to authenticated using (user_id = auth.uid());

-- apply.html/mypage.html 의 결제 흐름과 동일한 패턴: 결제창의 paymentId 로 쓰려면 먼저 행이 있어야 하므로
-- 본인 user_id 로만 INSERT 를 허용합니다(결제 승인 여부와 무관하게 PENDING 상태로 먼저 생성). 승인 반영
-- (status→PAID, user_packages 충전)은 아래 confirm_package_order_payment() 가 service_role 로만 수행합니다.
drop policy if exists package_orders_insert_own on public.package_orders;
create policy package_orders_insert_own on public.package_orders
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'PENDING');

grant  select, insert on public.package_orders to authenticated;
revoke select, insert on public.package_orders from anon;


-- ----------------------------------------------------------------------------
-- 3) 패키지 정가/회차 카탈로그 — apply.html/mypage.html 의 화면 표시 값과 반드시 같게 유지합니다.
--    (expected_service_price() 와 같은 패턴: 서버가 검증할 "정답"은 이 함수뿐입니다.)
--    (2026 마진율 개편: 신규 판매 상품은 '10_hours'/'20_hours' — 기본 2시간 x 5회/10회라는 동일한
--    차감 방식을 "시간" 단위로 다시 소개하는 상품입니다. '5_sessions'/'10_sessions' 는 이미 구매해 둔
--    보호자가 있을 수 있어 과거 정가 그대로 남겨 둡니다(새로 판매하지는 않음 — package.html 참고).)
-- ----------------------------------------------------------------------------
create or replace function public.expected_package_price(p_package_type text)
returns integer
language sql immutable as $$
  select case p_package_type
    when '5_sessions'  then 220000
    when '10_sessions' then 440000
    when '10_hours'    then 230000
    when '20_hours'    then 440000
    else null
  end;
$$;

create or replace function public.package_session_count(p_package_type text)
returns integer
language sql immutable as $$
  select case p_package_type
    when '5_sessions'  then 5
    when '10_sessions' then 10
    when '10_hours'    then 5  -- 10시간 ÷ 기본 2시간
    when '20_hours'    then 10 -- 20시간 ÷ 기본 2시간
    else null
  end;
$$;

grant execute on function public.expected_package_price(text) to anon, authenticated;
grant execute on function public.package_session_count(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4) 패키지 결제 승인 반영 — confirm-package-order-payment Edge Function / portone-webhook 이
--    PortOne API 를 서버에서 재조회한 뒤에만 호출합니다(mark_payment_matching_pending 과 같은 원칙).
--    p_paid_amount 가 package_type 의 정가와 다르면 AMOUNT_MISMATCH 로 거부합니다.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_package_order_payment(
  p_order_id uuid,
  p_paid_amount integer default null,
  p_payment_key text default null
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_order  public.package_orders;
  v_count  integer;
  v_pkg    public.user_packages;
begin
  select * into v_order from public.package_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'PACKAGE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status = 'PAID' then
    -- 중복 웹훅/재시도 — 이미 충전된 패키지를 그대로 돌려줍니다(멱등).
    select * into v_pkg from public.user_packages
     where user_id = v_order.user_id and package_type = v_order.package_type
     order by created_at desc limit 1;
    return v_pkg;
  end if;
  if v_order.status <> 'PENDING' then
    raise exception 'PACKAGE_ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;

  if p_paid_amount is not null and p_paid_amount <> v_order.amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_order.amount, p_paid_amount using errcode = 'P0003';
  end if;

  v_count := public.package_session_count(v_order.package_type);
  if v_count is null then
    raise exception 'UNKNOWN_PACKAGE_TYPE: %', v_order.package_type using errcode = 'P0001';
  end if;

  update public.package_orders
     set status = 'PAID', paid_at = now(), pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where id = p_order_id;

  -- 90일을 넘겨 쓰지 못한 회차가 그냥 사라지는 건 과하다고 보고, 패키지 유효기간은 180일(6개월)로
  -- 둡니다 — 운영 방침이 바뀌면 이 interval 만 조정하면 됩니다.
  insert into public.user_packages (user_id, package_type, total_count, remaining_count, status, expires_at)
  values (v_order.user_id, v_order.package_type, v_count, v_count, 'active', now() + interval '180 days')
  returning * into v_pkg;

  return v_pkg;
end $$;

revoke all on function public.confirm_package_order_payment(uuid, integer, text) from public, anon, authenticated;


-- ============================================================================
-- 5) service_applications 확장 — 패키지 연결 + 실제 소요 시간/초과 요금
-- ============================================================================
alter table public.service_applications add column if not exists package_id uuid references public.user_packages(id);
alter table public.service_applications add column if not exists is_package_used boolean not null default false;
alter table public.service_applications add column if not exists actual_duration_minutes integer;
alter table public.service_applications add column if not exists extra_fee integer;
alter table public.service_applications add column if not exists extra_fee_status text;

alter table public.service_applications drop constraint if exists service_applications_package_consistency_check;
alter table public.service_applications add constraint service_applications_package_consistency_check
  check ((is_package_used and package_id is not null) or (not is_package_used and package_id is null));

alter table public.service_applications drop constraint if exists service_applications_extra_fee_status_check;
alter table public.service_applications add constraint service_applications_extra_fee_status_check
  check (extra_fee_status is null or extra_fee_status in ('pending_payment', 'paid'));

alter table public.service_applications drop constraint if exists service_applications_actual_duration_check;
alter table public.service_applications add constraint service_applications_actual_duration_check
  check (actual_duration_minutes is null or actual_duration_minutes >= 0);


-- ----------------------------------------------------------------------------
-- 6) 패키지 차감 트리거 — apply.html 이 is_package_used=true, package_id=<보유 패키지> 로 신청서를
--    저장하면, 결제 단계를 거치지 않고 이 트리거가 그 자리에서 회차를 차감하고 바로 매칭 대기
--    상태로 넘깁니다. SECURITY DEFINER 로 user_packages 의 revoke 를 우회해 "정확히 이 검증을 통과한
--    경우에만" 차감되게 하고, 동시 접수로 마지막 회차가 두 번 쓰이지 않도록 select ... for update 로
--    패키지 행을 잠급니다. 아래에서 net.http_post 로 텔레그램 알림도 보내므로 pg_net 이 꺼져 있으면
--    이 CREATE EXTENSION 문에서만 에러가 날 수 있습니다 — sql/matching_expiry_auto_refund.sql 의
--    8번과 같은 안내대로, Supabase 대시보드 → Database → Extensions 에서 pg_net 을 켠 뒤 다시 실행하세요.
-- ----------------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function public.consume_package_on_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pkg          public.user_packages;
  v_addon_total  integer;
  v_desired_at   text;
  v_applicant    text;
  v_when         text;
  v_addon_labels text;
  v_message      text;
  v_bot_token    text;
  v_chat_id      text;
begin
  if not new.is_package_used then
    return new;
  end if;
  if new.user_id is null then
    raise exception 'PACKAGE_REQUIRES_LOGIN' using errcode = '28000';
  end if;

  select * into v_pkg from public.user_packages
   where id = new.package_id
   for update;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pkg.user_id <> new.user_id then
    raise exception 'PACKAGE_NOT_OWNED' using errcode = '42501';
  end if;
  if v_pkg.status <> 'active' or v_pkg.remaining_count <= 0 then
    raise exception 'PACKAGE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.user_packages
     set remaining_count = remaining_count - 1
   where id = v_pkg.id;

  -- 패키지로 이미 결제된 건이므로 가상계좌/카드 결제 단계를 건너뛰고 곧바로 매칭 대기로 넘어갑니다.
  new.status := 'MATCHING_PENDING';

  -- ---------------------------------------------------------------------------
  -- 선택 추가 옵션(Add-on) 금액 — 패키지는 기본 서비스 요금만 차감하고 추가 옵션 금액은 포함하지
  -- 않으므로(apply.html toDbRow 참고), 클라이언트가 보낸 addon_total 을 그대로 믿지 않고
  -- expected_addon_total() (sql/user_coupons_checkout.sql)로 addon_codes 에서 다시 계산해 덮어씁니다
  -- (mark_payment_matching_pending 과 같은 원칙). 금액이 있으면 지금 결제받지 않고 extra_fee/
  -- extra_fee_status='pending_payment' 로만 남겨 두고, 매니저가 수락할 때(accept_service_application()/
  -- admin_assign_manager(), sql/manager_settlement_70_30.sql)이 값을 care_schedules.extra_charge_* 로
  -- 옮겨 기존 '추가 요금 결제 안내' 결제 레일(sql/extra_charge_billing.sql)에 그대로 올립니다.
  -- ---------------------------------------------------------------------------
  v_addon_total := public.expected_addon_total(new.addon_codes);
  new.addon_total := v_addon_total;
  if v_addon_total > 0 then
    new.extra_fee := v_addon_total;
    new.extra_fee_status := 'pending_payment';
  end if;

  -- ---------------------------------------------------------------------------
  -- 텔레그램 알림 — 이 신청은 issue-virtual-account/portone-webhook Edge Function을 거치지 않고
  -- apply.html 이 service_applications 에 직접 INSERT 하고 이 BEFORE INSERT 트리거가 바로 매칭 대기로
  -- 넘기기 때문에(_shared/telegram.ts 호출 지점을 지나가지 않음), sql/admin_manual_payment_telegram_notify.sql
  -- 의 admin_confirm_manual_payment() 와 같은 이유로 알림이 빠져 있었습니다 — 같은 패턴(SQL에서 pg_net
  -- 으로 텔레그램 API 직접 호출)으로 여기도 보냅니다. net.http_post 는 이 트랜잭션 안에서 큐 테이블에
  -- 넣힐 뿐이라, 이후 INSERT 가 다른 제약으로 실패해 트랜잭션 전체가 롤백되면 이 알림도 함께 롤백되어
  -- 실제로는 발송되지 않습니다 — 그래서 "이미 보냈는데 신청은 실패"하는 불일치가 생기지 않습니다.
  -- 알림 자체가 실패해도(토큰 미설정, 네트워크 등) 이미 위에서 끝난 회차 차감/상태 전환을 막지 않도록
  -- exception 은 경고로만 남깁니다.
  -- ---------------------------------------------------------------------------
  begin
    select decrypted_secret into v_bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

    if v_bot_token is not null and v_chat_id is not null then
      v_desired_at := (regexp_match(coalesce(new.request_details, ''), '희망\s*일시:\s*([^\n]+)'))[1];
      v_applicant := nullif(btrim(split_part(coalesce(new.user_contact, ''), '/', 1)), '');
      v_when := coalesce(
        nullif(btrim(v_desired_at), ''),
        to_char(coalesce(new.created_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        '협의 필요'
      );

      -- 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, expected_addon_total() 과
      -- 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html/_shared/telegram.ts 에도
      -- 같은 맵이 있습니다 — 함께 고쳐 주세요). 패키지 차감 예약도 추가 옵션을 고를 수 있고(위에서
      -- v_addon_total 로 다시 계산), 그 금액은 지금 결제받지 않았다는 걸 매니저가 알 수 있도록 메시지에 밝힙니다.
      select coalesce(string_agg(case code
          when 'URGENT_MATCHING' then '긴급 매칭 서비스'
          else code
        end, ', '), '없음')
        into v_addon_labels
        from unnest(coalesce(new.addon_codes, '{}'::text[])) as code;

      v_message :=
        '[🔔 위드브릿지 신규 케어 신청 접수]' || chr(10) ||
        '• 서비스: ' || coalesce(new.service_type, '동행 서비스') || chr(10) ||
        '• 지역: ' || coalesce(new.address, '주소 미입력') || chr(10) ||
        '• 일시: ' || v_when || chr(10) ||
        '• 신청자: ' || coalesce(v_applicant, '고객') || ' 고객님' || chr(10) ||
        '• 선택 옵션: ' || v_addon_labels ||
          case when v_addon_total > 0 then ' (' || v_addon_total || '원, 결제 대기 — 수락 후 별도 결제 안내)' else '' end
          || chr(10) ||
        '👉 매니저 마이페이지에서 수락하기: mypage-manager.html' || chr(10) ||
        '(보유 패키지 차감 예약)';

      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'disable_web_page_preview', true)
      );
    else
      raise warning '[consume_package_on_application] telegram_bot_token/telegram_chat_id 가 Vault에 없어 알림을 건너뜁니다.';
    end if;
  exception when others then
    raise warning '[consume_package_on_application] 텔레그램 알림 발송 중 오류(회차 차감/상태 전환은 이미 완료됨) — %', sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists service_applications_consume_package on public.service_applications;
create trigger service_applications_consume_package
  before insert on public.service_applications
  for each row execute function public.consume_package_on_application();


-- ============================================================================
-- 7) 초과 시간 자동 과금 — mypage-manager.html '케어 완료' 모달이 이미 받고 있는 실제 종료 시각을
--    기준으로, 기본 2시간을 넘긴 시간을 30분당 서비스별 단가(expected_overtime_rate_per_30min(),
--    sql/payment_confirmation_functions.sql — 시니어 병원 동행 12,500 / 생활 편의 대행 10,000 /
--    복합 매칭 서비스 15,000)로 환산해 자동 청구합니다. 매니저(배정된 본인) 또는 관리자만 호출할 수
--    있고, 기존 2차 결제 레일(care_schedules.extra_charge_*, confirm_extra_charge_payment(),
--    mypage.html 의 PortOne 결제 버튼)을 그대로 재사용합니다 — 결제 인프라를 새로 만들지 않고,
--    "얼마를 청구할지"만 자동으로 계산해 올려 둡니다.
--    (2026 마진율 개편 전에는 서비스 종류와 무관하게 30분당 10,000원 고정이었습니다 — service_type 을
--    연결된 신청서에서 가져올 수 없는 경우(application_id 가 없는 수기 배정 등)에는 그 기존 기본값
--    10,000원을 그대로 fallback 으로 씁니다.)
-- ----------------------------------------------------------------------------
create or replace function public.report_care_duration_and_bill_extra(
  p_schedule_id uuid,
  p_actual_duration_minutes integer
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.care_schedules;
  v_extra_fee integer;
  v_service_type text;
  v_unit_fee     integer;
  v_base_minutes constant integer := 120; -- 기본 요금에 포함된 시간(2시간, index.html/apply.html 요금표와 동일)
begin
  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_row.manager_id = auth.uid() or public.is_admin()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_actual_duration_minutes is null or p_actual_duration_minutes < 0 then
    raise exception 'INVALID_DURATION' using errcode = '22023';
  end if;
  if v_row.extra_charge_status = 'PAID' then
    raise exception 'EXTRA_CHARGE_ALREADY_PAID' using errcode = 'P0001';
  end if;

  if v_row.application_id is not null then
    select service_type into v_service_type from public.service_applications where id = v_row.application_id;
  end if;
  v_unit_fee := public.expected_overtime_rate_per_30min(v_service_type);

  v_extra_fee := greatest(0, ceil((p_actual_duration_minutes - v_base_minutes) / 30.0)::integer) * v_unit_fee;

  if v_extra_fee > 0 then
    -- 패키지 차감 예약에 선택 추가 옵션이 있으면(consume_package_on_application/accept_service_application
    -- 이 이미 extra_charge_amount 를 그 추가 옵션 금액으로 'REQUESTED' 해 둠) 여기서 금액을 통째로
    -- 덮어쓰면 그 미결제 추가 옵션 금액이 사라집니다 — 아직 PAID 가 아닌 기존 금액에는 더하고, 메모도
    -- 이어 붙입니다(amount=0/메모 없음인 'NONE' 상태에서는 coalesce(..,0)+v_extra_fee 가 그냥 v_extra_fee 와 같음).
    update public.care_schedules
       set extra_charge_amount = coalesce(extra_charge_amount, 0) + v_extra_fee,
           extra_charge_memo = case when extra_charge_memo is not null
             then extra_charge_memo || E'\n' || '기본 2시간 초과 자동 산정 (실제 소요 ' || p_actual_duration_minutes || '분)'
             else '기본 2시간 초과 자동 산정 (실제 소요 ' || p_actual_duration_minutes || '분)' end,
           extra_charge_status = 'REQUESTED',
           extra_charge_payment_id = coalesce(extra_charge_payment_id, gen_random_uuid()),
           extra_charge_requested_at = coalesce(extra_charge_requested_at, now())
     where id = p_schedule_id
    returning * into v_row;
    -- TODO(카카오 알림톡): 여기서 보호자에게 추가 요금 발생을 알립니다. 카카오 비즈니스 발신프로필·
    -- 템플릿 승인이 끝나면 이 지점에서 알림톡 발송 API를 호출하세요(현재는 외부 계정이 없어 결제
    -- 링크 안내만 제공합니다 — mypage.html '추가 요금 결제 안내' 섹션이 그 결제 링크 역할을 합니다).
  end if;

  if v_row.application_id is not null then
    -- v_row.extra_charge_amount 를 그대로 씁니다(위에서 pending 추가 옵션 금액에 이번 초과 요금을 더한
    -- 합계일 수 있음) — v_extra_fee(이번 초과 요금만)를 쓰면 패키지 차감 예약의 추가 옵션 pending 금액이
    -- service_applications 쪽 표시에서는 사라져 보입니다(실제 결제 레일인 care_schedules 쪽은 이미 합산됨).
    update public.service_applications
       set actual_duration_minutes = p_actual_duration_minutes,
           extra_fee = v_row.extra_charge_amount,
           extra_fee_status = case when coalesce(v_row.extra_charge_amount, 0) > 0 then 'pending_payment' else null end
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.report_care_duration_and_bill_extra(uuid, integer) from public, anon;
grant  execute on function public.report_care_duration_and_bill_extra(uuid, integer) to authenticated;


-- ----------------------------------------------------------------------------
-- 8) confirm_extra_charge_payment() 보강 — 결제가 실제로 PAID 되는 순간, service_applications.
--    extra_fee_status 도 'paid' 로 같이 맞춥니다(원본은 sql/extra_charge_billing.sql, 이후
--    sql/manager_settlement_70_30.sql 이 payment_amount 합산 로직을 추가했고, 여기서는 그 위에
--    한 줄만 더합니다).
-- ----------------------------------------------------------------------------
create or replace function public.confirm_extra_charge_payment(p_payment_id uuid, p_paid_amount integer)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  select * into v_row from public.care_schedules where extra_charge_payment_id = p_payment_id;
  if v_row.id is null then
    raise exception 'EXTRA_CHARGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.extra_charge_status = 'PAID' then
    return v_row; -- 중복 웹훅/재시도 — 조용히 현재 행 그대로 반환 (멱등)
  end if;
  if v_row.extra_charge_status <> 'REQUESTED' then
    raise exception 'EXTRA_CHARGE_NOT_REQUESTED' using errcode = 'P0001';
  end if;
  if p_paid_amount is distinct from v_row.extra_charge_amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_row.extra_charge_amount, p_paid_amount
      using errcode = 'P0003';
  end if;

  update public.care_schedules
     set extra_charge_status = 'PAID',
         extra_charge_paid_at = now(),
         payment_amount = payment_amount + v_row.extra_charge_amount
   where id = v_row.id
  returning * into v_row;

  if v_row.application_id is not null then
    update public.service_applications
       set extra_fee_status = 'paid'
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.confirm_extra_charge_payment(uuid, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 9) pg_cron — 만료된 패키지 정리(매일 새벽 3시, KST 기준이 아니라 DB 서버 시각 기준이므로 UTC 환경이면
--    한국 시간 정오 즈음입니다 — 정확한 시각이 중요하지 않은 정리 작업이라 그대로 둡니다). pg_cron 이
--    꺼져 있으면 이 블록만 실패하고 나머지는 이미 전부 적용된 상태로 남습니다(sql/
--    payment_confirmation_functions.sql 의 8번과 같은 안내).
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'expire-user-packages';
select cron.schedule(
  'expire-user-packages',
  '0 3 * * *',
  $$select public.expire_user_packages();$$
);


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [17. 매니저 상해보험 추적]  (원본: sql/manager_insurance_tracking.sql)
-- ==============================================================================

-- ============================================================================
-- 단체보험/포괄 안심케어 적용 이력 — 내부 DB 로그 저장 (외부 보험사 API 연동 없음)
--
--   정책: 위드브릿지는 개별 신청건마다 보험사 API를 호출하지 않고, 매니저 전체를 대상으로 한 단체
--   배상책임보험(또는 자체 안심케어 프로그램)에 포괄 가입하는 구조를 전제로 합니다. 이 파일은 그
--   "모든 동행에 안심케어가 적용됐다"는 사실을 신청서(service_applications) 행마다 내부 로그로
--   남기는 최소한의 장치입니다 — 실제 보험 접수/심사는 사고가 났을 때 회사가 보험사와 별도로 처리하고
--   (terms.html 제8조 ④, privacy.html의 '배상책임보험사' 제공 항목 참고), 이 로그는 "이 건이 안심케어
--   적용 대상이었다"는 증빙으로만 씁니다.
--
--   insurance_applied         boolean, default true  — 안심케어 적용 여부. 포괄 가입 구조라 거의 항상
--     true이고, 기본값 자체가 "모든 동행에 기본 포함"이라는 고객 공지(apply.html/index.html/terms.html의
--     '* 위드브릿지의 모든 동행에는 매니저 안심케어(배상책임) 혜택이 기본 포함되어 있습니다.')와 일치합니다.
--   insurance_applied_at      timestamptz, null       — 적용이 확정된 시각. 결제가 끝나지 않은 채
--     취소되는 건(cancel_unpaid_application 등)까지 전부 찍히면 "결제 완료 건에만 적용된다"는 사실과
--     어긋나므로, 신청서 생성 시점이 아니라 아래 세 지점(실제로 '결제 완료' 또는 '패키지 차감으로 즉시
--     확정'이 되는 지점)에서만 now()로 채웁니다.
--   insurance_policy_number   text, null              — 추후 실제 단체보험 증권을 체결하면 그 증권번호를
--     채워 넣을 자리입니다. 지금은 빈 필드로만 두고, 어느 코드도 이 값을 읽거나 강제하지 않습니다.
--
--   적용 시각을 찍는 세 지점(= '결제 완료' 또는 결제 없이 즉시 확정되는 '신청 완료' 지점):
--     1) mark_payment_matching_pending() — 카드/간편결제/계좌이체/가상계좌 등 PortOne 결제가 PAID로
--        확인됐을 때(portone-webhook Edge Function이 호출).
--     2) admin_confirm_manual_payment() — 가상계좌/무통장 입금을 관리자가 어드민 콘솔에서 수동으로
--        확인했을 때.
--     3) consume_package_on_application() — 보유 패키지(5회권/10회권) 차감으로 결제 단계 없이 즉시
--        매칭 대기로 넘어가는 신청(apply.html 이 is_package_used=true 로 바로 INSERT).
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/payment_confirmation_functions.sql →
--   sql/welcome_coupons.sql → sql/user_points.sql → sql/user_coupons_checkout.sql →
--   sql/admin_manual_payment_telegram_notify.sql → sql/matching_expiry_auto_refund.sql →
--   sql/user_packages_system.sql → 이 파일.
--   (이 파일이 mark_payment_matching_pending/admin_confirm_manual_payment/consume_package_on_application
--   을 다시 create or replace 하므로, 반드시 저 파일들보다 나중에 실행해야 쿠폰/적립금/패키지/텔레그램
--   로직이 되돌아가지 않습니다 — 그래서 아래 세 함수 본문에 그 로직을 전부 그대로 들고 와서 insurance_*
--   SET 절만 추가했습니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.service_applications
  add column if not exists insurance_applied boolean not null default true;
alter table public.service_applications
  add column if not exists insurance_applied_at timestamptz;
alter table public.service_applications
  add column if not exists insurance_policy_number text;


-- ----------------------------------------------------------------------------
-- 2) mark_payment_matching_pending() — 일반 결제(카드/간편결제/계좌이체/가상계좌) PAID 확인 시점
--    (sql/matching_expiry_auto_refund.sql 의 최신 정의를 그대로 들고 와서 insurance_* SET 절만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app             public.service_applications;
  v_price           integer;
  v_addon_total     integer;
  v_coupon_discount integer;
  v_coupon_valid    boolean;
  v_points_to_use   integer;
  v_discount        integer;
  v_expected        integer;
  v_balance         integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    return v_app; -- 이미 처리됨(멱등)
  end if;

  -- 쿠폰: 지금 이 순간에도 "이 사람 것 + 아직 유효(active, 미만료)" 인지 다시 확인
  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  -- 적립금: 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price + v_addon_total - v_discount;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, addon=%, coupon=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_addon_total, v_coupon_discount, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리, 쿠폰 사용 처리, 적립금 차감, 확정 금액 기록을 실행합니다.
  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now(),
         insurance_applied = true,
         insurance_applied_at = now()
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      raise warning '[mark_payment_matching_pending] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, public.expected_service_price(v_app.service_type)) + v_addon_total - v_discount,
         payment_key = coalesce(p_payment_key, payment_key)
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) admin_confirm_manual_payment() — 가상계좌/무통장 입금 관리자 수동 확인 시점
--    (sql/admin_manual_payment_telegram_notify.sql 의 최신 정의를 그대로 들고 와서 insurance_* SET 절만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.admin_confirm_manual_payment(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app             public.service_applications;
  v_price           integer;
  v_addon_total     integer;
  v_coupon_discount integer;
  v_coupon_valid    boolean;
  v_points_to_use   integer;
  v_discount        integer;
  v_balance         integer;
  v_desired_at      text;
  v_applicant       text;
  v_when            text;
  v_addon_labels    text;
  v_message         text;
  v_bot_token       text;
  v_chat_id         text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now(),
         insurance_applied = true,
         insurance_applied_at = now()
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_NOT_AWAITING_PAYMENT' using errcode = 'P0002';
  end if;

  update public.virtual_accounts
     set is_paid = true
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      raise warning '[admin_confirm_manual_payment] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[admin_confirm_manual_payment] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  v_price := public.expected_service_price(v_app.service_type);
  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, final_amount) + v_addon_total - v_discount
   where id = p_application_id
  returning * into v_app;

  -- ---------------------------------------------------------------------------
  -- 텔레그램 알림 — 여기까지 왔다면(위에서 예외 없이) 이 호출이 PAYMENT_PENDING → MATCHING_PENDING
  -- 전환을 실제로 수행한 것이 확실하므로 바로 보냅니다. 알림 발송이 실패해도(토큰 미설정, 네트워크 등)
  -- 이미 입금 확인/상태 전환은 끝난 뒤이므로 트랜잭션을 되돌리지 않고 경고만 남깁니다.
  -- ---------------------------------------------------------------------------
  begin
    select decrypted_secret into v_bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

    if v_bot_token is not null and v_chat_id is not null then
      v_desired_at := (regexp_match(coalesce(v_app.request_details, ''), '희망\s*일시:\s*([^\n]+)'))[1];
      v_applicant := nullif(btrim(split_part(coalesce(v_app.user_contact, ''), '/', 1)), '');
      v_when := coalesce(
        nullif(btrim(v_desired_at), ''),
        to_char(v_app.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        '협의 필요'
      );

      -- 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, expected_addon_total() 과
      -- 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html/_shared/telegram.ts 에도
      -- 같은 맵이 있습니다 — 함께 고쳐 주세요).
      select coalesce(string_agg(case code
          when 'URGENT_MATCHING' then '긴급 매칭 서비스'
          else code
        end, ', '), '없음')
        into v_addon_labels
        from unnest(coalesce(v_app.addon_codes, '{}'::text[])) as code;

      v_message :=
        '[🔔 위드브릿지 신규 케어 신청 접수]' || chr(10) ||
        '• 서비스: ' || coalesce(v_app.service_type, '동행 서비스') || chr(10) ||
        '• 지역: ' || coalesce(v_app.address, '주소 미입력') || chr(10) ||
        '• 일시: ' || v_when || chr(10) ||
        '• 신청자: ' || coalesce(v_applicant, '고객') || ' 고객님' || chr(10) ||
        '• 선택 옵션: ' || v_addon_labels || chr(10) ||
        '👉 매니저 마이페이지에서 수락하기: mypage-manager.html' || chr(10) ||
        '(관리자 수동 입금 확인)';

      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'disable_web_page_preview', true)
      );
    else
      raise warning '[admin_confirm_manual_payment] telegram_bot_token/telegram_chat_id 가 Vault에 없어 알림을 건너뜁니다.';
    end if;
  exception when others then
    raise warning '[admin_confirm_manual_payment] 텔레그램 알림 발송 중 오류(상태 전환은 이미 완료됨) — %', sqlerrm;
  end;

  return v_app;
end $$;

revoke all on function public.admin_confirm_manual_payment(uuid) from public, anon;
grant  execute on function public.admin_confirm_manual_payment(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) consume_package_on_application() — 보유 패키지 차감으로 결제 없이 즉시 확정되는 신청
--    (sql/user_packages_system.sql 의 최신 정의를 그대로 들고 와서 insurance_* 대입만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.consume_package_on_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pkg          public.user_packages;
  v_addon_total  integer;
  v_desired_at   text;
  v_applicant    text;
  v_when         text;
  v_addon_labels text;
  v_message      text;
  v_bot_token    text;
  v_chat_id      text;
begin
  if not new.is_package_used then
    return new;
  end if;
  if new.user_id is null then
    raise exception 'PACKAGE_REQUIRES_LOGIN' using errcode = '28000';
  end if;

  select * into v_pkg from public.user_packages
   where id = new.package_id
   for update;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pkg.user_id <> new.user_id then
    raise exception 'PACKAGE_NOT_OWNED' using errcode = '42501';
  end if;
  if v_pkg.status <> 'active' or v_pkg.remaining_count <= 0 then
    raise exception 'PACKAGE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.user_packages
     set remaining_count = remaining_count - 1
   where id = v_pkg.id;

  -- 패키지로 이미 결제된 건이므로 가상계좌/카드 결제 단계를 건너뛰고 곧바로 매칭 대기로 넘어갑니다.
  new.status := 'MATCHING_PENDING';

  -- 결제 단계가 없는 패키지 차감은 이 트리거가 신청을 확정하는 그 순간이 "안심케어 적용" 시점입니다.
  new.insurance_applied := true;
  new.insurance_applied_at := now();

  -- ---------------------------------------------------------------------------
  -- 선택 추가 옵션(Add-on) 금액 — 패키지는 기본 서비스 요금만 차감하고 추가 옵션 금액은 포함하지
  -- 않으므로(apply.html toDbRow 참고), 클라이언트가 보낸 addon_total 을 그대로 믿지 않고
  -- expected_addon_total() (sql/user_coupons_checkout.sql)로 addon_codes 에서 다시 계산해 덮어씁니다
  -- (mark_payment_matching_pending 과 같은 원칙). 금액이 있으면 지금 결제받지 않고 extra_fee/
  -- extra_fee_status='pending_payment' 로만 남겨 두고, 매니저가 수락할 때(accept_service_application()/
  -- admin_assign_manager(), sql/manager_settlement_70_30.sql)이 값을 care_schedules.extra_charge_* 로
  -- 옮겨 기존 '추가 요금 결제 안내' 결제 레일(sql/extra_charge_billing.sql)에 그대로 올립니다.
  -- ---------------------------------------------------------------------------
  v_addon_total := public.expected_addon_total(new.addon_codes);
  new.addon_total := v_addon_total;
  if v_addon_total > 0 then
    new.extra_fee := v_addon_total;
    new.extra_fee_status := 'pending_payment';
  end if;

  -- ---------------------------------------------------------------------------
  -- 텔레그램 알림 — 이 신청은 issue-virtual-account/portone-webhook Edge Function을 거치지 않고
  -- apply.html 이 service_applications 에 직접 INSERT 하고 이 BEFORE INSERT 트리거가 바로 매칭 대기로
  -- 넘기기 때문에(_shared/telegram.ts 호출 지점을 지나가지 않음), sql/admin_manual_payment_telegram_notify.sql
  -- 의 admin_confirm_manual_payment() 와 같은 이유로 알림이 빠져 있었습니다 — 같은 패턴(SQL에서 pg_net
  -- 으로 텔레그램 API 직접 호출)으로 여기도 보냅니다. net.http_post 는 이 트랜잭션 안에서 큐 테이블에
  -- 넣힐 뿐이라, 이후 INSERT 가 다른 제약으로 실패해 트랜잭션 전체가 롤백되면 이 알림도 함께 롤백되어
  -- 실제로는 발송되지 않습니다 — 그래서 "이미 보냈는데 신청은 실패"하는 불일치가 생기지 않습니다.
  -- 알림 자체가 실패해도(토큰 미설정, 네트워크 등) 이미 위에서 끝난 회차 차감/상태 전환을 막지 않도록
  -- exception 은 경고로만 남깁니다.
  -- ---------------------------------------------------------------------------
  begin
    select decrypted_secret into v_bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

    if v_bot_token is not null and v_chat_id is not null then
      v_desired_at := (regexp_match(coalesce(new.request_details, ''), '희망\s*일시:\s*([^\n]+)'))[1];
      v_applicant := nullif(btrim(split_part(coalesce(new.user_contact, ''), '/', 1)), '');
      v_when := coalesce(
        nullif(btrim(v_desired_at), ''),
        to_char(coalesce(new.created_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        '협의 필요'
      );

      -- 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, expected_addon_total() 과
      -- 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html/_shared/telegram.ts 에도
      -- 같은 맵이 있습니다 — 함께 고쳐 주세요). 패키지 차감 예약도 추가 옵션을 고를 수 있고(위에서
      -- v_addon_total 로 다시 계산), 그 금액은 지금 결제받지 않았다는 걸 매니저가 알 수 있도록 메시지에 밝힙니다.
      select coalesce(string_agg(case code
          when 'URGENT_MATCHING' then '긴급 매칭 서비스'
          else code
        end, ', '), '없음')
        into v_addon_labels
        from unnest(coalesce(new.addon_codes, '{}'::text[])) as code;

      v_message :=
        '[🔔 위드브릿지 신규 케어 신청 접수]' || chr(10) ||
        '• 서비스: ' || coalesce(new.service_type, '동행 서비스') || chr(10) ||
        '• 지역: ' || coalesce(new.address, '주소 미입력') || chr(10) ||
        '• 일시: ' || v_when || chr(10) ||
        '• 신청자: ' || coalesce(v_applicant, '고객') || ' 고객님' || chr(10) ||
        '• 선택 옵션: ' || v_addon_labels ||
          case when v_addon_total > 0 then ' (' || v_addon_total || '원, 결제 대기 — 수락 후 별도 결제 안내)' else '' end
          || chr(10) ||
        '👉 매니저 마이페이지에서 수락하기: mypage-manager.html' || chr(10) ||
        '(보유 패키지 차감 예약)';

      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'disable_web_page_preview', true)
      );
    else
      raise warning '[consume_package_on_application] telegram_bot_token/telegram_chat_id 가 Vault에 없어 알림을 건너뜁니다.';
    end if;
  exception when others then
    raise warning '[consume_package_on_application] 텔레그램 알림 발송 중 오류(회차 차감/상태 전환은 이미 완료됨) — %', sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists service_applications_consume_package on public.service_applications;
create trigger service_applications_consume_package
  before insert on public.service_applications
  for each row execute function public.consume_package_on_application();


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [18. 관리자 패키지 관리]  (원본: sql/admin_package_management.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔(admin.html / admin.js) 패키지 관리 보강
--
--   1) service_applications.package_remaining_after — 패키지 차감 신청(is_package_used=true) 건이
--      접수되는 바로 그 순간, 차감 후 남은 회차를 스냅샷으로 저장합니다. user_packages.remaining_count
--      는 그 뒤에도 다른 신청으로 계속 줄어들 수 있어서(같은 패키지를 여러 건에 나눠 쓰는 경우),
--      "이 신청 당시의 잔여 회차"를 보려면 지금 값이 아니라 그 시점의 스냅샷이 필요합니다.
--      sql/user_packages_system.sql 의 consume_package_on_application() 트리거는 그대로 두고,
--      그 다음에 실행되는 별도 BEFORE INSERT 트리거로 "방금 차감되고 난 뒤"의 remaining_count 를
--      읽어 옵니다(두 트리거 다 같은 BEFORE INSERT 라서 Postgres 가 트리거 이름 알파벳 순으로
--      실행하므로, 'consume' 가 'snapshot' 보다 먼저 실행됨이 보장됩니다).
--
--      [버그 수정] 처음 버전은 new.package_id 1건의 remaining_count 만 읽어서, 보호자가 패키지를
--      여러 개 보유한 경우(만료일이 가장 빠른 패키지부터 차감 — apply.html 의 activePackage 선택)
--      실제로 차감된 "그 패키지 한 장"의 잔여만 스냅샷에 남았습니다. 그런데 apply.html 이 신청 시점에
--      보호자에게 보여주는 "잔여 N회"(activePackageTotalRemaining, 보유한 모든 활성 패키지의
--      remaining_count 합계)는 다른 수치라서, 예를 들어 "소진 직전인 패키지 A(1회 남음) + 방금 산
--      패키지 B(10회 남음)"를 보유한 보호자가 신청하면 A에서 1회가 차감되어 A의 remaining_count 는
--      0이 되고, 어드민에는 "신청 당시 잔여 0회"로 찍혀 버립니다 — 보호자는 실제로 B의 10회를 그대로
--      보유하고 있는데도 어드민 화면만 보면 회차가 하나도 안 남은 것처럼 보이는 버그였습니다.
--      지금 버전은 new.package_id 한 건이 아니라 "이 보호자(new.user_id)가 보유한 모든 활성(active)
--      패키지의 remaining_count 합계"를 스냅샷으로 저장해, apply.html/mypage.html 이 보호자에게
--      보여주는 "잔여 N회"와 항상 같은 수치가 어드민에도 찍히도록 맞췄습니다.
--
--   2) user_packages / admin_care_adjustments 에 관리자 조회·수동 조정 권한을 추가합니다.
--      - user_packages_select_admin: 관리자가 전체 보호자의 패키지를 조회(어드민 "패키지 구매
--        회원 관리" 섹션).
--      - admin_care_adjustments.package_id: 특정 신청(application_id)과 무관하게 패키지 자체를
--        조정하는 이력도 같은 표에 남기기 위한 컬럼(기존 action_type 체크에 'manual_adjust' 추가).
--      - admin_adjust_user_package(): 관리자가 특정 user_packages 행의 remaining_count 를 직접
--        가감(+면 충전/보정, -면 차감 보정)하는 SECURITY DEFINER RPC. sql/admin_manual_assignment.sql
--        의 is_admin() 가드 + grant 패턴을 그대로 따릅니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/user_packages_system.sql → sql/care_interruption_refund_system.sql
--             (admin_care_adjustments, remaining_count numeric(5,1) 확장 필요) → 이 파일.
--   전부 create or replace / add column if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 패키지 차감 신청의 "신청 당시 잔여 회차" 스냅샷
-- ----------------------------------------------------------------------------
alter table public.service_applications
  add column if not exists package_remaining_after numeric(5, 1);

create or replace function public.snapshot_package_remaining_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_package_used and new.package_id is not null then
    -- new.package_id 한 건이 아니라 이 보호자가 보유한 모든 '활성' 패키지의 remaining_count 합계를
    -- 읽습니다 — apply.html 이 신청 당시 보여주는 "잔여 N회"(activePackageTotalRemaining)와 같은
    -- 기준이어야, 보호자가 패키지를 여러 개 가지고 있을 때(소진 직전 패키지부터 차감) 어드민 화면에
    -- 엉뚱하게 "0회"로 찍히는 일이 없습니다. consume_package_on_application() 가 이미 해당 패키지의
    -- remaining_count 를 1 줄여 둔 뒤라(알파벳 순으로 이 트리거보다 먼저 실행), 이 합계에는 그 차감이
    -- 그대로 반영됩니다.
    select coalesce(sum(remaining_count), 0) into new.package_remaining_after
      from public.user_packages
     where user_id = new.user_id
       and status = 'active';
  end if;
  return new;
end $$;

-- 'service_applications_consume_package' (consume_package_on_application) 가 먼저 회차를 차감하고
-- 난 뒤, 알파벳 순으로 이후에 실행되는 이 트리거가 이미 줄어든 remaining_count 를 그대로 읽습니다.
drop trigger if exists service_applications_snapshot_package_remaining on public.service_applications;
create trigger service_applications_snapshot_package_remaining
  before insert on public.service_applications
  for each row execute function public.snapshot_package_remaining_after();

revoke all on function public.snapshot_package_remaining_after() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) user_packages — 관리자 전체 조회 (어드민 "패키지 구매 회원 관리" 섹션)
--    기존 user_packages_select_own 정책은 그대로 두고(permissive 라 OR 로 합쳐짐), is_admin() 인
--    경우에만 모든 행을 더 볼 수 있게 추가합니다.
-- ----------------------------------------------------------------------------
drop policy if exists user_packages_select_admin on public.user_packages;
create policy user_packages_select_admin on public.user_packages
  for select to authenticated using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 3) admin_care_adjustments — 특정 신청과 무관한 "패키지 수동 조정" 이력도 남기기 위한 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.admin_care_adjustments
  add column if not exists package_id uuid references public.user_packages(id) on delete set null;

alter table public.admin_care_adjustments drop constraint if exists admin_care_adjustments_action_type_check;
alter table public.admin_care_adjustments add constraint admin_care_adjustments_action_type_check
  check (action_type in ('partial_refund', 'package_restore', 'package_partial_deduct', 'manual_adjust'));


-- ----------------------------------------------------------------------------
-- 4) admin_adjust_user_package() — 관리자가 특정 보호자의 패키지 잔여 회차를 직접 가감합니다.
--    p_delta 는 0이 아니어야 하고(+1, -0.5 등), remaining_count 는 0 ~ total_count 범위로 clamp 됩니다.
--    사유 메모(p_memo)는 admin_adjust_package_session() 과 같은 이유로 필수입니다 — 사후에 "왜
--    바꼈는지"를 반드시 남겨야 분쟁이 생겼을 때 추적할 수 있습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_adjust_user_package(uuid, numeric, text);

create or replace function public.admin_adjust_user_package(
  p_package_id uuid,
  p_delta numeric,
  p_memo text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid;
  v_pkg   public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = '22023';
  end if;
  if coalesce(btrim(p_memo), '') = '' then
    raise exception 'MEMO_REQUIRED' using errcode = '22004';
  end if;

  v_admin := auth.uid();

  update public.user_packages
     set remaining_count = greatest(least(remaining_count + p_delta, total_count), 0)
   where id = p_package_id
  returning * into v_pkg;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.admin_care_adjustments (package_id, admin_id, action_type, amount, memo)
  values (p_package_id, v_admin, 'manual_adjust', p_delta, p_memo);

  return v_pkg;
end $$;

revoke all on function public.admin_adjust_user_package(uuid, numeric, text) from public, anon, authenticated;
grant  execute on function public.admin_adjust_user_package(uuid, numeric, text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [19. 관리자 활동 로그]  (원본: sql/admin_logs.sql)
-- ==============================================================================

-- ============================================================================
-- admin-logs.html — 관리자 활동 감사 로그
--
--   admin_logs : 관리자가 수행한 민감한 조작(회원 정보 수정, CS 메모 작성, 계정 정지/활성화 등)을
--   남기는 범용 이력 테이블입니다. insert/update/delete 를 전부 authenticated/anon 에게서 거둬들이고
--   오직 아래 log_admin_action() SECURITY DEFINER 함수(또는 service-role Edge Function)를 통해서만
--   행이 생기게 해, 로그 자체가 사후에 고쳐지거나 지워질 수 없게 합니다(admin-logs.html 은 읽기
--   전용 — 이 테이블에 UPDATE/DELETE 정책 자체가 없으므로 화면에 버튼을 만들지 않는 것과 무관하게
--   API 로도 변경이 불가능합니다).
--
--   어떤 행동이 이미 이 테이블에 기록되는지(이 파일 기준):
--     - member_profile_update : admin_update_member_profile() (sql/admin_member_management.sql)
--     - member_note_add       : admin_add_member_note()       (sql/admin_member_management.sql)
--     - member_suspend / member_activate : admin-set-member-status Edge Function
--   그 밖의 기존 관리자 조작(매니저 승인/반려, 수동 배정, 환불 처리, 패키지 회차 조정 등)은 아직 이
--   테이블에 기록되지 않습니다 — 필요하면 각 RPC에 `perform public.log_admin_action(...)` 한 줄을
--   추가해 같은 방식으로 확장할 수 있습니다.
--
--   실행 순서: sql/admin_rls_policies.sql(is_admin()) → 이 파일 → sql/admin_member_management.sql
--   (admin_update_member_profile()/admin_add_member_note() 가 이 파일의 log_admin_action() 을
--   호출하므로, 이 파일이 먼저 있어야 합니다. 이미 admin_member_management.sql 을 먼저 실행했다면
--   이 파일 실행 후 admin_member_management.sql 을 한 번 더 실행하세요 — 둘 다 create or replace
--   기반이라 순서를 바꿔 다시 실행해도 안전합니다).
-- ============================================================================

create table if not exists public.admin_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id),
  -- 기록 시점의 관리자 이름/이메일을 함께 찍어 둡니다 — 나중에 그 관리자 계정의 이름이 바뀌거나
  -- 탈퇴해도(프로필 자체가 지워지는 경우는 없지만) 이 로그 행이 "그 당시 누가 했는지"를 그대로 보여줍니다.
  admin_name  text,
  admin_email text,
  action_type text not null,
  target_type text,
  target_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);
create index if not exists admin_logs_admin_id_idx    on public.admin_logs (admin_id);
create index if not exists admin_logs_action_type_idx  on public.admin_logs (action_type);

alter table public.admin_logs enable row level security;

drop policy if exists admin_logs_select_admin on public.admin_logs;
create policy admin_logs_select_admin on public.admin_logs
  for select to authenticated using (public.is_admin());

-- update/delete 정책을 아예 만들지 않습니다 — 정책이 없으면 RLS가 기본적으로 모두 거부하므로,
-- service_role(Supabase 대시보드 SQL Editor 등)이 아닌 한 그 누구도(관리자 포함) 고치거나 지울 수 없습니다.
revoke insert, update, delete on public.admin_logs from anon, authenticated;
grant  select on public.admin_logs to authenticated;
revoke all on public.admin_logs from anon;

-- ----------------------------------------------------------------------------
-- log_admin_action() — 로그를 남기는 유일한 통로. 다른 SECURITY DEFINER RPC 안에서
-- `perform public.log_admin_action(...)` 로 호출하거나, admin.html/admin-logs.html 에서 직접
-- (아직 전용 RPC로 감싸지 않은 관리자 조작을 기록하고 싶을 때) client.rpc() 로 호출할 수 있습니다.
-- is_admin() 이 아니면 아무도 로그를 남길 수 없습니다(관리자를 사칭한 로그 위조 방지).
-- ----------------------------------------------------------------------------
create or replace function public.log_admin_action(
  p_action_type text,
  p_target_type text default null,
  p_target_id   text default null,
  p_detail      jsonb default null
)
returns public.admin_logs
language plpgsql security definer set search_path = public as $$
declare
  v_admin_name  text;
  v_admin_email text;
  v_row         public.admin_logs;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if coalesce(btrim(p_action_type), '') = '' then
    raise exception 'ACTION_TYPE_REQUIRED' using errcode = '22004';
  end if;

  select p.name, u.email into v_admin_name, v_admin_email
    from public.profiles p join auth.users u on u.id = p.id
   where p.id = auth.uid();

  insert into public.admin_logs (admin_id, admin_name, admin_email, action_type, target_type, target_id, detail)
  values (auth.uid(), v_admin_name, v_admin_email, p_action_type, p_target_type, p_target_id, p_detail)
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant  execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [20a. 회원 자가 정보 수정]  (원본: sql/profile_self_update.sql)
-- ==============================================================================

-- ============================================================================
-- 보호자 본인 프로필(이름/연락처) 자가 수정 — 헤더 드롭다운(js/auth-header.js)의 '내 정보 수정'
-- 모달이 update_user_profile() RPC를 호출해 씁니다.
--
--   profiles.role 은 매니저 승인/해제(approve_manager_application 등, sql/manager_applications.sql)
--   같은 서버 로직만 바꿀 수 있어야 합니다 — 그래서 authenticated 에게 테이블 전체 UPDATE를 열어주지
--   않고, name/phone 두 컬럼만 "컬럼 단위 권한 + 내 행만"으로 좁힙니다(아래 1번). 그 위에 올라가는
--   update_user_profile() RPC(2번)는 입력값을 서버에서 다시 검증(이름 trim/길이, 연락처 숫자 개수)한
--   뒤 저장하고 갱신된 행을 그대로 돌려줍니다 — SECURITY DEFINER 로 실행하지만 auth.uid() 로만 자기
--   행을 찾고 다른 사용자 id 를 파라미터로 받지 않으므로 권한 상승 경로가 없습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql(profiles 테이블) 이후 아무 때나. create or replace /
--   grant / create policy 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 단위 권한 + RLS — "role 은 빼고 name/phone 만, 내 행만" 을 DB 레벨에서 강제합니다.
--    (update_user_profile() 이 SECURITY DEFINER 라 이 그랜트/정책이 없어도 RPC 경로는 동작하지만,
--     PostgREST 로 profiles 를 직접 PATCH 하는 경로까지 같은 기준으로 막아 두기 위해 함께 둡니다.)
-- ----------------------------------------------------------------------------
grant update (name, phone) on public.profiles to authenticated;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2) 자가 수정 RPC — 이름은 trim 후 1~30자, 연락처는 선택 입력(빈 값이면 null 로 저장)이고 입력하면
--    숫자 9~11자리여야 합니다. 저장 형식은 apply.html formatPhoneDigits() 와 같은 3-3-3/3-3-4/3-4-4
--    하이픈 규칙으로 서버에서 다시 정규화해, 클라이언트가 무엇을 보내든 저장된 형식이 항상 같습니다.
-- ----------------------------------------------------------------------------
create or replace function public.update_user_profile(p_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone  text;
  v_row    public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if v_digits = '' then
    v_phone := null; -- 연락처는 선택 입력
  elsif length(v_digits) < 9 or length(v_digits) > 11 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  elsif length(v_digits) <= 10 then
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7);
  else
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4);
  end if;

  update public.profiles
     set name = v_name,
         phone = v_phone
   where id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.update_user_profile(text, text) from public, anon;
grant  execute on function public.update_user_profile(text, text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [20b. 회원 탈퇴/계정 관리]  (원본: sql/profile_account_management.sql)
-- ==============================================================================

-- ============================================================================
-- profile-edit.html 고도화(주소지 관리 · 알림 수신 설정 · 회원 탈퇴)를 위한 profiles 컬럼 확장 +
-- update_user_profile() 확장 + 회원 탈퇴용 deactivate_own_account() 추가.
--
--   [비밀번호 변경] 섹션은 이 사이트가 카카오 OAuth 전용(이메일/비밀번호 로그인 없음, login.html의
--   아이디/비밀번호 입력란은 "카카오 소셜 로그인을 이용해 주세요" 안내만 띄우는 비활성 UI)이라 넣지
--   않았습니다 — 모든 계정에 "현재 비밀번호"라는 게 존재하지 않아 검증할 방법이 없습니다.
--
--   [회원 탈퇴]는 하드 삭제(auth.users 행 삭제)가 아닙니다. profiles.id 를 참조하는 여러 테이블
--   (예: care_schedules.guardian_id/manager_id — on delete cascade 가 안 걸린 FK) 때문에 하드 삭제는
--   거의 항상 외래키 제약 위반으로 실패하고, 설령 성공해도 결제/정산 이력을 실제로 지우는 것은
--   전자상거래법상 바람직하지 않습니다. 그래서 "탈퇴"는 (1) 이 함수로 profiles 의 개인식별정보만
--   지우고 (2) supabase/functions/delete-account 가 GoTrue Admin API로 이 계정을 매우 긴 기간
--   차단(ban)해 다시 로그인할 수 없게 만드는 두 단계로 구현합니다.
--
--   실행 순서: sql/profile_self_update.sql 이후 아무 때나. create or replace / alter table add column
--   if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists address          text;
alter table public.profiles add column if not exists address_detail   text;
-- 케어 안내(배정/일정/결제 등 서비스 운영에 필요한 알림)는 기본 수신 — 마케팅과 성격이 다릅니다.
alter table public.profiles add column if not exists notify_care      boolean not null default true;
-- 마케팅/프로모션 알림은 정보통신망법상 별도 동의가 필요하므로 기본값은 false(수신안함)입니다.
alter table public.profiles add column if not exists notify_marketing boolean not null default false;
alter table public.profiles add column if not exists withdrawn_at     timestamptz;

-- ----------------------------------------------------------------------------
-- 2) 컬럼 단위 권한 — sql/profile_self_update.sql 이 열어 둔 name/phone 에 새 컬럼들을 더합니다.
--    (profiles_update_own RLS 정책은 이미 있으므로 다시 만들지 않습니다.)
-- ----------------------------------------------------------------------------
grant update (name, phone, address, address_detail, notify_care, notify_marketing) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 3) 자가 수정 RPC 확장 — 기존 update_user_profile(text, text) 를 대체합니다(시그니처가 바뀌므로
--    이전 2-인자 버전은 명시적으로 drop). 이름/연락처 검증 로직은 sql/profile_self_update.sql 과
--    동일하고, 주소/알림 수신 여부가 추가됐습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.update_user_profile(text, text);

create or replace function public.update_user_profile(
  p_name             text,
  p_phone            text,
  p_address          text default null,
  p_address_detail   text default null,
  p_notify_care      boolean default true,
  p_notify_marketing boolean default false
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name           text := nullif(btrim(coalesce(p_name, '')), '');
  v_digits         text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone          text;
  v_address        text := nullif(btrim(coalesce(p_address, '')), '');
  v_address_detail text := nullif(btrim(coalesce(p_address_detail, '')), '');
  v_row            public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if v_digits = '' then
    v_phone := null; -- 연락처는 선택 입력
  elsif length(v_digits) < 9 or length(v_digits) > 11 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  elsif length(v_digits) <= 10 then
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7);
  else
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4);
  end if;

  if v_address is not null and length(v_address) > 200 then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  if v_address_detail is not null and length(v_address_detail) > 100 then
    raise exception 'INVALID_ADDRESS_DETAIL' using errcode = '22023';
  end if;

  update public.profiles
     set name             = v_name,
         phone            = v_phone,
         address          = v_address,
         address_detail   = v_address_detail,
         notify_care      = coalesce(p_notify_care, true),
         notify_marketing = coalesce(p_notify_marketing, false)
   where id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.update_user_profile(text, text, text, text, boolean, boolean) from public, anon;
grant  execute on function public.update_user_profile(text, text, text, text, boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) 회원 탈퇴 1단계 — profiles 의 개인식별정보 스크럽. 2단계(로그인 영구 차단)는
--    supabase/functions/delete-account 가 이 RPC 호출 *다음*에 GoTrue Admin API로 수행합니다.
-- ----------------------------------------------------------------------------
create or replace function public.deactivate_own_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.profiles
     set name             = '탈퇴한 회원',
         phone            = null,
         address          = null,
         address_detail   = null,
         notify_care      = false,
         notify_marketing = false,
         withdrawn_at     = now()
   where id = auth.uid();
end $$;

revoke all on function public.deactivate_own_account() from public, anon;
grant  execute on function public.deactivate_own_account() to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [20c. 전화번호 잠금]  (원본: sql/profile_phone_lock.sql)
-- ==============================================================================

-- ============================================================================
-- 휴대폰 번호(profiles.phone) 자기서비스 수정 잠금 — profile-edit.html 의 '휴대폰 번호' 입력칸을
-- 읽기 전용으로 바꾸면서, 백엔드도 같은 기준으로 막습니다(화면만 잠그고 API는 열려 있으면 소용없음).
--
--   ※ 중요한 사실 확인(향후 유지보수자를 위한 기록): 이 사이트는 카카오 OAuth 로그인 시 전화번호
--   scope(카카오싱크의 "카카오 계정과 연결된 전화번호" 동의 항목)를 요청하지 않고, 지금까지 카카오로부터
--   실제 전화번호를 받아온 적이 없습니다(코드 전체에 phone scope 처리가 전혀 없음 — js/auth-header.js
--   의 signInWithOAuth 호출에 scopes 옵션 자체가 없습니다). profiles.phone 은 여전히 자기기입 값이고,
--   이 마이그레이션은 "카카오가 실제로 동기화해 주는 값"으로 바뀌는 게 아니라 "사용자가 더 이상
--   스스로 바꿀 수 없게" 만드는 것뿐입니다 — 화면 안내 문구와 실제 데이터 소스가 다르다는 점을
--   알고 있어야 번호가 비어 있거나 틀린 계정을 만났을 때 당황하지 않습니다. 고치려면 Supabase
--   대시보드에서 관리자가 직접 profiles.phone 을 수정하는 것이 지금은 유일한 경로입니다.
--
--   실행 순서: sql/profile_account_management.sql 이후 아무 때나.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 단위 권한에서 phone 제외 — PostgREST 로 profiles 를 직접 PATCH 하는 경로까지 막습니다
--    (sql/profile_account_management.sql 이 name/phone/address/address_detail/notify_* 를 한 번에
--    열어 줬던 것에서 phone 만 다시 거둬들입니다).
-- ----------------------------------------------------------------------------
revoke update (phone) on public.profiles from authenticated;

-- ----------------------------------------------------------------------------
-- 2) update_user_profile() 재정의 — p_phone 파라미터는 호환을 위해 시그니처에 남겨 두지만(기존
--    호출부가 이 값을 보내도 에러가 나지 않도록 default null 로 바꿈), UPDATE SET 절에서 완전히
--    빼서 어떤 값을 보내도 phone 컬럼은 손대지 않습니다 — 클라이언트가 보내는 값을 신뢰하지 않는
--    것이 아니라, 아예 읽지도 않습니다(가장 안전한 방어).
-- ----------------------------------------------------------------------------
create or replace function public.update_user_profile(
  p_name             text,
  p_phone            text default null, -- 더 이상 사용하지 않음(호환용) — phone 은 이 함수로 바꿀 수 없습니다
  p_address          text default null,
  p_address_detail   text default null,
  p_notify_care      boolean default true,
  p_notify_marketing boolean default false
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name           text := nullif(btrim(coalesce(p_name, '')), '');
  v_address        text := nullif(btrim(coalesce(p_address, '')), '');
  v_address_detail text := nullif(btrim(coalesce(p_address_detail, '')), '');
  v_row            public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if v_address is not null and length(v_address) > 200 then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  if v_address_detail is not null and length(v_address_detail) > 100 then
    raise exception 'INVALID_ADDRESS_DETAIL' using errcode = '22023';
  end if;

  update public.profiles
     set name             = v_name,
         -- phone 은 의도적으로 빠져 있습니다 — p_phone 에 무엇이 들어오든 기존 값이 그대로 유지됩니다.
         address          = v_address,
         address_detail   = v_address_detail,
         notify_care      = coalesce(p_notify_care, true),
         notify_marketing = coalesce(p_notify_marketing, false)
   where id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.update_user_profile(text, text, text, text, boolean, boolean) from public, anon;
grant  execute on function public.update_user_profile(text, text, text, text, boolean, boolean) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [20d. 카카오 동기화]  (원본: sql/profile_phone_kakao_sync.sql)
-- ==============================================================================

-- ============================================================================
-- 휴대폰 번호(profiles.phone) — 카카오 자동 동기화 + "번호가 없는 유저"를 위한 결제 시점 1회 입력.
--
--   이 파일은 sql/profile_phone_lock.sql(authenticated 의 자기서비스 수정을 막는 락)과 짝입니다.
--   "사용자가 스스로 못 고친다"는 그대로 유지하면서, phone 이 실제로 채워질 수 있는 두 경로만 열어
--   둡니다 — 둘 다 authenticated 롤의 테이블 권한이 아니라 SECURITY DEFINER 함수/트리거를 통해서만
--   동작하므로 profile_phone_lock.sql 의 revoke 와 충돌하지 않습니다.
--
--   ⚠ 1번(카카오 자동 동기화)은 이 저장소의 코드만으로는 100% 보장할 수 없는 외부 의존성이 두 개
--   있습니다 — login.html 의 scopes 요청 주석에 적어 둔 그대로입니다:
--     (1) 카카오 디벨로퍼스 콘솔에서 "전화번호" 동의항목이 비즈 앱 심사를 통과해야 카카오가 번호를
--         내려줍니다(사업자가 외부에서 진행하는 절차 — 코드로 할 수 없음).
--     (2) Supabase Auth(GoTrue)의 카카오 프로바이더가 그 값을 raw_user_meta_data 에 실제로 넣어
--         줘야 아래 트리거가 읽을 수 있습니다 — Supabase 쪽 구현에 달려 있어 이 저장소 코드로
--         확인/보장할 수 없습니다.
--   두 조건 중 하나라도 안 맞으면 아래 트리거는 그냥 조용히 아무 것도 하지 않고 넘어갑니다(필수
--   경로가 아니라 "되면 좋은" 보강 경로) — 그래서 2번(결제 시점 1회 입력)이 실제로는 더 중요한,
--   항상 동작하는 안전망입니다.
--
--   실행 순서: sql/profile_phone_lock.sql 이후 아무 때나.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 카카오 로그인 → profiles.phone 자동 동기화 (있을 때만, 되면 좋은 보강 경로)
--
--    auth.users.raw_user_meta_data 안에서 전화번호가 들어올 수 있는 몇 가지 경로를 방어적으로
--    다 찾아봅니다 — Supabase 카카오 프로바이더가 실제로 어떤 키에 매핑하는지 코드만으로는 확신할
--    수 없으므로, 흔히 쓰이는 키 이름들을 전부 시도합니다. 로그인 때마다(INSERT/UPDATE 모두) 실행해
--    매번 최신 값으로 맞추되, 카카오가 값을 안 줬을 때는(이 세션에서 scope 동의가 없었거나, 비즈
--    앱 승인 전이거나) 기존 값을 절대 지우지 않습니다 — "없다"와 "안 알려줬다"를 구분할 방법이
--    없어서, 더 보수적인 쪽(기존 값 보존)으로 처리합니다.
-- ----------------------------------------------------------------------------
create or replace function public.sync_kakao_phone_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_raw     text;
  v_digits  text;
  v_phone   text;
begin
  v_raw := coalesce(
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data#>>'{kakao_account,phone_number}'
  );
  if v_raw is null or btrim(v_raw) = '' then
    return new; -- 카카오가 번호를 안 줬음 — 기존 profiles.phone 은 그대로 둡니다.
  end if;

  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  -- 카카오는 보통 국가코드(+82)를 포함해 주므로 '820...' 형태면 맨 앞 82 를 떼고 0을 다시 붙입니다.
  if length(v_digits) = 11 and left(v_digits, 2) = '82' then
    v_digits := '0' || substr(v_digits, 3);
  end if;
  if length(v_digits) < 9 or length(v_digits) > 11 then
    return new; -- 형식을 알 수 없는 값 — 잘못된 번호를 저장하는 것보다 건너뛰는 쪽이 안전합니다.
  end if;

  v_phone := case
    when length(v_digits) <= 10 then substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7)
    else substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
  end;

  update public.profiles set phone = v_phone where id = new.id and phone is distinct from v_phone;
  return new;
end $$;

drop trigger if exists on_auth_user_kakao_phone_sync on auth.users;
create trigger on_auth_user_kakao_phone_sync
  after insert or update on auth.users
  for each row execute function public.sync_kakao_phone_from_auth();

-- ----------------------------------------------------------------------------
-- 2) 결제/예약 시점의 1회 입력 — profiles.phone 이 NULL 인 유저가 케어 패키지 구매(package.html)
--    같은 결제 플로우에서 알림톡 받을 번호를 한 번 입력하면 그때만 저장됩니다. 이미 값이 있으면
--    (카카오 동기화로 채워졌든, 과거에 이 함수로 채워졌든) 조용히 기존 값을 그대로 반환합니다 —
--    "1회"라는 말 그대로, 이 함수로 이미 채워진 뒤에는 다시 바꿀 수 없습니다(그 다음엔 사용자
--    자신도 못 고치는 sql/profile_phone_lock.sql 의 잠금과 같은 성격이 됩니다).
-- ----------------------------------------------------------------------------
create or replace function public.set_initial_phone_if_missing(p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone  text;
  v_row    public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.profiles where id = auth.uid();
  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.phone is not null then
    return v_row; -- 이미 번호가 있음 — 그대로 반환(덮어쓰지 않음, 에러도 아님)
  end if;

  if length(v_digits) < 9 or length(v_digits) > 11 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  v_phone := case
    when length(v_digits) <= 10 then substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7)
    else substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
  end;

  update public.profiles set phone = v_phone where id = auth.uid() returning * into v_row;
  return v_row;
end $$;

revoke all on function public.set_initial_phone_if_missing(text) from public, anon;
grant  execute on function public.set_initial_phone_if_missing(text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [20e. 전화번호 중복 방지]  (원본: sql/profile_phone_uniqueness.sql)
-- ==============================================================================

-- ============================================================================
-- 1인 1계정 정책 — 휴대폰 번호(profiles.phone) 중복 가입 차단.
--
--   목적: 같은 휴대폰 번호로 여러 개의 계정이 만들어지는 것을 막습니다. 이 저장소에는 phone 이
--   채워지는 경로가 두 곳 있습니다(sql/profile_phone_kakao_sync.sql 참고) — 둘 다 아래에서
--   "이미 등록된 번호면 막기"로 다시 정의합니다:
--     (1) sync_kakao_phone_from_auth() — auth.users INSERT/UPDATE 트리거. signup.html 이 이메일
--         가입 시 options.data.phone 으로 보낸 값도 이 경로로 들어옵니다.
--     (2) set_initial_phone_if_missing() — package.html 등에서 번호가 없는 유저가 결제 시점에
--         1회 입력하는 RPC.
--   여기에 더해, signup.html 이 auth.signUp() 을 호출하기 *전에* 미리 물어볼 수 있는 익명 호출용
--   RPC(is_phone_registered)를 새로 추가해, 계정이 실제로 만들어지기 전에 친절한 한국어 에러를
--   보여줄 수 있게 합니다. DB 의 UNIQUE 인덕스는 이 사전 체크를 우회하는 모든 경로(동시 요청 레이스,
--   향후 추가될 카카오 전화번호 동기화 등)에 대한 최종 방어선입니다.
--
--   ⚠ 실행 전: 이미 같은 번호로 중복 가입된 계정이 있다면 UNIQUE 인덕스 생성이 실패합니다. 먼저
--   아래로 중복 여부를 확인하세요:
--     select phone, count(*) from public.profiles where phone is not null group by phone having count(*) > 1;
--   중복이 있다면 어느 계정을 남길지 운영 판단으로 정리한 뒤 이 파일을 실행하세요.
--
--   실행 순서: sql/profile_phone_kakao_sync.sql 이후 아무 때나(두 함수를 CREATE OR REPLACE 로
--   다시 정의하므로 실행 순서 자체는 중요하지 않습니다).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) 전화번호 정규화 공용 함수 — 숫자만 추출해 "010-1234-5678" 형태로 통일합니다. 형식이 이상하면
--    (9~11자리 범위를 벗어나면) null 을 돌려줍니다. 기존 두 함수에 복붙돼 있던 로직을 하나로 모아,
--    "등록 여부 확인"과 "실제 저장"이 서로 다른 번호로 비교/저장되는 것을 막습니다.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_phone(p_raw text) returns text
language plpgsql immutable as $$
declare
  v_digits text := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
begin
  if length(v_digits) = 11 and left(v_digits, 2) = '82' then
    v_digits := '0' || substr(v_digits, 3);
  end if;
  if length(v_digits) < 9 or length(v_digits) > 11 then
    return null;
  end if;
  return case
    when length(v_digits) <= 10 then substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7)
    else substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
  end;
end $$;

revoke all on function public.normalize_phone(text) from public, anon, authenticated;
grant  execute on function public.normalize_phone(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) DB 단 원천 방어 — phone 이 있는 행끼리는 값이 겹칠 수 없습니다. phone 이 null(아직 입력 전)인
--    행은 여러 개 있어도 됩니다(partial unique index).
-- ----------------------------------------------------------------------------
create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone) where phone is not null;

-- ----------------------------------------------------------------------------
-- 2) 가입 전 사전 확인용 RPC — 로그인하지 않은 사용자(회원가입 폼)도 호출해야 하므로 anon 에게도
--    실행 권한을 줍니다. profiles 테이블 자체는 RLS 로 본인 행만 보이므로, 다른 사람의 전화번호가
--    등록되어 있는지 "여부(boolean)"만 돌려주고 그 외 정보는 노출하지 않습니다.
-- ----------------------------------------------------------------------------
create or replace function public.is_phone_registered(p_phone text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.normalize_phone(p_phone);
begin
  if v_phone is null then
    return false; -- 형식이 이상한 값은 "중복 아님"으로 — 형식 검증은 클라이언트 쪽 책임입니다.
  end if;
  return exists (select 1 from public.profiles where phone = v_phone);
end $$;

revoke all on function public.is_phone_registered(text) from public;
grant  execute on function public.is_phone_registered(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) sync_kakao_phone_from_auth() 재정의 — normalize_phone() 을 쓰도록 바꾸고, UNIQUE 위반을
--    사람이 읽을 수 있는 메시지로 바꿔 던집니다. 이 함수는 auth.users AFTER INSERT 트리거로 실행되므로,
--    예외가 나면 auth.users INSERT 자체가 롤백됩니다 — 즉 중복 번호로는 계정이 "절대" 만들어지지
--    않습니다(signup.html 의 사전 체크를 우회하는 모든 경로에 대한 최종 방어선).
-- ----------------------------------------------------------------------------
create or replace function public.sync_kakao_phone_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_raw   text;
  v_phone text;
begin
  v_raw := coalesce(
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data#>>'{kakao_account,phone_number}'
  );
  if v_raw is null or btrim(v_raw) = '' then
    return new; -- 번호를 안 받았음 — 기존 profiles.phone 은 그대로 둡니다.
  end if;

  v_phone := public.normalize_phone(v_raw);
  if v_phone is null then
    return new; -- 형식을 알 수 없는 값 — 잘못된 번호를 저장하는 것보다 건너뛰는 쪽이 안전합니다.
  end if;

  begin
    update public.profiles set phone = v_phone where id = new.id and phone is distinct from v_phone;
  exception when unique_violation then
    raise exception '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.' using errcode = '23505';
  end;
  return new;
end $$;

-- 트리거는 이미 profile_phone_kakao_sync.sql 에서 만들어져 있으므로 다시 만들 필요 없습니다
-- (함수 본문만 CREATE OR REPLACE 로 바뀝니다). 그래도 안전하게 한 번 더 명시합니다.
drop trigger if exists on_auth_user_kakao_phone_sync on auth.users;
create trigger on_auth_user_kakao_phone_sync
  after insert or update on auth.users
  for each row execute function public.sync_kakao_phone_from_auth();

-- ----------------------------------------------------------------------------
-- 4) set_initial_phone_if_missing() 재정의 — 결제 시점 1회 입력 경로도 같은 기준으로 막습니다.
-- ----------------------------------------------------------------------------
create or replace function public.set_initial_phone_if_missing(p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_row   public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.profiles where id = auth.uid();
  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.phone is not null then
    return v_row; -- 이미 번호가 있음 — 그대로 반환(덮어쓰지 않음, 에러도 아님)
  end if;

  if v_phone is null then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  begin
    update public.profiles set phone = v_phone where id = auth.uid() returning * into v_row;
  exception when unique_violation then
    raise exception '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.' using errcode = '23505';
  end;
  return v_row;
end $$;

revoke all on function public.set_initial_phone_if_missing(text) from public, anon;
grant  execute on function public.set_initial_phone_if_missing(text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [21. 관리자 회원 관리(상세조회/수정/CS메모)]  (원본: sql/admin_member_management.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔(admin.html) '회원 관리' CS 대응 기능 확장
--
--   1) admin_list_members() 재정의 — 계정 정지 여부(banned_until)와, 페이지네이션에 필요한 전체
--      건수(total_count, window 함수로 이 호출의 where 조건 기준 총 개수를 매 행에 함께 돌려줌 —
--      별도 count 쿼리 없이 한 번의 호출로 "몇 번째 페이지"를 그릴 수 있게 합니다)를 추가합니다.
--      RETURNS TABLE 의 컬럼 구성이 바뀌므로 CREATE OR REPLACE 로는 안 되고, 먼저 DROP 해야 합니다.
--   2) admin_member_notes — 회원별 CS 메모(운영자 전용, 누적 로그 — 수정/삭제 없이 쌓이기만 함).
--   3) admin_update_member_profile() — 관리자가 CS 응대 중 회원의 이름/전화번호/주소를 직접 고칩니다.
--      전화번호는 sql/profile_phone_uniqueness.sql 의 normalize_phone() 으로 포맷을 통일하고, 같은
--      파일의 UNIQUE 인덕스(profiles_phone_unique_idx)로 다른 회원과의 중복도 그대로 막힙니다.
--   4) user_coupons / seniors 관리자 전체 조회 정책 — 회원 상세 모달에 보유 쿠폰·등록된 어르신
--      프로필을 보여주기 위해 필요합니다(user_packages 는 sql/admin_package_management.sql 에서
--      이미 열려 있음).
--   5) 계정 정지/활성화는 GoTrue Admin API(auth.admin.updateUserById, ban_duration) 로만 할 수 있어
--      SQL이 아니라 service-role Edge Function(supabase/functions/admin-set-member-status)이 담당합니다.
--   6) admin_update_member_profile() / admin_add_member_note() 는 성공 시 sql/admin_logs.sql 의
--      log_admin_action() 을 호출해 admin-logs.html 감사 로그에도 함께 남깁니다.
--
--   실행 순서: sql/admin_user_management.sql → sql/admin_rls_policies.sql(is_admin()) →
--             sql/profile_phone_uniqueness.sql(normalize_phone()) → sql/welcome_coupons.sql
--             (user_coupons) → sql/supabase_schema_latest.sql(seniors) → sql/admin_logs.sql
--             (log_admin_action()) → 이 파일.
--   전부 drop/create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) admin_list_members() 재정의 — banned_until(계정 정지 여부) + total_count(페이지네이션용) 추가
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_members(integer, integer, text, text, text);

create or replace function public.admin_list_members(
  p_limit    integer default 21,
  p_offset   integer default 0,
  p_search   text    default null, -- 이름/휴대폰 부분일치(대소문자 무시). null/빈 문자열이면 전체.
  p_provider text    default null, -- 'email' | 'kakao' | null(전체)
  p_verified text    default null  -- 'verified' | 'unverified' | null(전체)
)
returns table (
  id                  uuid,
  name                text,
  phone               text,
  email               text,
  provider            text,
  email_confirmed_at  timestamptz,
  banned_until        timestamptz,
  created_at          timestamptz,
  address             text,
  address_detail      text,
  total_count         bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    p.name,
    p.phone,
    u.email::text,
    -- Supabase Auth 가 가입 시 자동으로 채우는 필드 — 'email'(이메일/비밀번호) | 'kakao' 등.
    -- 과거 데이터 중 이 값이 비어 있는 경우는 이메일/비밀번호 가입으로 간주합니다.
    coalesce(u.raw_app_meta_data->>'provider', 'email') as provider,
    u.email_confirmed_at,
    u.banned_until,
    u.created_at,
    p.address,
    p.address_detail,
    count(*) over() as total_count
  from auth.users u
  left join public.profiles p on p.id = u.id
  where
    (v_search is null
      or p.name  ilike '%' || v_search || '%'
      or p.phone ilike '%' || v_search || '%')
    and (p_provider is null
      or coalesce(u.raw_app_meta_data->>'provider', 'email') = p_provider)
    and (p_verified is null
      or (p_verified = 'verified'   and u.email_confirmed_at is not null)
      or (p_verified = 'unverified' and u.email_confirmed_at is null))
  order by u.created_at desc
  limit p_limit offset p_offset;
end $$;

revoke all on function public.admin_list_members(integer, integer, text, text, text) from public, anon;
grant  execute on function public.admin_list_members(integer, integer, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 2) admin_member_notes — 회원별 CS 메모(운영자 전용, 누적 로그)
--    '누가 언제 무슨 메모를 남겼는지' 전부 남기는 것이 CS 이력 추적의 목적이라, 수정/삭제를 만들지
--    않고 insert만 허용합니다(admin_care_adjustments 와 같은 "되돌릴 수 없는 이력" 성격).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_member_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  admin_id   uuid not null references public.profiles(id),
  note       text not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_member_notes_user_idx
  on public.admin_member_notes (user_id, created_at desc);

alter table public.admin_member_notes enable row level security;
drop policy if exists admin_member_notes_select_admin on public.admin_member_notes;
create policy admin_member_notes_select_admin on public.admin_member_notes
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.admin_member_notes from anon, authenticated;
grant  select on public.admin_member_notes to authenticated;
revoke all on public.admin_member_notes from anon;

create or replace function public.admin_add_member_note(p_user_id uuid, p_note text)
returns public.admin_member_notes
language plpgsql security definer set search_path = public as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_row  public.admin_member_notes;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if v_note = '' then
    raise exception 'NOTE_REQUIRED' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.admin_member_notes (user_id, admin_id, note)
  values (p_user_id, auth.uid(), v_note)
  returning * into v_row;

  -- 감사 로그 기록 실패(예: sql/admin_logs.sql 이 아직 적용되지 않아 log_admin_action() 자체가
  -- 없는 경우)가 CS 메모 저장까지 함께 롤백시키지 않도록 별도 블록으로 감쌉니다 — 실패해도 메모는
  -- 그대로 저장되고, 원인은 Postgres 로그의 WARNING 으로 확인할 수 있습니다.
  begin
    perform public.log_admin_action('member_note_add', 'member', p_user_id::text,
      jsonb_build_object('note_preview', left(v_note, 120)));
  exception when others then
    raise warning 'admin_add_member_note: log_admin_action 호출 실패(메모 저장 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_add_member_note(uuid, text) from public, anon;
grant  execute on function public.admin_add_member_note(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) admin_update_member_profile() — 관리자가 회원의 이름/전화번호/주소를 직접 수정
--    (profile-edit.html 의 update_user_profile() 과 달리 auth.uid() 본인이 아니라 p_user_id 를
--    대상으로 하고, phone 컬럼도 함께 바꿀 수 있습니다 — sql/profile_phone_lock.sql 의 self-service
--    잠금은 authenticated 롤의 테이블 권한을 거둔 것이라, SECURITY DEFINER 로 도는 이 함수에는
--    적용되지 않습니다.)
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_member_profile(
  p_user_id        uuid,
  p_name           text,
  p_phone          text default null,
  p_address        text default null,
  p_address_detail text default null
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text;
  v_row   public.profiles;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  -- 빈 값으로 보내면(번호를 지우는 CS 상황) null 로 저장하고, 값이 있으면 normalize_phone() 으로
  -- 포맷을 통일해 "010-1234-5678" 형태로 맞춥니다. 형식을 알 수 없는 값은 저장을 거부합니다.
  if coalesce(btrim(p_phone), '') = '' then
    v_phone := null;
  else
    v_phone := public.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'INVALID_PHONE' using errcode = '22023';
    end if;
  end if;

  begin
    update public.profiles
       set name           = v_name,
           phone          = v_phone,
           address        = nullif(btrim(coalesce(p_address, '')), ''),
           address_detail = nullif(btrim(coalesce(p_address_detail, '')), '')
     where id = p_user_id
    returning * into v_row;
  exception when unique_violation then
    raise exception '이미 해당 휴대폰 번호로 가입된 다른 계정이 존재합니다.' using errcode = '23505';
  end;

  if v_row.id is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    perform public.log_admin_action('member_profile_update', 'member', p_user_id::text,
      jsonb_build_object('name', v_row.name, 'phone', v_row.phone, 'address', v_row.address, 'address_detail', v_row.address_detail));
  exception when others then
    raise warning 'admin_update_member_profile: log_admin_action 호출 실패(정보 수정 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_update_member_profile(uuid, text, text, text, text) from public, anon;
grant  execute on function public.admin_update_member_profile(uuid, text, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) user_coupons / seniors — 관리자 전체 조회 (회원 상세 모달의 '보유 쿠폰' / '등록된 어르신 프로필')
--    기존 본인 전용 정책(user_coupons_select_own, seniors_select_own)은 그대로 두고, permissive
--    정책이라 OR 로 합쳐집니다 — is_admin() 인 세션만 추가로 전체 행을 볼 수 있습니다.
-- ----------------------------------------------------------------------------
drop policy if exists user_coupons_select_admin on public.user_coupons;
create policy user_coupons_select_admin on public.user_coupons
  for select to authenticated using (public.is_admin());

drop policy if exists seniors_select_admin on public.seniors;
create policy seniors_select_admin on public.seniors
  for select to authenticated using (public.is_admin());


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [22. 관리자 쿠폰/패키지 수동 지급]  (원본: sql/admin_member_benefit_grants.sql)
-- ==============================================================================

-- ============================================================================
-- 어드민 콘솔(admin.html) 회원 상세 모달 — 쿠폰/회차 수동 지급·차감
--
--   목적: CS 응대 중 보상/정정 목적으로 관리자가 쿠폰을 직접 발급하거나, 패키지 구매 이력이
--   없는 회원에게도 회차를 임의로 넣어 줄 수 있게 합니다. 전부 아래 네 개의 SECURITY DEFINER
--   RPC를 통해서만 이뤄지고(user_coupons/user_packages 는 이미 authenticated 의 직접 insert/
--   update/delete 권한이 없음 — sql/welcome_coupons.sql, sql/user_packages_system.sql), 각 RPC는:
--     1) is_admin() 이 아니면 전부 거부(fail closed)
--     2) 변경 사유(메모) 10자 미만이면 거부 — "반드시 사유를 남겨야 처리된다"를 DB 단에서 강제
--     3) 성공하면 sql/admin_logs.sql 의 log_admin_action() 으로 admin_logs 에 영구 기록
--        (관리자 id/이름/이메일은 log_admin_action 내부에서 자동으로 채워지고, 여기서는
--        action_type/target_type/target_id/detail(jsonb — 변경 내용 + 입력한 사유)만 넘깁니다)
--   을 공통으로 지킵니다.
--
--   ⚠ 기존 admin_adjust_user_package()(sql/admin_package_management.sql, '패키지 구매 회원 관리'
--   섹션의 [회차 조정] 전용)는 건드리지 않았습니다 — 그 기능은 이미 운영 중이고 메모 10자 제한이
--   없는 채로 써 왔으므로, 여기서 새로 추가하는 더 엄격한 검증을 거기에도 적용하면 기존 흐름이
--   갑자기 막힐 수 있습니다. 이 파일의 admin_adjust_member_sessions() 는 회원 상세 모달의
--   [− 회차 수동 차감] 전용으로 별도로 둔, 의도적으로 분리된 함수입니다.
--
--   실행 순서: sql/admin_rls_policies.sql(is_admin()) → sql/admin_logs.sql(log_admin_action()) →
--             sql/welcome_coupons.sql(user_coupons) → sql/user_packages_system.sql(user_packages) →
--             sql/admin_member_management.sql → 이 파일.
--   전부 create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) admin_grant_member_coupon() — 쿠폰 수동 지급
--    coupon_code 는 user_coupons 의 unique(user_id, coupon_code) 제약과 겹치지 않도록, 지급마다
--    고유한 값을 만들어 둡니다("같은 사람에게 같은 금액을 두 번 지급"해도 막히지 않아야 함).
-- ----------------------------------------------------------------------------
create or replace function public.admin_grant_member_coupon(
  p_user_id uuid,
  p_amount  integer,
  p_memo    text
)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_code text;
  v_row  public.user_coupons;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_code := 'ADMIN_GRANT_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 6);

  -- 관리자 수동 지급 쿠폰은 결제 할인 목적(welcome coupon)보다 CS 보상 성격이 강해, 조금 더 길게
  -- 90일 유효기간을 둡니다(sql/welcome_coupons.sql 의 신규가입 쿠폰은 30일).
  insert into public.user_coupons (user_id, coupon_code, amount, expires_at)
  values (p_user_id, v_code, p_amount, now() + interval '90 days')
  returning * into v_row;

  -- 감사 로그 실패가 쿠폰 지급 자체를 롤백하지 않도록 별도 블록으로 감쌉니다(아래 세 함수 모두 동일).
  begin
    perform public.log_admin_action('coupon_grant', 'member', p_user_id::text,
      jsonb_build_object('coupon_id', v_row.id, 'amount', p_amount, 'memo', v_memo));
  exception when others then
    raise warning 'admin_grant_member_coupon: log_admin_action 호출 실패(쿠폰 지급 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_grant_member_coupon(uuid, integer, text) from public, anon;
grant  execute on function public.admin_grant_member_coupon(uuid, integer, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 2) admin_delete_member_coupon() — 쿠폰 삭제(하드 삭제 — 지급을 되돌리는 조작이라 이 역시
--    사유를 남겨야 하고, 지워지기 전의 내용을 detail 에 스냅샷으로 남겨 둡니다(삭제 후엔 행이
--    없어 admin_logs 가 "무엇을 지웠는지"에 대한 유일한 기록이 됩니다).
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_member_coupon(
  p_coupon_id uuid,
  p_memo      text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_row  public.user_coupons;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;

  select * into v_row from public.user_coupons where id = p_coupon_id;
  if v_row.id is null then
    raise exception 'COUPON_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.user_coupons where id = p_coupon_id;

  begin
    perform public.log_admin_action('coupon_delete', 'member', v_row.user_id::text,
      jsonb_build_object('coupon_id', v_row.id, 'amount', v_row.amount, 'status', v_row.status, 'memo', v_memo));
  exception when others then
    raise warning 'admin_delete_member_coupon: log_admin_action 호출 실패(쿠폰 삭제 자체는 완료됨) — %', sqlerrm;
  end;

  return true;
end $$;

revoke all on function public.admin_delete_member_coupon(uuid, text) from public, anon;
grant  execute on function public.admin_delete_member_coupon(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) admin_grant_member_package() — 회차 수동 지급(항상 새 user_packages 행을 만듭니다 — 패키지
--    구매 이력이 전혀 없는 회원에게도 그대로 동작하고, 기존 패키지가 있어도 별도 행으로 쌓여
--    consume_package_on_application() 이 평소처럼 활성 패키지 중에서 골라 씁니다).
--
--    2026-10 보안 강화: 회차 수(p_session_count)를 관리자가 직접 입력하던 파라미터를 완전히
--    없앴습니다 — 숫자를 입력받는 한 "0회 지급" 사유 메모만 적당히 쓰고 비정상적으로 큰 회차를
--    지급하는 악용이나 단순 입력 실수를 막을 방법이 없었습니다. 이제 지급 회차는 package_type
--    만으로 sql/user_packages_system.sql 의 package_session_count() 가 그대로 산정합니다(패키지
--    구매 시 쓰는 것과 동일한 "정답"이라, 수동 지급과 실제 결제가 항상 같은 회차 기준을 씁니다).
--    package_type 도 package.html 이 지금 실제로 판매하는 두 상품(10_hours/20_hours)만 허용합니다
--    — 5_sessions/10_sessions 는 과거 판매분 보유자만 있고 신규 판매·신규 지급 대상이 아닙니다
--    (이미 그 타입으로 보유 중인 패키지의 조회·사용·차감에는 전혀 영향이 없습니다 — user_packages
--    테이블의 CHECK 제약과 소진 로직은 그대로 두었고, 이 함수의 "새로 지급할 수 있는 종류"만 좁혔습니다).
--    파라미터 자체가 바뀌어(CREATE OR REPLACE 로는 안 되고) 먼저 기존 함수를 지웁니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_grant_member_package(uuid, text, numeric, text);

create or replace function public.admin_grant_member_package(
  p_user_id      uuid,
  p_package_type text,
  p_memo         text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_memo          text := btrim(coalesce(p_memo, ''));
  v_session_count integer;
  v_row           public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  -- package.html 이 실제로 파는 상품만 — 5_sessions/10_sessions 는 과거 판매분 보유자 전용이라
  -- 신규 지급 대상에서 뺐습니다(위 설명 참고).
  if p_package_type not in ('10_hours', '20_hours') then
    raise exception 'INVALID_PACKAGE_TYPE' using errcode = '22023';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 회차 수는 입력받지 않고 여기서 직접 산정합니다 — package.html 결제 확정(confirm_package_order_payment())
  -- 이 쓰는 것과 정확히 같은 "정답" 함수라, 수동 지급도 실제 구매와 항상 같은 회차 기준을 갖습니다.
  v_session_count := public.package_session_count(p_package_type);
  if v_session_count is null then
    raise exception 'UNKNOWN_PACKAGE_TYPE: %', p_package_type using errcode = 'P0001';
  end if;

  -- sql/user_packages_system.sql 의 confirm_package_order_payment() 와 같은 180일 유효기간을 씁니다.
  insert into public.user_packages (user_id, package_type, total_count, remaining_count, status, expires_at)
  values (p_user_id, p_package_type, v_session_count, v_session_count, 'active', now() + interval '180 days')
  returning * into v_row;

  begin
    perform public.log_admin_action('package_grant', 'member', p_user_id::text,
      jsonb_build_object('package_id', v_row.id, 'package_type', p_package_type, 'session_count', v_session_count, 'memo', v_memo));
  exception when others then
    raise warning 'admin_grant_member_package: log_admin_action 호출 실패(회차 지급 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_grant_member_package(uuid, text, text) from public, anon;
grant  execute on function public.admin_grant_member_package(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) admin_adjust_member_sessions() — 회차 수동 차감(기존 패키지 대상). admin_adjust_user_package()
--    와 같은 가감 로직이지만, 이 기능 전용으로 메모 10자 제한 + admin_logs 기록을 추가한 별도 함수입니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_adjust_member_sessions(
  p_package_id uuid,
  p_delta      numeric,
  p_memo       text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_pkg  public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = '22023';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;

  update public.user_packages
     set remaining_count = greatest(least(remaining_count + p_delta, total_count), 0)
   where id = p_package_id
  returning * into v_pkg;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    perform public.log_admin_action('package_adjust', 'member', v_pkg.user_id::text,
      jsonb_build_object('package_id', v_pkg.id, 'delta', p_delta, 'remaining_after', v_pkg.remaining_count, 'memo', v_memo));
  exception when others then
    raise warning 'admin_adjust_member_sessions: log_admin_action 호출 실패(회차 차감 자체는 완료됨) — %', sqlerrm;
  end;

  return v_pkg;
end $$;

revoke all on function public.admin_adjust_member_sessions(uuid, numeric, text) from public, anon;
grant  execute on function public.admin_adjust_member_sessions(uuid, numeric, text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [23a. 매니저 지원서(기본)]  (원본: sql/manager_applications.sql)
-- ==============================================================================

-- ============================================================================
-- 케어 매니저 신청 및 승인 시스템
--   일반 유저가 manager-apply.html 에서 케어 매니저 등록을 신청(manager_applications) →
--   관리자가 admin.html 에서 승인/반려. 승인되면 managers 행이 만들어지고(또는 갱신되고)
--   profiles.role 이 'manager' 로 바뀌어, 기존 is_manager()/checkIsManager() 가
--   그 즉시 이 유저를 매니저로 인식합니다 — 권한 판정 로직은 새로 만들지 않고 그대로 재사용합니다.
--   admin.html '활동 중인 케어 매니저' 목록의 [권한 해제] 버튼은 revoke_manager() 로 반대 방향(매니저 → 일반 회원)을 처리합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   create/drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 승인 일자를 관리자 화면(활동 중인 케어 매니저 목록)에 보여주기 위해 managers 에 컬럼을 추가합니다.
-- (managers 자체는 sql/supabase_schema_latest.sql 에서 만들어졌다고 가정)
alter table public.managers add column if not exists approved_at timestamptz;

create table if not exists public.manager_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name             text not null,
  phone            text not null,
  certification    text,
  experience_years integer,
  motivation       text,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  reject_reason    text,
  created_at       timestamptz not null default now()
);

-- 한 유저가 동시에 여러 건을 '대기' 상태로 올리지 못하게 (반려된 뒤 재신청은 새 행으로 허용)
create unique index if not exists manager_applications_one_pending_per_user
  on public.manager_applications (user_id) where status = 'pending';
create index if not exists manager_applications_pending_idx
  on public.manager_applications (created_at) where status = 'pending';

alter table public.manager_applications enable row level security;

-- 본인 신청 내역 + 관리자는 전체 조회
drop policy if exists manager_applications_select on public.manager_applications;
create policy manager_applications_select on public.manager_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 본인 명의로만 신청 가능. 이미 인증된 매니저(managers.certification_verified)는 중복 신청 불가
drop policy if exists manager_applications_insert_own on public.manager_applications;
create policy manager_applications_insert_own on public.manager_applications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.managers m where m.id = auth.uid() and m.certification_verified
    )
  );

-- UPDATE/DELETE 는 아무도 직접 못 함 — 승인/반려는 아래 SECURITY DEFINER 함수로만 처리(감사 로그 성격의 이력 보존)
revoke insert, update, delete on public.manager_applications from anon, authenticated;
grant  select, insert on public.manager_applications to authenticated;
revoke select on public.manager_applications from anon;


-- 승인: managers 행 생성/갱신 + profiles.role='manager' + 신청 상태 갱신을 한 트랜잭션으로 처리
create or replace function public.approve_manager_application(p_application_id uuid)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.managers (id, certification, certification_verified, activity_status, approved_at)
  values (v_app.user_id, v_app.certification, true, 'break', now())
  on conflict (id) do update
    set certification = excluded.certification,
        certification_verified = true,
        approved_at = now();

  update public.profiles set role = 'manager' where id = v_app.user_id;

  return v_app;
end $$;

revoke all on function public.approve_manager_application(uuid) from public, anon;
grant  execute on function public.approve_manager_application(uuid) to authenticated;


-- 반려: 신청 상태만 갱신 (managers/profiles 는 건드리지 않음 — 재신청 가능)
create or replace function public.reject_manager_application(p_application_id uuid, p_reason text default null)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  return v_app;
end $$;

revoke all on function public.reject_manager_application(uuid, text) from public, anon;
grant  execute on function public.reject_manager_application(uuid, text) to authenticated;


-- 매니저 권한 해제: certification_verified 를 false 로 내려 is_manager()/checkIsManager() 가 즉시
-- '매니저 아님'으로 판정하게 하고, profiles.role 도 'guardian'(일반 회원)으로 되돌립니다.
-- managers 행 자체는 지우지 않습니다 — 자격증/이력을 남겨 두면 나중에 다시 승인할 때 정보를 재입력하지 않아도 됩니다.
--
-- ⚠ sql/ · _backup_sql/ 전수 조사 결과 managers 에는 우리가 만든 managers_admin_only_fields 밖에
-- 없었는데, 실제 프로젝트에는 Supabase 대시보드에서 SQL 파일 없이 직접 추가된
-- trigger_auto_verify_manager 가 하나 더 있었고(어떤 로직인지는 이 저장소 어디에도 정의가 없어
-- 알 수 없음), 이게 certification_verified 를 다시 true 로 되돌리고 있었습니다(REVOKE_DID_NOT_APPLY
-- 의 원인). 그 트리거의 내부 로직을 모르는 채로 함부로 다시 만들면(CREATE OR REPLACE) 원래 의도를
-- 지워버릴 위험이 있으므로, 대신 이 함수의 UPDATE 한 문장에 한해서만 두 트리거를 이름으로 지정해
-- 꺼뒀다가 즉시 되살립니다 — 관리자 검증은 이미 위에서 마쳤으므로 안전합니다.
create or replace function public.revoke_manager(p_manager_id uuid)
returns public.managers
language plpgsql security definer set search_path = public as $$
declare
  v_row     public.managers;
  v_recheck boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  -- 두 트리거를 이름으로 지정해 끔 (트리거가 없는 환경에서도 함수가 깨지지 않도록 각각 예외 처리)
  begin
    alter table public.managers disable trigger trigger_auto_verify_manager;
  exception when undefined_object then
    null;
  end;
  begin
    alter table public.managers disable trigger managers_admin_only_fields;
  exception when undefined_object then
    null;
  end;

  update public.managers
     set certification_verified = false
   where id = p_manager_id
  returning * into v_row;

  -- 실패하든 성공하든 반드시 되살림 (다음 UPDATE 부터는 원래 검증/자동화가 정상 동작해야 하므로)
  begin
    alter table public.managers enable trigger trigger_auto_verify_manager;
  exception when undefined_object then
    null;
  end;
  begin
    alter table public.managers enable trigger managers_admin_only_fields;
  exception when undefined_object then
    null;
  end;

  if not found then
    raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- RETURNING 이 준 값이 아니라, 테이블에서 독립적으로 다시 읽어서 실제로 커밋될 상태를 재확인
  select certification_verified into v_recheck
    from public.managers where id = p_manager_id;

  if v_recheck is distinct from false then
    raise exception 'REVOKE_DID_NOT_APPLY: certification_verified 가 false 로 반영되지 않았습니다 (현재 값: %). '
      'trigger_auto_verify_manager/managers_admin_only_fields 는 이미 이 UPDATE 동안 꺼 뒀으므로, '
      'CREATE RULE 로 만든 규칙이나 그 밖의 메커니즘이 있는지 Supabase 대시보드에서 직접 확인하세요.', v_recheck
      using errcode = 'P0001';
  end if;

  update public.profiles set role = 'guardian' where id = p_manager_id and role = 'manager';

  return v_row;
end $$;

revoke all on function public.revoke_manager(uuid) from public, anon;
grant  execute on function public.revoke_manager(uuid) to authenticated;


-- ============================================================================
-- my_application_managers() 재정의: 연락처 폴백 추가
--   sql/supabase_schema_latest.sql 의 원본은 profiles.phone 만 봤는데, 매니저가 자기 프로필(phone)을
--   따로 채운 적이 없으면(보통 그렇습니다 — 매니저는 가입 시 프로필 전화번호를 따로 입력하는 화면이
--   없습니다) 이 값이 비어 있어 보호자 쪽 '담당 매니저 정보' 모달에 번호 대신 "곧 안내해 드려요"만
--   보였습니다. 정작 전화번호는 이 매니저가 지원할 때 적어 낸 manager_applications.phone(not null)에
--   이미 있으므로, profiles.phone 이 비었을 때만 그 값으로 보강합니다 — 가장 최근에 승인된 신청을 우선.
--   이 파일(manager_applications.sql)이 supabase_schema_latest.sql 보다 나중에 실행되므로(파일 맨 위
--   실행 순서 안내 참고) manager_applications 테이블이 이미 있는 여기서 재정의합니다.
-- ============================================================================
create or replace function public.my_application_managers()
returns table (application_id uuid, manager_name text, manager_phone text, manager_certification text)
language sql stable security definer set search_path = public as $$
  select a.id,
         coalesce(nullif(btrim(p.name), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')),
         coalesce(nullif(btrim(p.phone), ''), nullif(btrim(ma.phone), '')),
         nullif(btrim(m.certification), '')
    from public.service_applications a
    left join public.profiles p on p.id = a.manager_id
    left join public.managers m on m.id = a.manager_id
    left join auth.users u      on u.id = a.manager_id
    left join lateral (
      select phone from public.manager_applications
      where user_id = a.manager_id and status = 'approved'
      order by reviewed_at desc nulls last
      limit 1
    ) ma on true
   where a.user_id = auth.uid()
     and a.manager_id is not null
$$;

revoke all on function public.my_application_managers() from public, anon;
grant  execute on function public.my_application_managers() to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [23b. 매니저 지원서 v2(신분증 Storage 버킷)]  (원본: sql/manager_applications_v2.sql)
-- ==============================================================================

-- ============================================================================
-- 케어 매니저 지원서 - 4단계 폼 확장 마이그레이션
--   manager-apply.html 이 기존 "이름/연락처/자격증/경력/동기" 5개 항목짜리 단일 폼에서,
--   구글폼 수준의 4단계(기본정보 → 활동조건/경력 → 정산계좌 → 서약/약관) 폼으로 바뀌면서
--   필요해진 컬럼을 sql/manager_applications.sql 의 manager_applications 테이블에 추가합니다.
--   또한 신분증 사본을 담을 비공개 Storage 버킷(manager-id-cards)과 RLS 정책을 만듭니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql → sql/manager_applications.sql
--             → 이 파일. Supabase 대시보드 → SQL Editor 에서 전체 실행.
--   add column/drop constraint if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 신규 컬럼 추가 (STEP 1~4 입력값)
-- ----------------------------------------------------------------------------
alter table public.manager_applications add column if not exists birth_date       date;
alter table public.manager_applications add column if not exists address         text;
alter table public.manager_applications add column if not exists id_image_path   text; -- storage.objects 의 object path (manager-id-cards 버킷, 본인 폴더 하위)

alter table public.manager_applications add column if not exists activity_areas    text[] not null default '{}'; -- STEP2: 활동 가능 지역 (다중)
alter table public.manager_applications add column if not exists activity_schedule text[] not null default '{}'; -- STEP2: 활동 가능 요일/시간대 (다중)
alter table public.manager_applications add column if not exists certifications    text[] not null default '{}'; -- STEP2: 보유 자격증 (다중, '해당 없음' 포함 가능)
alter table public.manager_applications add column if not exists career_experience text; -- STEP2: 관련 경력 및 경험 (자유 서술, 없으면 '없음')

alter table public.manager_applications add column if not exists bank_name       text; -- STEP3: 정산 은행명
alter table public.manager_applications add column if not exists account_number  text; -- STEP3: 계좌번호
alter table public.manager_applications add column if not exists account_holder  text; -- STEP3: 예금주명

alter table public.manager_applications add column if not exists agree_safety         boolean not null default false; -- STEP4: 범죄이력·안전 자가확인 서약
alter table public.manager_applications add column if not exists agree_no_direct_deal boolean not null default false; -- STEP4: 직거래(우회 거래) 금지 동의
alter table public.manager_applications add column if not exists agree_privacy        boolean not null default false; -- STEP4: 개인정보 수집·이용 동의

-- ----------------------------------------------------------------------------
-- 2) 옛 컬럼(certification/experience_years/motivation) → 새 컬럼으로 데이터 이전 후 제거
--    (admin.js / manager-apply.html 모두 새 컬럼만 사용하도록 이번 커밋에서 함께 바꿉니다)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'manager_applications' and column_name = 'certification') then
    update public.manager_applications
       set certifications = array[certification]
     where certification is not null and coalesce(array_length(certifications, 1), 0) = 0;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'manager_applications' and column_name = 'motivation')
     or exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'manager_applications' and column_name = 'experience_years') then
    update public.manager_applications a
       set career_experience = coalesce(
             a.career_experience,
             nullif(to_jsonb(a) ->> 'motivation', ''),
             case when (to_jsonb(a) ->> 'experience_years') is not null
                  then (to_jsonb(a) ->> 'experience_years') || '년' end
           );
  end if;
end $$;

-- 기존 행(과거 단일 폼으로 접수됨) 중 새 필수 컬럼이 비어 있는 경우를 위한 백필 —
-- 실제 운영 데이터가 있다면 반려 처리 후 재지원을 받는 편이 맞지만, 여기서는 NOT NULL 제약을
-- 걸기 위한 최소한의 placeholder 만 채웁니다.
update public.manager_applications set career_experience = '없음' where career_experience is null;
update public.manager_applications set address = '-' where address is null;
update public.manager_applications set bank_name = '-' where bank_name is null;
update public.manager_applications set account_number = '-' where account_number is null;
update public.manager_applications set account_holder = name where account_holder is null;

alter table public.manager_applications alter column career_experience set not null;
alter table public.manager_applications alter column address         set not null;
alter table public.manager_applications alter column bank_name       set not null;
alter table public.manager_applications alter column account_number  set not null;
alter table public.manager_applications alter column account_holder  set not null;

alter table public.manager_applications drop column if exists certification;
alter table public.manager_applications drop column if exists experience_years;
alter table public.manager_applications drop column if exists motivation;

-- ----------------------------------------------------------------------------
-- 3) 체크 제약: 활동 지역/시간대 최소 1개, 약관은 전부 동의해야 insert 가능
-- ----------------------------------------------------------------------------
-- 주의: array_length('{}', 1) 은 0 이 아니라 NULL 을 반환하므로(빈 배열은 해당 차원이 아예 없음),
-- "array_length(...) > 0" 로만 쓰면 NULL > 0 → NULL 이 되어 CHECK 를 통과시켜 버립니다(빈 배열이 그대로 insert됨).
-- coalesce 로 NULL 을 0 으로 바꿔야 빈 배열을 실제로 막을 수 있습니다.
alter table public.manager_applications drop constraint if exists manager_applications_areas_check;
alter table public.manager_applications add constraint manager_applications_areas_check
  check (coalesce(array_length(activity_areas, 1), 0) > 0);

alter table public.manager_applications drop constraint if exists manager_applications_schedule_check;
alter table public.manager_applications add constraint manager_applications_schedule_check
  check (coalesce(array_length(activity_schedule, 1), 0) > 0);

alter table public.manager_applications drop constraint if exists manager_applications_agree_check;
alter table public.manager_applications add constraint manager_applications_agree_check
  check (agree_safety and agree_no_direct_deal and agree_privacy);

-- ----------------------------------------------------------------------------
-- 4) approve_manager_application(): certifications(배열) → managers.certification(text) 로 합쳐 저장
--    (sql/manager_applications.sql 의 정의를 certifications 배열에 맞게 교체)
-- ----------------------------------------------------------------------------
create or replace function public.approve_manager_application(p_application_id uuid)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.managers (id, certification, certification_verified, activity_status, approved_at)
  values (
    v_app.user_id,
    nullif(array_to_string(v_app.certifications, ', '), ''),
    true, 'break', now()
  )
  on conflict (id) do update
    set certification = excluded.certification,
        certification_verified = true,
        approved_at = now();

  update public.profiles set role = 'manager' where id = v_app.user_id;

  return v_app;
end $$;

revoke all on function public.approve_manager_application(uuid) from public, anon;
grant  execute on function public.approve_manager_application(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) 신분증 사본 Storage 버킷 (비공개) + RLS
--    경로 규칙: "<auth.uid()>/<timestamp>_<파일명>" — 폴더명이 본인 uid 와 일치해야 업로드/조회 가능.
--    관리자는 is_admin() 이면 전체 조회 가능 (지원서 검토 화면에서 서명 URL로 열람).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manager-id-cards', 'manager-id-cards', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists manager_id_cards_insert_own on storage.objects;
create policy manager_id_cards_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'manager-id-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists manager_id_cards_select_own_or_admin on storage.objects;
create policy manager_id_cards_select_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'manager-id-cards'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- 제출 전 다시 첨부하는 경우를 위해 본인 폴더 안에서만 삭제 허용 (덮어쓰기는 새 파일명으로 올리고 이전 파일을 지우는 방식)
drop policy if exists manager_id_cards_delete_own on storage.objects;
create policy manager_id_cards_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'manager-id-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [23c. 간편 지원서 전환]  (원본: sql/manager_applications_simple_form_v3.sql)
-- ==============================================================================

-- ============================================================================
-- 케어 매니저 "간편 지원서" 전환 마이그레이션
--   manager-apply.html 이 4단계 멀티스텝 폼(신분증 사본·정산 계좌·요일/시간대·3종 서약)에서,
--   이름/연락처/연령대/거주지역/희망지역/자격증/경력+동기/통합 동의 체크박스 1개로 구성된
--   단일 페이지 "간편 지원서"로 바뀌면서 필요해진 스키마 변경입니다.
--
--   신분증 사본(id_image_path)·정산 계좌(bank_name/account_number/account_holder)는
--   더 이상 지원 시점에 받지 않고, 합격 후 온라인 안전교육 온보딩 단계에서 별도로 안내해
--   수집할 예정입니다 — 그래서 정산 계좌 3개 컬럼의 NOT NULL 을 해제합니다(컬럼 자체는 보존).
--   활동 요일/시간대(activity_schedule)는 UI 입력 없이 ['추후 협의'] 고정값을 보내므로
--   기존 NOT NULL + CHECK(1개 이상) 제약은 그대로 둬도 통과합니다 — 스키마 변경 불필요.
--   안전 서약 3종(agree_safety/agree_no_direct_deal/agree_privacy)도 폼에서는 체크박스
--   1개로 통합해 보여주되, insert 시 세 값 모두 true 로 보내 기존 CHECK 제약을 그대로
--   만족시키므로 역시 스키마 변경이 필요 없습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql →
--             sql/manager_applications.sql → sql/manager_applications_v2.sql → 이 파일.
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   add column/drop not null if exists 기반이라 여러 번 실행해도 안전합니다.
--
--   ⚠ 이 마이그레이션을 실행하기 전에는 manager-apply.html 의 새 간편 지원서가 제출 시
--   "age_group 컬럼을 찾을 수 없음"(PGRST204) 오류로 실패합니다 — 반드시 먼저 실행하세요.
-- ============================================================================

-- 1) 연령대(선택 입력) — 정확한 생년월일 대신 "20대/30대/…" 같은 구간 문자열을 그대로 저장
alter table public.manager_applications add column if not exists age_group text;

-- 2) 정산 계좌 3개 컬럼: 지원 시점에는 더 이상 필수 입력이 아니므로 NOT NULL 해제
--    (컬럼/기존 데이터는 그대로 유지 — 온보딩 단계에서 채워질 예정)
alter table public.manager_applications alter column bank_name      drop not null;
alter table public.manager_applications alter column account_number drop not null;
alter table public.manager_applications alter column account_holder drop not null;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [23d. 상세 지원서 원복]  (원본: sql/manager_applications_restore_detailed_form.sql)
-- ==============================================================================

-- ============================================================================
-- 케어 매니저 "간편 지원서" → 상세 지원서(4단계) 원상복구 마이그레이션
--   manager-apply.html 이 다시 신분증 사본·정산 계좌·생년월일·주소 검색 등을 지원
--   시점에 받는 4단계 멀티스텝 폼으로 되돌아가면서, sql/manager_applications_simple_form_v3.sql
--   이 완화했던 bank_name/account_number/account_holder 의 NOT NULL 제약을 다시 겁니다.
--
--   컬럼 자체는 simple_form_v3 마이그레이션에서도 지워진 적이 없으므로(DROP NOT NULL 만 했음)
--   새 컬럼 추가는 필요 없습니다. age_group 컬럼은 상세 폼에서 더 이상 쓰이지 않지만,
--   이미 간편 지원서로 제출된 행의 데이터를 보존하기 위해 그대로 둡니다(드롭하지 않음).
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql →
--             sql/manager_applications.sql → sql/manager_applications_v2.sql →
--             (sql/manager_applications_simple_form_v3.sql 이미 실행된 환경이라면) → 이 파일.
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   update ... where ... is null / set not null 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 1) 간편 지원서로 제출되어 bank_name/account_number/account_holder 가 비어 있는 기존 행을
--    백필합니다 (admin.js 는 이 값이 비어 있으면 어차피 '-' 로 표시하므로 동일한 자리표시자를 씁니다).
--    실제 운영 중이라면 백필 후 해당 지원자에게 정산 계좌 재제출을 안내하는 편이 안전합니다.
update public.manager_applications set bank_name      = '-'    where bank_name      is null;
update public.manager_applications set account_number = '-'    where account_number is null;
update public.manager_applications set account_holder = name   where account_holder is null;

-- 2) NOT NULL 제약 복구
alter table public.manager_applications alter column bank_name      set not null;
alter table public.manager_applications alter column account_number set not null;
alter table public.manager_applications alter column account_holder set not null;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [23e. 지원서 어뷰징 방지 + 브라우저 직접 insert 차단]  (원본: sql/manager_application_anti_abuse.sql)
-- ==============================================================================

-- ============================================================================
-- 케어 매니저 지원서(manager-apply.html) 도배/봇 공격 방지 — 다층 방어
--
--   기존에는 브라우저가 manager_applications 에 직접 insert 했습니다(RLS: 본인 명의만, 이미 인증된
--   매니저는 금지). 하지만 RLS만으로는 다음을 막을 수 없습니다:
--     1) 같은 연락처(phone)로 이미 접수된 다른 사용자의 지원 — RLS는 "본인 행"만 보게 하므로
--        브라우저가 다른 사용자의 행을 조회해 중복을 스스로 확인할 방법이 없습니다.
--     2) Cloudflare Turnstile 검증(외부 HTTP 호출) — Postgres RLS/트리거로는 동기적으로 외부 API를
--        호출해 그 결과를 바로 insert 허용/거부에 반영하기 어렵습니다.
--     3) IP 기반 요청 횟수 제한 — 요청 IP는 Edge Function에서만 알 수 있습니다.
--
--   그래서 이 파일부터는 "브라우저가 직접 insert" 경로를 막고, 대신 supabase/functions/
--   submit-manager-application (service_role, 위 1~3 검증을 모두 수행) 를 통해서만 행이 생기도록
--   강제합니다. 이 파일은 그 Edge Function이 쓰는 DB 쪽 부품(연락처 중복 차단 인덱스, IP 레이트리밋
--   테이블/함수)과 권한 변경(브라우저 직접 insert 차단)을 담당합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql → sql/manager_applications.sql
--   → sql/manager_applications_v2.sql → (sql/manager_applications_restore_detailed_form.sql 이미
--   실행된 환경이라면) → 이 파일.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 연락처 중복 차단 — 같은 phone 으로 '심사 중' 또는 '승인됨' 지원이 이미 있으면 새 지원을 막습니다
--    (반려된 건은 재지원을 허용하므로 대상에서 제외). manager_applications_one_pending_per_user
--    (sql/manager_applications.sql, user_id 기준) 와 같은 패턴의 부분 유니크 인덱스입니다 — Edge
--    Function이 미리 SELECT로 확인해 친절한 안내 문구를 주지만, 동시 요청(TOCTOU) 사이에도 이 인덱스가
--    최종 방어선이 되어 중복 행이 생기지 않습니다.
-- ----------------------------------------------------------------------------
create unique index if not exists manager_applications_phone_active_unique
  on public.manager_applications (phone)
  where status in ('pending', 'approved');


-- ----------------------------------------------------------------------------
-- 2) IP 기반 레이트리밋 — submit-manager-application Edge Function이 요청마다 이 함수를 호출해
--    "최근 p_window_minutes 분 안에 이 IP에서 p_max_attempts 회 이상 시도했는지"를 확인합니다.
--    PostgREST(브라우저)로는 누구도 이 테이블/함수에 접근할 수 없습니다 — service_role 전용
--    (service_role 은 REVOKE 와 무관하게 항상 호출 가능).
-- ----------------------------------------------------------------------------
create table if not exists public.manager_application_rate_limits (
  id         bigint generated always as identity primary key,
  ip         inet not null,
  created_at timestamptz not null default now()
);
create index if not exists manager_application_rate_limits_ip_idx
  on public.manager_application_rate_limits (ip, created_at desc);

alter table public.manager_application_rate_limits enable row level security;
revoke all on public.manager_application_rate_limits from anon, authenticated;

create or replace function public.check_manager_application_rate_limit(
  p_ip inet,
  p_max_attempts integer default 5,
  p_window_minutes integer default 10
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.manager_application_rate_limits
   where ip = p_ip
     and created_at > now() - (p_window_minutes || ' minutes')::interval;

  -- 차단 여부와 무관하게 이번 시도를 기록합니다 — 막힌 뒤에도 계속 두드리는 요청이 윈도우 경계에서
  -- 다시 허용돼 버리지 않도록(기록 자체를 건너뛰면 그 순간부터 다시 카운트가 비어 보입니다).
  insert into public.manager_application_rate_limits (ip) values (p_ip);

  return v_count < p_max_attempts;
end $$;

revoke all on function public.check_manager_application_rate_limit(inet, integer, integer) from public, anon, authenticated;

-- 하루 지난 기록은 더 볼 일이 없으므로 테이블이 무한히 커지지 않게 매시 정리합니다.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-manager-application-rate-limits';
select cron.schedule(
  'cleanup-manager-application-rate-limits',
  '0 * * * *',
  $$ delete from public.manager_application_rate_limits where created_at < now() - interval '1 day'; $$
);


-- ----------------------------------------------------------------------------
-- 3) 브라우저 직접 insert 차단 — 이제부터 manager_applications 행 생성은 submit-manager-application
--    Edge Function(service_role)만 할 수 있습니다. 위 1)의 인덱스나 2)의 레이트리밋, Turnstile 검증을
--    모두 그 함수 안에서 거치게 하려면 "브라우저가 테이블에 직접 쓸 수 있는" 경로 자체를 없애야 합니다
--    (grant 가 남아 있으면 Turnstile/레이트리밋을 다 건너뛰고 그냥 insert 를 호출해버릴 수 있음).
--    SELECT 권한(본인 행 조회, manager_applications_select 정책)은 그대로 둡니다 — manager-apply.html
--    이 기존 지원 내역을 확인하는 데 계속 필요합니다.
-- ----------------------------------------------------------------------------
drop policy if exists manager_applications_insert_own on public.manager_applications;
revoke insert on public.manager_applications from authenticated;


notify pgrst, 'reload schema';


-- ==============================================================================
-- [23f. 신분증 Storage 정책 완화]  (원본: sql/manager_id_cards_storage_fix.sql)
-- ==============================================================================

-- ============================================================================
-- manager-id-cards 버킷 업로드 시 "new row violates row-level security policy" 해결
--
--   원인: sql/manager_applications_v2.sql 의 manager_id_cards_insert_own 정책은
--   "<auth.uid()>/파일명" 처럼 폴더명이 본인 uid 와 정확히 같아야만 업로드를 허용합니다.
--   이 정책이 아직 실행되지 않았거나(버킷/정책 자체가 없어 기본적으로 전부 막힌 상태),
--   혹은 폴더명이 그 규칙과 어긋나면 RLS 위반으로 업로드가 거부됩니다.
--
--   이 파일은 그 폴더명 검사를 없애고, "로그인한 사용자라면 누구나"(+ 필요하면 비로그인까지)
--   이 버킷에 업로드할 수 있도록 정책을 완화합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   drop policy if exists / on conflict 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 버킷이 아직 없다면 생성 (이미 있으면 그대로 둠)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manager-id-cards', 'manager-id-cards', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- 본인 폴더만 허용하던 기존 업로드 정책 제거 (경로 불일치로 막히던 원인)
drop policy if exists manager_id_cards_insert_own on storage.objects;

-- 1) 로그인한 사용자라면 누구나 이 버킷에 업로드 가능 (폴더 경로 제한 없음)
drop policy if exists manager_id_cards_insert_authenticated on storage.objects;
create policy manager_id_cards_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'manager-id-cards');

-- 2) (선택) 비로그인 사용자도 업로드를 허용하려면 이 정책도 함께 켜세요.
--    신분증처럼 민감한 파일을 비로그인 상태로도 올릴 수 있게 되는 것이라 스팸/오남용 위험이 있습니다.
--    문제 재현/테스트가 끝나면 이 정책만 drop 하는 걸 권장합니다:
--      drop policy manager_id_cards_insert_anon on storage.objects;
drop policy if exists manager_id_cards_insert_anon on storage.objects;
create policy manager_id_cards_insert_anon on storage.objects
  for insert to anon
  with check (bucket_id = 'manager-id-cards');

-- 조회(select)/삭제(delete) 정책은 손대지 않습니다 — admin.js 의 신분증 확인 모달과
-- manager-apply.html 의 재첨부 기능은 sql/manager_applications_v2.sql 에서 만든
-- manager_id_cards_select_own_or_admin / manager_id_cards_delete_own 그대로 사용합니다.

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [24. 신원정보 자동 채움]  (원본: sql/profile_identity_autofill.sql)
-- ==============================================================================

-- ============================================================================
-- profiles.name / profiles.phone 자동 보정
--
--   지금까지는 profiles.name/phone 이 비어 있을 때 "읽는 시점"에만 보조 값을 찾아 보여주는
--   방식이었습니다(예: sql/manager_applications.sql 의 my_application_managers(),
--   admin.js 의 fetchActiveManagersWithNames()/fillMissingGuardianContact()) — 화면마다 각자
--   COALESCE/fallback 쿼리를 따로 짜야 했고, 아직 그 fallback을 안 넣은 화면은 여전히 "미등록"이
--   보였습니다(어드민 콘솔 디버깅 세션에서 확인된 근본 원인 — profiles.name/phone 이 실제로
--   NULL인 행이 존재함: 카카오 로그인은 전화번호를 전혀 주지 않고, 닉네임 제공을 거부하면
--   이름도 없습니다).
--
--   이 파일은 그 보조 값들을 "쓰는 시점"에 profiles 테이블에 직접 채워 넣습니다 — 한 번 채워지면
--   그 뒤로는 모든 화면이 fallback 없이 profiles.name/phone 만 읽어도 값이 보입니다:
--
--     1) handle_new_user() 보강 — 가입 시 auth 메타데이터에 phone(또는 phone_number)이 있으면
--        profiles.phone 도 같이 채웁니다(지금까지는 name만 복사했습니다).
--     2) manager_applications 트리거 — 신청서가 '승인'되는 순간, 그 신청서에 적힌(가입 시
--        필수 입력이라 비어 있을 수 없는) name/phone 으로 profiles 의 빈 칸만 채웁니다.
--     3) service_applications 트리거 — 보호자가 신청서를 낼 때마다, 그 신청서의
--        user_contact("이름 / 연락처", apply.html 에서 매번 직접 입력) 로 profiles 의 빈 칸만
--        채웁니다.
--     4) 위 두 트리거가 "앞으로" 생기는 데이터에만 적용되므로, 이미 쌓여 있는 기존 행도 한 번
--        같은 규칙으로 보정합니다(멱등 — 이미 채워진 행은 WHERE 조건에서 자연히 빠집니다).
--
--   전부 "이미 값이 있으면 절대 덮어쓰지 않고, 비어 있을 때만 채운다"는 원칙입니다 — 사용자가
--   나중에 직접 수정한 이름/번호를 트리거가 되돌리는 일은 없습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/manager_applications.sql → 이 파일.
--   전부 create or replace / drop trigger if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) handle_new_user() 재정의 — 가입 시점에 메타데이터의 phone/phone_number 도 함께 복사.
--    (name 쪽 로직은 sql/supabase_schema_latest.sql 원본과 동일 — phone만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, phone)
  values (
    new.id, 'guardian',
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number')
  )
  on conflict (id) do nothing;
  return new;
end $$;
-- 트리거(on_auth_user_created)는 sql/supabase_schema_latest.sql 에 이미 있고 함수만 바뀌면
-- 충분합니다 — 다시 만들 필요 없습니다.


-- ----------------------------------------------------------------------------
-- 2) manager_applications 승인 시 profiles 보정 — status 가 'approved' 로 바뀌는(또는 바로
--    'approved' 로 insert되는) 순간, name/phone(둘 다 신청서 제출 시 필수 입력이라 not null)으로
--    profiles 의 빈 칸만 채웁니다. sql/protect_admin_role.sql 의 approve_manager_application()
--    이 하는 UPDATE 를 그대로 타므로, 그 함수를 또 고칠 필요 없이 트리거 하나로 해결됩니다 — 누가
--    어떤 경로로 status 를 'approved' 로 바꾸든(직접 UPDATE 포함) 항상 적용됩니다.
-- ----------------------------------------------------------------------------
create or replace function public.backfill_profile_from_manager_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set name  = coalesce(nullif(btrim(name), ''), nullif(btrim(new.name), '')),
         phone = coalesce(nullif(btrim(phone), ''), nullif(btrim(new.phone), ''))
   where id = new.user_id
     and (nullif(btrim(name), '') is null or nullif(btrim(phone), '') is null);
  return new;
end $$;

drop trigger if exists manager_applications_backfill_profile on public.manager_applications;
create trigger manager_applications_backfill_profile
  after insert or update of status on public.manager_applications
  for each row
  when (new.status = 'approved')
  execute function public.backfill_profile_from_manager_application();


-- ----------------------------------------------------------------------------
-- 3) service_applications 신청 시 profiles 보정 — apply.html 이 신청서를 낼 때마다 함께 입력받는
--    user_contact("신청자 성함 / 신청자 연락처", apply.html 의 applicant_name + ' / ' + applicant_phone
--    형식)를 분해해 profiles 의 빈 칸만 채웁니다. 구분자 ' / '가 없으면(형식이 다른 옛 데이터 등)
--    전체를 이름으로 보고 연락처는 비워 둡니다 — admin.js 의 parseUserContact() 와 같은 규칙입니다.
-- ----------------------------------------------------------------------------
create or replace function public.backfill_profile_from_service_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_phone text;
  v_sep   int;
begin
  if new.user_contact is null or btrim(new.user_contact) = '' then
    return new;
  end if;

  v_sep := position(' / ' in new.user_contact);
  if v_sep > 0 then
    v_name  := nullif(btrim(substr(new.user_contact, 1, v_sep - 1)), '');
    v_phone := nullif(btrim(substr(new.user_contact, v_sep + 3)), '');
  else
    v_name  := nullif(btrim(new.user_contact), '');
    v_phone := null;
  end if;

  update public.profiles
     set name  = coalesce(nullif(btrim(name), ''), v_name),
         phone = coalesce(nullif(btrim(phone), ''), v_phone)
   where id = new.user_id
     and (nullif(btrim(name), '') is null or nullif(btrim(phone), '') is null);
  return new;
end $$;

drop trigger if exists service_applications_backfill_profile on public.service_applications;
create trigger service_applications_backfill_profile
  after insert on public.service_applications
  for each row
  execute function public.backfill_profile_from_service_application();


-- ----------------------------------------------------------------------------
-- 4) 기존 행 한 번 보정 — 위 두 트리거는 "앞으로" 일어나는 INSERT/UPDATE에만 반응하므로, 이미
--    쌓여 있던 행은 한 번 같은 규칙으로 직접 채웁니다. 이미 채워진 profiles 행은 WHERE 조건에서
--    빠지므로 여러 번 실행해도 안전합니다(멱등).
-- ----------------------------------------------------------------------------

-- 4a) 매니저 — 승인된 신청서 중 가장 최근 것으로 채움
update public.profiles p
   set name  = coalesce(nullif(btrim(p.name), ''), nullif(btrim(ma.name), '')),
       phone = coalesce(nullif(btrim(p.phone), ''), nullif(btrim(ma.phone), ''))
  from (
    select distinct on (user_id) user_id, name, phone
      from public.manager_applications
     where status = 'approved'
     order by user_id, reviewed_at desc nulls last
  ) ma
 where ma.user_id = p.id
   and (nullif(btrim(p.name), '') is null or nullif(btrim(p.phone), '') is null);

-- 4b) 보호자 — user_contact 가 있는 신청서 중 가장 최근 것으로 채움
update public.profiles p
   set name  = coalesce(nullif(btrim(p.name), ''), nullif(btrim(split_part(sa.user_contact, ' / ', 1)), '')),
       phone = coalesce(nullif(btrim(p.phone), ''), nullif(btrim(split_part(sa.user_contact, ' / ', 2)), ''))
  from (
    select distinct on (user_id) user_id, user_contact
      from public.service_applications
     where user_contact is not null and btrim(user_contact) <> ''
     order by user_id, created_at desc
  ) sa
 where sa.user_id = p.id
   and (nullif(btrim(p.name), '') is null or nullif(btrim(p.phone), '') is null);


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [25. 관리자 권한 강등 방지 트리거]  (원본: sql/protect_admin_role.sql)
-- ==============================================================================

-- ============================================================================
-- 관리자 계정이 다른 로직에 의해 강등되는 것을 막는 2중 안전장치
--
--   지금까지 approve_manager_application() 의 마지막 줄이 조건 없이
--   "update profiles set role = 'manager' where id = v_app.user_id" 였어서, 관리자 계정이 본인
--   명의로 매니저 지원서를 넣고 승인하면 그 즉시 role 이 'admin' → 'manager' 로 바뀌었습니다.
--   (sql/approve_manager_application_preserve_admin_role.sql 에서 한 번 고쳤지만, 이 파일 하나는
--   "함수 안에서만" 막는 거라 — 앞으로 또 다른 함수/트리거/수동 UPDATE 가 똑같은 실수를 하면 다시
--   뚫립니다. 그래서 이번엔 테이블 자체에 트리거를 걸어 어떤 코드 경로로 오든 막습니다.)
--
--   이 파일은 두 겹으로 보호합니다:
--     1) approve_manager_application() 함수 자체에 role <> 'admin' 조건 (다시 명시 — 이 파일만
--        실행해도 통째로 안전해지도록 자기 완결적으로 포함)
--     2) public.profiles 테이블에 BEFORE UPDATE 트리거: role 이 이미 'admin' 인 행을 다른 값으로
--        바꾸려는 모든 UPDATE 를 — 어떤 함수/코드에서 왔든 — 조용히 무시하고 'admin' 을 그대로 유지
--
--   ⚠ 관리자를 실제로 강등시켜야 하는 날이 오면, 이 트리거가 그것도 막으므로 아래처럼 잠깐 꺼야 합니다:
--     alter table public.profiles disable trigger profiles_protect_admin_role;
--     update public.profiles set role = 'guardian' where id = '...';
--     alter table public.profiles enable  trigger profiles_protect_admin_role;
--
--   실행 방법: Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요. 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 1) 승인 함수 자체의 보호 (다시 포함 — 자기 완결적)
create or replace function public.approve_manager_application(p_application_id uuid)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.managers (id, certification, certification_verified, activity_status, approved_at)
  values (
    v_app.user_id,
    nullif(array_to_string(v_app.certifications, ', '), ''),
    true, 'break', now()
  )
  on conflict (id) do update
    set certification = excluded.certification,
        certification_verified = true,
        approved_at = now();

  -- 'admin' 계정은 매니저로 승인되어도 강등되지 않도록 보호 (role 이 'admin' 이 아닐 때만 'manager' 로 변경)
  update public.profiles set role = 'manager' where id = v_app.user_id and role <> 'admin';

  return v_app;
end $$;

revoke all on function public.approve_manager_application(uuid) from public, anon;
grant  execute on function public.approve_manager_application(uuid) to authenticated;

-- 2) 테이블 차원의 포괄적 보호: role 이 'admin' 이던 행은 어떤 UPDATE 로도 'admin' 에서 못 벗어남
create or replace function public.protect_admin_role() returns trigger
language plpgsql as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    new.role := 'admin';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_admin_role on public.profiles;
create trigger profiles_protect_admin_role
  before update of role on public.profiles
  for each row execute function public.protect_admin_role();

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- [26. 매니저 정산: 70% 비율제 → 시급제 전환]  (원본: sql/manager_hourly_rate_settlement.sql)
-- ==============================================================================

-- ============================================================================
-- 매니저 정산: 결제액 70% 비율제 → 매니저 시급제로 전환
--
--   기존(sql/manager_settlement_70_30.sql)에는 건별 결제 금액의 70%를 매니저 정산금으로 자동
--   분배했습니다. 이 파일은 그 분배 공식 자체를 "수행 시간(시간) × 매니저 시급"으로 바꿉니다.
--
--   - 매니저 시급: manager_applications(그 매니저의 승인된 최신 행).hourly_rate 가 설정돼 있으면
--     그 값, 없으면 기본 시급(default_manager_hourly_rate(), 15,000원/시간 = 기본 2시간 30,000원)을
--     씁니다. 매니저별 시급을 다르게 주려면 manager_applications.hourly_rate 컬럼을 관리자가
--     직접(Supabase 테이블 편집기 등으로) 채우면 됩니다 — 이 파일은 그 값을 "읽는" 계산 로직만
--     만듭니다. 어드민 콘솔에서 시급을 편집하는 UI/RPC는 아직 없습니다(필요하면 별도 요청해 주세요).
--
--   - 수행 시간: service_applications.actual_duration_minutes(매니저가 '케어 완료' 모달에서
--     보고한 실제 소요 시간, sql/user_packages_system.sql 의 report_care_duration_and_bill_extra
--     참고)가 있으면 그 값, 없으면(아직 보고 전, 또는 신청서 연결 없는 수기 배정) 기본 2시간(120분)
--     으로 봅니다 — 패키지/단건 모두 "기본 2시간부터" 계약이라 최소 2시간分은 항상 보장합니다.
--
--   care_schedules.manager_payout/platform_fee/payout_amount 컬럼은 그대로 두고 트리거 내부
--   계산식만 바꿉니다 — admin_manager_monthly_settlements()/admin_manager_monthly_settlement_details()
--   (sql/admin_settlement_fixes_v4_restore_and_rpc.sql, sql/admin_settlement_detail_rpc.sql)와
--   mypage-manager.html(매니저 본인 화면의 "예상 정산 금액")이 전부 이미 이 컬럼들을 그대로 읽고
--   있으므로, 이 트리거 함수만 바꾸면 어드민 집계와 매니저 화면이 자동으로 같은 수치를 보여줍니다
--   (두 RPC는 수정할 필요가 없습니다).
--
--   ⚠ 소급 적용 안 함: 이미 존재하는 care_schedules 행은 이 마이그레이션만으로는 재계산되지
--   않습니다 — payment_amount(또는 manager_id)가 다시 쓰여지는 다음 이벤트(완료 후 초과요금
--   결제 확정 등)에만 새 공식이 적용됩니다. 이미 지난 달에 70% 공식으로 정산·지급을 마친 건,
--   그리고 sql/admin_settlement_fixes_v4_restore_and_rpc.sql 이 수기로 보정해 둔 과거 특정 건의
--   금액을 이번 변경이 조용히 덮어써 과거 지급 내역과 어긋나게 만들지 않기 위해서입니다. 이번
--   달처럼 아직 지급 전인 진행 중 건까지 지금 바로 새 공식으로 다시 계산해 보고 싶다면, 아래를
--   참고해 필요한 범위만 선택해 실행하세요(과거 수기 보정 건까지 덮어쓰지 않도록 주의):
--     update public.care_schedules set payment_amount = payment_amount
--      where status not in ('completed', 'cancelled');
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 매니저별 시급 컬럼 — null 이면 기본 시급(아래 2번)을 씁니다. 실적에 따른 개별 인상은
--    이 값을 직접 채우면 됩니다.
-- ----------------------------------------------------------------------------
alter table public.manager_applications add column if not exists hourly_rate integer;
alter table public.manager_applications drop constraint if exists manager_applications_hourly_rate_check;
alter table public.manager_applications add constraint manager_applications_hourly_rate_check
  check (hourly_rate is null or hourly_rate > 0);


-- ----------------------------------------------------------------------------
-- 2) 기본 시급 — 15,000원/시간(기본 2시간 기준 30,000원). 사이트 전체에서 "시급 기본값"을
--    참조할 곳은 전부 이 함수 하나만 쓰도록 해, 나중에 기본값을 바꿀 때 한 곳만 고치면 됩니다.
-- ----------------------------------------------------------------------------
create or replace function public.default_manager_hourly_rate()
returns integer
language sql immutable as $$
  select 15000;
$$;

grant execute on function public.default_manager_hourly_rate() to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) 정산 분배 트리거 재정의 — manager_payout = 수행 시간(시간) × 매니저 시급(반올림).
--    payment_amount 가 0 이면(취소/환불, sql/care_schedule_cancellation_sync.sql 이 payment_amount
--    를 0으로 맞추는 경로) 시급 계산을 건너뛰고 정산금도 0으로 맞춥니다 — 그 동기화 로직이
--    "취소되면 정산금도 즉시 0" 이라는 전제로 짜여 있어, 시급제로 바뀌어도 이 전제는 그대로
--    지켜야 합니다.
--    platform_fee 는 "결제액 - 정산금"으로 그대로 두되, 시급제에서는 더 이상 결제액의 고정
--    비율이 아니라 건마다 달라지는 실제 마진입니다(초과요금이 적거나 시급이 높으면 음수가 될
--    수도 있음 — 집계용 참고값일 뿐 화면에 노출되지 않으므로 별도 하한 처리는 하지 않습니다).
-- ----------------------------------------------------------------------------
create or replace function public.compute_manager_settlement_split() returns trigger
language plpgsql as $$
declare
  v_duration_minutes integer;
  v_hourly_rate       integer;
begin
  if coalesce(new.payment_amount, 0) = 0 then
    new.manager_payout := 0;
    new.platform_fee   := 0;
    new.payout_amount   := 0;
    return new;
  end if;

  select coalesce(
    (select sa.actual_duration_minutes from public.service_applications sa where sa.id = new.application_id),
    120
  ) into v_duration_minutes;

  select coalesce(
    (select a.hourly_rate
       from public.manager_applications a
      where a.user_id = new.manager_id and a.status = 'approved'
      order by a.reviewed_at desc nulls last
      limit 1),
    public.default_manager_hourly_rate()
  ) into v_hourly_rate;

  new.manager_payout := round(v_duration_minutes / 60.0 * v_hourly_rate)::integer;
  new.platform_fee   := coalesce(new.payment_amount, 0) - new.manager_payout;
  new.payout_amount   := new.manager_payout;
  return new;
end $$;

-- manager_id 재배정도 이제 정산액에 영향을 주므로(매니저마다 시급이 다를 수 있음), payment_amount
-- 뿐 아니라 manager_id 가 바뀔 때도 다시 계산하도록 트리거 대상 컬럼을 넓힙니다.
drop trigger if exists care_schedules_settlement_split on public.care_schedules;
create trigger care_schedules_settlement_split
  before insert or update of payment_amount, manager_id on public.care_schedules
  for each row execute function public.compute_manager_settlement_split();


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';


-- ============================================================================
-- 부록) 이번 통합에서 "일부러" 제외한 파일과 그 이유
--   (전부 create or replace 기반이라 그냥 포함해도 틀리지는 않지만, 아래 파일들은
--   diff로 대조한 결과 이미 0번 supabase_schema_latest.sql에 100% 흡수돼 있거나,
--   진단용 SELECT만 있거나, 새 프로젝트에선 무의미한 데이터 복구 스크립트입니다.)
-- ============================================================================
--   - _recover_admin_account.sql
--       → 특정 계정(이메일) 잠금 해제용 복구 스크립트 — 새 dev 프로젝트에는 해당 계정이 없어 무의미
--   - admin_manager_identity_mapping_diagnostic.sql
--       → 진단용 SELECT 쿼리만 있음(스키마 변경 없음)
--   - admin_names_phones_diagnostic_and_fix.sql
--       → 자기 파일 설명대로 다른 파일들(admin_profiles_select.sql 등)의 내용을 재수집한 것 — 그 원본 파일들을 이미 포함하므로 중복
--   - care_report_rich_fields.sql
--       → 파일 자체 주석에 'supabase_schema_latest.sql에도 반영했다'고 명시 — diff로 대조한 결과 100% 동일 내용이 이미 0번 파일에 포함됨
--   - care_reports_grant_fix.sql
--       → 수정하려는 GRANT 버그/RLS 조건이 supabase_schema_latest.sql에는 처음부터 이미 고쳐진 채로 들어있음(대조 확인함)
--   - care_schedule_5step_status.sql
--       → 파일 자체 주석에 '이미 supabase_schema_latest.sql에도 반영'이라고 명시 + CHECK 제약 대조 결과 100% 동일
--   - care_verification_overload_fix.sql
--       → 제거 대상인 구버전 함수 오버로드 자체가 supabase_schema_latest.sql에는 처음부터 존재하지 않아, 새 프로젝트에서는 'drop function'이 아무 일도 안 하는 무의미한 공백 실행이 됨
--   - manager_duty_status.sql
--       → 파일 자체 주석에 '이미 supabase_schema_latest.sql에도 반영'이라고 명시 + 컬럼/트리거 대조 결과 100% 동일
--   - seniors_profile_fields.sql
--       → diff 대조 결과 supabase_schema_latest.sql의 seniors 섹션과 100% 동일 내용(주석까지 동일)

-- ============================================================================
-- 끝 — 마지막으로 스키마 캐시를 한 번 더 새로고침합니다.
-- ============================================================================
notify pgrst, 'reload schema';
