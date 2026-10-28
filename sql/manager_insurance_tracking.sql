-- ============================================================================
-- 단체보험/포괄 안심케어 적용 이력 — 내부 DB 로그 저장 (외부 보험사 API 연동 없음)
--
--   정책: 위드브릿지는 개별 신청건마다 보험사 API를 호출하지 않고, 매니저 전체를 대상으로 한 단체
--   배상책임보험(또는 자체 안심케어 프로그램)에 포괄 가입하는 구조를 전제로 합니다. 이 파일은 그
--   "모든 동행에 안심케어가 적용됐다"는 사실을 신청서(service_applications) 행마다 내부 로그로
--   남기는 최소한의 장치입니다 — 실제 보험 접수/심사는 사고가 났을 때 회사가 보험사와 별도로 처리하고
--   (terms.html 제8조 ④, privacy.html의 '배상책임보험사' 제공 항목 참고), 이 로그는 "이 건이 안심케어
--   적용 대상이었다"는 증빙으로만 씁니다.
--
--   insurance_applied         boolean, default true  — 안심케어 적용 여부. 포괄 가입 구조라 거의 항상
--     true이고, 기본값 자체가 "모든 동행에 기본 포함"이라는 고객 공지(apply.html/index.html/terms.html의
--     '* 위드브릿지의 모든 동행에는 매니저 안심케어(배상책임) 혜택이 기본 포함되어 있습니다.')와 일치합니다.
--   insurance_applied_at      timestamptz, null       — 적용이 확정된 시각. 결제가 끝나지 않은 채
--     취소되는 건(cancel_unpaid_application 등)까지 전부 찍히면 "결제 완료 건에만 적용된다"는 사실과
--     어긋나므로, 신청서 생성 시점이 아니라 아래 세 지점(실제로 '결제 완료' 또는 '패키지 차감으로 즉시
--     확정'이 되는 지점)에서만 now()로 채웁니다.
--   insurance_policy_number   text, null              — 추후 실제 단체보험 증권을 체결하면 그 증권번호를
--     채워 넣을 자리입니다. 지금은 빈 필드로만 두고, 어느 코드도 이 값을 읽거나 강제하지 않습니다.
--
--   적용 시각을 찍는 세 지점(= '결제 완료' 또는 결제 없이 즉시 확정되는 '신청 완료' 지점):
--     1) mark_payment_matching_pending() — 카드/간편결제/계좌이체/가상계좌 등 PortOne 결제가 PAID로
--        확인됐을 때(portone-webhook Edge Function이 호출).
--     2) admin_confirm_manual_payment() — 가상계좌/무통장 입금을 관리자가 어드민 콘솔에서 수동으로
--        확인했을 때.
--     3) consume_package_on_application() — 보유 패키지(5회권/10회권) 차감으로 결제 단계 없이 즉시
--        매칭 대기로 넘어가는 신청(apply.html 이 is_package_used=true 로 바로 INSERT).
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/payment_confirmation_functions.sql →
--   sql/welcome_coupons.sql → sql/user_points.sql → sql/user_coupons_checkout.sql →
--   sql/admin_manual_payment_telegram_notify.sql → sql/matching_expiry_auto_refund.sql →
--   sql/user_packages_system.sql → 이 파일.
--   (이 파일이 mark_payment_matching_pending/admin_confirm_manual_payment/consume_package_on_application
--   을 다시 create or replace 하므로, 반드시 저 파일들보다 나중에 실행해야 쿠폰/적립금/패키지/텔레그램
--   로직이 되돌아가지 않습니다 — 그래서 아래 세 함수 본문에 그 로직을 전부 그대로 들고 와서 insurance_*
--   SET 절만 추가했습니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.service_applications
  add column if not exists insurance_applied boolean not null default true;
alter table public.service_applications
  add column if not exists insurance_applied_at timestamptz;
alter table public.service_applications
  add column if not exists insurance_policy_number text;


-- ----------------------------------------------------------------------------
-- 2) mark_payment_matching_pending() — 일반 결제(카드/간편결제/계좌이체/가상계좌) PAID 확인 시점
--    (sql/matching_expiry_auto_refund.sql 의 최신 정의를 그대로 들고 와서 insurance_* SET 절만 추가)
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
  v_addon_total     integer;
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
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  if p_paid_amount is not null then
    v_price := public.expected_service_price(v_app.service_type);
    if v_price is not null then
      v_expected := v_price + v_addon_total - v_discount;
      if p_paid_amount <> v_expected then
        raise exception 'AMOUNT_MISMATCH: service_type=%, expected=%(price=%, addon=%, coupon=%, points=%), paid=%',
          v_app.service_type, v_expected, v_price, v_addon_total, v_coupon_discount, v_points_to_use, p_paid_amount using errcode = 'P0003';
      end if;
    end if;
  end if;

  -- 상태 전환을 먼저 원자적으로 선점합니다. 이 UPDATE 가 실제로 행을 바꿨을 때(FOUND)만 아래의 가상계좌
  -- 입금 처리, 쿠폰 사용 처리, 적립금 차감, 확정 금액 기록을 실행합니다.
  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now(),
         insurance_applied = true,
         insurance_applied_at = now()
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
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, public.expected_service_price(v_app.service_type)) + v_addon_total - v_discount,
         payment_key = coalesce(p_payment_key, payment_key)
   where id = p_application_id
  returning * into v_app;

  return v_app;
end $$;

revoke all on function public.mark_payment_matching_pending(uuid, text, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) admin_confirm_manual_payment() — 가상계좌/무통장 입금 관리자 수동 확인 시점
--    (sql/admin_manual_payment_telegram_notify.sql 의 최신 정의를 그대로 들고 와서 insurance_* SET 절만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.admin_confirm_manual_payment(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app             public.service_applications;
  v_price           integer;
  v_addon_total     integer;
  v_coupon_discount integer;
  v_coupon_valid    boolean;
  v_points_to_use   integer;
  v_discount        integer;
  v_balance         integer;
  v_desired_at      text;
  v_applicant       text;
  v_when            text;
  v_addon_labels    text;
  v_message         text;
  v_bot_token       text;
  v_chat_id         text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select * into v_app from public.service_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

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

  v_points_to_use := greatest(coalesce(v_app.points_used, 0), 0);
  if v_points_to_use > 0 and v_app.user_id is not null then
    select coalesce(points_balance, 0) into v_balance from public.profiles where id = v_app.user_id;
    v_points_to_use := least(v_points_to_use, coalesce(v_balance, 0));
  else
    v_points_to_use := 0;
  end if;

  v_discount := v_coupon_discount + v_points_to_use;
  v_addon_total := public.expected_addon_total(v_app.addon_codes);

  update public.service_applications
     set status = 'MATCHING_PENDING',
         payment_status = 'PAID',
         matching_started_at = now(),
         insurance_applied = true,
         insurance_applied_at = now()
   where id = p_application_id
     and status = 'PAYMENT_PENDING'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_NOT_AWAITING_PAYMENT' using errcode = 'P0002';
  end if;

  update public.virtual_accounts
     set is_paid = true
   where application_id = p_application_id
     and is_paid = false;

  if v_coupon_discount > 0 then
    update public.user_coupons
       set status = 'used', used_at = now()
     where id = v_app.coupon_id
       and status = 'active';

    if not found then
      raise warning '[admin_confirm_manual_payment] 쿠폰 사용 처리 실패(상태 변경됨) — application_id=%, coupon_id=%',
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
      raise warning '[admin_confirm_manual_payment] 적립금 차감 실패(잔액 변경) — application_id=%, user_id=%, 요청 차감=%',
        p_application_id, v_app.user_id, v_points_to_use;
    end if;
  end if;

  v_price := public.expected_service_price(v_app.service_type);
  update public.service_applications
     set discount_amount = v_discount,
         coupon_discount = v_coupon_discount,
         addon_total = v_addon_total,
         final_amount = coalesce(v_price, final_amount) + v_addon_total - v_discount
   where id = p_application_id
  returning * into v_app;

  -- ---------------------------------------------------------------------------
  -- 텔레그램 알림 — 여기까지 왔다면(위에서 예외 없이) 이 호출이 PAYMENT_PENDING → MATCHING_PENDING
  -- 전환을 실제로 수행한 것이 확실하므로 바로 보냅니다. 알림 발송이 실패해도(토큰 미설정, 네트워크 등)
  -- 이미 입금 확인/상태 전환은 끝난 뒤이므로 트랜잭션을 되돌리지 않고 경고만 남깁니다.
  -- ---------------------------------------------------------------------------
  begin
    select decrypted_secret into v_bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

    if v_bot_token is not null and v_chat_id is not null then
      v_desired_at := (regexp_match(coalesce(v_app.request_details, ''), '희망\s*일시:\s*([^\n]+)'))[1];
      v_applicant := nullif(btrim(split_part(coalesce(v_app.user_contact, ''), '/', 1)), '');
      v_when := coalesce(
        nullif(btrim(v_desired_at), ''),
        to_char(v_app.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        '협의 필요'
      );

      -- 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, expected_addon_total() 과
      -- 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html/_shared/telegram.ts 에도
      -- 같은 맵이 있습니다 — 함께 고쳐 주세요).
      select coalesce(string_agg(case code
          when 'URGENT_MATCHING' then '긴급 매칭 서비스'
          else code
        end, ', '), '없음')
        into v_addon_labels
        from unnest(coalesce(v_app.addon_codes, '{}'::text[])) as code;

      v_message :=
        '[🔔 위드브릿지 신규 케어 신청 접수]' || chr(10) ||
        '• 서비스: ' || coalesce(v_app.service_type, '동행 서비스') || chr(10) ||
        '• 지역: ' || coalesce(v_app.address, '주소 미입력') || chr(10) ||
        '• 일시: ' || v_when || chr(10) ||
        '• 신청자: ' || coalesce(v_applicant, '고객') || ' 고객님' || chr(10) ||
        '• 선택 옵션: ' || v_addon_labels || chr(10) ||
        '👉 매니저 마이페이지에서 수락하기: mypage-manager.html' || chr(10) ||
        '(관리자 수동 입금 확인)';

      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'disable_web_page_preview', true)
      );
    else
      raise warning '[admin_confirm_manual_payment] telegram_bot_token/telegram_chat_id 가 Vault에 없어 알림을 건너뜁니다.';
    end if;
  exception when others then
    raise warning '[admin_confirm_manual_payment] 텔레그램 알림 발송 중 오류(상태 전환은 이미 완료됨) — %', sqlerrm;
  end;

  return v_app;
end $$;

revoke all on function public.admin_confirm_manual_payment(uuid) from public, anon;
grant  execute on function public.admin_confirm_manual_payment(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) consume_package_on_application() — 보유 패키지 차감으로 결제 없이 즉시 확정되는 신청
--    (sql/user_packages_system.sql 의 최신 정의를 그대로 들고 와서 insurance_* 대입만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.consume_package_on_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pkg          public.user_packages;
  v_addon_total  integer;
  v_desired_at   text;
  v_applicant    text;
  v_when         text;
  v_addon_labels text;
  v_message      text;
  v_bot_token    text;
  v_chat_id      text;
begin
  if not new.is_package_used then
    return new;
  end if;
  if new.user_id is null then
    raise exception 'PACKAGE_REQUIRES_LOGIN' using errcode = '28000';
  end if;

  select * into v_pkg from public.user_packages
   where id = new.package_id
   for update;

  if v_pkg.id is null then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pkg.user_id <> new.user_id then
    raise exception 'PACKAGE_NOT_OWNED' using errcode = '42501';
  end if;
  if v_pkg.status <> 'active' or v_pkg.remaining_count <= 0 then
    raise exception 'PACKAGE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.user_packages
     set remaining_count = remaining_count - 1
   where id = v_pkg.id;

  -- 패키지로 이미 결제된 건이므로 가상계좌/카드 결제 단계를 건너뛰고 곧바로 매칭 대기로 넘어갑니다.
  new.status := 'MATCHING_PENDING';

  -- 결제 단계가 없는 패키지 차감은 이 트리거가 신청을 확정하는 그 순간이 "안심케어 적용" 시점입니다.
  new.insurance_applied := true;
  new.insurance_applied_at := now();

  -- ---------------------------------------------------------------------------
  -- 선택 추가 옵션(Add-on) 금액 — 패키지는 기본 서비스 요금만 차감하고 추가 옵션 금액은 포함하지
  -- 않으므로(apply.html toDbRow 참고), 클라이언트가 보낸 addon_total 을 그대로 믿지 않고
  -- expected_addon_total() (sql/user_coupons_checkout.sql)로 addon_codes 에서 다시 계산해 덮어씁니다
  -- (mark_payment_matching_pending 과 같은 원칙). 금액이 있으면 지금 결제받지 않고 extra_fee/
  -- extra_fee_status='pending_payment' 로만 남겨 두고, 매니저가 수락할 때(accept_service_application()/
  -- admin_assign_manager(), sql/manager_settlement_70_30.sql)이 값을 care_schedules.extra_charge_* 로
  -- 옮겨 기존 '추가 요금 결제 안내' 결제 레일(sql/extra_charge_billing.sql)에 그대로 올립니다.
  -- ---------------------------------------------------------------------------
  v_addon_total := public.expected_addon_total(new.addon_codes);
  new.addon_total := v_addon_total;
  if v_addon_total > 0 then
    new.extra_fee := v_addon_total;
    new.extra_fee_status := 'pending_payment';
  end if;

  -- ---------------------------------------------------------------------------
  -- 텔레그램 알림 — 이 신청은 issue-virtual-account/portone-webhook Edge Function을 거치지 않고
  -- apply.html 이 service_applications 에 직접 INSERT 하고 이 BEFORE INSERT 트리거가 바로 매칭 대기로
  -- 넘기기 때문에(_shared/telegram.ts 호출 지점을 지나가지 않음), sql/admin_manual_payment_telegram_notify.sql
  -- 의 admin_confirm_manual_payment() 와 같은 이유로 알림이 빠져 있었습니다 — 같은 패턴(SQL에서 pg_net
  -- 으로 텔레그램 API 직접 호출)으로 여기도 보냅니다. net.http_post 는 이 트랜잭션 안에서 큐 테이블에
  -- 넣힐 뿐이라, 이후 INSERT 가 다른 제약으로 실패해 트랜잭션 전체가 롤백되면 이 알림도 함께 롤백되어
  -- 실제로는 발송되지 않습니다 — 그래서 "이미 보냈는데 신청은 실패"하는 불일치가 생기지 않습니다.
  -- 알림 자체가 실패해도(토큰 미설정, 네트워크 등) 이미 위에서 끝난 회차 차감/상태 전환을 막지 않도록
  -- exception 은 경고로만 남깁니다.
  -- ---------------------------------------------------------------------------
  begin
    select decrypted_secret into v_bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

    if v_bot_token is not null and v_chat_id is not null then
      v_desired_at := (regexp_match(coalesce(new.request_details, ''), '희망\s*일시:\s*([^\n]+)'))[1];
      v_applicant := nullif(btrim(split_part(coalesce(new.user_contact, ''), '/', 1)), '');
      v_when := coalesce(
        nullif(btrim(v_desired_at), ''),
        to_char(coalesce(new.created_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        '협의 필요'
      );

      -- 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, expected_addon_total() 과
      -- 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html/_shared/telegram.ts 에도
      -- 같은 맵이 있습니다 — 함께 고쳐 주세요). 패키지 차감 예약도 추가 옵션을 고를 수 있고(위에서
      -- v_addon_total 로 다시 계산), 그 금액은 지금 결제받지 않았다는 걸 매니저가 알 수 있도록 메시지에 밝힙니다.
      select coalesce(string_agg(case code
          when 'URGENT_MATCHING' then '긴급 매칭 서비스'
          else code
        end, ', '), '없음')
        into v_addon_labels
        from unnest(coalesce(new.addon_codes, '{}'::text[])) as code;

      v_message :=
        '[🔔 위드브릿지 신규 케어 신청 접수]' || chr(10) ||
        '• 서비스: ' || coalesce(new.service_type, '동행 서비스') || chr(10) ||
        '• 지역: ' || coalesce(new.address, '주소 미입력') || chr(10) ||
        '• 일시: ' || v_when || chr(10) ||
        '• 신청자: ' || coalesce(v_applicant, '고객') || ' 고객님' || chr(10) ||
        '• 선택 옵션: ' || v_addon_labels ||
          case when v_addon_total > 0 then ' (' || v_addon_total || '원, 결제 대기 — 수락 후 별도 결제 안내)' else '' end
          || chr(10) ||
        '👉 매니저 마이페이지에서 수락하기: mypage-manager.html' || chr(10) ||
        '(보유 패키지 차감 예약)';

      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'disable_web_page_preview', true)
      );
    else
      raise warning '[consume_package_on_application] telegram_bot_token/telegram_chat_id 가 Vault에 없어 알림을 건너뜁니다.';
    end if;
  exception when others then
    raise warning '[consume_package_on_application] 텔레그램 알림 발송 중 오류(회차 차감/상태 전환은 이미 완료됨) — %', sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists service_applications_consume_package on public.service_applications;
create trigger service_applications_consume_package
  before insert on public.service_applications
  for each row execute function public.consume_package_on_application();


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
