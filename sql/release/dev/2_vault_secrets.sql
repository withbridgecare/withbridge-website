-- ============================================================================
-- [개발 DB] Vault 비밀값 등록 템플릿 — 1_schema_bootstrap.sql 실행 후
-- ============================================================================
-- 실행 위치: "개발" Supabase 프로젝트 → SQL Editor (운영 프로젝트에서 실행 금지!)
--
-- 아래 <...> 자리를 개발용 값으로 채운 뒤 실행하세요. 이미 있는 이름이면 값을 덮어씁니다.
-- ⚠ 값을 채운 이 파일은 저장소에 커밋하지 마세요(비밀값이 들어갑니다). SQL Editor 에서만 쓰고 버리세요.
--
-- DB 트리거(pg_net/pg_cron)가 Edge Function 을 부를 때 쓰는 값들입니다.
--   *_url    : 개발 프로젝트의 Edge Function 주소
--   *_secret : 같은 이름의 Edge Function Secret 과 반드시 같은 값 (아래 표 참고)
--
--   Vault 이름                       ↔  Edge Function Secret (supabase secrets set ...)
--   care_request_notify_secret       ↔  DB_WEBHOOK_SECRET
--   alimtalk_webhook_secret          ↔  ALIMTALK_WEBHOOK_SECRET
--   partner_inquiry_webhook_secret   ↔  PARTNER_INQUIRY_WEBHOOK_SECRET
--   telegram_bot_token / chat_id     ↔  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (개발용 봇·채팅방 권장)
--
-- bank_account_key(계좌번호 암호화 키)는 1_schema_bootstrap.sql 이 자동으로 만들었으므로 여기 없습니다.
-- ============================================================================

create or replace function pg_temp.upsert_secret(p_name text, p_value text) returns void
language plpgsql as $$
declare v_id uuid;
begin
  if p_value like '<%>' then
    raise notice '건너뜀(값 미입력): %', p_name;
    return;
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name);
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end $$;

-- Project Settings → API → service_role key (pg_cron 이 Edge Function 을 부를 때 사용)
select pg_temp.upsert_secret('service_role_key',               '<개발 프로젝트 service_role key>');

select pg_temp.upsert_secret('care_request_notify_url',        'https://<개발 프로젝트 ref>.supabase.co/functions/v1/notify-care-request');
select pg_temp.upsert_secret('care_request_notify_secret',     '<DB_WEBHOOK_SECRET 과 같은 임의의 긴 문자열>');

select pg_temp.upsert_secret('alimtalk_function_url',          'https://<개발 프로젝트 ref>.supabase.co/functions/v1/send-status-alimtalk');
select pg_temp.upsert_secret('alimtalk_webhook_secret',        '<ALIMTALK_WEBHOOK_SECRET 과 같은 임의의 긴 문자열>');

select pg_temp.upsert_secret('partner_inquiry_function_url',   'https://<개발 프로젝트 ref>.supabase.co/functions/v1/notify-partner-inquiry');
select pg_temp.upsert_secret('partner_inquiry_webhook_secret', '<PARTNER_INQUIRY_WEBHOOK_SECRET 과 같은 임의의 긴 문자열>');

select pg_temp.upsert_secret('telegram_bot_token',             '<개발용 텔레그램 봇 토큰>');
select pg_temp.upsert_secret('telegram_chat_id',               '<개발용 텔레그램 채팅방 id>');

-- 확인: 등록된 이름 목록 (값은 보이지 않음)
select name, created_at, updated_at from vault.secrets order by name;
