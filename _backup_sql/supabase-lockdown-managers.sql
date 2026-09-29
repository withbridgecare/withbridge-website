-- =====================================================================
-- 위드브릿지: public.managers 테이블 잠금 (보안 조치)
--
-- 발견: 로그인하지 않은 방문자도 공개 API 로 managers 테이블을 읽을 수 있는 상태였습니다 (행 1개 노출:
--       id, certification, certification_verified, activity_status).
--       이 테이블은 '인증된 케어매니저가 누구인가'를 정하는 기준이라, 아무나 읽거나 고칠 수 있으면 안 됩니다.
--
-- 이 파일이 하는 일
--   1) managers 의 RLS 를 켜고, 기존 정책을 모두 지운 뒤(느슨한 정책이 남아 있으면 계속 공개되므로)
--      '로그인한 본인 행만 조회 / 본인의 activity_status 만 수정' 정책만 남깁니다.
--   2) 비로그인(anon)의 모든 권한과, 로그인 사용자의 INSERT/DELETE 권한을 회수합니다.
--      (자격 인증 여부 certification_verified 는 운영자가 대시보드에서만 바꿀 수 있습니다)
--
-- ⚠ 실행 전 확인: 지금 managers 에 걸려 있는 정책을 직접 만드신 게 있다면 이 파일이 지웁니다.
--   Supabase 대시보드 > SQL Editor 에서 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- 1) RLS 켜기
alter table public.managers enable row level security;

-- 2) 기존 정책 전부 삭제 (이름과 상관없이)
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'managers' loop
    execute format('drop policy %I on public.managers', pol.policyname);
  end loop;
end $$;

-- 3) 필요한 정책만 새로 만들기
create policy managers_select_own on public.managers
  for select to authenticated using (id = auth.uid());
create policy managers_update_own on public.managers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 4) 테이블 권한 정리
revoke all on public.managers from anon, authenticated;
grant  select on public.managers to authenticated;
grant  update (activity_status) on public.managers to authenticated;   -- 자격/인증 여부는 본인이 못 바꿈

-- ★ 확인 (각각 실행)
--   select policyname, cmd, roles from pg_policies where tablename = 'managers';   -- select_own, update_own 두 개만 보여야 함
--   비로그인 상태에서 https://<프로젝트>.supabase.co/rest/v1/managers?select=* 를 열었을 때 데이터가 나오지 않아야 함

-- ★ 다른 표도 같은 방식으로 점검하세요 (대시보드 > Table Editor 에서 각 표 이름 옆에 'RLS enabled' 가 있는지):
--   service_applications, seniors, profiles, care_schedules, care_reports
--   (이 중 신청서 표의 조회 정책은 supabase-service-applications-select.sql 에 있습니다)
