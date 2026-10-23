-- ============================================================================
-- 어드민 콘솔(admin.html / admin.js) 패키지 관리 보강
--
--   1) service_applications.package_remaining_after — 패키지 차감 신청(is_package_used=true) 건이
--      접수되는 바로 그 순간, 차감 후 남은 회차를 스냅샷으로 저장합니다. user_packages.remaining_count
--      는 그 뒤에도 다른 신청으로 계속 줄어들 수 있어서(같은 패키지를 여러 건에 나눠 쓰는 경우),
--      "이 신청 당시의 잔여 회차"를 보려면 지금 값이 아니라 그 시점의 스냅샷이 필요합니다.
--      sql/user_packages_system.sql 의 consume_package_on_application() 트리거는 그대로 두고,
--      그 다음에 실행되는 별도 BEFORE INSERT 트리거로 "방금 차감되고 난 뒤"의 remaining_count 를
--      읽어 옵니다(두 트리거 다 같은 BEFORE INSERT 라서 Postgres 가 트리거 이름 알파벳 순으로
--      실행하므로, 'consume' 가 'snapshot' 보다 먼저 실행됨이 보장됩니다).
--
--   2) user_packages / admin_care_adjustments 에 관리자 조회·수동 조정 권한을 추가합니다.
--      - user_packages_select_admin: 관리자가 전체 보호자의 패키지를 조회(어드민 "패키지 구매
--        회원 관리" 섹션).
--      - admin_care_adjustments.package_id: 특정 신청(application_id)과 무관하게 패키지 자체를
--        조정하는 이력도 같은 표에 남기기 위한 컬럼(기존 action_type 체크에 'manual_adjust' 추가).
--      - admin_adjust_user_package(): 관리자가 특정 user_packages 행의 remaining_count 를 직접
--        가감(+면 충전/보정, -면 차감 보정)하는 SECURITY DEFINER RPC. sql/admin_manual_assignment.sql
--        의 is_admin() 가드 + grant 패턴을 그대로 따릅니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/user_packages_system.sql → sql/care_interruption_refund_system.sql
--             (admin_care_adjustments, remaining_count numeric(5,1) 확장 필요) → 이 파일.
--   전부 create or replace / add column if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 패키지 차감 신청의 "신청 당시 잔여 회차" 스냅샷
-- ----------------------------------------------------------------------------
alter table public.service_applications
  add column if not exists package_remaining_after numeric(5, 1);

create or replace function public.snapshot_package_remaining_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_package_used and new.package_id is not null then
    select remaining_count into new.package_remaining_after
      from public.user_packages
     where id = new.package_id;
  end if;
  return new;
end $$;

-- 'service_applications_consume_package' (consume_package_on_application) 가 먼저 회차를 차감하고
-- 난 뒤, 알파벳 순으로 이후에 실행되는 이 트리거가 이미 줄어든 remaining_count 를 그대로 읽습니다.
drop trigger if exists service_applications_snapshot_package_remaining on public.service_applications;
create trigger service_applications_snapshot_package_remaining
  before insert on public.service_applications
  for each row execute function public.snapshot_package_remaining_after();

revoke all on function public.snapshot_package_remaining_after() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) user_packages — 관리자 전체 조회 (어드민 "패키지 구매 회원 관리" 섹션)
--    기존 user_packages_select_own 정책은 그대로 두고(permissive 라 OR 로 합쳐짐), is_admin() 인
--    경우에만 모든 행을 더 볼 수 있게 추가합니다.
-- ----------------------------------------------------------------------------
drop policy if exists user_packages_select_admin on public.user_packages;
create policy user_packages_select_admin on public.user_packages
  for select to authenticated using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 3) admin_care_adjustments — 특정 신청과 무관한 "패키지 수동 조정" 이력도 남기기 위한 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.admin_care_adjustments
  add column if not exists package_id uuid references public.user_packages(id) on delete set null;

alter table public.admin_care_adjustments drop constraint if exists admin_care_adjustments_action_type_check;
alter table public.admin_care_adjustments add constraint admin_care_adjustments_action_type_check
  check (action_type in ('partial_refund', 'package_restore', 'package_partial_deduct', 'manual_adjust'));


-- ----------------------------------------------------------------------------
-- 4) admin_adjust_user_package() — 관리자가 특정 보호자의 패키지 잔여 회차를 직접 가감합니다.
--    p_delta 는 0이 아니어야 하고(+1, -0.5 등), remaining_count 는 0 ~ total_count 범위로 clamp 됩니다.
--    사유 메모(p_memo)는 admin_adjust_package_session() 과 같은 이유로 필수입니다 — 사후에 "왜
--    바꼈는지"를 반드시 남겨야 분쟁이 생겼을 때 추적할 수 있습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_adjust_user_package(uuid, numeric, text);

create or replace function public.admin_adjust_user_package(
  p_package_id uuid,
  p_delta numeric,
  p_memo text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid;
  v_pkg   public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = '22023';
  end if;
  if coalesce(btrim(p_memo), '') = '' then
    raise exception 'MEMO_REQUIRED' using errcode = '22004';
  end if;

  v_admin := auth.uid();

  update public.user_packages
     set remaining_count = greatest(least(remaining_count + p_delta, total_count), 0)
   where id = p_package_id
  returning * into v_pkg;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.admin_care_adjustments (package_id, admin_id, action_type, amount, memo)
  values (p_package_id, v_admin, 'manual_adjust', p_delta, p_memo);

  return v_pkg;
end $$;

revoke all on function public.admin_adjust_user_package(uuid, numeric, text) from public, anon, authenticated;
grant  execute on function public.admin_adjust_user_package(uuid, numeric, text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
