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
--   ⚠ 관리자를 실제로 강등시켜야 하는 날이 오면, 이 트리거가 그것도 막으므로 아래처럼 잠깐 꺼야 합니다:
--     alter table public.profiles disable trigger profiles_protect_admin_role;
--     update public.profiles set role = 'guardian' where id = '...';
--     alter table public.profiles enable  trigger profiles_protect_admin_role;
--
--   실행 방법: Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요. 여러 번 실행해도 안전합니다.
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
create or replace function public.protect_admin_role() returns trigger
language plpgsql as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
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
