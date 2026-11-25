-- ============================================================================
-- 결제 전(PAYMENT_PENDING) 신청에 텔레그램 알림이 가지 않도록 막기
--
--   증상: apply 에서 결제하기를 누르면 결제 전인데도(status = PAYMENT_PENDING) 매니저 텔레그램 알림이 감.
--   원래 설계: 결제 확인으로 MATCHING_PENDING 이 된 뒤에만 notify-care-request 가 알림을 보냄
--             (claim_telegram_notification() 이 is_pending_application_status(status) 로 판단).
--   저장소의 SQL 은 어느 버전도 PAYMENT_PENDING 을 '매칭 가능'으로 보지 않으므로, 운영 DB 에 예전/다른
--   버전 함수가 남아 있거나 대시보드에서 따로 만든 Database Webhook 이 있을 가능성이 큽니다.
--
--   이 파일:
--     [A] 진단(읽기만 함) — 실제로 어떤 경로가 알림을 보내는지 확인
--     [B] 수정 — is_pending_application_status / claim_telegram_notification 이 PAYMENT_PENDING 을
--         명시적으로 제외하도록 다시 정의 (여러 번 실행해도 안전)
--   함께 배포: supabase functions deploy notify-care-request
--             (함수에도 같은 차단을 넣었습니다 — DB 에 예전 함수가 다시 덮어써져도 알림이 새지 않도록)
--
--   개발 프로젝트에서 먼저 실행해 확인한 뒤 운영 프로젝트 SQL Editor 에서 실행하세요.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A-1] 지금 DB 의 판단 결과 — true 가 나오면 그게 원인입니다(예전 버전 함수)
-- ----------------------------------------------------------------------------
select public.is_pending_application_status('PAYMENT_PENDING')  as payment_pending_is_matchable_now,  -- false 여야 정상
       public.is_pending_application_status('MATCHING_PENDING') as matching_pending_is_matchable_now; -- true 여야 정상

-- [A-2] 지금 DB 에 들어 있는 claim 함수 본문 — status 조건이 빠져 있으면 그게 원인입니다
select pg_get_functiondef('public.claim_telegram_notification(uuid)'::regprocedure) as claim_def;

-- [A-3] service_applications 에 붙은 트리거 전체 — 대시보드 Database Webhook 은
--       supabase_functions.http_request 를 호출하는 트리거로 보입니다. INSERT 에 붙은 웹훅이 예전
--       알림 함수를 부르고 있지 않은지 확인하세요(정상 경로는 service_applications_notify_care_request 하나).
select t.tgname,
       p.proname as function_name,
       pg_get_triggerdef(t.oid) as definition
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.service_applications'::regclass
   and not t.tgisinternal
 order by t.tgname;

-- [A-4] 최근 신청 중 결제 전인데 알림 시각이 찍힌 건 (있으면 claim 단계가 PAYMENT_PENDING 을 통과시킨 것)
select id, created_at, status, telegram_notified_at
  from public.service_applications
 where status = 'PAYMENT_PENDING'
   and telegram_notified_at is not null
 order by created_at desc
 limit 20;


-- ----------------------------------------------------------------------------
-- [B-1] 매칭 가능 상태 판단 — PAYMENT_PENDING(및 결제 대기 계열)을 맨 먼저 명시적으로 제외
--       (기존 판단 규칙은 그대로 유지: 취소 제외, matching_pending/pending 등 포함)
-- ----------------------------------------------------------------------------
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('payment_pending', 'payment_waiting', 'unpaid') then false
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in
      ('matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' and coalesce(p_status, '') !~ '입금|결제' then true
    else false
  end
$$;

-- ----------------------------------------------------------------------------
-- [B-2] 알림 선점 — 결제 전 건은 선점하지 않음(위 함수가 예전 버전으로 다시 덮여도 안전하도록 이중 확인)
-- ----------------------------------------------------------------------------
create or replace function public.claim_telegram_notification(p_application_id uuid)
returns public.service_applications
language sql security definer set search_path = public as $$
  update public.service_applications
     set telegram_notified_at = now()
   where id = p_application_id
     and telegram_notified_at is null
     and manager_id is null
     and upper(btrim(coalesce(status, ''))) <> 'PAYMENT_PENDING'
     and public.is_pending_application_status(status)
  returning *;
$$;
revoke all on function public.claim_telegram_notification(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- [B-3] 이미 결제 전에 알림이 '선점'된 건은 선점 표시를 되돌려, 나중에 결제가 확인되면 정상적으로
--       알림이 가도록 합니다. (PAYMENT_PENDING 인 건만 대상 — 결제 완료/배정된 건은 건드리지 않음)
--       실행 전에 [A-4] 결과로 대상 건수를 확인하세요.
-- ----------------------------------------------------------------------------
update public.service_applications
   set telegram_notified_at = null
 where status = 'PAYMENT_PENDING'
   and telegram_notified_at is not null
   and manager_id is null;

notify pgrst, 'reload schema';
