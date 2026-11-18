-- ============================================================================
-- super-admin.html / super-admin.js 전용 — 최고 관리자(super_admin)만 다른 계정에 관리자(admin)
-- 권한을 부여/회수할 수 있게 하는 함수들입니다.
--
--   is_super_admin() 은 profiles.role = 'super_admin' 일 때만 true 입니다(예전의 고정 이메일 예외는
--   sql/role_hierarchy_hardening.sql 에서 제거했습니다).
--   이 함수가 false 를 돌려주면 아래 grant/revoke 함수는 전부 예외를 던지고 아무것도 바꾸지
--   않습니다(fail closed) — super-admin.js 의 화면단 접근 차단도 이 함수 하나만 호출해서 판단합니다.
--
--   role 값은 자유 text 컬럼(check 제약 없음, sql/supabase_schema_latest.sql)이라 'super_admin'
--   값을 쓰는 데 별도 스키마 변경이 필요 없습니다. 최초의 super_admin 계정은 이 파일만으로는
--   만들어지지 않습니다 — 최고관리자로 쓸 계정은 Supabase 대시보드에서 직접
--   `update public.profiles set role = 'super_admin' where id = '...'` 을 실행하세요
--   (sql/_recover_admin_account.sql 과 같은 1회성 수기 작업 패턴).
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin(), super_admin
--   포함하도록 수정됨) → sql/admin_logs.sql(log_admin_action()) → 이 파일.
--   모든 문장이 create or replace 기반이라 여러 번 실행해도 안전합니다.
--
--   ⚠ sql/protect_admin_role.sql 을 이미 실행해 둔 프로젝트라면(role='admin' 강등을 막는
--   profiles_protect_admin_role 트리거), 그 파일도 최신 버전으로 한 번 더 실행하세요 —
--   super_admin_revoke_admin() 이 그 트리거의 escape hatch(app.allow_admin_role_change
--   설정값)를 쓰는데, 옛 버전 트리거는 이 설정값을 모르고 무조건 막기 때문에 [권한 회수] 가
--   성공한 것처럼 보이지만 실제로는 role 이 그대로 'admin' 으로 남습니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) is_super_admin()
-- ----------------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  -- 최고관리자는 profiles.role = 'super_admin' 하나로만 판단합니다(고정 이메일 예외는 제거됨 —
  -- sql/role_hierarchy_hardening.sql). 계정을 최고관리자로 지정하는 일은 대시보드 SQL Editor 에서만.
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(btrim(coalesce(p.role, ''))) = 'super_admin'
  );
$$;
revoke all on function public.is_super_admin() from public, anon;
grant  execute on function public.is_super_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 1) super_admin_list_admins() — 현재 admin/super_admin 권한을 가진 계정 전체 목록
--    (super-admin.html 의 "현재 관리자 목록" 표)
-- ----------------------------------------------------------------------------
create or replace function public.super_admin_list_admins()
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'NOT_SUPER_ADMIN' using errcode = '42501';
  end if;

  -- auth.users.email 은 character varying 이라, RETURNS TABLE 의 email text 와 타입이 정확히
  -- 일치해야 하는 RETURN QUERY 에서는 명시적으로 ::text 캐스팅해야 합니다(그러지 않으면 "structure
  -- of query does not match function result type" 에러 — sql/admin_user_management.sql 의
  -- u.email::text 와 같은 이유).
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role in ('admin', 'super_admin')
    order by (p.role = 'super_admin') desc, p.created_at asc;
end $$;
revoke all on function public.super_admin_list_admins() from public, anon;
grant  execute on function public.super_admin_list_admins() to authenticated;


-- ----------------------------------------------------------------------------
-- 2) super_admin_grant_admin(p_email) — 이메일로 가입된 계정을 찾아 role 을 'admin' 으로 변경
--    (이미 가입된 계정만 대상 — auth.users 에 없으면 USER_NOT_FOUND)
-- ----------------------------------------------------------------------------
create or replace function public.super_admin_grant_admin(p_email text)
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_target_id   uuid;
  v_target_name text;
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

  -- RETURNS TABLE(id, name, email, role, created_at) 가 선언되면 plpgsql 함수 본문 전체에서
  -- 그 이름들이 OUT 매개변수 변수로도 동시에 존재합니다 — 아래처럼 테이블 별칭 없이 그냥
  -- "id" 라고만 쓰면 그 변수와 profiles.id 컬럼 중 어느 쪽인지 알 수 없어 "column reference
  -- 'id' is ambiguous" 에러가 납니다. 테이블에 별칭(p)을 주고 p.id 로 명시해 해결합니다.
  perform set_config('app.allow_admin_role_change', 'on', true); -- role 보호 트리거 통과(검사 완료 후, 이 트랜잭션만)
  update public.profiles as p set role = 'admin' where p.id = v_target_id;

  perform public.log_admin_action('super_admin_grant_admin', 'profiles', v_target_id::text,
    jsonb_build_object('target_email', p_email, 'target_name', v_target_name));

  -- auth.users.email 은 character varying 이라 RETURNS TABLE 의 email text 와 정확히 맞추려면
  -- ::text 캐스팅이 필요합니다(바로 위 1번 함수와 같은 이유).
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = v_target_id;
end $$;
revoke all on function public.super_admin_grant_admin(text) from public, anon;
grant  execute on function public.super_admin_grant_admin(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) super_admin_revoke_admin(p_target_id) — admin 권한 회수(role 을 기본값 'guardian' 으로 되돌림)
--    - 본인 계정은 회수 불가(자기 권한을 스스로 걸어 잠그는 사고 방지)
--    - super_admin 계정은 이 함수로 회수 불가(여기서는 admin ↔ guardian 전환만 다룹니다)
-- ----------------------------------------------------------------------------
create or replace function public.super_admin_revoke_admin(p_target_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_current_role text;
  v_target_name  text;
  v_target_email text;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_SUPER_ADMIN' using errcode = '42501';
  end if;

  if p_target_id = auth.uid() then
    raise exception 'CANNOT_REVOKE_SELF' using errcode = '22023';
  end if;

  select p.role, p.name, u.email into v_current_role, v_target_name, v_target_email
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_target_id;

  if v_current_role is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current_role = 'super_admin' then
    raise exception 'CANNOT_REVOKE_SUPER_ADMIN' using errcode = '22023';
  end if;

  -- sql/protect_admin_role.sql 의 profiles_protect_admin_role 트리거가 role='admin' 이던 행을
  -- 'admin' 밖으로 못 나가게 막고 있어서, 이 플래그 없이는 아래 UPDATE 가 조용히 무시됩니다
  -- (에러 없이 성공한 것처럼 보이지만 DB는 그대로 'admin' 으로 남음). is_super_admin() 확인을
  -- 이미 통과한 뒤이므로 이 트랜잭션에서만(set_config 세 번째 인자 true) 잠깐 열어 줍니다 —
  -- 커밋/롤백과 함께 자동으로 다시 닫혀 다른 UPDATE 경로에는 영향이 없습니다.
  perform set_config('app.allow_admin_role_change', 'on', true);
  update public.profiles as p set role = 'guardian' where p.id = p_target_id;

  perform public.log_admin_action('super_admin_revoke_admin', 'profiles', p_target_id::text,
    jsonb_build_object('target_email', v_target_email, 'target_name', v_target_name));
end $$;
revoke all on function public.super_admin_revoke_admin(uuid) from public, anon;
grant  execute on function public.super_admin_revoke_admin(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
