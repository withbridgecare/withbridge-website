-- ============================================================================
-- seniors 테이블 RLS: 어르신 프로필 수정/삭제 기능을 위해 필요한 정책 보강
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--
-- ▶ 배경: mypage.html 의 '어르신 프로필 관리'는 지금까지 등록(insert)·조회(select)만 했고, 이번에
--   수정(update)·삭제(delete) 기능을 추가했습니다. seniors 테이블은 이 저장소에 CREATE TABLE 이
--   남아 있지 않아(대시보드에서 만들어진 테이블로 추정) 이 프로젝트에 실제로 어떤 RLS 정책이 걸려
--   있는지 알 수 없으므로, '본인 행만 수정/삭제 가능' 정책을 이름을 정해 새로 추가합니다.
--   이미 같은 이름의 정책이 있어도 DROP → CREATE 로 안전하게 다시 실행할 수 있고, 기존에 다른
--   이름으로 만들어져 있던 select/insert 정책은 그대로 둬도 이 정책과 충돌하지 않습니다
--   (permissive 정책은 서로 OR 로 합쳐집니다).
--
-- ▶ 참고: seniors 는 care_schedules/service_applications 에서 FK 로 참조되지 않습니다(그 두 테이블은
--   신청 시점의 어르신 성함을 텍스트로만 스냅샷). 그래서 삭제 시 외래키 제약 위반이 날 수 없고,
--   soft delete 없이 바로 delete 해도 이미 접수된 케어 신청 내역에는 영향이 없습니다.
-- ============================================================================

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

-- ★ 확인용 (SQL Editor)
--   select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'seniors';
--   (seniors_select_own · seniors_insert_own · seniors_update_own · seniors_delete_own 네 개가 보이면 정상)
