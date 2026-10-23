-- ============================================================================
-- 케어 매니저 신청 및 승인 시스템
--   일반 유저가 manager-apply.html 에서 케어 매니저 등록을 신청(manager_applications) →
--   관리자가 admin.html 에서 승인/반려. 승인되면 managers 행이 만들어지고(또는 갱신되고)
--   profiles.role 이 'manager' 로 바뀌어, 기존 is_manager()/checkIsManager() 가
--   그 즉시 이 유저를 매니저로 인식합니다 — 권한 판정 로직은 새로 만들지 않고 그대로 재사용합니다.
--   admin.html '활동 중인 케어 매니저' 목록의 [권한 해제] 버튼은 revoke_manager() 로 반대 방향(매니저 → 일반 회원)을 처리합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   create/drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 승인 일자를 관리자 화면(활동 중인 케어 매니저 목록)에 보여주기 위해 managers 에 컬럼을 추가합니다.
-- (managers 자체는 sql/supabase_schema_latest.sql 에서 만들어졌다고 가정)
alter table public.managers add column if not exists approved_at timestamptz;

create table if not exists public.manager_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name             text not null,
  phone            text not null,
  certification    text,
  experience_years integer,
  motivation       text,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  reject_reason    text,
  created_at       timestamptz not null default now()
);

-- 한 유저가 동시에 여러 건을 '대기' 상태로 올리지 못하게 (반려된 뒤 재신청은 새 행으로 허용)
create unique index if not exists manager_applications_one_pending_per_user
  on public.manager_applications (user_id) where status = 'pending';
create index if not exists manager_applications_pending_idx
  on public.manager_applications (created_at) where status = 'pending';

alter table public.manager_applications enable row level security;

-- 본인 신청 내역 + 관리자는 전체 조회
drop policy if exists manager_applications_select on public.manager_applications;
create policy manager_applications_select on public.manager_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 본인 명의로만 신청 가능. 이미 인증된 매니저(managers.certification_verified)는 중복 신청 불가
drop policy if exists manager_applications_insert_own on public.manager_applications;
create policy manager_applications_insert_own on public.manager_applications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.managers m where m.id = auth.uid() and m.certification_verified
    )
  );

-- UPDATE/DELETE 는 아무도 직접 못 함 — 승인/반려는 아래 SECURITY DEFINER 함수로만 처리(감사 로그 성격의 이력 보존)
revoke insert, update, delete on public.manager_applications from anon, authenticated;
grant  select, insert on public.manager_applications to authenticated;
revoke select on public.manager_applications from anon;


-- 승인: managers 행 생성/갱신 + profiles.role='manager' + 신청 상태 갱신을 한 트랜잭션으로 처리
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
  values (v_app.user_id, v_app.certification, true, 'break', now())
  on conflict (id) do update
    set certification = excluded.certification,
        certification_verified = true,
        approved_at = now();

  update public.profiles set role = 'manager' where id = v_app.user_id;

  return v_app;
end $$;

revoke all on function public.approve_manager_application(uuid) from public, anon;
grant  execute on function public.approve_manager_application(uuid) to authenticated;


-- 반려: 신청 상태만 갱신 (managers/profiles 는 건드리지 않음 — 재신청 가능)
create or replace function public.reject_manager_application(p_application_id uuid, p_reason text default null)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  return v_app;
end $$;

revoke all on function public.reject_manager_application(uuid, text) from public, anon;
grant  execute on function public.reject_manager_application(uuid, text) to authenticated;


-- 매니저 권한 해제: certification_verified 를 false 로 내려 is_manager()/checkIsManager() 가 즉시
-- '매니저 아님'으로 판정하게 하고, profiles.role 도 'guardian'(일반 회원)으로 되돌립니다.
-- managers 행 자체는 지우지 않습니다 — 자격증/이력을 남겨 두면 나중에 다시 승인할 때 정보를 재입력하지 않아도 됩니다.
--
-- ⚠ sql/ · _backup_sql/ 전수 조사 결과 managers 에는 우리가 만든 managers_admin_only_fields 밖에
-- 없었는데, 실제 프로젝트에는 Supabase 대시보드에서 SQL 파일 없이 직접 추가된
-- trigger_auto_verify_manager 가 하나 더 있었고(어떤 로직인지는 이 저장소 어디에도 정의가 없어
-- 알 수 없음), 이게 certification_verified 를 다시 true 로 되돌리고 있었습니다(REVOKE_DID_NOT_APPLY
-- 의 원인). 그 트리거의 내부 로직을 모르는 채로 함부로 다시 만들면(CREATE OR REPLACE) 원래 의도를
-- 지워버릴 위험이 있으므로, 대신 이 함수의 UPDATE 한 문장에 한해서만 두 트리거를 이름으로 지정해
-- 꺼뒀다가 즉시 되살립니다 — 관리자 검증은 이미 위에서 마쳤으므로 안전합니다.
create or replace function public.revoke_manager(p_manager_id uuid)
returns public.managers
language plpgsql security definer set search_path = public as $$
declare
  v_row     public.managers;
  v_recheck boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  -- 두 트리거를 이름으로 지정해 끔 (트리거가 없는 환경에서도 함수가 깨지지 않도록 각각 예외 처리)
  begin
    alter table public.managers disable trigger trigger_auto_verify_manager;
  exception when undefined_object then
    null;
  end;
  begin
    alter table public.managers disable trigger managers_admin_only_fields;
  exception when undefined_object then
    null;
  end;

  update public.managers
     set certification_verified = false
   where id = p_manager_id
  returning * into v_row;

  -- 실패하든 성공하든 반드시 되살림 (다음 UPDATE 부터는 원래 검증/자동화가 정상 동작해야 하므로)
  begin
    alter table public.managers enable trigger trigger_auto_verify_manager;
  exception when undefined_object then
    null;
  end;
  begin
    alter table public.managers enable trigger managers_admin_only_fields;
  exception when undefined_object then
    null;
  end;

  if not found then
    raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- RETURNING 이 준 값이 아니라, 테이블에서 독립적으로 다시 읽어서 실제로 커밋될 상태를 재확인
  select certification_verified into v_recheck
    from public.managers where id = p_manager_id;

  if v_recheck is distinct from false then
    raise exception 'REVOKE_DID_NOT_APPLY: certification_verified 가 false 로 반영되지 않았습니다 (현재 값: %). '
      'trigger_auto_verify_manager/managers_admin_only_fields 는 이미 이 UPDATE 동안 꺼 뒀으므로, '
      'CREATE RULE 로 만든 규칙이나 그 밖의 메커니즘이 있는지 Supabase 대시보드에서 직접 확인하세요.', v_recheck
      using errcode = 'P0001';
  end if;

  update public.profiles set role = 'guardian' where id = p_manager_id and role = 'manager';

  return v_row;
end $$;

revoke all on function public.revoke_manager(uuid) from public, anon;
grant  execute on function public.revoke_manager(uuid) to authenticated;


-- ============================================================================
-- my_application_managers() 재정의: 연락처 폴백 추가
--   sql/supabase_schema_latest.sql 의 원본은 profiles.phone 만 봤는데, 매니저가 자기 프로필(phone)을
--   따로 채운 적이 없으면(보통 그렇습니다 — 매니저는 가입 시 프로필 전화번호를 따로 입력하는 화면이
--   없습니다) 이 값이 비어 있어 보호자 쪽 '담당 매니저 정보' 모달에 번호 대신 "곧 안내해 드려요"만
--   보였습니다. 정작 전화번호는 이 매니저가 지원할 때 적어 낸 manager_applications.phone(not null)에
--   이미 있으므로, profiles.phone 이 비었을 때만 그 값으로 보강합니다 — 가장 최근에 승인된 신청을 우선.
--   이 파일(manager_applications.sql)이 supabase_schema_latest.sql 보다 나중에 실행되므로(파일 맨 위
--   실행 순서 안내 참고) manager_applications 테이블이 이미 있는 여기서 재정의합니다.
-- ============================================================================
create or replace function public.my_application_managers()
returns table (application_id uuid, manager_name text, manager_phone text, manager_certification text)
language sql stable security definer set search_path = public as $$
  select a.id,
         coalesce(nullif(btrim(p.name), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')),
         coalesce(nullif(btrim(p.phone), ''), nullif(btrim(ma.phone), '')),
         nullif(btrim(m.certification), '')
    from public.service_applications a
    left join public.profiles p on p.id = a.manager_id
    left join public.managers m on m.id = a.manager_id
    left join auth.users u      on u.id = a.manager_id
    left join lateral (
      select phone from public.manager_applications
      where user_id = a.manager_id and status = 'approved'
      order by reviewed_at desc nulls last
      limit 1
    ) ma on true
   where a.user_id = auth.uid()
     and a.manager_id is not null
$$;

revoke all on function public.my_application_managers() from public, anon;
grant  execute on function public.my_application_managers() to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
