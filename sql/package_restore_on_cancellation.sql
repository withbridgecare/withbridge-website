-- ============================================================================
-- package_restore_on_cancellation.sql
-- 패키지 이용권(user_packages)을 차감해 접수한 신청(service_applications.is_package_used=true)이
-- 취소될 때, 차감됐던 회차(1회)를 자동으로 돌려줍니다.
--
--   지금까지 패키지 회차 "복구"는 admin_adjust_package_session()(sql/care_interruption_refund_system.sql)
--   하나뿐이었는데, 이건 "진행 중인 케어가 현장에서 중단됐을 때" 관리자가 메모를 남기고 수동으로
--   0.5회/1회를 되돌리는 별개의 도구입니다(그 경로는 care_schedules 를 'completed'로 닫으며
--   status 를 CANCELLED/EXPIRED_CANCELLED 로 바꾸지 않습니다 — 아래 트리거와 겹치지 않습니다).
--
--   정작 "아직 매니저가 배정되지 않은 신청을 취소"하는 가장 흔한 경로들은 패키지를 전혀 신경 쓰지
--   않고 있었습니다:
--     - cancel_my_application()(sql/guardian_cancel_application.sql) — 보호자 마이페이지 직접 취소
--     - admin.js cancelApplication() — 관리자가 service_applications.status 를 직접 UPDATE(RPC 없음)
--     - expire_unmatched_application()(sql/matching_expiry_auto_refund.sql) — 48시간 미매칭 자동취소
--   이 셋 다 "status 를 CANCELLED 또는 EXPIRED_CANCELLED 로 바꾼다"는 공통점만 있고, 그 외에는
--   RPC/클라이언트 직접 UPDATE 등 호출 방식이 전부 다릅니다 — 그래서 호출부마다 복구 로직을 각각
--   끼워 넣는 대신, "status 가 취소류로 바뀌는 순간" 하나에 반응하는 트리거 하나로 전부 커버합니다.
--   앞으로 새로운 취소 경로가 추가되어도(이 트리거를 또 고치지 않아도) 같은 규칙으로 자동 적용됩니다.
--
--   중복 복구 방지: package_restored 플래그 컬럼을 추가해, 이 트리거가 "이미 한 번 복구한 신청"을
--   다시 복구하지 않도록 막습니다. 또한 old.status 가 이미 CANCELLED/EXPIRED_CANCELLED 였다면
--   (예: CANCELLED 상태에서 다시 한 번 status='CANCELLED' 로 쓰거나, 드물게 CANCELLED →
--   EXPIRED_CANCELLED 처럼 취소류 사이를 오가는 경우) 발동하지 않습니다 — "정상적으로 활성/대기
--   상태에서 취소로 막 넘어가는 단 한 번"만 복구합니다.
--
--   실행 순서: sql/user_packages_system.sql(user_packages/package_id/is_package_used 컬럼) →
--             sql/care_interruption_refund_system.sql(remaining_count 가 numeric(5,1) 로 바뀜) → 이 파일.
--   add column if not exists / create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 중복 복구 방지 플래그 — 이 신청의 패키지 회차를 이미 돌려줬는지 기록합니다.
--
--    + 패키지 차감/복구 이력 컬럼(2026-11 추가) — "신청 당시 잔여 몇 회였는지"와 "취소로 복구되는
--    순간 잔여가 몇 회 → 몇 회로 바뀌었는지"를 이 신청 행 자체에 그대로 남겨, 관리자(admin.js '패키지
--    1회 복구 완료' 배지 상세)와 보호자(mypage.html 취소 안내 문구) 양쪽이 "정상적으로 복구됐는지"를
--    바로 검증할 수 있게 합니다 — 수동 조작으로 remaining_count 가 이상하게 바뀌었는지도 이 숫자들로
--    바로 드러납니다(예: before_restore 가 total_count 와 같은데도 또 복구 시도를 했다거나, after가
--    before+1 이 아니라거나 하면 즉시 의심할 수 있음).
--      - package_remaining_at_application : 이 신청이 패키지를 차감한 "직후" 그 패키지의 잔여 횟수.
--        아래 §5 의 AFTER INSERT 트리거가 채웁니다(consume_package_on_application() 자체는 건드리지
--        않습니다 — 이미 운영 중인 그 큰 함수를 다시 정의해 베끼면 로직이 누락될 위험이 있어, 같은
--        트랜잭션 안에서 이미 차감된 값을 한 번 더 읽어오는 별도 트리거로 분리했습니다).
--      - package_remaining_before_restore / package_remaining_after_restore : 취소로 회차가 복구되는
--        그 순간의 전/후 잔여. §2(자동 트리거)·§4(관리자 수동 복구 RPC) 둘 다 이 두 값을 채웁니다.
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists package_restored boolean not null default false;
alter table public.service_applications add column if not exists package_remaining_at_application numeric(5, 1);
alter table public.service_applications add column if not exists package_remaining_before_restore numeric(5, 1);
alter table public.service_applications add column if not exists package_remaining_after_restore numeric(5, 1);

-- ----------------------------------------------------------------------------
-- 2) 트리거 함수 — service_applications.status 가 (취소류가 아니었던 상태에서) CANCELLED 또는
--    EXPIRED_CANCELLED 로 바뀌는 순간, 패키지 차감 예약(is_package_used=true)이었다면 연결된
--    user_packages.remaining_count 를 +1 합니다. user_packages 는 authenticated 에 UPDATE 권한이
--    없으므로(sql/user_packages_system.sql — 결제 없이 회차를 조작하지 못하게 막음) SECURITY
--    DEFINER 로 그 제한을 우회해서 씁니다(consume_package_on_application() 과 같은 원칙).
--
--    least(remaining_count + 1, total_count) 로 한 번 더 clamp 하는 이유: 정상 경로에서는 차감 당시
--    항상 total_count 보다 작았던 값에 1을 더하는 것이라 절대 total_count 를 넘지 않지만, 혹시 모를
--    데이터 불일치(예: 수기 보정) 상황에서도 remaining_count 가 total_count 를 초과해 저장되는 사고를
--    막습니다(이미 user_packages_remaining_le_total CHECK 제약이 있지만, UPDATE 가 그 제약 위반으로
--    예외를 던져 취소 처리 자체를 막아버리는 것보다는 여기서 미리 clamp 하는 쪽이 안전합니다).
-- ----------------------------------------------------------------------------
create or replace function public.restore_package_on_application_cancellation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pkg public.user_packages;
begin
  if new.status is distinct from old.status
     and new.status in ('CANCELLED', 'EXPIRED_CANCELLED')
     and old.status not in ('CANCELLED', 'EXPIRED_CANCELLED')
     and old.is_package_used
     and old.package_id is not null
     and not old.package_restored then

    -- for update 로 잠가 "지금 이 순간의 잔여"를 먼저 읽어 두고(before), 그 값 그대로 +1(after)해서
    -- 두 값 다 이 신청 행에 그대로 남깁니다 — 악용/오류 검증용 이력(admin.js/mypage.html 참고).
    select * into v_pkg from public.user_packages where id = old.package_id for update;

    update public.user_packages
       set remaining_count = least(v_pkg.remaining_count + 1, v_pkg.total_count)
     where id = old.package_id;

    new.package_restored := true;
    new.package_remaining_before_restore := v_pkg.remaining_count;
    new.package_remaining_after_restore := least(v_pkg.remaining_count + 1, v_pkg.total_count);
  end if;
  return new;
end $$;

drop trigger if exists trg_restore_package_on_cancellation on public.service_applications;
create trigger trg_restore_package_on_cancellation
  before update of status on public.service_applications
  for each row execute function public.restore_package_on_application_cancellation();

-- ----------------------------------------------------------------------------
-- 3) 백필 — 이 트리거가 생기기 전에 이미 취소된 패키지 차감 예약은 회차가 돌아오지 않은 채로 남아
--    있을 수 있으므로, 한 번만 정리합니다(package_restored 플래그가 이미 true 인 행은 자연히
--    제외되므로 이 파일을 다시 실행해도 또 복구되지 않습니다).
--
--    같은 패키지(user_packages 한 행)가 여러 건의 취소된 예약에 쓰였을 수 있어, 패키지별로 먼저
--    건수를 모아서(group by) 한 번에 더합니다 — UPDATE ... FROM 은 target 행 하나가 from_list 의
--    여러 행과 매칭되면 "그 중 하나만" 반영하므로(PostgreSQL 문서에 명시된 동작), sa 를 그대로
--    조인하면 같은 패키지에서 2건 이상 취소된 경우 1회만 복구되는 버그가 생깁니다.
-- ----------------------------------------------------------------------------
update public.user_packages up
   set remaining_count = least(up.remaining_count + sub.cnt, up.total_count)
  from (
    select package_id, count(*) as cnt
      from public.service_applications
     where is_package_used
       and package_id is not null
       and status in ('CANCELLED', 'EXPIRED_CANCELLED')
       and not package_restored
     group by package_id
  ) sub
 where sub.package_id = up.id;

update public.service_applications
   set package_restored = true
 where is_package_used
   and package_id is not null
   and status in ('CANCELLED', 'EXPIRED_CANCELLED')
   and not package_restored;

-- ----------------------------------------------------------------------------
-- 4) admin_restore_package_session() — admin.html '취소된 신청 내역' 카드의 [패키지 횟수 수동 복구
--    확인] 버튼. 정상 경로라면 위 트리거가 취소되는 순간 이미 복구를 끝내므로 이 RPC 를 쓸 일이
--    거의 없지만, 이 SQL을 아직 실행하지 않은 환경에서 먼저 취소된 건이나(트리거가 없던 시절의
--    취소) 그 밖의 알 수 없는 이유로 package_restored 가 false 로 남은 건을 관리자가 그 자리에서
--    바로 바로잡을 수 있게 합니다. 트리거 함수와 조건을 완전히 똑같이 맞춰(취소류 상태 + 패키지
--    차감 건 + 아직 미복구) 중복 복구를 막습니다 — 이미 true 인 건을 다시 호출해도 'NOTHING_TO_RESTORE'
--    로만 끝나고 remaining_count 는 건드리지 않습니다(안전하게 재시도 가능, 멱등).
-- ----------------------------------------------------------------------------
create or replace function public.admin_restore_package_session(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
  v_pkg public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select * into v_app from public.service_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_app.is_package_used or v_app.package_id is null then
    raise exception 'NOT_A_PACKAGE_BOOKING' using errcode = 'P0001';
  end if;
  if not (upper(coalesce(v_app.status, '')) like '%CANCEL%' or v_app.status like '%취소%') then
    raise exception 'NOT_CANCELLED' using errcode = 'P0001';
  end if;
  if v_app.package_restored then
    -- 이미 복구된 건을 다시 눌렀을 때(멱등 재시도) — 에러 대신 현재 행을 그대로 돌려줍니다.
    return v_app;
  end if;

  select * into v_pkg from public.user_packages where id = v_app.package_id for update;
  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.user_packages
     set remaining_count = least(v_pkg.remaining_count + 1, v_pkg.total_count)
   where id = v_pkg.id;

  update public.service_applications
     set package_restored = true,
         package_remaining_before_restore = v_pkg.remaining_count,
         package_remaining_after_restore = least(v_pkg.remaining_count + 1, v_pkg.total_count)
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.admin_restore_package_session(uuid) from public, anon;
grant  execute on function public.admin_restore_package_session(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) package_remaining_at_application 스냅샷 — "이 신청이 패키지를 차감한 직후 그 패키지의 잔여
--    횟수"를 기록합니다. consume_package_on_application()(sql/user_packages_system.sql, BEFORE
--    INSERT) 은 이미 운영 중인 긴 함수라 그 안에 로직을 추가해 다시 정의하면(복사 과정에서 addon_total
--    계산·텔레그램 알림 등 기존 분기를 빠뜨릴 위험) 자칫 회귀를 만들 수 있어, 그 함수를 전혀 건드리지
--    않습니다 — 대신 AFTER INSERT 트리거를 새로 추가해, 같은 트랜잭션 안에서 "이미 BEFORE INSERT가
--    차감을 끝낸 뒤"의 user_packages.remaining_count 를 한 번 더 읽어와 이 신청 행에 복사만 합니다
--    (같은 트랜잭션 내에서는 자신이 방금 쓴 값을 즉시 다시 읽을 수 있으므로, 시점 차이로 다른 값이
--    섞여 들어올 위험이 없습니다).
-- ----------------------------------------------------------------------------
create or replace function public.snapshot_package_remaining_at_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_package_used and new.package_id is not null then
    update public.service_applications
       set package_remaining_at_application = (
             select remaining_count from public.user_packages where id = new.package_id
           )
     where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_package_remaining_at_application on public.service_applications;
create trigger trg_snapshot_package_remaining_at_application
  after insert on public.service_applications
  for each row execute function public.snapshot_package_remaining_at_application();

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
