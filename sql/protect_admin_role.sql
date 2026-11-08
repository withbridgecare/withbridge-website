-- ============================================================================
-- 관리자 계정이 다른 로직에 의해 강등되는 것을 막는 2중 안전장치
--
--   지금까지 approve_manager_application() 의 마지막 줄이 조건 없이
--   "update profiles set role = 'manager' where id = v_app.user_id" 였어서, 관리자 계정이 본인
--   명의로 매니저 지원서를 넣고 승인하면 그 즉시 role 이 'admin' → 'manager' 로 바뀌었습니다.
--   (sql/approve_manager_application_preserve_admin_role.sql 에서 한 번 고쳤지만, 이 파일 하나는
--   "함수 안에서만" 막는 거라 — 앞으로 또 다른 함수/트리거/수동 UPDATE 가 똑같은 실수를 하면 다시
--   뚫립니다. 그래서 이번엔 테이블 자체에 트리거를 걸어 어떤 코드 경로로 오든 막습니다.)
--
--   이 파일은 두 겹으로 보호합니다:
--     1) approve_manager_application() 함수 자체에 role <> 'admin' 조건 (다시 명시 — 이 파일만
--        실행해도 통째로 안전해지도록 자기 완결적으로 포함)
--     2) public.profiles 테이블에 BEFORE UPDATE 트리거: role 이 이미 'admin' 인 행을 다른 값으로
--        바꾸려는 모든 UPDATE 를 — 어떤 함수/코드에서 왔든 — 조용히 무시하고 'admin' 을 그대로 유지
--
--   ⚠ 관리자를 실제로 강등시켜야 하는 날이 오면(= super-admin.html 의 [권한 회수]),
--     이 트리거가 그것도 막아버립니다. 두 가지 방법이 있습니다:
--     1) (권장, 이미 적용됨) sql/super_admin_management.sql 의 super_admin_revoke_admin() 은
--        아래 트리거 함수가 보는 트랜잭션-로컬 설정값을 먼저 켜고 UPDATE 합니다:
--          perform set_config('app.allow_admin_role_change', 'on', true);
--          update public.profiles set role = 'guardian' where id = '...';
--        set_config(..., true) 의 세 번째 인자 true 는 "이 트랜잭션에서만" 적용된다는 뜻이라,
--        커밋/롤백되면 자동으로 꺼집니다 — 다른 UPDATE 에 실수로 계속 열려 있을 걱정이 없습니다.
--     2) Supabase 대시보드에서 수동으로 내릴 때는 여전히 트리거를 잠깐 꺼야 합니다:
--        alter table public.profiles disable trigger profiles_protect_admin_role;
--        update public.profiles set role = 'guardian' where id = '...';
--        alter table public.profiles enable  trigger profiles_protect_admin_role;
--
--   실행 방법: Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요. 여러 번 실행해도 안전합니다.
--   sql/super_admin_management.sql 의 super_admin_revoke_admin() 이 위 set_config 키를 쓰므로,
--   이 파일을 먼저(또는 다시) 실행해 트리거 함수를 최신으로 맞춰야 [권한 회수] 가 실제로 반영됩니다.
-- ============================================================================

-- 1) 승인 함수 자체의 보호 (다시 포함 — 자기 완결적)
create or replace function public.approve_manager_application(p_application_id uuid)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.managers (id, certification, certification_verified, activity_status, approved_at)
  values (
    v_app.user_id,
    nullif(array_to_string(v_app.certifications, ', '), ''),
    true, 'break', now()
  )
  on conflict (id) do update
    set certification = excluded.certification,
        certification_verified = true,
        approved_at = now();

  -- 'admin' 계정은 매니저로 승인되어도 강등되지 않도록 보호 (role 이 'admin' 이 아닐 때만 'manager' 로 변경)
  update public.profiles set role = 'manager' where id = v_app.user_id and role <> 'admin';

  return v_app;
end $$;

revoke all on function public.approve_manager_application(uuid) from public, anon;
grant  execute on function public.approve_manager_application(uuid) to authenticated;

-- 2) 테이블 차원의 포괄적 보호: role 이 'admin' 이던 행은 어떤 UPDATE 로도 'admin' 에서 못 벗어남
--    단, current_setting('app.allow_admin_role_change', true) 가 'on' 이면 통과시킵니다 —
--    super_admin_revoke_admin() (sql/super_admin_management.sql) 이 최고 관리자 본인 확인을
--    마친 뒤에만 이 트랜잭션 동안 그 설정을 켭니다(set_config 의 is_local=true 라 트랜잭션이
--    끝나면 자동으로 꺼짐). 그 밖의 모든 경로(수동 UPDATE, 다른 함수의 실수 등)는 여전히 막힙니다.
create or replace function public.protect_admin_role() returns trigger
language plpgsql as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin'
     and coalesce(current_setting('app.allow_admin_role_change', true), '') <> 'on' then
    new.role := 'admin';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_admin_role on public.profiles;
create trigger profiles_protect_admin_role
  before update of role on public.profiles
  for each row execute function public.protect_admin_role();

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
