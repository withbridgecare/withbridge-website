-- ============================================================================
-- 병원 도착 인증 고도화: GPS 지오펜싱(150m) + 사진 워터마크 검증 결과를
-- 감사 로그로 남기는 arrival_verification_logs 테이블입니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-care-verification.sql 을 먼저 실행했다고 가정합니다
--  — care_schedules.manager_id/guardian_id, record_care_verification() 이 필요합니다)
--
-- ▶ 이 테이블은 care_schedules.arrived_at/arrived_location/arrived_photo(기존, record_care_verification()
--   이 채움)를 대체하지 않고 "병원 도착" 인증 1건마다 남기는 상세 로그입니다. 기존 컬럼은 '가장 최근' 값만
--   담지만, 이 테이블은 시도마다(재시도 포함) 행이 쌓여서 반경(m)·GPS 오차·판정 결과를 그대로 추적할 수 있습니다.
--   화면(mypage-manager.html)은 record_care_verification() 호출이 성공한 뒤 이 테이블에도 best-effort 로
--   한 번 더 기록합니다 — 이 INSERT 가 실패해도(테이블 미배포 등) 도착 처리 자체는 막지 않습니다.
--
-- ▶ 컬럼명 참고: 이 프로젝트는 "예약"이 아니라 "일정(care_schedules)" 용어를 씁니다. 그래서 reservation_id
--   대신 schedule_id(care_schedules.id 참조)로 통일했습니다 — 다른 테이블(care_reports.schedule_id 등)과 같은 이름입니다.
-- ============================================================================

-- 1) 테이블 -------------------------------------------------------------
create table if not exists public.arrival_verification_logs (
  id                     uuid primary key default gen_random_uuid(),
  schedule_id            uuid not null references public.care_schedules(id) on delete cascade,
  manager_id             uuid not null references public.profiles(id),
  verification_type      text not null check (verification_type in ('GPS', 'PHOTO', 'GPS_PHOTO')),
  status                 text not null check (status in ('SUCCESS', 'PENDING_REVIEW')),
  current_lat            double precision,
  current_lng            double precision,
  gps_accuracy           double precision,          -- navigator.geolocation 의 accuracy(m). 클수록 오차가 큼
  target_distance_meters double precision,           -- 목적지(병원) 좌표와의 거리(m). 지오코딩 실패 시 null
  -- ⚠ Storage 버킷을 별도로 두지 않고, 기존 verification_photo 컬럼과 같은 방식으로 축소된 이미지를
  --   data URL 텍스트로 그대로 저장합니다(컬럼명은 _url 이지만 실제로는 data:image/jpeg;base64,... 문자열).
  --   대용량 원본을 별도 스토리지에 두고 싶다면 이 두 컬럼에 Storage 공개 URL을 대신 넣으면 됩니다.
  watermarked_image_url  text,
  raw_image_url          text,
  created_at             timestamptz not null default now()
);

create index if not exists arrival_verification_logs_schedule_idx on public.arrival_verification_logs (schedule_id, created_at desc);
create index if not exists arrival_verification_logs_manager_idx  on public.arrival_verification_logs (manager_id, created_at desc);

-- 2) RLS ------------------------------------------------------------------
alter table public.arrival_verification_logs enable row level security;

-- 매니저 본인이, 자신이 담당한(manager_id = auth.uid()) 일정에 대해서만 기록을 남길 수 있습니다.
drop policy if exists arrival_verification_logs_insert_manager on public.arrival_verification_logs;
create policy arrival_verification_logs_insert_manager on public.arrival_verification_logs
  for insert to authenticated
  with check (
    manager_id = auth.uid()
    and exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.manager_id = auth.uid()
    )
  );

-- 해당 일정의 매니저 본인 또는 연결된 보호자만 조회할 수 있습니다.
drop policy if exists arrival_verification_logs_select_own on public.arrival_verification_logs;
create policy arrival_verification_logs_select_own on public.arrival_verification_logs
  for select to authenticated
  using (
    manager_id = auth.uid()
    or exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.guardian_id = auth.uid()
    )
  );

-- 수정/삭제 정책은 두지 않습니다 — 감사 로그이므로 누구도(매니저 본인 포함) 고칠 수 없고, 새 시도는 새 행으로 남습니다.

-- 3) 권한(GRANT) ------------------------------------------------------------
revoke all on public.arrival_verification_logs from public, anon;
grant select, insert on public.arrival_verification_logs to authenticated;

-- 4) Realtime: 보호자 화면이 INSERT 이벤트를 postgres_changes 로 구독할 수 있게 publication 에 포함
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arrival_verification_logs'
  ) then
    alter publication supabase_realtime add table public.arrival_verification_logs;
  end if;
end $$;

-- 5) PostgREST 스키마 캐시 새로고침 (그래야 방금 만든 테이블/정책이 바로 API 에 반영됨)
notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   테이블/정책이 등록됐는지 확인:
--     select policyname, cmd from pg_policies
--     where schemaname = 'public' and tablename = 'arrival_verification_logs';
--   이 테이블이 Realtime publication 에 있는지 확인 (0행이면 위 4)번이 아직 반영되지 않은 것):
--     select * from pg_publication_tables
--     where pubname = 'supabase_realtime' and tablename = 'arrival_verification_logs';
--   특정 일정의 인증 로그 확인:
--     select verification_type, status, current_lat, current_lng, gps_accuracy, target_distance_meters, created_at
--     from public.arrival_verification_logs where schedule_id = '<일정 UUID>' order by created_at desc;
