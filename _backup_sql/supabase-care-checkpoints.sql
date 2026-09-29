-- ============================================================================
-- 현장 수행 5단계 체크포인트(출발/미팅 → 병원 도착 → 진료 완료 → 귀가 이동 → 귀가 및 완료)를
-- 매니저 화면(mypage-manager.html)에서 보호자 화면(mypage.html)으로 실시간 연결하기 위한 스키마입니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-care-verification.sql 을 먼저 실행했다고 가정합니다
--  — care_schedules.manager_id/guardian_id 가 필요합니다)
--
-- ▶ care_schedules.status 는 CHECK 제약으로 pending/assigned/departed/arrived/completed 5개 값만 허용해서
--   '진료 완료'·'귀가 이동'처럼 그 사이에 있는 세부 단계를 status 컬럼에 추가로 넣을 수 없습니다. 이 테이블은
--   status 를 대체하지 않고, 5단계 전체를 '인증 기록(체크포인트)'으로 별도로 쌓습니다 — 재시도까지 그대로
--   남는 감사 로그 방식(arrival_verification_logs 와 같은 설계)이라, 화면은 항상 "step 별 가장 최근 값"만 읽습니다.
--
-- ▶ 컬럼명 참고: departure/hospital_arrival/treatment_complete/return_departure/return_complete 5개 step 값은
--   mypage.html 의 REPORT_TIMELINE_STEPS, mypage-manager.html 의 FIELD_FLOW 와 반드시 같은 문자열이어야 합니다.
-- ============================================================================

-- 1) 테이블 -------------------------------------------------------------
create table if not exists public.care_checkpoints (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references public.care_schedules(id) on delete cascade,
  manager_id     uuid not null references public.profiles(id),
  step           text not null check (step in (
                   'departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'
                 )),
  lat            double precision,
  lng            double precision,
  accuracy       double precision,          -- navigator.geolocation 의 accuracy(m)
  -- ⚠ Storage 버킷을 별도로 두지 않고, 기존 verification_photo/watermarked_image_url 컬럼과 같은 방식으로
  --   축소된 이미지를 data URL 텍스트로 그대로 저장합니다(컬럼명은 _url 이지만 실제로는 data:image/jpeg;base64,... 문자열).
  photo_url      text,
  checkpoint_at  timestamptz not null default now(),   -- 실제 인증(버튼을 누른) 시각
  created_at     timestamptz not null default now()
);

create index if not exists care_checkpoints_schedule_idx on public.care_checkpoints (schedule_id, step, checkpoint_at desc);
create index if not exists care_checkpoints_manager_idx  on public.care_checkpoints (manager_id, created_at desc);

-- 2) RLS ------------------------------------------------------------------
alter table public.care_checkpoints enable row level security;

-- 매니저 본인이, 자신이 담당한(manager_id = auth.uid()) 일정에 대해서만 체크포인트를 남길 수 있습니다.
drop policy if exists care_checkpoints_insert_manager on public.care_checkpoints;
create policy care_checkpoints_insert_manager on public.care_checkpoints
  for insert to authenticated
  with check (
    manager_id = auth.uid()
    and exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.manager_id = auth.uid()
    )
  );

-- 해당 일정의 매니저 본인 또는 연결된 보호자만 조회할 수 있습니다(Realtime postgres_changes 구독에도 그대로 적용됨).
drop policy if exists care_checkpoints_select_own on public.care_checkpoints;
create policy care_checkpoints_select_own on public.care_checkpoints
  for select to authenticated
  using (
    manager_id = auth.uid()
    or exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.guardian_id = auth.uid()
    )
  );

-- 수정/삭제 정책은 두지 않습니다 — 감사 로그이므로 누구도(매니저 본인 포함) 고칠 수 없고, 재인증은 새 행으로 남깁니다.

-- 3) 권한(GRANT) ------------------------------------------------------------
revoke all on public.care_checkpoints from public, anon;
grant select, insert on public.care_checkpoints to authenticated;

-- 4) Realtime: 보호자 화면이 INSERT 이벤트를 postgres_changes 로 구독할 수 있게 publication 에 포함
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'care_checkpoints'
  ) then
    alter publication supabase_realtime add table public.care_checkpoints;
  end if;
end $$;

-- 5) PostgREST 스키마 캐시 새로고침 (그래야 방금 만든 테이블/정책이 바로 API 에 반영됨)
notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   테이블/정책이 등록됐는지 확인:
--     select policyname, cmd from pg_policies
--     where schemaname = 'public' and tablename = 'care_checkpoints';
--   이 테이블이 Realtime publication 에 있는지 확인 (0행이면 위 4)번이 아직 반영되지 않은 것):
--     select * from pg_publication_tables
--     where pubname = 'supabase_realtime' and tablename = 'care_checkpoints';
--   특정 일정의 단계별 최신 체크포인트 확인:
--     select distinct on (step) step, lat, lng, accuracy, (photo_url is not null) as has_photo, checkpoint_at
--     from public.care_checkpoints where schedule_id = '<일정 UUID>' order by step, checkpoint_at desc;
