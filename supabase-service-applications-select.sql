-- =====================================================================
-- 위드브릿지: 마이페이지 '케어 현황'에 '내 신청 내역'을 보여주기 위한 설정 (public.service_applications)
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 전제: 테이블에 user_id (uuid) 컬럼이 있고, 로그인한 사용자의 id(auth.users.id)를 담습니다.
--
-- 왜 필요한가
--   마이페이지는 user_id 가 '나'인 신청 내역만 조회합니다. RLS 가 켜져 있는데 조회(SELECT) 정책이 없으면
--   에러 없이 '0건'이 돌아와서, 신청을 했는데도 "예정된 동행 일정이 없습니다"만 보이게 됩니다.
-- =====================================================================

-- 1) RLS 켜기 (이미 켜져 있으면 그대로)
alter table public.service_applications enable row level security;

-- 2) 조회(SELECT) 정책: 로그인한 사용자는 '내 user_id 인 행'만 읽을 수 있음
drop policy if exists service_applications_select_own on public.service_applications;
create policy service_applications_select_own on public.service_applications
  for select to authenticated
  using (auth.uid() = user_id);

-- 3) 테이블 권한: 로그인 사용자에게는 조회 허용, 비로그인(anon)에게는 조회 권한 자체를 회수
--    (신청 내용에는 이름·연락처·주소가 있으므로 익명 방문자가 읽을 수 없어야 합니다.
--     신청서 제출(INSERT)은 이 권한과 별개라 그대로 동작합니다)
grant  select on public.service_applications to authenticated;
revoke select on public.service_applications from anon;

-- 4) 신청할 때 로그인한 사용자의 id 가 user_id 에 '자동으로' 들어가게 (서버가 채우므로 브라우저에서 위조할 수 없음)
--    apply.html 은 user_id 를 보내지 않으므로 이 기본값이 없으면 user_id 가 비어 마이페이지에 안 보입니다.
--    (비로그인 신청은 auth.uid() 가 NULL 이라 user_id 도 NULL 로 저장됩니다)
alter table public.service_applications alter column user_id set default auth.uid();

-- 5) (권장) 신청 INSERT 정책 점검 — 남의 user_id 로 신청을 끼워 넣지 못하게
--    현재 정책 목록:
--      select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'service_applications';
--    INSERT 정책이 'with check (true)' 처럼 느슨하다면, 그 정책을 삭제하고 아래로 교체하세요.
--    (정책은 여러 개가 OR 로 합쳐지므로, 느슨한 기존 정책을 지우지 않으면 아래 정책을 추가해도 효과가 없습니다)
--      drop policy if exists "<기존 INSERT 정책 이름>" on public.service_applications;
--      create policy service_applications_insert on public.service_applications
--        for insert to anon, authenticated
--        with check (privacy_agreed = true and (user_id is null or user_id = auth.uid()));

-- 6) 이미 접수된 신청 중 user_id 가 비어 있는 건은 마이페이지에 나타나지 않습니다. (아래는 조회/수동 연결 방법)
--    비어 있는 건 확인:
--      select id, created_at, user_contact, service_type from public.service_applications where user_id is null order by created_at desc;
--    본인 확인을 마친 뒤 계정 연결 (계정 UUID 는 Authentication > Users 에서 확인):
--      update public.service_applications set user_id = '<보호자 계정 UUID>' where id = '<신청 id>';

-- ★ 확인
--   select policyname, cmd, roles from pg_policies where tablename = 'service_applications';   -- select_own 이 보여야 함
--   마이페이지에 로그인해 '케어 현황'에 신청 카드가 나오는지 확인
