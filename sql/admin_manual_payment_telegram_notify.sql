-- ============================================================================
-- 어드민 콘솔 '수동 입금 확인'([입금 확인] 버튼, admin_confirm_manual_payment() RPC)에는 텔레그램
-- 알림이 빠져 있었습니다 — 신규 신청 알림은 issue-virtual-account/portone-webhook Edge Function
-- 안에서만 보내는데, 이 버튼은 admin.js 가 Edge Function을 거치지 않고 이 RPC를 브라우저에서 직접
-- 호출하기 때문입니다(그래서 가상계좌/무통장 입금을 매니저가 관리자에게 알려 수동으로 확인 처리하는
-- 경로는 알림이 영영 발송되지 않고 있었습니다).
--
-- Edge Function을 하나 더 추가하는 대신(admin.js 에 추가 호출/인증 전달이 또 필요해짐), 이미 이 RPC가
-- SECURITY DEFINER로 서버에서 실행되는 점을 이용해 함수 안에서 바로 pg_net 으로 텔레그램 API를
-- 호출합니다 — 이 프로젝트가 이미 쓰고 있는 "SQL에서 pg_net 으로 외부 HTTP 호출" 패턴(sql/
-- matching_expiry_auto_refund.sql 의 cron)과 같은 방식이고, 상태 전환과 같은 트랜잭션 안에서 일어나므로
-- 별도의 "이미 알림을 보냈는지" 중복 방지 로직이 필요 없습니다(이 UPDATE 가 실제로 행을 바꿨을 때만,
-- 즉 이 호출이 PAYMENT_PENDING → MATCHING_PENDING 전환을 "처음" 수행했을 때만 아래까지 도달합니다 —
-- 이미 처리된 건을 다시 누르면 'APPLICATION_NOT_AWAITING_PAYMENT' 예외로 그 전에 끝납니다).
--
-- 텔레그램 봇 토큰/채팅방 id는 Vault에 저장합니다(service_role_key 와 같은 이유로 SQL에 평문으로 남기지
-- 않음). 최초 1회, Supabase SQL Editor에서 아래를 실행해 두세요(이미 저장했다면 건너뛰기):
--   select vault.create_secret('<텔레그램 봇 토큰>', 'telegram_bot_token');
--   select vault.create_secret('<텔레그램 채팅방 id>', 'telegram_chat_id');
-- 메시지 형식은 supabase/functions/_shared/telegram.ts 의 buildNewApplicationMessage() 와 동일하게
-- 맞췄습니다(서비스/지역/일시/신청자 + 매니저 마이페이지 링크).
--
-- ⚠ admin_confirm_manual_payment() 의 유일한 정의입니다 — sql/payment_confirmation_functions.sql,
--   sql/matching_expiry_auto_refund.sql 에 있던 옛 정의는 이 파일로 옮겨 왔고 그 자리엔 포인터
--   주석만 남겼습니다. 다른 어떤 파일에도 이 함수를 create or replace 하는 코드를 다시 추가하지
--   마세요 — 나중에 실행되는 쪽이 이전 정의를 덮어쓰는 Postgres 특성 때문에, 더 단순한 버전이 나중에
--   실행되면 텔레그램 알림이 아무 에러 없이 조용히 사라집니다(실제로 한 번 발생했던 회귀).
--   실행 순서: sql/admin_rls_policies.sql(is_admin) → sql/payment_confirmation_functions.sql
--   (expected_service_price) → sql/user_coupons_checkout.sql(expected_addon_total) → 이 파일.
--   이 파일을 몇 번을 다시 실행해도(create or replace) 안전하고, 오히려 위 파일들을 나중에 다시 실행해야
--   할 일이 생기면 그 뒤에 이 파일을 한 번 더 실행해 주는 것이 안전합니다.
-- ============================================================================

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
         matching_started_at = now()
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
          when 'VEHICLE_SUPPORT' then '차량 이동 지원'
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

notify pgrst, 'reload schema';
