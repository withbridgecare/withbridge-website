-- ============================================================================
-- seniors_rls_fix.sql
-- apply.html의 [입력한 어르신 정보를 '어르신 프로필'에 저장하기] 체크박스로 접수한 신청(test8 등)이
-- seniors 테이블에 저장되지 않고, mypage.html '어르신 프로필 관리'가 "등록된 어르신이 없습니다"로
-- 비어 보이는 문제를 점검/보강하기 위한 파일입니다.
--
--   seniors 테이블 자체는 이 저장소의 어떤 SQL 파일에도 CREATE TABLE 문이 없습니다 — sql/
--   supabase_schema_latest.sql 7)번 섹션 주석에 "테이블 자체는 Supabase 대시보드에 이미 존재한다고
--   가정"이라고 적혀 있듯, Supabase 대시보드에서 직접 만들어진 테이블입니다. 그 말은 RLS 정책/GRANT도
--   그 섹션이 실제로 이 프로젝트의 Supabase 인스턴스에 실행된 적이 있어야만 걸려 있다는 뜻입니다 —
--   다른 많은 마이그레이션 파일처럼 "이미 적용됐다고 가정"하고 넘어간 부분이라, 이 프로젝트에서
--   한 번도 실행되지 않았을 가능성이 있습니다. apply.html 쪽 체크박스 로직과 mypage.html 쪽 등록/
--   조회 로직은 모두 코드상 올바르게 짜여 있으므로(이 파일과 별개로 재점검함), 저장이 안 되는 가장
--   유력한 원인은 바로 이 RLS/GRANT 누락입니다 — INSERT 가 RLS에 막히면 supabase-js 는 예외를 던지지
--   않고 `{ error }` 만 돌려주므로, 콘솔을 보지 않으면 "조용히 실패"한 것처럼 보입니다.
--
--   이 파일은 sql/supabase_schema_latest.sql 7)번과 sql/seniors_profile_fields.sql 의 내용을 그대로
--   다시 실행합니다 — 이미 적용돼 있었다면 아무 효과 없이 끝나고(DROP POLICY IF EXISTS / CREATE OR
--   REPLACE 기반), 적용된 적이 없었다면 이 한 번으로 바로 고쳐집니다. 독립적으로 재실행 가능하도록
--   이 파일 하나만 떼어 왔습니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RLS 활성화 + 본인 행만 select/insert/update/delete (sql/supabase_schema_latest.sql 7)번과 동일)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2) 확장 컬럼 — apply.html '원클릭 불러오기'/체크박스 저장, mypage.html 등록·수정 모달이 함께 쓰는
--    여섯 컬럼(sql/seniors_profile_fields.sql과 동일). 이 컬럼들이 없으면 apply.html 의
--    saveSeniorProfileFromApplication() 이 보내는 payload 중 일부가 PGRST204/42703(컬럼 없음)로
--    거부됩니다.
-- ----------------------------------------------------------------------------
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
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
