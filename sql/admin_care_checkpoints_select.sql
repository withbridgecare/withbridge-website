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
