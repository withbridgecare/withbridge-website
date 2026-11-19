-- ============================================================================
-- 어드민 콘솔(admin.html / admin.js) 전용 RLS 정책
--   profiles.role = 'admin' 인 로그인 사용자가
--     1) managers.certification_verified 를 승인(true)         ← '승인' 버튼
--     2) service_applications.manager_id / status 를 수동 배정 ← '수동 배정' 버튼
--   을 클라이언트에서 직접 UPDATE 할 수 있도록 허용합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   sql/supabase_schema_latest.sql 이 이미 적용돼 있어야 합니다
--   (profiles / managers / service_applications, is_manager() 패턴을 전제로 합니다).
--   모든 문장이 create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) is_admin(): 지금 로그인한 사용자가 profiles.role = 'admin' 인지 (is_manager() 와 같은 패턴)
--    SECURITY DEFINER 로 정의해 profiles 의 RLS(자기 행만 select) 와 무관하게 판정합니다.
--    role = 'super_admin'(sql/super_admin_management.sql)도 admin 전용 화면/기능을 그대로 쓸 수
--    있어야 하므로 여기 포함합니다 — super_admin 은 admin 의 상위 권한이지 별개 권한이 아닙니다.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 1) profiles : 관리자가 다른 유저의 role / name / phone 을 수정
--    (지금은 profiles 에 다른 UPDATE 정책이 전혀 없으므로, is_admin() 이 아닌 사용자는
--     아래 grant 가 있어도 이 정책 하나 때문에 어떤 행도 고칠 수 없습니다 — fail closed)
-- ----------------------------------------------------------------------------
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- role 은 직접 수정 권한을 주지 않습니다 — 등급 변경은 검사를 거친 함수로만(sql/role_hierarchy_hardening.sql).
grant update (name, phone) on public.profiles to authenticated;
revoke update (role) on public.profiles from authenticated, anon;


-- ----------------------------------------------------------------------------
-- 2) managers : 관리자가 매니저 자격 인증 상태를 승인/반려
--    주의: managers_update_own(자기 행, activity_status 컬럼만 grant)이 이미 있어서,
--    certification / certification_verified 컬럼을 authenticated 에 grant 하면 컬럼 권한만으로는
--    매니저 본인도 자기 행에 한해 이 컬럼을 바꿀 수 있게 열리는 셈입니다(컬럼 grant는 정책 단위가
--    아니라 역할 단위라서). 그래서 트리거로 "이 두 컬럼은 is_admin() 세션만 바꿀 수 있다"를
--    한 번 더 강제해 자기 승인(self-approve)을 막습니다.
-- ----------------------------------------------------------------------------
drop policy if exists managers_update_admin on public.managers;
create policy managers_update_admin on public.managers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update (certification, certification_verified) on public.managers to authenticated;

create or replace function public.enforce_managers_admin_only_fields() returns trigger
language plpgsql as $$
begin
  if (new.certification_verified is distinct from old.certification_verified
      or new.certification is distinct from old.certification)
     and not public.is_admin() then
    raise exception 'ADMIN_ONLY_FIELD: certification/certification_verified 는 관리자만 수정할 수 있습니다.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists managers_admin_only_fields on public.managers;
create trigger managers_admin_only_fields before update on public.managers
  for each row execute function public.enforce_managers_admin_only_fields();


-- ----------------------------------------------------------------------------
-- 3) service_applications : 관리자가 수동으로 매니저 배정(manager_id) / 상태(status) 조정
--    이 테이블은 지금까지 UPDATE 정책이 전혀 없었습니다(모든 변경이 accept_service_application() 등
--    SECURITY DEFINER 함수 경유). 이 정책을 추가해도 is_admin() 이 아닌 사용자는 여전히 어떤 행도
--    고치지 못합니다 — fail closed.
--    manager_id 만 채워도 기존 트리거 sync_application_status() 가 accepted_at 과
--    status='matched' 를 자동으로 채우므로, admin.js 는 manager_id 만 보내면 충분합니다.
--    status 컬럼은 관리자가 배정 취소 등으로 직접 조정할 수 있게 함께 열어 둡니다.
-- ----------------------------------------------------------------------------
drop policy if exists service_applications_update_admin on public.service_applications;
create policy service_applications_update_admin on public.service_applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update (manager_id, status) on public.service_applications to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침 — 위에서 추가한 정책/함수/권한을 API 가 바로 인식하도록
-- ============================================================================
notify pgrst, 'reload schema';
