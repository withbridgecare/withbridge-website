-- =====================================================================
-- 위드브릿지: 신청서의 user_id 가 NULL 로 저장되는 문제 해결 + 비로그인 신청을 로그인 후 계정에 연결
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 이 파일이 하는 일
--   1) user_id 의 기본값을 auth.uid() 로 설정: 로그인한 상태의 신청은 브라우저가 user_id 를 못 보내도 '서버가' 본인 id 를 채웁니다.
--      (비로그인 신청은 auth.uid() 가 NULL 이라 NULL 로 저장됩니다)
--   2) 로그인한 사용자가 '자기 id 로' 신청서를 저장할 수 있게 INSERT 권한/정책을 추가
--      (기존 INSERT 정책이 user_id 지정을 막고 있어서 42501 이 나던 경우를 해결. 기존 정책은 지우지 않고 '추가'만 합니다)
--   3) claim_service_applications(): 비로그인 상태로 낸 신청을, 나중에 로그인/회원가입한 계정에 연결하는 함수
--      · 신청한 브라우저가 신청서 id(무작위 UUID)를 기억해 두었다가, 로그인 직후 이 함수로 '내 신청'이라고 주장(claim)합니다.
--      · user_id 가 아직 비어 있는 신청만, 최근 14일 안의 것만, 한 번에 최대 20건까지 연결합니다. 이미 다른 계정에 연결된 신청은 바뀌지 않습니다.
--
-- 전제: supabase-applications-to-manager.sql 이 이미 실행되어 있어야 합니다 (service_applications 확장 컬럼과 상태 트리거).
-- =====================================================================

-- 1) 로그인한 신청은 서버가 user_id 를 채움 --------------------------------------------
alter table public.service_applications alter column user_id set default auth.uid();

-- 2) 로그인한 사용자가 '내 id 로' 신청서를 저장할 수 있게 (기존 정책은 그대로 두고 추가) ------------
--    정책은 여러 개가 OR 로 합쳐지므로, 기존의 비로그인 신청용 INSERT 정책은 그대로 동작합니다.
grant insert on public.service_applications to authenticated;
drop policy if exists service_applications_insert_linked on public.service_applications;
create policy service_applications_insert_linked on public.service_applications
  for insert to authenticated
  with check (privacy_agreed = true and user_id = auth.uid());

-- 3) 비로그인 신청 → 로그인 후 내 계정에 연결 ---------------------------------------------
--  * p_ids 는 이 브라우저가 신청 직후 기억해 둔 신청서 id 목록입니다. 무작위 UUID 라 추측할 수 없고, 다른 사람에게 노출되지 않습니다.
--    (참고: 인증된 매니저는 '신청 대기 목록' 조회로 대기 중인 신청 id 를 볼 수 있지만, 신청서 내용도 이미 볼 수 있는 운영 권한입니다)
--  * 이미 user_id 가 있는 신청, 14일이 지난 신청, 존재하지 않는 id 는 조용히 건너뜁니다 (연결된 id 만 돌려줌).
--  * 비로그인 상태로 낸 신청이 로그인 전에 이미 매니저가 수락해 care_schedules 행이 만들어졌을 수 있습니다 — 그때는
--    accept_service_application() 이 guardian_id 를 (당시엔 NULL 이던) 신청서 user_id 로 채워서 NULL 로 남습니다.
--    이 claim 이 일어나는 시점에 schedule_id 로 연결된 care_schedules.guardian_id 도 함께 채워야, 보호자 마이페이지가
--    care_schedules 를 직접 select 할 때(mypage.html 의 attachSchedules(), guardian_id = auth.uid() 정책 기준으로
--    걸러짐) 이 일정도 바로 보입니다 — 여기서 안 채우면 로그인해서 claim 해도 진행 현황(출발/도착)이 계속 안 보입니다.
create or replace function public.claim_service_applications(p_ids uuid[])
returns setof uuid
language sql security definer set search_path = public as $$
  with claimed as (
    update public.service_applications a
       set user_id = auth.uid()
     where auth.uid() is not null
       and a.id = any (p_ids[1:20])
       and a.user_id is null
       and a.created_at > now() - interval '14 days'
    returning a.id, a.schedule_id
  ), backfill as (
    update public.care_schedules s
       set guardian_id = auth.uid()
      from claimed c
     where s.id = c.schedule_id and s.guardian_id is null
    returning s.id
  )
  select id from claimed
$$;

revoke all on function public.claim_service_applications(uuid[]) from public, anon;
grant  execute on function public.claim_service_applications(uuid[]) to authenticated;

notify pgrst, 'reload schema';   -- API 가 새 함수·정책을 바로 알도록

-- ★ 확인 (각각 실행)
--   1) 기본값:   select column_default from information_schema.columns
--                 where table_schema = 'public' and table_name = 'service_applications' and column_name = 'user_id';   -- auth.uid()
--   2) 정책:     select policyname, cmd, roles, with_check from pg_policies where tablename = 'service_applications';
--                 → service_applications_insert_linked (INSERT, authenticated) 가 보여야 함
--   3) 함수 권한: select has_function_privilege('authenticated', 'public.claim_service_applications(uuid[])', 'execute');   -- true
--
-- ★ 이미 user_id 가 비어 있는 예전 신청 (이 파일로는 자동 연결되지 않습니다 — 어느 브라우저가 냈는지 알 수 없으므로)
--   비어 있는 건 확인:
--     select id, created_at, user_contact, service_type, status from public.service_applications where user_id is null order by created_at desc;
--   본인 확인을 마친 뒤 계정 연결 (계정 UUID 는 Authentication > Users 에서 확인):
--     update public.service_applications set user_id = '<보호자 계정 UUID>' where id = '<신청 id>';
