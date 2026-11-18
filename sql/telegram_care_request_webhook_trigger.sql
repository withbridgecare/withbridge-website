-- ============================================================================
-- service_applications → notify-care-request Edge Function 호출 트리거
--
--   notify-care-request/telegram-webhook Edge Function(sql/telegram_care_request_notifications.sql과
--   짝)은 이미 Supabase에 배포되어 있지만, 아직 아무것도 그 함수를 호출하지 않아 하이브리드 알림
--   (개인 DM + [동행 수락하기] 버튼)이 한 번도 발송되지 않았습니다 — 기존에 보이는 "매니저
--   마이페이지에서 수락하기: ..." 텍스트 알림은 issue-virtual-account/portone-webhook 안에서
--   _shared/telegram.ts 의 sendTelegramMessage() 를 바로 호출하는 완전히 별개의 옛 경로입니다
--   (이 파일과 무관하게 계속 동작하며, 끄지 않아도 됩니다 — 같은 그룹방에 두 알림이 함께 와도
--   무방하지만, 옛 알림을 끄고 싶다면 그 두 Edge Function의 sendTelegramMessage 호출부를 지워야
--   합니다. 이 파일만으로는 꺼지지 않습니다).
--
--   Supabase 대시보드의 "Database → Webhooks" UI는 쓰지 않습니다 — 이 프로젝트가 이미
--   sql/care_status_alimtalk_webhook.sql·sql/admin_manual_payment_telegram_notify.sql 에서 쓰고 있는
--   "Postgres 트리거 + pg_net.http_post() + Vault" 패턴을 그대로 따릅니다(대시보드 클릭 없이 SQL
--   하나로 전체 등록이 끝납니다).
--
--   최초 1회, Supabase 대시보드 → SQL Editor 에서 **이 블록만 먼저** 실행해 Vault에 호출 URL과
--   공유 비밀값을 등록하세요(비밀값은 이미 Edge Function 쪽에 설정된 DB_WEBHOOK_SECRET 과 정확히
--   같은 값입니다 — 아래 그대로 쓰면 됩니다):
--
--     select vault.create_secret(
--       'https://layvjisfeivkzowopkco.supabase.co/functions/v1/notify-care-request',
--       'care_request_notify_url'
--     );
--     select vault.create_secret(
--       '1981953cc364aed6347c7383004aaa0a4e5dd2dc14a70d2eebbd16bfeb5f6ea7',
--       'care_request_notify_secret'
--     );
--
--   ⚠ 위 비밀값은 이 트리거 전용으로 새로 발급한 DB_WEBHOOK_SECRET 입니다 — 이미 Supabase Edge
--   Function Secrets 에도 등록되어 있습니다(supabase secrets set DB_WEBHOOK_SECRET=...). 나중에
--   이 값을 교체하려면 Edge Function 시크릿과 이 Vault 시크릿을 반드시 같이 바꿔야 합니다.
--
--   그 다음 이 파일 나머지(트리거 생성)를 실행하세요. create or replace / drop trigger if exists
--   기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 공용 호출 함수 — Vault 에서 URL/비밀값을 읽어 pg_net 으로 비동기 호출합니다. notify-care-request
--    Edge Function이 기대하는 바디 모양 { table, record }(Supabase Database Webhook 과 동일한 모양)을
--    그대로 맞춥니다 — 실패해도 신청 INSERT/UPDATE 트랜잭션 자체를 막지 않도록 모든 예외를 삼킵니다
--    (notify_booking_status_webhook() 과 같은 원칙).
-- ----------------------------------------------------------------------------
create or replace function public.notify_care_request_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'care_request_notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'care_request_notify_secret';

  if v_url is null or v_secret is null then
    raise warning '[notify_care_request_webhook] care_request_notify_url/secret 이 Vault에 없어 알림을 건너뜁니다(application_id=%).', new.id;
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', v_secret),
    body := jsonb_build_object(
      'type', tg_op,
      'table', 'service_applications',
      'record', row_to_json(new)
    )
  );
  return new;
exception when others then
  raise warning '[notify_care_request_webhook] webhook 호출 중 오류(신청 저장은 이미 완료됨, application_id=%) — %', new.id, sqlerrm;
  return new;
end $$;

revoke all on function public.notify_care_request_webhook() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) 트리거 — INSERT(결제 없는 패키지 차감 신청은 접수 즉시 매칭 가능 상태) + status 가 바뀌는 UPDATE
--    (결제 확인 후 MATCHING_PENDING 진입)만 봅니다. 실제로 알림을 보낼지(이미 알림을 보냈는지/배정
--    됐는지/매칭 가능 상태인지)는 notify-care-request 안의 claim_telegram_notification() 이 매 호출마다
--    원자적으로 다시 판단하므로, 여기서는 "신청에 뭔가 생겼다"는 사실만 넓게 알려도 안전합니다.
-- ----------------------------------------------------------------------------
drop trigger if exists service_applications_notify_care_request on public.service_applications;
create trigger service_applications_notify_care_request
  after insert or update of status on public.service_applications
  for each row execute function public.notify_care_request_webhook();

notify pgrst, 'reload schema';
