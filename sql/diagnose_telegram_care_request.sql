-- ============================================================================
-- 진단 전용(읽기만 함): apply 신청·결제 후 텔레그램 알림이 오지 않을 때 어느 단계에서 끊겼는지 확인
--
--   알림 경로:
--     ① 결제 완료 → issue-virtual-account 가 신청 status 를 MATCHING_PENDING 으로 바꿈
--     ② DB 트리거 service_applications_notify_care_request → notify_care_request_webhook()
--     ③ Vault 의 care_request_notify_url / care_request_notify_secret 으로 pg_net 호출
--     ④ Edge Function notify-care-request → claim_telegram_notification() 이 매칭 가능 상태인지 판단
--     ⑤ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 로 발송
--
--   로컬(.env)이 가리키는 Supabase 프로젝트의 SQL Editor 에서 전체를 실행하세요.
--   (운영과 개발 프로젝트가 다릅니다 — 로컬은 개발 프로젝트 tjbjrxzeycomrhbgljuy)
--   데이터는 바꾸지 않습니다. 비밀값은 출력하지 않고 '있는지/어느 주소인지'만 보여 줍니다.
-- ============================================================================

-- [1] 최근 신청 10건: 결제 후 status 가 MATCHING_PENDING 으로 바뀌었는지, 알림 선점 시각이 찍혔는지
--     status 가 PAYMENT_PENDING 그대로 → ① 단계 문제(결제 확인 실패). 브라우저 콘솔의 [결제] 로그 확인.
--     MATCHING_PENDING 인데 telegram_notified_at 이 비어 있음 → ②~④ 단계 문제(아래 확인).
--     telegram_notified_at 이 찍혀 있음 → ⑤ 발송 단계 문제(봇 토큰·채팅방 ID, 함수 로그 확인).
select id, created_at, status, payment_status, manager_id, telegram_notified_at,
       public.is_pending_application_status(status) as is_matchable
  from public.service_applications
 order by created_at desc
 limit 10;

-- [2] 트리거가 붙어 있는지 (없으면 sql/telegram_care_request_webhook_trigger.sql 실행 필요)
select tgname, tgenabled, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t
 where tgrelid = 'public.service_applications'::regclass
   and tgname = 'service_applications_notify_care_request';

-- [3] Vault 값이 있는지 + 알림 URL 이 '이 프로젝트'의 함수를 가리키는지
--     URL 이 다른 프로젝트(예: 운영 layvjisfeivkzowopkco)를 가리키면 그 프로젝트에는 이 신청이 없어 알림이 안 갑니다.
select name,
       case when name = 'care_request_notify_url' then decrypted_secret
            else '(비밀값 — 길이 ' || length(decrypted_secret) || '자)' end as value
  from vault.decrypted_secrets
 where name in ('care_request_notify_url', 'care_request_notify_secret');

-- [4] MATCHING_PENDING 이 '매칭 가능 상태'로 인정되는지 (false 면 함수가 알림을 건너뜀 —
--     예전 버전 is_pending_application_status 에는 matching_pending 이 없었습니다)
select public.is_pending_application_status('MATCHING_PENDING') as matching_pending_is_matchable;

-- [5] 최근 pg_net 호출 결과 (트리거가 notify-care-request 를 부른 응답)
--     401 UNAUTHORIZED      → Vault care_request_notify_secret ≠ Edge Function Secret DB_WEBHOOK_SECRET
--     500 NOT_CONFIGURED    → Edge Function Secret DB_WEBHOOK_SECRET 없음
--     200 skipped: ALREADY_NOTIFIED_OR_NOT_ELIGIBLE → [4] 가 false 이거나 이미 알림/배정됨
--     200 skipped: TELEGRAM_NOT_CONFIGURED          → TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 없음
--     404                    → URL 오타 또는 함수 미배포
--     행이 하나도 없음       → 트리거가 안 돌았거나([2]) Vault 값이 없음([3])
select id, created, status_code, left(content::text, 300) as body, error_msg
  from net._http_response
 order by created desc
 limit 10;
