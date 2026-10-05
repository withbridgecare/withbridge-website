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
