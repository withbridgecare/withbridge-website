-- =====================================================================
-- 위드브릿지: 보호자 마이페이지에서 '배정 완료' 상태와 담당 매니저 정보가 보이게 하는 권한 설정 + 점검
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 전제: supabase-applications-to-manager.sql 이 이미 실행되어 있어야 합니다 (컬럼 manager_id · accepted_at, 함수 my_application_managers 등).
--
-- 이 파일이 하는 일 (1~3 은 실행, 4~ 는 '점검용'이라 필요할 때 한 문장씩 실행)
--   1) service_applications : 로그인한 보호자는 '내 신청(user_id = 나)'만 조회하는 정책을 다시 만들고 SELECT 권한을 부여
--   2) my_application_managers() : 로그인 사용자(authenticated)만 호출할 수 있게 GRANT EXECUTE (비로그인은 차단)
--   3) 배정 시각(accepted_at) 기록 보완: 트리거 갱신 + 이미 배정된 건의 빈 accepted_at 채우기 (대시보드에서 직접 배정한 건이 보호자 화면에서 사라지지 않도록)
--   4) API(PostgREST)가 방금 바꾼 권한·함수를 바로 알도록 스키마 캐시 새로고침
--   ※ 점검용 D) 는 '신청의 user_id 가 비었거나 다른 계정이라서 안 보이는' 가장 흔한 원인을 찾고 고치는 방법입니다
-- =====================================================================

-- 1) 보호자의 '내 신청' 조회 정책 -------------------------------------------------
alter table public.service_applications enable row level security;

drop policy if exists service_applications_select_own on public.service_applications;
create policy service_applications_select_own on public.service_applications
  for select to authenticated
  using (auth.uid() = user_id);

grant select on public.service_applications to authenticated;
-- (참고) 매니저용 조회 정책 service_applications_select_managers 는 supabase-applications-to-manager.sql 이 만든 것이며 그대로 둡니다.
--        정책은 여러 개가 OR 로 합쳐지므로, 같은 사람이 보호자이자 매니저여도 문제없이 함께 동작합니다.

-- 2) 담당 매니저 정보 함수 실행 권한 -------------------------------------------------
revoke all on function public.my_application_managers() from public, anon;
grant  execute on function public.my_application_managers() to authenticated;
-- 같은 방식으로 다른 매니저 기능 함수도 로그인 사용자에게만 열려 있는지 다시 맞춰 둡니다
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;
grant  execute on function public.is_manager() to authenticated;

-- 3) 배정 시각(accepted_at) 기록 보완 ------------------------------------------------------
--  대시보드에서 status 를 'matched' 로, manager_id 를 함께 직접 고쳐 배정하면 accepted_at 이 비어 있게 되고, 그러면 보호자 화면이 그 신청의
--  나이를 알 수 없습니다. 아래는 (a) 트리거를 '매니저가 처음 지정되는 순간'마다 accepted_at 을 채우도록 갱신하고
--  (b) 이미 비어 있는 배정 건의 accepted_at 을 지금 시각으로 채웁니다 (그 시점부터 48시간 동안 보호자 화면에 표시).
--  (supabase-applications-to-manager.sql 5번과 같은 함수입니다 — 이 버전이 최신입니다)
create or replace function public.sync_application_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and current_user in ('anon', 'authenticated') then
    new.manager_id := null;
    new.accepted_at := null;
    new.schedule_id := null;
  end if;
  if new.manager_id is not null then
    if new.accepted_at is null then
      if tg_op = 'INSERT' then
        new.accepted_at := now();
      elsif old.manager_id is distinct from new.manager_id then
        new.accepted_at := now();
      end if;
    end if;
    if public.is_pending_application_status(new.status) then
      new.status := 'matched';
    end if;
  end if;
  return new;
end $$;

update public.service_applications
   set accepted_at = now()
 where manager_id is not null and accepted_at is null;

-- 4) API 스키마 캐시 새로고침 (함수·컬럼·권한을 바꾼 직후 '함수를 찾을 수 없음'(PGRST202)이 나올 때 도움이 됩니다)
notify pgrst, 'reload schema';


-- =====================================================================
-- ★ 점검용 쿼리 — 보호자 화면에 '배정 완료'가 안 보일 때 위에서부터 한 문장씩 실행해 보세요
-- =====================================================================

-- A) 신청 행이 실제로 어떻게 바뀌었는지 (수락 후 status = 'matched', manager_id 와 accepted_at 이 채워져 있어야 함)
--    select id, created_at, user_id, status, manager_id, accepted_at, schedule_id
--      from public.service_applications order by created_at desc limit 10;
--    · status 가 아직 'pending' 이고 manager_id 가 비어 있음 → 매니저 수락이 실패한 것입니다. 매니저 화면의 오류 메시지를 확인하세요.
--    · user_id 가 비어 있음(null) → 로그인하지 않고 신청했거나 기본값(auth.uid())이 없어서, 어느 보호자에게도 안 보입니다. (아래 D 로 연결)

-- B) 보호자 계정의 id 확인 → A 의 user_id 와 같아야 합니다 (브라우저 콘솔의 '[케어 현황] 로그인 사용자 id' 와도 같아야 함)
--    select id, email from auth.users where email ilike '%보호자이메일%';

-- C) 정책 · 권한 확인
--    select policyname, permissive, cmd, roles, qual from pg_policies where tablename = 'service_applications';
--      → service_applications_select_own (SELECT, authenticated, auth.uid() = user_id) 가 보여야 합니다.
--        'RESTRICTIVE'(permissive = 'RESTRICTIVE') 정책이 있다면 모든 조회를 추가로 막으니 내용을 확인하세요.
--    select has_function_privilege('authenticated', 'public.my_application_managers()', 'execute') as can_call_manager_info,
--           has_table_privilege('authenticated', 'public.service_applications', 'select')            as can_select_applications;
--      → 둘 다 true 여야 합니다.

-- D) ★ 보호자 화면에 안 뜨는 가장 흔한 원인: 신청의 user_id 가 비어 있거나(NULL) 다른 계정이라 DB 규칙상 이 보호자에게 안 보임
--    (DB 규칙은 화면 코드로 우회할 수 없으므로, 여기서 user_id 를 고쳐야 합니다)
--    1) 연결 상태 한눈에 보기 (아래 '<보호자 계정 UUID>' 를 B 에서 확인한 id 로 바꿔 실행):
--         select a.id, a.created_at, a.status, a.manager_id, a.user_id,
--                case when a.user_id is null then 'NULL — 어느 계정에도 안 보임'
--                     when a.user_id <> '<보호자 계정 UUID>' then '다른 계정에 연결됨'
--                     else '이 보호자에 연결됨' end as link_state
--           from public.service_applications a order by a.created_at desc limit 20;
--    2) 특정 신청 하나를 연결 (본인 확인을 마친 뒤):
--         update public.service_applications set user_id = '<보호자 계정 UUID>' where id = '<신청 id>';
--    3) [테스트 DB 전용] user_id 가 비어 있는 신청 전부를 한 계정에 연결:
--         update public.service_applications set user_id = '<보호자 계정 UUID>' where user_id is null;
--         ※ 실제 고객 신청이 섞여 있는 운영 DB 에서는 실행하지 마세요 (남의 신청이 이 계정에 붙습니다).

-- E) 배정된 매니저 이름·연락처가 비어 있다면 (카드에는 '담당 매니저 배정됨'만 표시됩니다)
--    select a.id, a.manager_id, p.name, p.phone from public.service_applications a
--      left join public.profiles p on p.id = a.manager_id where a.manager_id is not null;
--    update public.profiles set name = '김은지', phone = '010-0000-0000' where id = '<매니저 계정 UUID>';

-- F) 보호자 입장 시뮬레이션 (SQL Editor 는 관리자 권한이라 그냥 실행하면 RLS 가 적용되지 않습니다. 아래를 '한 번에' 실행 — 끝에 rollback 이라 데이터는 안 바뀝니다.
--    ※ 결과 창에는 '마지막 조회'만 보이므로, 두 select 를 한 번에 하나씩 남기고 각각 실행해 보세요)
--    begin;
--    select set_config('request.jwt.claims', json_build_object('sub', '<보호자 계정 UUID>', 'role', 'authenticated')::text, true);
--    set local role authenticated;
--    select id, status, manager_id, accepted_at from public.service_applications;      -- 내 신청만 나와야 함
--    select * from public.my_application_managers();                                    -- 배정된 건의 매니저 정보가 나와야 함
--    rollback;
