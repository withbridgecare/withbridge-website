-- ============================================================================
-- 관리자 콘솔(admin.html) '배정 완료(진행 중) 케어 현황' 카드 액션 — 매니저 교체 / 강제 완료
--   두 액션 모두 care_schedules 에 대한 admin 전용 UPDATE RLS 정책이 없어도 동작합니다
--   (SECURITY DEFINER 함수는 RLS 를 거치지 않고 함수 소유자 권한으로 실행되기 때문입니다).
--   is_admin() 은 sql/admin_rls_policies.sql 이 이미 만들어 둔 함수를 그대로 재사용합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일.
--   create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
--
--   0번의 DROP FUNCTION 이 필요한 이유: create or replace function 은 매개변수 목록(시그니처)이 같을 때만
--   "교체"로 처리되고, 반환 타입(RETURNS)이나 매개변수 타입이 달라지면 "cannot change return type of
--   existing function"(42P13) 에러로 거부합니다. 이 두 함수를 이전에 다른 반환 타입으로 먼저 만들어 둔
--   적이 있다면(예: void 등) create or replace 만으로는 덮어쓸 수 없으므로, 같은 이름+매개변수 조합의
--   기존 함수를 먼저 완전히 지운 뒤 아래에서 새로 만듭니다. 처음 실행하는 환경에서는 지울 함수가 없으므로
--   IF EXISTS 덕분에 조용히 넘어갑니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) 반환 타입 충돌 방지 — 기존 함수가 있다면(어떤 반환 타입이었든) 먼저 삭제
-- ----------------------------------------------------------------------------
drop function if exists public.admin_force_complete_care(uuid);
drop function if exists public.admin_reassign_care_manager(uuid, uuid);


-- ----------------------------------------------------------------------------
-- 1) 매니저 교체 — 이미 배정된(= manager_id 가 채워진) care_schedules 건의 담당 매니저를
--    다른 활동 중인(certification_verified=true) 매니저로 바꿉니다. 완료된 건은 바꿀 수 없습니다.
--    같은 건이 service_applications 와 연결돼 있으면(application_id) 그 신청서의 manager_id 도
--    함께 맞춰서 두 테이블이 어긋나지 않게 합니다(care_schedules.manager_id 와
--    service_applications.manager_id 는 서로 자동 동기화 트리거가 없는 별개 컬럼이라, 여기서
--    바꾸지 않으면 신청서 쪽은 예전 매니저로 계속 남습니다).
-- ----------------------------------------------------------------------------
create or replace function public.admin_reassign_care_manager(p_schedule_id uuid, p_new_manager_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.care_schedules;
  v_is_active boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.managers m
    where m.id = p_new_manager_id and m.certification_verified = true
  ) into v_is_active;
  if not v_is_active then
    raise exception 'MANAGER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.care_schedules
     set manager_id = p_new_manager_id
   where id = p_schedule_id
     and manager_id is not null
     and status <> 'completed'
  returning * into v_row;

  if not found then
    raise exception 'SCHEDULE_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if v_row.application_id is not null then
    update public.service_applications
       set manager_id = p_new_manager_id
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.admin_reassign_care_manager(uuid, uuid) from public, anon;
grant  execute on function public.admin_reassign_care_manager(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 2) 강제 완료 — care_schedules_status_flow 트리거(enforce_care_status_flow)가 단계를 한 번에
--    건너뛰는 전환(예: assigned → completed)을 막고 있으므로, 관리자가 눌렀을 때는 남은 단계를
--    한 단계씩 순서대로 밀어서 결국 completed 까지 보냅니다(각 단계 전환마다 트리거가 정상적으로
--    같이 돌아 completed_at 기록, care_schedules → service_applications 상태 미러링까지 그대로 적용됨).
--    이미 완료된 건을 다시 호출해도 에러 없이 그대로 반환합니다(멱등).
--
--    아래 CASE는 enforce_care_status_flow(sql/supabase_schema_latest.sql)가 허용하는 전환과 반드시
--    같아야 합니다 — 한쪽만 고치면 "invalid status transition" 으로 다시 막힙니다. care_schedule_5step_status.sql
--    로 arrived 다음 단계가 treatment_done/returning 두 개로 늘었는데 이 함수가 옛 3단계(pending/assigned/
--    departed/arrived→completed) 기준으로 남아 있어 arrived 건에서 "invalid status transition:
--    arrived -> completed" 에러가 났던 것을 고쳤습니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_force_complete_care(p_schedule_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.care_schedules;
  v_next text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  while v_row.status is distinct from 'completed' loop
    v_next := case v_row.status
      when 'pending'        then 'assigned'
      when 'assigned'       then 'departed'
      when 'departed'       then 'arrived'
      when 'arrived'        then 'treatment_done'
      when 'treatment_done' then 'returning'
      when 'returning'      then 'completed'
      else null
    end;
    if v_next is null then
      raise exception 'CANNOT_FORCE_COMPLETE_FROM_STATUS' using errcode = 'P0001';
    end if;
    update public.care_schedules set status = v_next where id = v_row.id returning * into v_row;
  end loop;

  return v_row;
end $$;

revoke all on function public.admin_force_complete_care(uuid) from public, anon;
grant  execute on function public.admin_force_complete_care(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
