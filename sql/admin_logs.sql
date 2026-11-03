-- ============================================================================
-- admin-logs.html — 관리자 활동 감사 로그
--
--   admin_logs : 관리자가 수행한 민감한 조작(회원 정보 수정, CS 메모 작성, 계정 정지/활성화 등)을
--   남기는 범용 이력 테이블입니다. insert/update/delete 를 전부 authenticated/anon 에게서 거둬들이고
--   오직 아래 log_admin_action() SECURITY DEFINER 함수(또는 service-role Edge Function)를 통해서만
--   행이 생기게 해, 로그 자체가 사후에 고쳐지거나 지워질 수 없게 합니다(admin-logs.html 은 읽기
--   전용 — 이 테이블에 UPDATE/DELETE 정책 자체가 없으므로 화면에 버튼을 만들지 않는 것과 무관하게
--   API 로도 변경이 불가능합니다).
--
--   어떤 행동이 이미 이 테이블에 기록되는지(이 파일 기준):
--     - member_profile_update : admin_update_member_profile() (sql/admin_member_management.sql)
--     - member_note_add       : admin_add_member_note()       (sql/admin_member_management.sql)
--     - member_suspend / member_activate : admin-set-member-status Edge Function
--   그 밖의 기존 관리자 조작(매니저 승인/반려, 수동 배정, 환불 처리, 패키지 회차 조정 등)은 아직 이
--   테이블에 기록되지 않습니다 — 필요하면 각 RPC에 `perform public.log_admin_action(...)` 한 줄을
--   추가해 같은 방식으로 확장할 수 있습니다.
--
--   실행 순서: sql/admin_rls_policies.sql(is_admin()) → 이 파일 → sql/admin_member_management.sql
--   (admin_update_member_profile()/admin_add_member_note() 가 이 파일의 log_admin_action() 을
--   호출하므로, 이 파일이 먼저 있어야 합니다. 이미 admin_member_management.sql 을 먼저 실행했다면
--   이 파일 실행 후 admin_member_management.sql 을 한 번 더 실행하세요 — 둘 다 create or replace
--   기반이라 순서를 바꿔 다시 실행해도 안전합니다).
-- ============================================================================

create table if not exists public.admin_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id),
  -- 기록 시점의 관리자 이름/이메일을 함께 찍어 둡니다 — 나중에 그 관리자 계정의 이름이 바뀌거나
  -- 탈퇴해도(프로필 자체가 지워지는 경우는 없지만) 이 로그 행이 "그 당시 누가 했는지"를 그대로 보여줍니다.
  admin_name  text,
  admin_email text,
  action_type text not null,
  target_type text,
  target_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);
create index if not exists admin_logs_admin_id_idx    on public.admin_logs (admin_id);
create index if not exists admin_logs_action_type_idx  on public.admin_logs (action_type);

alter table public.admin_logs enable row level security;

drop policy if exists admin_logs_select_admin on public.admin_logs;
create policy admin_logs_select_admin on public.admin_logs
  for select to authenticated using (public.is_admin());

-- update/delete 정책을 아예 만들지 않습니다 — 정책이 없으면 RLS가 기본적으로 모두 거부하므로,
-- service_role(Supabase 대시보드 SQL Editor 등)이 아닌 한 그 누구도(관리자 포함) 고치거나 지울 수 없습니다.
revoke insert, update, delete on public.admin_logs from anon, authenticated;
grant  select on public.admin_logs to authenticated;
revoke all on public.admin_logs from anon;

-- ----------------------------------------------------------------------------
-- log_admin_action() — 로그를 남기는 유일한 통로. 다른 SECURITY DEFINER RPC 안에서
-- `perform public.log_admin_action(...)` 로 호출하거나, admin.html/admin-logs.html 에서 직접
-- (아직 전용 RPC로 감싸지 않은 관리자 조작을 기록하고 싶을 때) client.rpc() 로 호출할 수 있습니다.
-- is_admin() 이 아니면 아무도 로그를 남길 수 없습니다(관리자를 사칭한 로그 위조 방지).
-- ----------------------------------------------------------------------------
create or replace function public.log_admin_action(
  p_action_type text,
  p_target_type text default null,
  p_target_id   text default null,
  p_detail      jsonb default null
)
returns public.admin_logs
language plpgsql security definer set search_path = public as $$
declare
  v_admin_name  text;
  v_admin_email text;
  v_row         public.admin_logs;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if coalesce(btrim(p_action_type), '') = '' then
    raise exception 'ACTION_TYPE_REQUIRED' using errcode = '22004';
  end if;

  select p.name, u.email into v_admin_name, v_admin_email
    from public.profiles p join auth.users u on u.id = p.id
   where p.id = auth.uid();

  insert into public.admin_logs (admin_id, admin_name, admin_email, action_type, target_type, target_id, detail)
  values (auth.uid(), v_admin_name, v_admin_email, p_action_type, p_target_type, p_target_id, p_detail)
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant  execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
