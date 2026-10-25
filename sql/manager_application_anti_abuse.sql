-- ============================================================================
-- 케어 매니저 지원서(manager-apply.html) 도배/봇 공격 방지 — 다층 방어
--
--   기존에는 브라우저가 manager_applications 에 직접 insert 했습니다(RLS: 본인 명의만, 이미 인증된
--   매니저는 금지). 하지만 RLS만으로는 다음을 막을 수 없습니다:
--     1) 같은 연락처(phone)로 이미 접수된 다른 사용자의 지원 — RLS는 "본인 행"만 보게 하므로
--        브라우저가 다른 사용자의 행을 조회해 중복을 스스로 확인할 방법이 없습니다.
--     2) Cloudflare Turnstile 검증(외부 HTTP 호출) — Postgres RLS/트리거로는 동기적으로 외부 API를
--        호출해 그 결과를 바로 insert 허용/거부에 반영하기 어렵습니다.
--     3) IP 기반 요청 횟수 제한 — 요청 IP는 Edge Function에서만 알 수 있습니다.
--
--   그래서 이 파일부터는 "브라우저가 직접 insert" 경로를 막고, 대신 supabase/functions/
--   submit-manager-application (service_role, 위 1~3 검증을 모두 수행) 를 통해서만 행이 생기도록
--   강제합니다. 이 파일은 그 Edge Function이 쓰는 DB 쪽 부품(연락처 중복 차단 인덱스, IP 레이트리밋
--   테이블/함수)과 권한 변경(브라우저 직접 insert 차단)을 담당합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql → sql/manager_applications.sql
--   → sql/manager_applications_v2.sql → (sql/manager_applications_restore_detailed_form.sql 이미
--   실행된 환경이라면) → 이 파일.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 연락처 중복 차단 — 같은 phone 으로 '심사 중' 또는 '승인됨' 지원이 이미 있으면 새 지원을 막습니다
--    (반려된 건은 재지원을 허용하므로 대상에서 제외). manager_applications_one_pending_per_user
--    (sql/manager_applications.sql, user_id 기준) 와 같은 패턴의 부분 유니크 인덱스입니다 — Edge
--    Function이 미리 SELECT로 확인해 친절한 안내 문구를 주지만, 동시 요청(TOCTOU) 사이에도 이 인덱스가
--    최종 방어선이 되어 중복 행이 생기지 않습니다.
-- ----------------------------------------------------------------------------
create unique index if not exists manager_applications_phone_active_unique
  on public.manager_applications (phone)
  where status in ('pending', 'approved');


-- ----------------------------------------------------------------------------
-- 2) IP 기반 레이트리밋 — submit-manager-application Edge Function이 요청마다 이 함수를 호출해
--    "최근 p_window_minutes 분 안에 이 IP에서 p_max_attempts 회 이상 시도했는지"를 확인합니다.
--    PostgREST(브라우저)로는 누구도 이 테이블/함수에 접근할 수 없습니다 — service_role 전용
--    (service_role 은 REVOKE 와 무관하게 항상 호출 가능).
-- ----------------------------------------------------------------------------
create table if not exists public.manager_application_rate_limits (
  id         bigint generated always as identity primary key,
  ip         inet not null,
  created_at timestamptz not null default now()
);
create index if not exists manager_application_rate_limits_ip_idx
  on public.manager_application_rate_limits (ip, created_at desc);

alter table public.manager_application_rate_limits enable row level security;
revoke all on public.manager_application_rate_limits from anon, authenticated;

create or replace function public.check_manager_application_rate_limit(
  p_ip inet,
  p_max_attempts integer default 5,
  p_window_minutes integer default 10
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.manager_application_rate_limits
   where ip = p_ip
     and created_at > now() - (p_window_minutes || ' minutes')::interval;

  -- 차단 여부와 무관하게 이번 시도를 기록합니다 — 막힌 뒤에도 계속 두드리는 요청이 윈도우 경계에서
  -- 다시 허용돼 버리지 않도록(기록 자체를 건너뛰면 그 순간부터 다시 카운트가 비어 보입니다).
  insert into public.manager_application_rate_limits (ip) values (p_ip);

  return v_count < p_max_attempts;
end $$;

revoke all on function public.check_manager_application_rate_limit(inet, integer, integer) from public, anon, authenticated;

-- 하루 지난 기록은 더 볼 일이 없으므로 테이블이 무한히 커지지 않게 매시 정리합니다.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-manager-application-rate-limits';
select cron.schedule(
  'cleanup-manager-application-rate-limits',
  '0 * * * *',
  $$ delete from public.manager_application_rate_limits where created_at < now() - interval '1 day'; $$
);


-- ----------------------------------------------------------------------------
-- 3) 브라우저 직접 insert 차단 — 이제부터 manager_applications 행 생성은 submit-manager-application
--    Edge Function(service_role)만 할 수 있습니다. 위 1)의 인덱스나 2)의 레이트리밋, Turnstile 검증을
--    모두 그 함수 안에서 거치게 하려면 "브라우저가 테이블에 직접 쓸 수 있는" 경로 자체를 없애야 합니다
--    (grant 가 남아 있으면 Turnstile/레이트리밋을 다 건너뛰고 그냥 insert 를 호출해버릴 수 있음).
--    SELECT 권한(본인 행 조회, manager_applications_select 정책)은 그대로 둡니다 — manager-apply.html
--    이 기존 지원 내역을 확인하는 데 계속 필요합니다.
-- ----------------------------------------------------------------------------
drop policy if exists manager_applications_insert_own on public.manager_applications;
revoke insert on public.manager_applications from authenticated;


notify pgrst, 'reload schema';
