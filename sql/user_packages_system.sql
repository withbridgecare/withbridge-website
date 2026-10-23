-- ============================================================================
-- 선결제 회차 패키지(5회권/10회권) + 유연한 차감 예약 + 초과 시간 후불 과금
--
--   패키지 구매(선결제) → user_packages 충전 → apply.html 에서 결제 없이 회차 차감 예약 →
--   완료 시 매니저가 입력한 실제 소요 시간으로 초과 요금을 자동 산정해 기존 2차 결제
--   레일(sql/extra_charge_billing.sql)에 그대로 올립니다. 70:30 정산(sql/manager_settlement_70_30.sql)은
--   care_schedules.payment_amount 가 바뀔 때마다 이미 자동으로 다시 계산되므로, 패키지 결제건이든
--   후불 초과금이든 추가 코드 없이 똑같이 70%/30% 로 나뉩니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/payment_confirmation_functions.sql(expected_service_price() 참고용) →
--             sql/user_coupons_checkout.sql(expected_addon_total() — 패키지 차감 + 선택 추가 옵션 금액
--             검증에 필요) → sql/extra_charge_billing.sql(extra_charge_* 컬럼/함수) →
--             sql/manager_settlement_70_30.sql(payment_amount/manager_payout/platform_fee + 70:30 트리거) →
--             이 파일.
--   전부 create or replace / add column if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ============================================================================
-- 1) user_packages — 보호자가 선결제한 회차권
-- ============================================================================
create table if not exists public.user_packages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  package_type    text not null check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours')),
  total_count     integer not null check (total_count > 0),
  remaining_count integer not null check (remaining_count >= 0),
  status          text not null default 'active' check (status in ('active', 'exhausted', 'expired')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint user_packages_remaining_le_total check (remaining_count <= total_count)
);

-- 테이블이 이미 있던 환경(이전 버전에서 '5_sessions'/'10_sessions' 만 허용하던 체크 제약)에도 새 패키지
-- 코드('10_hours'/'20_hours')를 쓸 수 있도록 제약을 다시 걸어 둡니다 — create table if not exists 는
-- 이미 존재하는 테이블의 제약을 바꾸지 않으므로 이 ALTER 가 따로 필요합니다.
alter table public.user_packages drop constraint if exists user_packages_package_type_check;
alter table public.user_packages add constraint user_packages_package_type_check
  check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours'));

create index if not exists user_packages_user_active_idx
  on public.user_packages (user_id) where status = 'active' and remaining_count > 0;

alter table public.user_packages enable row level security;

-- 보호자는 본인 패키지만 조회 — 차감/충전은 전부 아래 SECURITY DEFINER 함수/트리거를 통해서만 이뤄지므로
-- authenticated 에 insert/update/delete 권한을 주지 않습니다(결제 없이 회차를 스스로 늘리는 조작을 막음).
drop policy if exists user_packages_select_own on public.user_packages;
create policy user_packages_select_own on public.user_packages
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.user_packages from anon, authenticated;
grant  select on public.user_packages to authenticated;
revoke select on public.user_packages from anon;

-- 잔여 횟수가 0이 되면 자동으로 'exhausted' — 아래 2번 패키지 차감 트리거가 이미 remaining_count=0일 때
-- status 도 같이 바꿔 주지만, 혹시 다른 경로(수동 SQL 등)로 remaining_count 가 바뀌는 경우까지 대비한 이중 안전장치.
create or replace function public.sync_user_package_status() returns trigger
language plpgsql as $$
begin
  if new.remaining_count <= 0 then
    new.status := 'exhausted';
  elsif new.status = 'exhausted' and new.remaining_count > 0 then
    new.status := 'active';
  end if;
  return new;
end $$;

drop trigger if exists user_packages_sync_status on public.user_packages;
create trigger user_packages_sync_status
  before insert or update of remaining_count on public.user_packages
  for each row execute function public.sync_user_package_status();

-- 만료일이 지난 패키지를 'expired' 로 정리 — pg_cron 이 주기적으로 호출합니다(맨 아래 스케줄).
create or replace function public.expire_user_packages() returns void
language sql security definer set search_path = public as $$
  update public.user_packages
     set status = 'expired'
   where status = 'active'
     and expires_at < now();
$$;
revoke all on function public.expire_user_packages() from public, anon, authenticated;


-- ============================================================================
-- 2) package_orders — 패키지 선결제 1건당 주문 1개 (PortOne paymentId = 이 테이블의 id)
-- ============================================================================
create table if not exists public.package_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  package_type text not null check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours')),
  amount       integer not null check (amount > 0),
  status       text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELLED')),
  pg_payment_ref text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);

-- user_packages 와 같은 이유로, 테이블이 이미 있던 환경에도 새 패키지 코드를 쓸 수 있도록 다시 겁니다.
alter table public.package_orders drop constraint if exists package_orders_package_type_check;
alter table public.package_orders add constraint package_orders_package_type_check
  check (package_type in ('5_sessions', '10_sessions', '10_hours', '20_hours'));

alter table public.package_orders enable row level security;

drop policy if exists package_orders_select_own on public.package_orders;
create policy package_orders_select_own on public.package_orders
  for select to authenticated using (user_id = auth.uid());

-- apply.html/mypage.html 의 결제 흐름과 동일한 패턴: 결제창의 paymentId 로 쓰려면 먼저 행이 있어야 하므로
-- 본인 user_id 로만 INSERT 를 허용합니다(결제 승인 여부와 무관하게 PENDING 상태로 먼저 생성). 승인 반영
-- (status→PAID, user_packages 충전)은 아래 confirm_package_order_payment() 가 service_role 로만 수행합니다.
drop policy if exists package_orders_insert_own on public.package_orders;
create policy package_orders_insert_own on public.package_orders
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'PENDING');

grant  select, insert on public.package_orders to authenticated;
revoke select, insert on public.package_orders from anon;


-- ----------------------------------------------------------------------------
-- 3) 패키지 정가/회차 카탈로그 — apply.html/mypage.html 의 화면 표시 값과 반드시 같게 유지합니다.
--    (expected_service_price() 와 같은 패턴: 서버가 검증할 "정답"은 이 함수뿐입니다.)
--    (2026 마진율 개편: 신규 판매 상품은 '10_hours'/'20_hours' — 기본 2시간 x 5회/10회라는 동일한
--    차감 방식을 "시간" 단위로 다시 소개하는 상품입니다. '5_sessions'/'10_sessions' 는 이미 구매해 둔
--    보호자가 있을 수 있어 과거 정가 그대로 남겨 둡니다(새로 판매하지는 않음 — package.html 참고).)
-- ----------------------------------------------------------------------------
create or replace function public.expected_package_price(p_package_type text)
returns integer
language sql immutable as $$
  select case p_package_type
    when '5_sessions'  then 220000
    when '10_sessions' then 440000
    when '10_hours'    then 230000
    when '20_hours'    then 440000
    else null
  end;
$$;

create or replace function public.package_session_count(p_package_type text)
returns integer
language sql immutable as $$
  select case p_package_type
    when '5_sessions'  then 5
    when '10_sessions' then 10
    when '10_hours'    then 5  -- 10시간 ÷ 기본 2시간
    when '20_hours'    then 10 -- 20시간 ÷ 기본 2시간
    else null
  end;
$$;

grant execute on function public.expected_package_price(text) to anon, authenticated;
grant execute on function public.package_session_count(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4) 패키지 결제 승인 반영 — confirm-package-order-payment Edge Function / portone-webhook 이
--    PortOne API 를 서버에서 재조회한 뒤에만 호출합니다(mark_payment_matching_pending 과 같은 원칙).
--    p_paid_amount 가 package_type 의 정가와 다르면 AMOUNT_MISMATCH 로 거부합니다.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_package_order_payment(
  p_order_id uuid,
  p_paid_amount integer default null,
  p_payment_key text default null
)
returns public.user_packages
language plpgsql security definer set search_path = public as $$
declare
  v_order  public.package_orders;
  v_count  integer;
  v_pkg    public.user_packages;
begin
  select * into v_order from public.package_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'PACKAGE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status = 'PAID' then
    -- 중복 웹훅/재시도 — 이미 충전된 패키지를 그대로 돌려줍니다(멱등).
    select * into v_pkg from public.user_packages
     where user_id = v_order.user_id and package_type = v_order.package_type
     order by created_at desc limit 1;
    return v_pkg;
  end if;
  if v_order.status <> 'PENDING' then
    raise exception 'PACKAGE_ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;

  if p_paid_amount is not null and p_paid_amount <> v_order.amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_order.amount, p_paid_amount using errcode = 'P0003';
  end if;

  v_count := public.package_session_count(v_order.package_type);
  if v_count is null then
    raise exception 'UNKNOWN_PACKAGE_TYPE: %', v_order.package_type using errcode = 'P0001';
  end if;

  update public.package_orders
     set status = 'PAID', paid_at = now(), pg_payment_ref = coalesce(p_payment_key, pg_payment_ref)
   where id = p_order_id;

  -- 90일을 넘겨 쓰지 못한 회차가 그냥 사라지는 건 과하다고 보고, 패키지 유효기간은 180일(6개월)로
  -- 둡니다 — 운영 방침이 바뀌면 이 interval 만 조정하면 됩니다.
  insert into public.user_packages (user_id, package_type, total_count, remaining_count, status, expires_at)
  values (v_order.user_id, v_order.package_type, v_count, v_count, 'active', now() + interval '180 days')
  returning * into v_pkg;

  return v_pkg;
end $$;

revoke all on function public.confirm_package_order_payment(uuid, integer, text) from public, anon, authenticated;


-- ============================================================================
-- 5) service_applications 확장 — 패키지 연결 + 실제 소요 시간/초과 요금
-- ============================================================================
alter table public.service_applications add column if not exists package_id uuid references public.user_packages(id);
alter table public.service_applications add column if not exists is_package_used boolean not null default false;
alter table public.service_applications add column if not exists actual_duration_minutes integer;
alter table public.service_applications add column if not exists extra_fee integer;
alter table public.service_applications add column if not exists extra_fee_status text;

alter table public.service_applications drop constraint if exists service_applications_package_consistency_check;
alter table public.service_applications add constraint service_applications_package_consistency_check
  check ((is_package_used and package_id is not null) or (not is_package_used and package_id is null));

alter table public.service_applications drop constraint if exists service_applications_extra_fee_status_check;
alter table public.service_applications add constraint service_applications_extra_fee_status_check
  check (extra_fee_status is null or extra_fee_status in ('pending_payment', 'paid'));

alter table public.service_applications drop constraint if exists service_applications_actual_duration_check;
alter table public.service_applications add constraint service_applications_actual_duration_check
  check (actual_duration_minutes is null or actual_duration_minutes >= 0);


-- ----------------------------------------------------------------------------
-- 6) 패키지 차감 트리거 — apply.html 이 is_package_used=true, package_id=<보유 패키지> 로 신청서를
--    저장하면, 결제 단계를 거치지 않고 이 트리거가 그 자리에서 회차를 차감하고 바로 매칭 대기
--    상태로 넘깁니다. SECURITY DEFINER 로 user_packages 의 revoke 를 우회해 "정확히 이 검증을 통과한
--    경우에만" 차감되게 하고, 동시 접수로 마지막 회차가 두 번 쓰이지 않도록 select ... for update 로
--    패키지 행을 잠급니다. 아래에서 net.http_post 로 텔레그램 알림도 보내므로 pg_net 이 꺼져 있으면
--    이 CREATE EXTENSION 문에서만 에러가 날 수 있습니다 — sql/matching_expiry_auto_refund.sql 의
--    8번과 같은 안내대로, Supabase 대시보드 → Database → Extensions 에서 pg_net 을 켠 뒤 다시 실행하세요.
-- ----------------------------------------------------------------------------
create extension if not exists pg_net;

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
          when 'VEHICLE_SUPPORT' then '차량 이동 지원'
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
-- 7) 초과 시간 자동 과금 — mypage-manager.html '케어 완료' 모달이 이미 받고 있는 실제 종료 시각을
--    기준으로, 기본 2시간을 넘긴 시간을 30분당 서비스별 단가(expected_overtime_rate_per_30min(),
--    sql/payment_confirmation_functions.sql — 시니어 병원 동행 12,000 / 생활 편의 대행 10,000 /
--    복합 매칭 서비스 14,000)로 환산해 자동 청구합니다. 매니저(배정된 본인) 또는 관리자만 호출할 수
--    있고, 기존 2차 결제 레일(care_schedules.extra_charge_*, confirm_extra_charge_payment(),
--    mypage.html 의 PortOne 결제 버튼)을 그대로 재사용합니다 — 결제 인프라를 새로 만들지 않고,
--    "얼마를 청구할지"만 자동으로 계산해 올려 둡니다.
--    (2026 마진율 개편 전에는 서비스 종류와 무관하게 30분당 10,000원 고정이었습니다 — service_type 을
--    연결된 신청서에서 가져올 수 없는 경우(application_id 가 없는 수기 배정 등)에는 그 기존 기본값
--    10,000원을 그대로 fallback 으로 씁니다.)
-- ----------------------------------------------------------------------------
create or replace function public.report_care_duration_and_bill_extra(
  p_schedule_id uuid,
  p_actual_duration_minutes integer
)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.care_schedules;
  v_extra_fee integer;
  v_service_type text;
  v_unit_fee     integer;
  v_base_minutes constant integer := 120; -- 기본 요금에 포함된 시간(2시간, index.html/apply.html 요금표와 동일)
begin
  select * into v_row from public.care_schedules where id = p_schedule_id;
  if v_row.id is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_row.manager_id = auth.uid() or public.is_admin()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_actual_duration_minutes is null or p_actual_duration_minutes < 0 then
    raise exception 'INVALID_DURATION' using errcode = '22023';
  end if;
  if v_row.extra_charge_status = 'PAID' then
    raise exception 'EXTRA_CHARGE_ALREADY_PAID' using errcode = 'P0001';
  end if;

  if v_row.application_id is not null then
    select service_type into v_service_type from public.service_applications where id = v_row.application_id;
  end if;
  v_unit_fee := public.expected_overtime_rate_per_30min(v_service_type);

  v_extra_fee := greatest(0, ceil((p_actual_duration_minutes - v_base_minutes) / 30.0)::integer) * v_unit_fee;

  if v_extra_fee > 0 then
    -- 패키지 차감 예약에 선택 추가 옵션이 있으면(consume_package_on_application/accept_service_application
    -- 이 이미 extra_charge_amount 를 그 추가 옵션 금액으로 'REQUESTED' 해 둠) 여기서 금액을 통째로
    -- 덮어쓰면 그 미결제 추가 옵션 금액이 사라집니다 — 아직 PAID 가 아닌 기존 금액에는 더하고, 메모도
    -- 이어 붙입니다(amount=0/메모 없음인 'NONE' 상태에서는 coalesce(..,0)+v_extra_fee 가 그냥 v_extra_fee 와 같음).
    update public.care_schedules
       set extra_charge_amount = coalesce(extra_charge_amount, 0) + v_extra_fee,
           extra_charge_memo = case when extra_charge_memo is not null
             then extra_charge_memo || E'\n' || '기본 2시간 초과 자동 산정 (실제 소요 ' || p_actual_duration_minutes || '분)'
             else '기본 2시간 초과 자동 산정 (실제 소요 ' || p_actual_duration_minutes || '분)' end,
           extra_charge_status = 'REQUESTED',
           extra_charge_payment_id = coalesce(extra_charge_payment_id, gen_random_uuid()),
           extra_charge_requested_at = coalesce(extra_charge_requested_at, now())
     where id = p_schedule_id
    returning * into v_row;
    -- TODO(카카오 알림톡): 여기서 보호자에게 추가 요금 발생을 알립니다. 카카오 비즈니스 발신프로필·
    -- 템플릿 승인이 끝나면 이 지점에서 알림톡 발송 API를 호출하세요(현재는 외부 계정이 없어 결제
    -- 링크 안내만 제공합니다 — mypage.html '추가 요금 결제 안내' 섹션이 그 결제 링크 역할을 합니다).
  end if;

  if v_row.application_id is not null then
    -- v_row.extra_charge_amount 를 그대로 씁니다(위에서 pending 추가 옵션 금액에 이번 초과 요금을 더한
    -- 합계일 수 있음) — v_extra_fee(이번 초과 요금만)를 쓰면 패키지 차감 예약의 추가 옵션 pending 금액이
    -- service_applications 쪽 표시에서는 사라져 보입니다(실제 결제 레일인 care_schedules 쪽은 이미 합산됨).
    update public.service_applications
       set actual_duration_minutes = p_actual_duration_minutes,
           extra_fee = v_row.extra_charge_amount,
           extra_fee_status = case when coalesce(v_row.extra_charge_amount, 0) > 0 then 'pending_payment' else null end
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.report_care_duration_and_bill_extra(uuid, integer) from public, anon;
grant  execute on function public.report_care_duration_and_bill_extra(uuid, integer) to authenticated;


-- ----------------------------------------------------------------------------
-- 8) confirm_extra_charge_payment() 보강 — 결제가 실제로 PAID 되는 순간, service_applications.
--    extra_fee_status 도 'paid' 로 같이 맞춥니다(원본은 sql/extra_charge_billing.sql, 이후
--    sql/manager_settlement_70_30.sql 이 payment_amount 합산 로직을 추가했고, 여기서는 그 위에
--    한 줄만 더합니다).
-- ----------------------------------------------------------------------------
create or replace function public.confirm_extra_charge_payment(p_payment_id uuid, p_paid_amount integer)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  select * into v_row from public.care_schedules where extra_charge_payment_id = p_payment_id;
  if v_row.id is null then
    raise exception 'EXTRA_CHARGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.extra_charge_status = 'PAID' then
    return v_row; -- 중복 웹훅/재시도 — 조용히 현재 행 그대로 반환 (멱등)
  end if;
  if v_row.extra_charge_status <> 'REQUESTED' then
    raise exception 'EXTRA_CHARGE_NOT_REQUESTED' using errcode = 'P0001';
  end if;
  if p_paid_amount is distinct from v_row.extra_charge_amount then
    raise exception 'AMOUNT_MISMATCH: expected=%, paid=%', v_row.extra_charge_amount, p_paid_amount
      using errcode = 'P0003';
  end if;

  update public.care_schedules
     set extra_charge_status = 'PAID',
         extra_charge_paid_at = now(),
         payment_amount = payment_amount + v_row.extra_charge_amount
   where id = v_row.id
  returning * into v_row;

  if v_row.application_id is not null then
    update public.service_applications
       set extra_fee_status = 'paid'
     where id = v_row.application_id;
  end if;

  return v_row;
end $$;

revoke all on function public.confirm_extra_charge_payment(uuid, integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 9) pg_cron — 만료된 패키지 정리(매일 새벽 3시, KST 기준이 아니라 DB 서버 시각 기준이므로 UTC 환경이면
--    한국 시간 정오 즈음입니다 — 정확한 시각이 중요하지 않은 정리 작업이라 그대로 둡니다). pg_cron 이
--    꺼져 있으면 이 블록만 실패하고 나머지는 이미 전부 적용된 상태로 남습니다(sql/
--    payment_confirmation_functions.sql 의 8번과 같은 안내).
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'expire-user-packages';
select cron.schedule(
  'expire-user-packages',
  '0 3 * * *',
  $$select public.expire_user_packages();$$
);


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
