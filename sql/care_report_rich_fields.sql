-- ============================================================================
-- care_reports : 케어 리포트 작성 모달 개선 — 원클릭 선택 칩 · 증빙 사진 첨부 · 다음 진료 예약일
--
--   mypage-manager.html의 '케어 리포트 작성' 모달(및 '케어 완료' 모달에 포함된 리포트 섹션)에 추가한
--   세 가지 입력을 저장할 컬럼입니다.
--     1) condition_tags  jsonb  — 어르신 컨디션 칩 + 보행 상태 칩을 함께 담는 배열. 예: ["양호","자립 보행"]
--        mypage.html 의 보호자 화면(careReportViewConditionTags)은 이미 이 모양(#해시태그 칩)을 그릴 수
--        있도록 만들어져 있었는데(렌더 코드는 있지만 입력 쪽이 없어 늘 빈 배열이었음), 이번에 입력이 생겼습니다.
--     2) photos          jsonb  — 처방전 · 진료비 영수증 · 약 봉투 등 증빙 사진의 배열: [{ "url": "data:...", "label": "처방전" }]
--        url 은 Supabase Storage 가 아니라 브라우저에서 canvas 로 가로 1000px 로 축소한 데이터 URL 그대로
--        저장합니다 — 이 프로젝트의 다른 현장 사진들(care_checkpoints.photo_url, arrival_verification_logs 의
--        watermarked_image_url/raw_image_url)과 같은 방식이라 새 Storage 버킷/RLS 설정이 필요 없습니다.
--     3) next_visit_date date   — 의사가 안내한 다음 병원 방문/예약일 (선택 입력).
--
--   senior_condition 은 이제 칩 선택을 보완하는 짧은 '특이사항' 자유 입력(선택 사항)으로 역할이 바뀌어
--   not null 제약을 풉니다 — physician_notes(진료 소견 · 의사 안내사항)는 여전히 필수입니다.
--
--   guardian_care_reports 뷰는 create or replace view 가 기존 컬럼 순서를 바꿀 수 없어 세 컬럼을 끝에
--   추가했습니다 — mypage.html 의 REPORT_OPTIONAL_COLS 가 이미 이 이름들을 기대하고 있습니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   같은 내용을 sql/supabase_schema_latest.sql 의 "4) care_reports"/"5) ... guardian_care_reports" 절에도
--   반영해 뒀으니, 스키마를 처음부터 새로 적용하는 환경이라면 이 파일을 따로 실행하지 않아도 됩니다.
--   alter ... add column if not exists / create or replace 는 모두 멱등이라 여러 번 실행해도 안전합니다.
--   선행 조건: sql/supabase_schema_latest.sql (care_reports, guardian_care_reports) 이 이미 적용돼 있어야 합니다.
-- ============================================================================

alter table public.care_reports alter column senior_condition drop not null;
alter table public.care_reports add column if not exists condition_tags  jsonb not null default '[]'::jsonb;
alter table public.care_reports add column if not exists photos          jsonb not null default '[]'::jsonb;
alter table public.care_reports add column if not exists next_visit_date date;

-- 뷰 전체를 다시 정의합니다 — 기존 컬럼은 그대로 두고 끝에 세 컬럼만 추가 (컬럼 순서를 바꾸면
-- "cannot change name of view column" 등으로 실패하므로 반드시 기존 순서를 유지해야 합니다).
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
  r.condition_tags    as condition_tags,
  r.photos            as photos,
  r.next_visit_date   as next_visit_date
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule_id(s.id);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- 점검 쿼리 — "매니저 화면(#reportViewModal, care_reports 테이블 직접 조회)엔 다음 방문일/컨디션 칩/
-- 증빙 사진이 보이는데 보호자 화면(mypage.html, guardian_care_reports 뷰 조회)엔 안 보인다"는 증상은
-- 거의 항상 이 파일을 아직(또는 일부만) 실행하지 않은 경우입니다 — care_reports 테이블에는 컬럼이
-- 있어도(그래서 매니저 쪽 insert/select 는 이미 성공) guardian_care_reports 뷰가 그 컬럼을 아직 끝에
-- 노출하지 않으면 보호자 쪽 select 만 42703 으로 조용히 실패하고 mypage.html 의 재시도 로직
-- (REPORT_OPTIONAL_COLS, queryReports()) 이 그 세 컬럼만 빼고 계속 조회해 '리포트는 뜨는데 새 필드만
-- 비어 있음'으로 보입니다. 아래 세 쿼리로 어느 단계까지 적용됐는지 확인하세요.
-- ----------------------------------------------------------------------------

-- (1) care_reports 테이블에 세 컬럼이 실제로 있는지 — 0 rows 면 위 alter table 이 아직 적용 전입니다.
-- select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'care_reports'
--     and column_name in ('condition_tags', 'photos', 'next_visit_date');

-- (2) guardian_care_reports 뷰가 그 컬럼을 노출하는지 — (1)은 있는데 이게 0 rows 면 뷰만 재생성이 안 된 경우입니다.
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'guardian_care_reports'
--     and column_name in ('condition_tags', 'photos', 'next_visit_date');

-- (3) 10월 5일 그 케어 건 원본 데이터 확인 — schedule_id 는 care_schedules.scheduled_at 으로 찾거나
--     mypage-manager.html 콘솔 로그(submitReport 호출)에서 가져오세요.
-- select id, schedule_id, condition_tags, photos, next_visit_date, created_at
--   from public.care_reports
--   where created_at::date = '2026-10-05'
--   order by created_at desc;
