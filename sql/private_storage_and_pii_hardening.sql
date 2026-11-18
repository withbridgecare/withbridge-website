-- ============================================================================
-- 개인정보(회원정보) 외부 유출 방지 — Storage 비공개 전환 + 업로드 경로 제한
-- ============================================================================
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다(idempotent).
--
-- 무엇이 문제였나
--   1) care-departure-photos 버킷이 public 이었고, storage.objects 에 "to public" SELECT 정책이 있어
--      로그인하지 않은 누구나(anon 키는 사이트 소스에 공개되어 있음) 버킷 목록을 조회해
--      모든 케어 현장 사진(어르신 얼굴·집 앞·차량 번호 등 + 워터마크의 시각/위치)을 내려받을 수 있었습니다.
--   2) manager-id-cards(신분증) 버킷에 비로그인(anon) 업로드 정책과, 다른 사람 폴더에도 올릴 수 있는
--      업로드 정책이 남아 있었습니다.
--
-- 바뀌는 점
--   - care-departure-photos 를 비공개(private)로 바꾸고, 조회는 "그 일정을 볼 수 있는 사람"
--     (담당 매니저 · 보호자 · 관리자 — care_schedules RLS 를 그대로 상속)만 서명 URL 로 가능하게 합니다.
--     화면은 js/privacy-guard.js 가 예전 공개 URL 을 자동으로 서명 URL 로 바꿔 보여주므로 DB 값을
--     바꿀 필요가 없습니다.
--   - 업로드는 해당 일정의 담당 매니저만, 자기 일정 폴더(<schedule_id>/...)에만 가능합니다.
--   - 신분증 버킷: anon 업로드 제거, 로그인 사용자는 자기 폴더(<user_id>/...)에만 업로드.
-- ============================================================================

-- 1) 출발 인증 사진 버킷 비공개 전환 -------------------------------------------
update storage.buckets set public = false where id = 'care-departure-photos';

drop policy if exists care_departure_photos_select_public on storage.objects;
drop policy if exists care_departure_photos_select_authorized on storage.objects;
create policy care_departure_photos_select_authorized on storage.objects
  for select to authenticated
  using (
    bucket_id = 'care-departure-photos'
    and (
      public.is_admin()
      -- care_schedules 의 기존 RLS(담당 매니저 / 보호자 / 신청자)를 그대로 따릅니다:
      -- 호출자가 볼 수 있는 일정의 폴더일 때만 통과합니다.
      or exists (
        select 1 from public.care_schedules cs
        where cs.id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists care_departure_photos_insert_authenticated on storage.objects;
drop policy if exists care_departure_photos_insert_assigned_manager on storage.objects;
create policy care_departure_photos_insert_assigned_manager on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'care-departure-photos'
    and exists (
      select 1 from public.care_schedules cs
      where cs.id::text = (storage.foldername(name))[1]
        and cs.manager_id = auth.uid()
    )
  );

-- 2) 신분증 버킷 업로드 제한 ----------------------------------------------------
update storage.buckets set public = false where id = 'manager-id-cards';

drop policy if exists manager_id_cards_insert_anon on storage.objects;
drop policy if exists manager_id_cards_insert_authenticated on storage.objects;
drop policy if exists manager_id_cards_insert_own on storage.objects;
create policy manager_id_cards_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'manager-id-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) 확인용 쿼리 (실행 후 결과에서 public = false 인지 확인) ----------------------
-- select id, public from storage.buckets where id in ('care-departure-photos', 'manager-id-cards');
-- select policyname, roles, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';

notify pgrst, 'reload schema';
