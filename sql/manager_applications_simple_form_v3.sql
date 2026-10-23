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
