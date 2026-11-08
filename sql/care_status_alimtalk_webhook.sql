-- ============================================================================
-- 동행 신청 상태(7단계) 변경 시 고객 카카오 알림톡 자동 발송 — DB 트리거 → Edge Function → Solapi
--
--   7단계와 발송 조건:
--     1) 접수 완료(ORDER_RECEIVED)       — service_applications INSERT 즉시
--     2) 배정 완료(MANAGER_ASSIGNED)     — care_schedules 생성 시 manager_id 가 이미 채워져 있거나
--                                          (매니저가 직접 수락), 나중에 관리자가 수동 배정해 manager_id 가
--                                          null → not null 로 바뀔 때(admin_manual_assignment.sql)
--     3) 출발 완료(DEPARTED)             — care_schedules.status → 'departed'
--     4) 병원 도착(ARRIVED_HOSPITAL)     — care_schedules.status → 'arrived'
--     5) 진료/대행 완료(TREATMENT_COMPLETED) — care_schedules.status → 'treatment_done'
--     6) 귀가 이동(RETURNING)            — care_schedules.status → 'returning'
--     7) 케어 완료(CARE_FINISHED)        — care_schedules.status → 'completed'
--   (sql/care_schedule_5step_status.sql 이 정의한 CHECK 제약 'pending'|'assigned'|'departed'|'arrived'|
--    'treatment_done'|'returning'|'completed' 7개 값과 정확히 1:1로 대응합니다 — 별도 7단계 컬럼/테이블을
--    새로 만들지 않고 이미 있는 care_schedules.status 하나만 봅니다.)
--
--   이 파일이 만드는 것은 "상태가 바뀌었다는 사실을 Edge Function에 알리는 트리거"까지입니다.
--   실제 Solapi 호출(HMAC 서명, 템플릿 변수 조립, 고객 연락처 조회)은 전부
--   supabase/functions/send-status-alimtalk 에 있습니다 — 트리거 SQL은 일부러 얕게 유지했습니다
--   (pg_net 으로 호출하는 Edge Function URL 과 webhook 공유 비밀값만 Vault 에서 읽어 넘깁니다).
--
--   admin_manual_payment_telegram_notify.sql 과 같은 "SQL에서 pg_net 으로 외부 HTTP 호출" 패턴을
--   그대로 따르되, 대상이 텔레그램 API(토큰 하나로 끝)가 아니라 우리가 만든 Edge Function이라
--   호출 URL + 공유 비밀값 2개를 Vault 에 저장해 둬야 합니다. 최초 1회, Supabase SQL Editor에서:
--
--     select vault.create_secret(
--       'https://<프로젝트 참조>.supabase.co/functions/v1/send-status-alimtalk',
--       'alimtalk_function_url'
--     );
--     select vault.create_secret('<임의의 긴 랜덤 문자열>', 'alimtalk_webhook_secret');
--
--   그리고 터미널(Supabase CLI)에서 Edge Function 쪽에도 같은 공유 비밀값과 Solapi 자격증명을 등록하세요
--   (아래 값은 전부 supabase/functions/_shared/solapi.ts 상단 주석에 설명돼 있습니다):
--
--     supabase functions deploy send-status-alimtalk --no-verify-jwt
--     supabase secrets set \
--       ALIMTALK_WEBHOOK_SECRET=<위와 똑같은 랜덤 문자열> \
--       SOLAPI_API_KEY=... \
--       SOLAPI_API_SECRET=... \
--       SOLAPI_SENDER_PHONE=... \
--       SOLAPI_PF_ID=... \
--       SOLAPI_TEMPLATE_ORDER_RECEIVED=... \
--       SOLAPI_TEMPLATE_MANAGER_ASSIGNED=... \
--       SOLAPI_TEMPLATE_DEPARTED=... \
--       SOLAPI_TEMPLATE_ARRIVED_HOSPITAL=... \
--       SOLAPI_TEMPLATE_TREATMENT_COMPLETED=... \
--       SOLAPI_TEMPLATE_RETURNING=... \
--       SOLAPI_TEMPLATE_CARE_FINISHED=... \
--       SITE_URL=https://<배포 도메인>
--
--   ⚠ --no-verify-jwt 로 배포하는 이유: DB 트리거(pg_net)는 로그인 세션이 없어 Authorization 헤더를
--   못 보냅니다. 대신 ALIMTALK_WEBHOOK_SECRET 을 x-webhook-secret 헤더로 대조해 아무나 이 URL을
--   호출해 알림을 마구 보내지 못하게 막습니다(send-status-alimtalk/index.ts 참고).
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (Vault 시크릿을 먼저
--   등록한 뒤 실행하세요). create or replace / drop trigger if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) 공용 호출 함수 — Vault 에서 Edge Function URL/비밀값을 읽어 pg_net 으로 비동기 호출합니다.
--    알림 발송 실패가 상태 전환 자체(이미 커밋될 트랜잭션)를 막으면 안 되므로, 모든 예외를 여기서
--    잡아 warning 으로만 남깁니다 — admin_confirm_manual_payment() 의 텔레그램 호출과 같은 원칙.
-- ----------------------------------------------------------------------------
create or replace function public.notify_booking_status_webhook(
  p_stage text,
  p_schedule_id uuid default null,
  p_application_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'alimtalk_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'alimtalk_webhook_secret';

  if v_url is null or v_secret is null then
    raise warning '[notify_booking_status_webhook] alimtalk_function_url/alimtalk_webhook_secret 이 Vault에 없어 알림을 건너뜁니다(stage=%).', p_stage;
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object(
      'stage', p_stage,
      'schedule_id', p_schedule_id,
      'application_id', p_application_id
    )
  );
exception when others then
  raise warning '[notify_booking_status_webhook] 알림 webhook 호출 중 오류(상태 전환은 이미 완료됨, stage=%) — %', p_stage, sqlerrm;
end $$;

revoke all on function public.notify_booking_status_webhook(text, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) 접수 완료(ORDER_RECEIVED) — service_applications 신규 신청서 제출 즉시
-- ----------------------------------------------------------------------------
create or replace function public.trg_notify_order_received() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_booking_status_webhook('ORDER_RECEIVED', null, new.id);
  return new;
end $$;

drop trigger if exists service_applications_notify_order_received on public.service_applications;
create trigger service_applications_notify_order_received
  after insert on public.service_applications
  for each row execute function public.trg_notify_order_received();

-- ----------------------------------------------------------------------------
-- 2) 배정 완료(MANAGER_ASSIGNED) ~ 7) 케어 완료(CARE_FINISHED) — care_schedules 한 테이블에서
--    manager_id 최초 배정과 status 5단계 전환을 전부 감지합니다.
-- ----------------------------------------------------------------------------
create or replace function public.trg_notify_care_schedule_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_stage text;
begin
  -- 배정 완료: INSERT 시점에 manager_id 가 이미 채워져 있거나(매니저 직접 수락),
  -- UPDATE 로 null → not null 로 바뀔 때(관리자 수동 배정, admin_manual_assignment.sql).
  if (tg_op = 'INSERT' and new.manager_id is not null)
     or (tg_op = 'UPDATE' and old.manager_id is null and new.manager_id is not null) then
    perform public.notify_booking_status_webhook('MANAGER_ASSIGNED', new.id, new.application_id);
  end if;

  -- 현장 수행 5단계 — status 가 실제로 바뀐 경우에만(단순 위치 갱신 등 다른 컬럼 UPDATE는 제외).
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_stage := case new.status
      when 'departed'       then 'DEPARTED'
      when 'arrived'        then 'ARRIVED_HOSPITAL'
      when 'treatment_done' then 'TREATMENT_COMPLETED'
      when 'returning'      then 'RETURNING'
      when 'completed'      then 'CARE_FINISHED'
      else null
    end;
    if v_stage is not null then
      perform public.notify_booking_status_webhook(v_stage, new.id, new.application_id);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists care_schedules_notify_status on public.care_schedules;
create trigger care_schedules_notify_status
  after insert or update of status, manager_id on public.care_schedules
  for each row execute function public.trg_notify_care_schedule_status();

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
