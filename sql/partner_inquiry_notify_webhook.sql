-- ============================================================================
-- 제휴 문의(partner.html) 신규 접수 시 대표님 이메일 알림 — DB 트리거 → Edge Function → Resend
--
--   partner.html 은 로그인 여부와 무관하게 anon 키로 partner_inquiries 에 직접 insert합니다
--   (sql/partner_inquiries.sql 참고 — 이 폼은 Edge Function을 거치지 않습니다). 그래서 "새 문의가
--   들어왔다"는 신호를 애플리케이션 코드가 아니라 DB 트리거에서 잡아야 합니다.
--
--   이 파일이 만드는 것은 "새 행이 insert됐다는 사실을 Edge Function에 알리는 트리거"까지입니다.
--   실제 메일 발송(Resend 호출, 본문 조립)은 전부 supabase/functions/notify-partner-inquiry 에
--   있습니다 — sql/care_status_alimtalk_webhook.sql 과 같은 "트리거는 얕게, 조회/가공은 Edge
--   Function에" 패턴을 그대로 따릅니다.
--
--   최초 1회, Supabase SQL Editor에서 Vault에 호출 URL과 공유 비밀값을 등록하세요:
--
--     select vault.create_secret(
--       'https://<프로젝트 참조>.supabase.co/functions/v1/notify-partner-inquiry',
--       'partner_inquiry_function_url'
--     );
--     select vault.create_secret('<임의의 긴 랜덤 문자열>', 'partner_inquiry_webhook_secret');
--
--   그리고 터미널(Supabase CLI)에서 Edge Function 쪽에도 같은 공유 비밀값과 Resend 자격증명을 등록하세요:
--
--     supabase functions deploy notify-partner-inquiry --no-verify-jwt
--     supabase secrets set \
--       PARTNER_INQUIRY_WEBHOOK_SECRET=<위와 똑같은 랜덤 문자열> \
--       RESEND_API_KEY=... \
--       RESEND_FROM_EMAIL='위드브릿지 <no-reply@withbridge.co.kr>' \
--       PARTNER_INQUIRY_NOTIFY_EMAIL=withbridge.care@outlook.kr
--
--   (PARTNER_INQUIRY_NOTIFY_EMAIL 은 생략해도 됩니다 — notify-partner-inquiry/index.ts 에 같은
--   주소가 기본값으로 들어 있습니다. 수신처를 바꿀 때만 등록하세요.)
--
--   ⚠ --no-verify-jwt 로 배포하는 이유: DB 트리거(pg_net)는 로그인 세션이 없어 Authorization 헤더를
--   못 보냅니다. 대신 PARTNER_INQUIRY_WEBHOOK_SECRET 을 x-webhook-secret 헤더로 대조해 아무나 이
--   URL을 호출해 알림을 마구 보내지 못하게 막습니다(notify-partner-inquiry/index.ts 참고).
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (Vault 시크릿을 먼저
--   등록한 뒤 실행하세요). create or replace / drop trigger if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

create or replace function public.notify_partner_inquiry_webhook(p_inquiry_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'partner_inquiry_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'partner_inquiry_webhook_secret';

  if v_url is null or v_secret is null then
    raise warning '[notify_partner_inquiry_webhook] partner_inquiry_function_url/partner_inquiry_webhook_secret 이 Vault에 없어 알림을 건너뜁니다(inquiry_id=%).', p_inquiry_id;
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('inquiry_id', p_inquiry_id)
  );
exception when others then
  raise warning '[notify_partner_inquiry_webhook] 알림 webhook 호출 중 오류(문의 접수는 이미 완료됨, inquiry_id=%) — %', p_inquiry_id, sqlerrm;
end $$;

revoke all on function public.notify_partner_inquiry_webhook(uuid) from public, anon, authenticated;

create or replace function public.trg_notify_partner_inquiry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner_inquiry_webhook(new.id);
  return new;
end $$;

drop trigger if exists partner_inquiries_notify on public.partner_inquiries;
create trigger partner_inquiries_notify
  after insert on public.partner_inquiries
  for each row execute function public.trg_notify_partner_inquiry();

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
