-- ============================================================================
-- 케어 매니저 지원서: 성별(gender) 추가 · 신분증 사본 선택 항목화
--
--   manager-apply.html 이 지원 단계에서 신분증 사본을 더 이상 받지 않고(ID_UPLOAD_ENABLED = false)
--   대신 성별(필수 선택: '남' / '여')을 받습니다. 어르신·보호자가 동성 매니저를 원하는 경우가 많아
--   매칭에 쓰입니다.
--     - gender        : 새 컬럼. '남' | '여' 만 허용(값이 없는 예전 지원서를 위해 null 허용).
--     - id_image_path : 원래부터 null 허용 컬럼이라(sql/manager_applications_v2.sql) 변경 없음.
--                       예전에 제출된 신분증 파일·경로는 그대로 남고, admin 화면의 '신분증 보기'는
--                       값이 있는 지원서에만 계속 보입니다.
--
--   배포 순서(중요): ① 이 SQL 실행 → ② Edge Function 배포
--                     (supabase functions deploy submit-manager-application)
--                   → ③ 사이트(manager-apply.html, admin.js) 배포.
--   ①보다 ②가 먼저면 gender 컬럼이 없어 지원서 저장이 실패합니다.
--   ②보다 ③이 먼저면 예전 함수가 신분증을 필수로 검사해 지원서 제출이 실패합니다.
--
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   add column if not exists / drop constraint if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

alter table public.manager_applications add column if not exists gender text;

alter table public.manager_applications drop constraint if exists manager_applications_gender_check;
alter table public.manager_applications
  add constraint manager_applications_gender_check check (gender is null or gender in ('남', '여'));

comment on column public.manager_applications.gender is '지원자 성별 (남/여) — manager-apply.html STEP 1 필수 선택';

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
