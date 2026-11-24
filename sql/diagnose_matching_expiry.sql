-- ============================================================================
-- 48시간 미매칭 자동 취소/환불 로직 진단용 조회 스크립트 (읽기 전용 — 아무것도 바꾸지 않습니다)
--
--   'test2' 케어 신청 건이 48시간이 지났는데도 자동 취소/환불되지 않은 문제를 조사하기 위한
--   스크립트입니다. Supabase 대시보드 → SQL Editor 에서 순서대로 실행해 보세요(service_role/postgres
--   권한으로 실행되므로 cron.job, vault.secrets 등 일반 클라이언트 권한으로는 못 보는 테이블도 보입니다).
--
--   관련 코드:
--     - sql/matching_expiry_auto_refund.sql  (DB 함수 + pg_cron 스케줄 정의)
--     - supabase/functions/cancel-expired-applications  (Edge Function)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) pg_cron 작업이 실제로 등록되어 있는지 + 등록된 URL/스케줄이 맞는지 확인
--    jobname 이 'expire-unmatched-applications' 행이 아예 없으면: sql/matching_expiry_auto_refund.sql
--    맨 아래 cron.schedule(...) 블록이 이 프로젝트에서 한 번도 실행되지 않았다는 뜻입니다(그 파일을 다시
--    실행하거나, pg_cron/pg_net extension 이 이 플랜에서 꺼져 있는지 Database → Extensions 에서 확인하세요).
-- ----------------------------------------------------------------------------
select jobid, jobname, schedule, active, command
  from cron.job
 where jobname = 'expire-unmatched-applications';


-- ----------------------------------------------------------------------------
-- 2) 그 작업이 실제로 "실행은 됐는지", "실행됐다면 성공/실패했는지" — 최근 20회
--    status 가 'failed' 이거나, return_message 에 에러 메시지가 보이면 거기서 원인을 알 수 있습니다.
--    이 결과가 아예 없다면: 작업이 등록은 됐지만 한 번도 스케줄러에 의해 실행되지 않은 것입니다
--    (schedule 문법 오류, active=false, 또는 pg_cron 백그라운드 워커 자체가 이 프로젝트 플랜에서
--    동작하지 않는 경우).
-- ----------------------------------------------------------------------------
select runid, jobid, status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'expire-unmatched-applications')
 order by start_time desc
 limit 20;


-- ----------------------------------------------------------------------------
-- 3) Vault 에 cron이 쓰는 service_role_key 시크릿이 실제로 저장되어 있는지(값 자체는 복호화해서
--    보여주지 않고, 존재 여부만 확인합니다) — sql/matching_expiry_auto_refund.sql 주석에 따르면 이게
--    한 번도 등록되지 않아서 cron이 30분마다 계속 401로 실패하고 있었다는 기록이 있습니다.
--    0건이면: 아래 안내대로 service_role 키를 Vault 에 저장하세요.
--      select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY 값>', 'service_role_key');
--    (SUPABASE_SERVICE_ROLE_KEY 값은 Project Settings → API → service_role 키)
-- ----------------------------------------------------------------------------
select name, created_at, updated_at
  from vault.secrets
 where name = 'service_role_key';


-- ----------------------------------------------------------------------------
-- 4) 'test2' 신청 건 자체의 현재 상태 — 검색어는 상황에 맞게 바꿔서 실행하세요.
--    여기서 봐야 할 것:
--      - status 가 'MATCHING_PENDING' 이고 manager_id 가 null 이어야 자동 만료 대상입니다.
--        (이미 CANCELLED/EXPIRED_CANCELLED/MATCHED 라면 — 누군가 이미 처리했거나 다른 경로로
--        빠진 것이니 아래 7)도 같이 확인하세요.)
--      - matching_started_at 이 null 이면 — list_expired_unmatched_applications() 의 WHERE 절이
--        "matching_started_at is not null" 을 요구하므로 영원히 대상에서 빠집니다. 결제 승인이
--        mark_payment_matching_pending()/admin_confirm_manual_payment() 가 아닌 다른 경로(예: 수동 UPDATE)로
--        이뤄졌다면 이 컬럼이 비어 있을 수 있습니다.
--      - now() - matching_started_at 이 48시간을 실제로 넘겼는지.
-- ----------------------------------------------------------------------------
select id, created_at, status, manager_id, payment_status, matching_started_at,
       now() - matching_started_at as elapsed_since_matching_started,
       refunded_at, senior_name, service_type, user_contact, applicant_email
  from public.service_applications
 where senior_name ilike '%test2%'
    or service_type ilike '%test2%'
    or user_contact ilike '%test2%'
    or request_details ilike '%test2%'
 order by created_at desc;


-- ----------------------------------------------------------------------------
-- 5) list_expired_unmatched_applications() 가 "지금 이 순간" test2 를 포함해 실제로 몇 건을 대상으로
--    잡는지 — 위 4)에서 찾은 id가 여기 나오는지 비교해 보세요. 안 나온다면 4)의 조건(status/manager_id/
--    matching_started_at) 중 하나가 안 맞는 것이고, 나온다면 DB 쪽 로직은 정상이고 cron/Edge Function
--    호출 쪽(1~3번)이 원인입니다.
-- ----------------------------------------------------------------------------
select * from public.list_expired_unmatched_applications();


-- ----------------------------------------------------------------------------
-- 6) 혹시 이미 수동/자동으로 처리 시도가 있었다면 admin_logs(sql/admin_logs.sql)에 흔적이 남아 있을 수
--    있습니다 — 테이블이 없다면 이 쿼리는 건너뛰세요.
-- ----------------------------------------------------------------------------
-- select * from public.admin_logs where detail::text ilike '%test2%' order by created_at desc limit 20;


-- ----------------------------------------------------------------------------
-- 7) pg_net 으로 나간 HTTP 요청 자체의 응답(PortOne 호출이 아니라 "cron → Edge Function" 호출의 응답) —
--    cron이 실행되긴 했는데 Edge Function이 401/500 등을 돌려줬다면 여기서 status_code/response 로 보입니다.
--    (net.http_post 는 비동기라 응답이 별도 테이블에 쌓입니다. 프로젝트의 pg_net 버전에 따라 테이블 이름이
--    net._http_response 가 아닐 수 있습니다 — 없다고 나오면 Database → Extensions → pg_net 버전을 확인하세요.)
-- ----------------------------------------------------------------------------
select id, status_code, content::text, error_msg, created
  from net._http_response
 order by created desc
 limit 20;


-- ----------------------------------------------------------------------------
-- 8) Edge Function이 쓰는 두 RPC를 service_role로 실행할 수 있는지 확인 — 둘 다 true여야 정상입니다.
--    false이면 sql/fix_48h_matching_expiry_cron_dev.sql(개발) 또는
--    sql/fix_48h_matching_expiry_cron.sql(운영)을 다시 실행하세요.
-- ----------------------------------------------------------------------------
select
  has_function_privilege('service_role', 'public.list_expired_unmatched_applications()', 'EXECUTE')
    as can_list_expired_applications,
  has_function_privilege('service_role', 'public.expire_unmatched_application(uuid, text)', 'EXECUTE')
    as can_finalize_expired_application;
