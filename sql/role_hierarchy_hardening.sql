-- ============================================================================
-- 권한 위계 강화: 일반(guardian) < 매니저(manager) < 관리자(admin) < 최고관리자(super_admin)
--
-- 이 파일이 고치는 것
--   1) 관리자가 profiles.role 을 직접 바꿔 다른 계정을 관리자/최고관리자로 올리거나, 최고관리자를
--      강등할 수 있던 문제 → role 컬럼 직접 수정 권한을 없애고, 등급 변경은 검사를 거친 함수로만.
--   2) is_super_admin() 의 고정 이메일 예외 → profiles.role = 'super_admin' 하나로만 판단.
--   3) 관리자는 일반/매니저/관리자 계정만 다룰 수 있고, 최고관리자 계정과 그 데이터(프로필·메모·
--      쿠폰·패키지)는 최고관리자만 바꿀 수 있게 DB에서 막습니다.
--
-- 실행 전 확인 (중요)
--   이 파일은 맨 앞에서 role = 'super_admin' 인 계정이 하나도 없으면 오류를 내고 멈춥니다.
--   지금까지는 고정 이메일 덕분에 role 값이 없어도 최고관리자로 인정됐기 때문에, 그 계정의 role 을
--   먼저 'super_admin' 으로 바꿔 두지 않으면 이 파일을 실행하는 순간 최고관리자가 사라집니다.
--   확인:  select p.id, p.name, u.email, p.role from public.profiles p join auth.users u on u.id = p.id
--          where p.role in ('admin', 'super_admin');
--   지정:  update public.profiles set role = 'super_admin' where id = '<최고관리자 계정 id>';
--
-- 실행 순서: sql/admin_rls_policies.sql → sql/admin_logs.sql → sql/super_admin_management.sql →
--           sql/protect_admin_role.sql → (회원 관리 SQL들) → 이 파일.
--   개발용 DB를 sql/schema_clone_dev.sql 로 만들었다면 그 뒤에도 이 파일을 한 번 실행하세요.
--   create or replace / drop if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) 안전장치: 최고관리자 계정이 하나도 없으면 아무것도 바꾸지 않고 멈춤
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.profiles where lower(btrim(coalesce(role, ''))) = 'super_admin'
  ) then
    raise exception '최고관리자(role = super_admin) 계정이 없습니다. 파일 상단 "실행 전 확인" 안내대로 먼저 지정한 뒤 다시 실행하세요.';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 1) is_super_admin(): role 로만 판단 (고정 이메일 예외 제거)
-- ----------------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(btrim(coalesce(p.role, ''))) = 'super_admin'
  );
$$;
revoke all on function public.is_super_admin() from public, anon;
grant  execute on function public.is_super_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 2) 관리자가 손댈 수 있는 계정인지: 최고관리자는 전부, 관리자는 최고관리자를 뺀 전부
-- ----------------------------------------------------------------------------
create or replace function public.can_manage_user(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or (
        public.is_admin()
        and not exists (
          select 1 from public.profiles p
          where p.id = p_target and lower(btrim(coalesce(p.role, ''))) = 'super_admin'
        )
      );
$$;
revoke all on function public.can_manage_user(uuid) from public, anon;
grant  execute on function public.can_manage_user(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) role 컬럼 직접 수정 금지
--    화면(브라우저)에서 오는 요청은 role 을 바꿀 수 없습니다. 등급 변경은 아래 함수들만 합니다.
--      - 일반 ↔ 매니저 : 매니저 승인/해제 함수(관리자, sql/manager_applications*.sql)
--      - 일반 ↔ 관리자 : super_admin_grant_admin / super_admin_revoke_admin (최고관리자)
--      - → 최고관리자  : Supabase 대시보드 SQL Editor 에서만
-- ----------------------------------------------------------------------------
revoke update (role) on public.profiles from authenticated, anon;

-- 표 전체 UPDATE 권한이 남아 있으면 위의 컬럼 단위 revoke 가 효과가 없습니다(Supabase 기본 권한).
-- 그런 경우에만 표 전체 권한을 거두고, 회원이 직접 고칠 수 있는 컬럼만 다시 열어 줍니다
-- (sql/profile_account_management.sql 의 목록에서 phone 을 뺀 것 — sql/profile_phone_lock.sql 과 동일).
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    revoke update on public.profiles from authenticated, anon;
    declare c text;
    begin
      foreach c in array array['name', 'address', 'address_detail', 'notify_care', 'notify_marketing'] loop
        if exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
          execute format('grant update (%I) on public.profiles to authenticated', c);
        end if;
      end loop;
    end;
    raise notice '[role_hierarchy_hardening] profiles 표 전체 UPDATE 권한을 회수하고 허용 컬럼만 다시 부여했습니다.';
  end if;
end $$;

-- 관리자의 다른 회원 프로필 수정 정책: 최고관리자 행은 최고관리자만
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.can_manage_user(id))
  with check (public.can_manage_user(id));


-- ----------------------------------------------------------------------------
-- 4) role 변경 보호 트리거 (protect_admin_role 의 확장판)
--    관리자·최고관리자가 관련된 등급 변경(올리기/내리기)은 아래 경우에만 통과합니다.
--      - Supabase 대시보드 SQL Editor / service-role(로그인 사용자 없음, auth.uid() is null)
--      - 최고관리자 함수가 검사를 마친 뒤 이 트랜잭션에만 켜는 app.allow_admin_role_change = 'on'
--    그 밖의 경우 role 은 조용히 원래 값으로 유지됩니다(예: 관리자 본인의 매니저 지원서를 승인해도
--    'admin' 이 'manager' 로 내려가지 않음 — 기존 protect_admin_role 과 같은 동작).
-- ----------------------------------------------------------------------------
create or replace function public.protect_privileged_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old text := lower(btrim(coalesce(old.role, '')));
  v_new text := lower(btrim(coalesce(new.role, '')));
begin
  if v_old = v_new then
    return new;
  end if;
  if auth.uid() is null then
    return new; -- 대시보드 SQL Editor, service-role
  end if;
  if coalesce(current_setting('app.allow_admin_role_change', true), '') = 'on' then
    return new;
  end if;
  if v_old in ('admin', 'super_admin') or v_new in ('admin', 'super_admin') then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_privileged_roles on public.profiles;
create trigger profiles_protect_privileged_roles
  before update of role on public.profiles
  for each row execute function public.protect_privileged_roles();


-- ----------------------------------------------------------------------------
-- 5) 최고관리자 계정 보호 트리거: 관리자가 최고관리자의 프로필·메모·쿠폰·패키지를 바꾸지 못하게
--    (본인 데이터, 매니저·시스템 처리, 최고관리자 본인의 작업은 그대로 통과)
-- ----------------------------------------------------------------------------
create or replace function public.guard_super_admin_target() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
begin
  -- INSERT 에는 OLD 가, DELETE 에는 NEW 가 없으므로 분기해서 읽습니다
  if tg_op = 'DELETE' then
    if tg_table_name = 'profiles' then v_target := old.id; else v_target := old.user_id; end if;
  else
    if tg_table_name = 'profiles' then v_target := new.id; else v_target := new.user_id; end if;
  end if;

  -- 관리자 권한으로 남의 데이터를 바꾸는 경우만 검사합니다. 본인 데이터, 대시보드/시스템 처리
  -- (auth.uid() 없음), 매니저의 회차 차감 같은 일반 흐름은 그대로 통과합니다.
  if auth.uid() is not null and v_target is not null and v_target <> auth.uid()
     and public.is_admin() and not public.can_manage_user(v_target) then
    raise exception 'CANNOT_MANAGE_SUPER_ADMIN' using errcode = '42501',
      hint = '최고관리자 계정의 정보는 최고관리자만 변경할 수 있습니다.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_super_admin on public.profiles;
create trigger profiles_guard_super_admin
  before update on public.profiles
  for each row execute function public.guard_super_admin_target();

do $$
declare
  t text;
begin
  foreach t in array array['admin_member_notes', 'user_coupons', 'user_packages'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_guard_super_admin', t);
      execute format(
        'create trigger %I before insert or update or delete on public.%I
           for each row execute function public.guard_super_admin_target()',
        t || '_guard_super_admin', t);
    end if;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 6) 관리자 지정/회수 함수: 검사 후에만 role 변경 허용 플래그를 켬
-- ----------------------------------------------------------------------------
create or replace function public.super_admin_grant_admin(p_email text)
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_target_id    uuid;
  v_target_name  text;
  v_current_role text;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_SUPER_ADMIN' using errcode = '42501';
  end if;

  select u.id into v_target_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_target_id is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select p.role, p.name into v_current_role, v_target_name
    from public.profiles p where p.id = v_target_id;

  if v_current_role = 'super_admin' then
    raise exception 'ALREADY_SUPER_ADMIN' using errcode = '22023';
  end if;
  if v_current_role = 'admin' then
    raise exception 'ALREADY_ADMIN' using errcode = '22023';
  end if;

  perform set_config('app.allow_admin_role_change', 'on', true);
  update public.profiles as p set role = 'admin' where p.id = v_target_id;

  perform public.log_admin_action('super_admin_grant_admin', 'profiles', v_target_id::text,
    jsonb_build_object('target_email', p_email, 'target_name', v_target_name));

  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = v_target_id;
end $$;
revoke all on function public.super_admin_grant_admin(text) from public, anon;
grant  execute on function public.super_admin_grant_admin(text) to authenticated;

-- super_admin_revoke_admin() 은 sql/super_admin_management.sql 그대로 씁니다
-- (is_super_admin 검사 → 본인/최고관리자 대상 거부 → 플래그를 켜고 'guardian' 으로 변경).


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
