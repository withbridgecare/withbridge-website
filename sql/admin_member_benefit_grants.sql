-- ============================================================================
-- 어드민 콘솔(admin.html) 회원 상세 모달 — 쿠폰/회차 수동 지급·차감
--
--   목적: CS 응대 중 보상/정정 목적으로 관리자가 쿠폰을 직접 발급하거나, 패키지 구매 이력이
--   없는 회원에게도 회차를 임의로 넣어 줄 수 있게 합니다. 전부 아래 네 개의 SECURITY DEFINER
--   RPC를 통해서만 이뤄지고(user_coupons/user_packages 는 이미 authenticated 의 직접 insert/
--   update/delete 권한이 없음 — sql/welcome_coupons.sql, sql/user_packages_system.sql), 각 RPC는:
--     1) is_admin() 이 아니면 전부 거부(fail closed)
--     2) 변경 사유(메모) 10자 미만이면 거부 — "반드시 사유를 남겨야 처리된다"를 DB 단에서 강제
--     3) 성공하면 sql/admin_logs.sql 의 log_admin_action() 으로 admin_logs 에 영구 기록
--        (관리자 id/이름/이메일은 log_admin_action 내부에서 자동으로 채워지고, 여기서는
--        action_type/target_type/target_id/detail(jsonb — 변경 내용 + 입력한 사유)만 넘깁니다)
--   을 공통으로 지킵니다.
--
--   ⚠ 기존 admin_adjust_user_package()(sql/admin_package_management.sql, '패키지 구매 회원 관리'
--   섹션의 [회차 조정] 전용)는 건드리지 않았습니다 — 그 기능은 이미 운영 중이고 메모 10자 제한이
--   없는 채로 써 왔으므로, 여기서 새로 추가하는 더 엄격한 검증을 거기에도 적용하면 기존 흐름이
--   갑자기 막힐 수 있습니다. 이 파일의 admin_adjust_member_sessions() 는 회원 상세 모달의
--   [− 회차 수동 차감] 전용으로 별도로 둔, 의도적으로 분리된 함수입니다.
--
--   실행 순서: sql/admin_rls_policies.sql(is_admin()) → sql/admin_logs.sql(log_admin_action()) →
--             sql/welcome_coupons.sql(user_coupons) → sql/user_packages_system.sql(user_packages) →
--             sql/admin_member_management.sql → 이 파일.
--   전부 create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) admin_grant_member_coupon() — 쿠폰 수동 지급
--    coupon_code 는 user_coupons 의 unique(user_id, coupon_code) 제약과 겹치지 않도록, 지급마다
--    고유한 값을 만들어 둡니다("같은 사람에게 같은 금액을 두 번 지급"해도 막히지 않아야 함).
-- ----------------------------------------------------------------------------
create or replace function public.admin_grant_member_coupon(
  p_user_id uuid,
  p_amount  integer,
  p_memo    text
)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_code text;
  v_row  public.user_coupons;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_code := 'ADMIN_GRANT_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 6);

  -- 관리자 수동 지급 쿠폰은 결제 할인 목적(welcome coupon)보다 CS 보상 성격이 강해, 조금 더 길게
  -- 90일 유효기간을 둡니다(sql/welcome_coupons.sql 의 신규가입 쿠폰은 30일).
  insert into public.user_coupons (user_id, coupon_code, amount, expires_at)
  values (p_user_id, v_code, p_amount, now() + interval '90 days')
  returning * into v_row;

  -- 감사 로그 실패가 쿠폰 지급 자체를 롤백하지 않도록 별도 블록으로 감쌉니다(아래 세 함수 모두 동일).
  begin
    perform public.log_admin_action('coupon_grant', 'member', p_user_id::text,
      jsonb_build_object('coupon_id', v_row.id, 'amount', p_amount, 'memo', v_memo));
  exception when others then
    raise warning 'admin_grant_member_coupon: log_admin_action 호출 실패(쿠폰 지급 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_grant_member_coupon(uuid, integer, text) from public, anon;
grant  execute on function public.admin_grant_member_coupon(uuid, integer, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 2) admin_delete_member_coupon() — 쿠폰 삭제(하드 삭제 — 지급을 되돌리는 조작이라 이 역시
--    사유를 남겨야 하고, 지워지기 전의 내용을 detail 에 스냅샷으로 남겨 둡니다(삭제 후엔 행이
--    없어 admin_logs 가 "무엇을 지웠는지"에 대한 유일한 기록이 됩니다).
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_member_coupon(
  p_coupon_id uuid,
  p_memo      text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_row  public.user_coupons;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;

  select * into v_row from public.user_coupons where id = p_coupon_id;
  if v_row.id is null then
    raise exception 'COUPON_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.user_coupons where id = p_coupon_id;

  begin
    perform public.log_admin_action('coupon_delete', 'member', v_row.user_id::text,
      jsonb_build_object('coupon_id', v_row.id, 'amount', v_row.amount, 'status', v_row.status, 'memo', v_memo));
  exception when others then
    raise warning 'admin_delete_member_coupon: log_admin_action 호출 실패(쿠폰 삭제 자체는 완료됨) — %', sqlerrm;
  end;

  return true;
end $$;

revoke all on function public.admin_delete_member_coupon(uuid, text) from public, anon;
grant  execute on function public.admin_delete_member_coupon(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) admin_grant_member_package() — 회차 수동 지급(항상 새 user_packages 행을 만듭니다 — 패키지
--    구매 이력이 전혀 없는 회원에게도 그대로 동작하고, 기존 패키지가 있어도 별도 행으로 쌓여
--    consume_package_on_application() 이 평소처럼 활성 패키지 중에서 골라 씁니다).
--
--    2026-10 보안 강화: 회차 수(p_session_count)를 관리자가 직접 입력하던 파라미터를 완전히
--    없앴습니다 — 숫자를 입력받는 한 "0회 지급" 사유 메모만 적당히 쓰고 비정상적으로 큰 회차를
--    지급하는 악용이나 단순 입력 실수를 막을 방법이 없었습니다. 이제 지급 회차는 package_type
--    만으로 sql/user_packages_system.sql 의 package_session_count() 가 그대로 산정합니다(패키지
--    구매 시 쓰는 것과 동일한 "정답"이라, 수동 지급과 실제 결제가 항상 같은 회차 기준을 씁니다).
--    package_type 도 package.html 이 지금 실제로 판매하는 두 상품(10_hours/20_hours)만 허용합니다
--    — 5_sessions/10_sessions 는 과거 판매분 보유자만 있고 신규 판매·신규 지급 대상이 아닙니다
--    (이미 그 타입으로 보유 중인 패키지의 조회·사용·차감에는 전혀 영향이 없습니다 — user_packages
--    테이블의 CHECK 제약과 소진 로직은 그대로 두었고, 이 함수의 "새로 지급할 수 있는 종류"만 좁혔습니다).
--    파라미터 자체가 바뀌어(CREATE OR REPLACE 로는 안 되고) 먼저 기존 함수를 지웁니다.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_grant_member_package(uuid, text, numeric, text);

create or replace function public.admin_grant_member_package(
  p_user_id      uuid,
  p_package_type text,
  p_memo         text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_memo          text := btrim(coalesce(p_memo, ''));
  v_session_count integer;
  v_row           public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  -- package.html 이 실제로 파는 상품만 — 5_sessions/10_sessions 는 과거 판매분 보유자 전용이라
  -- 신규 지급 대상에서 뺐습니다(위 설명 참고).
  if p_package_type not in ('10_hours', '20_hours') then
    raise exception 'INVALID_PACKAGE_TYPE' using errcode = '22023';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 회차 수는 입력받지 않고 여기서 직접 산정합니다 — package.html 결제 확정(confirm_package_order_payment())
  -- 이 쓰는 것과 정확히 같은 "정답" 함수라, 수동 지급도 실제 구매와 항상 같은 회차 기준을 갖습니다.
  v_session_count := public.package_session_count(p_package_type);
  if v_session_count is null then
    raise exception 'UNKNOWN_PACKAGE_TYPE: %', p_package_type using errcode = 'P0001';
  end if;

  -- sql/user_packages_system.sql 의 confirm_package_order_payment() 와 같은 180일 유효기간을 씁니다.
  insert into public.user_packages (user_id, package_type, total_count, remaining_count, status, expires_at)
  values (p_user_id, p_package_type, v_session_count, v_session_count, 'active', now() + interval '180 days')
  returning * into v_row;

  begin
    perform public.log_admin_action('package_grant', 'member', p_user_id::text,
      jsonb_build_object('package_id', v_row.id, 'package_type', p_package_type, 'session_count', v_session_count, 'memo', v_memo));
  exception when others then
    raise warning 'admin_grant_member_package: log_admin_action 호출 실패(회차 지급 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_grant_member_package(uuid, text, text) from public, anon;
grant  execute on function public.admin_grant_member_package(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) admin_adjust_member_sessions() — 회차 수동 차감(기존 패키지 대상). admin_adjust_user_package()
--    와 같은 가감 로직이지만, 이 기능 전용으로 메모 10자 제한 + admin_logs 기록을 추가한 별도 함수입니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_adjust_member_sessions(
  p_package_id uuid,
  p_delta      numeric,
  p_memo       text
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_pkg  public.user_packages;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = '22023';
  end if;
  if length(v_memo) < 10 then
    raise exception 'MEMO_TOO_SHORT' using errcode = '22004';
  end if;

  update public.user_packages
     set remaining_count = greatest(least(remaining_count + p_delta, total_count), 0)
   where id = p_package_id
  returning * into v_pkg;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    perform public.log_admin_action('package_adjust', 'member', v_pkg.user_id::text,
      jsonb_build_object('package_id', v_pkg.id, 'delta', p_delta, 'remaining_after', v_pkg.remaining_count, 'memo', v_memo));
  exception when others then
    raise warning 'admin_adjust_member_sessions: log_admin_action 호출 실패(회차 차감 자체는 완료됨) — %', sqlerrm;
  end;

  return v_pkg;
end $$;

revoke all on function public.admin_adjust_member_sessions(uuid, numeric, text) from public, anon;
grant  execute on function public.admin_adjust_member_sessions(uuid, numeric, text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
