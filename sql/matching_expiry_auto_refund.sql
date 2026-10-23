-- ============================================================================
-- 48시간 미매칭 자동 취소 + 100% 환불 (apply.html 안심 문구에 대응하는 백엔드 로직)
--
--   정책: 결제 완료(MATCHING_PENDING 진입) 후 48시간이 지나도 매니저가 배정되지 않으면(manager_id
--   여전히 null) 신청을 자동 취소하고 결제금액을 100% 환불합니다.
--
--   service_applications 상태값에 'EXPIRED_CANCELLED' 를 새로 추가합니다(표준 4종은
--   sql/service_application_status_standardization.sql 참고) — 사용자가 직접 취소한 CANCELLED/
--   미입금 만료(cancel_unpaid_application/cancel_expired_virtual_accounts)와 구분해, "결제까지는
--   끝났는데 매칭이 안 돼서 환불된 건"만 따로 식별할 수 있게 합니다.
--
--     PAYMENT_PENDING → MATCHING_PENDING → MATCHED
--                                        ↘ EXPIRED_CANCELLED (48시간 초과 미매칭, 이 파일)
--
--   결제 여부/환불 여부는 새 컬럼 service_applications.payment_status 로 추적합니다(PAID/REFUNDED).
--   virtual_accounts 테이블과 달리 "즉시결제(카드 등)"도 있어 신청서 쪽에 바로 둡니다.
--
--   왜 순수 SQL(pg_cron)만으로 끝나지 않는가: sql/payment_confirmation_functions.sql 의
--   cancel_expired_virtual_accounts() 는 "입금 전" 건을 쓸어가므로 PortOne 쪽에 아직 돈이 없어
--   DB 상태만 바꾸면 끝입니다. 반면 이 파일이 다루는 건 이미 결제가 승인된(MATCHING_PENDING) 건이라,
--   실제로 PortOne에 환불(결제 취소) API를 호출해야 "100% 자동 환불" 문구가 거짓이 되지 않습니다.
--   그래서:
--     1) 이 파일 : 대상 조회 함수 + 상태 전환 함수(DB)
--     2) supabase/functions/cancel-expired-applications : 대상을 조회해 PortOne 환불을 호출하고,
--        성공한 건만 위 상태 전환 함수를 호출한 뒤 Resend로 환불 완료 안내 메일까지 보내는 Edge Function
--     3) 맨 아래 pg_cron+pg_net 스케줄 : 그 Edge Function을 주기적으로 깨움
--
--   Edge Function 쪽에 필요한 환경변수(Supabase 대시보드 → Edge Functions → Secrets):
--     PORTONE_API_SECRET   : 이미 issue-virtual-account 등에서 쓰고 있다면 그대로 재사용됩니다.
--     RESEND_API_KEY        : Resend 콘솔에서 발급받은 API 키.
--     RESEND_FROM_EMAIL     : Resend에서 DNS 도메인 인증까지 끝낸 발신 주소(예: '위드브릿지 <no-reply@withbridge.co.kr>').
--                              이 값이 없으면 메일 발송이 실패합니다(_shared/resend.ts 참고) — 환불/상태
--                              전환 자체는 메일 발송 성공 여부와 무관하게 이미 끝난 뒤이므로 영향받지 않습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/payment_confirmation_functions.sql →
--   sql/welcome_coupons.sql → sql/user_points.sql → sql/user_coupons_checkout.sql → 이 파일.
--   (이 파일이 mark_payment_matching_pending/admin_confirm_manual_payment 를 다시 create or replace
--   하므로, 쿠폰/적립금 스크립트보다 반드시 나중에 실행해야 그 로직이 덮어써지지 않습니다 — 아래 두 함수
--   본문에 쿠폰/적립금 로직을 합쳐 넣어 둔 것도 이 순서가 지켜지지 않을 경우를 대비한 것입니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
--    payment_status: 결제/환불 여부 표시용. 기존 행은 전부 null(이 정책 도입 이전 데이터라 추적 안 함).
--      PAID     : mark_payment_matching_pending/admin_confirm_manual_payment 가 설정(결제 승인 완료)
--      REFUNDED : expire_unmatched_application() 이 설정(48시간 초과 자동 환불 완료)
--    matching_started_at: MATCHING_PENDING 으로 전환된 시점 — 48시간 카운트 시작점으로 씁니다
--      (신청서 작성 시각이 아니라 "결제가 끝나서 매칭 대기가 시작된" 시각이 기준입니다).
--    payment_key: PortOne 결제의 실제 transactionId(결제사/PG 쪽 영수증 식별자 — paymentId 는 이미
--      service_applications.id 와 같은 값이라 별도로 저장할 필요가 없지만, transactionId 는 환불 API
--      호출이나 고객센터 문의 대응 시 참조할 PG 쪽 거래번호라 따로 보관해 둡니다). 카드 등 즉시결제는
--      issue-virtual-account 가, 가상계좌 입금 확인은 portone-webhook 이 PortOne 재조회 결과에서 채웁니다.
--    refunded_at: payment_status 가 'REFUNDED' 로 바뀐 시점(expire_unmatched_application()의 48시간
--      자동환불, admin_mark_refund_completed()의 관리자 수동 환불 완료 처리 둘 다 여기서 채웁니다) —
--      mypage.html 이 "환불 완료 후 7일 이내"인 건만 '진행 중인 케어' 탭 상단 안내 배너로 보여주는 데 씁니다
--      (payment_status 하나만으로는 "언제" 환불됐는지 몰라 그 7일 기준을 잴 수 없었습니다).
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists payment_status text;
alter table public.service_applications add column if not exists matching_started_at timestamptz;
alter table public.service_applications add column if not exists payment_key text;
alter table public.service_applications add column if not exists refunded_at timestamptz;

-- 배치(list_expired_unmatched_applications)가 매번 전체 스캔하지 않도록
create index if not exists service_applications_matching_pending_idx
  on public.service_applications (matching_started_at)
  where status = 'MATCHING_PENDING' and manager_id is null;


-- ----------------------------------------------------------------------------
-- 2) 결제 승인 시점에 payment_status / matching_started_at 도 같이 채우도록 기존 함수 재정의
--    (상태 전환 조건·멱등 처리는 기존 로직과 동일하게 유지하고, set 절만 추가합니다)
--
--    ⚠ sql/user_coupons_checkout.sql 이 이 함수에 추가했던 쿠폰 검증/사용 처리 + 적립금 차감 로직을
--    여기서도 반드시 그대로 들고 와야 합니다 — create or replace 로 함수를 다시 정의하는 거라, 이 파일을
--    나중에 실행하면 그 로직 없이 함수가 "되돌아가" 버립니다(실제로 그래서 쿠폰/적립금이 결제 완료 후에도
--    차감되지 않는 회귀가 있었습니다 — 이 파일을 sql/user_coupons_checkout.sql 보다 나중에 실행해도
--    쿠폰/적립금 차감이 유지되도록, 그 로직을 이 함수 본문에 합쳐 넣습니다).
-- ----------------------------------------------------------------------------
create or replace function public.mark_payment_matching_pending(
  p_application_id uuid,
  p_payment_key text default null,
  p_paid_amount integer default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app             public.service_applications;
  v_price           integer;
  v_coupon_discount integer;
  v_coupon_valid    boolean;
  v_points_to_use   integer;
  v_discount        integer;
  v_expected        integer;
  v_balance         integer;
begin
  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status <> 'PAYMENT_PENDING' then
    return v_app; -- 이미 처리됨(멱등)
  end if;

  -- 쿠폰: 지금 이 순간에도 "이 사람 것 + 아직 유효(active, 미만료)" 인지 다시 확인
  v_coupon_discount := 0;
  if v_app.coupon_id is not null and v_app.user_id is not null then
    select exists (
      select 1 from public.user_coupons c
      where c.id = v_app.coupon_id
        and c.user_id = v_app.user_id
        and c.status = 'active'
        and c.expires_at > now()
    ) into v_coupon_valid;
    if v_coupon_valid then
      select amount into v_coupon_discount from public.user_coupons where id = v_app.coupon_id;
    end if;
  end if;

  -- 적립금: 신청서에 적힌 희망 사용액을, 지금 이 순간의 실제 잔액으로 한 번 더 제한
  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price - v_discount;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, coupon=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_coupon_discount, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리, 쿠폰 사용 처리, 적립금 차감, 확정 금액 기록을 실행합니다.
  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now()
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    return v_app;
  end if;

  update public.virtual_accounts
     set is_paid = true,
         pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      raise warning '[mark_payment_matching_pending] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
        p_application_id, v_app.coupon_id;
    end if;
  end if;

  if v_points_to_use > 0 then
    update public.profiles
       set points_balance = points_balance - v_points_to_use
     where id = v_app.user_id
       and points_balance >= v_points_to_use;

    if found then
      insert into public.point_transactions (user_id, application_id, amount, reason)
      values (v_app.user_id, p_application_id, -v_points_to_use, 'service_payment');
    else
      raise warning '[mark_payment_matching_pending] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         final_amount = coalesce(v_price, public.expected_service_price(v_app.service_type)) - v_discount,
         payment_key = coalesce(p_payment_key, payment_key)
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;

-- admin_confirm_manual_payment() 정의는 sql/admin_manual_payment_telegram_notify.sql 로 옮겼습니다
-- (쿠폰/적립금 차감 + 텔레그램 알림까지 포함한 최종 버전). 이 파일에서 다시 정의하면 — create or replace
-- 특성상 나중에 실행되는 쪽이 이기므로 — 그 파일의 텔레그램 알림이 조용히 사라지는 회귀가 실제로
-- 발생했던 적이 있습니다. 이 함수는 이제 그 파일에서만 정의합니다.


-- ----------------------------------------------------------------------------
-- 3) 48시간 초과 미매칭 건 조회 — supabase/functions/cancel-expired-applications 가 호출해
--    대상 목록을 가져간 뒤, 건마다 PortOne 환불 API를 호출합니다. service_role 전용(service_role 은
--    revoke 와 무관하게 항상 호출 가능).
-- ----------------------------------------------------------------------------
create or replace function public.list_expired_unmatched_applications()
returns setof public.service_applications
language sql security definer set search_path = public as $$
  select *
    from public.service_applications
   where status = 'MATCHING_PENDING'
     and manager_id is null
     and matching_started_at is not null
     and matching_started_at < now() - interval '48 hours';
$$;

revoke all on function public.list_expired_unmatched_applications() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4) 상태 전환 — PortOne 환불 API 호출이 성공한 건에 대해서만 Edge Function이 이 함수를 호출합니다.
--    MATCHING_PENDING + manager_id is null 조건을 다시 확인해(멱등 + 그 사이 매칭이 됐으면 보호),
--    환불 호출과 DB 전환 사이에 매니저가 배정돼 버린 경우를 되돌리지 않습니다.
--    p_refund_ref: PortOne 환불 응답의 cancellation id 등 참조값(고객센터 문의 대비 보관, 선택).
-- ----------------------------------------------------------------------------
create or replace function public.expire_unmatched_application(
  p_application_id uuid,
  p_refund_ref text default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  update public.service_applications
     set status = 'EXPIRED_CANCELLED',
         payment_status = 'REFUNDED',
         refunded_at = now()
   where id = p_application_id
     and status = 'MATCHING_PENDING'
     and manager_id is null
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- 이미 매칭됐거나 다른 상태로 넘어간 건에 대한 재호출 — 에러 없이 현재 행을 그대로 돌려줍니다(멱등).
    return v_app;
  end if;

  update public.virtual_accounts
     set pg_payment_ref = coalesce(p_refund_ref, pg_payment_ref)
   where application_id = p_application_id;

  return v_app;
end $$;

revoke all on function public.expire_unmatched_application(uuid, text) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) pg_cron + pg_net — supabase/functions/cancel-expired-applications 를 30분마다 깨웁니다.
--    서비스 role 키를 SQL에 평문으로 남기지 않기 위해 Supabase Vault에 저장한 값을 참조합니다.
--
-- ⚠ 2026-10-15 점검 결과: 이 cron job 은 실제로 스케줄은 등록돼 있었지만 (1) url 의 '<PROJECT_REF>'가
--    끝까지 실제 값으로 바뀌지 않았고 (2) 아래 vault.create_secret() 가 한 번도 실행되지 않아서,
--    30분마다 계속 실패만 하고 있었습니다 — 즉 "48시간 자동 환불" 안심 문구(apply.html)가 실제로는
--    전혀 동작하지 않는 상태였습니다. url 은 이번에 바로 고쳤습니다(아래 실제 프로젝트 ref로 교체 완료).
--    vault.create_secret() 은 service_role 키 평문이 필요해 제가 대신 실행할 수 없으니, 아래 안내대로
--    Supabase SQL Editor에서 꼭 한 번 실행해 주세요 — 그래야 이 cron이 실제로 환불을 수행합니다.
--
--    최초 1회, Supabase SQL Editor에서 아래를 실행해 키를 보관하세요(이미 저장했다면 건너뛰기):
--      select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY 값>', 'service_role_key');
--    (SUPABASE_SERVICE_ROLE_KEY 값은 Supabase 대시보드 → Project Settings → API → service_role 키)
--
--    pg_cron/pg_net 확장이 이 프로젝트 플랜에서 꺼져 있으면 extension 생성 문에서 에러가 날 수 있습니다—
--    그 경우 이 블록만 건너뛰고(1~4의 DB 함수는 pg_cron과 무관하게 바로 쓸 수 있습니다), Supabase
--    대시보드 → Database → Extensions 에서 pg_cron/pg_net 을 켠 뒤 다시 실행하거나, 외부 스케줄러
--    (예: GitHub Actions cron)로 같은 URL을 주기적으로 POST 하도록 대체하세요.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'expire-unmatched-applications';
select cron.schedule(
  'expire-unmatched-applications',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://layvjisfeivkzowopkco.supabase.co/functions/v1/cancel-expired-applications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ----------------------------------------------------------------------------
-- 6) admin_mark_refund_completed() — admin.html '취소된 신청 내역' 카드의 [환불 완료 처리] 버튼.
--    보호자 자가취소(cancel_my_application)/관리자 취소(admin.js cancelApplication, status 만 CANCELLED
--    로 바꿈)는 둘 다 PG 환불까지는 자동으로 하지 않으므로, 결제까지 끝난 뒤(payment_status='PAID')
--    취소된 건은 "PG 콘솔에서 수동 환불 → 여기서 완료 처리" 두 단계가 필요합니다. 이 함수는 그 두 번째
--    단계만 담당합니다 — PG 환불 자체는 이 함수가 호출하지 않고, 관리자가 PG사 콘솔에서 이미 환불을
--    마쳤다는 걸 스스로 확인한 뒤 누르는 것을 전제로 합니다.
--    payment_status='PAID' + status 가 취소류(CANCELLED/EXPIRED_CANCELLED)인 행만 대상으로 삼아(이미
--    REFUNDED 거나, 결제 전에 취소돼 환불할 돈이 없는 건, 아직 취소되지 않은 건은 전부 걸러집니다),
--    grant update(...) 로 열어 둔 (manager_id, status) 컬럼에 payment_status 를 추가하는 대신(그러면
--    관리자가 임의 행의 payment_status 를 아무 값으로나 바꿀 수 있게 됨) SECURITY DEFINER 함수로
--    "이 전환 하나만" 허용합니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_mark_refund_completed(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.service_applications
     set payment_status = 'REFUNDED',
         refunded_at = now()
   where id = p_application_id
     and payment_status = 'PAID'
     and status in ('CANCELLED', 'EXPIRED_CANCELLED')
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- 이미 환불 완료 처리됐거나(멱등 재클릭), 애초에 환불 대상이 아닌 건(결제 전 취소/아직 미취소) —
    -- 둘 다 "지금 바꿀 게 없다"는 뜻이라 에러 대신 현재 행을 그대로 돌려줍니다.
    return v_app;
  end if;

  return v_app;
end $$;

revoke all on function public.admin_mark_refund_completed(uuid) from public, anon;
grant  execute on function public.admin_mark_refund_completed(uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
