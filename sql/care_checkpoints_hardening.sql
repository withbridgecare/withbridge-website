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
