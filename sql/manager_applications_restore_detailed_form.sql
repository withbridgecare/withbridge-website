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
