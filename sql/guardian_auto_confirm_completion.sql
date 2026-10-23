-- ============================================================================
-- 보호자 미확정 자동 완료 — 매니저가 케어 리포트를 제출한 지 24시간이 지나도 보호자가
-- [케어 이용 완료 확정](confirm_service_application() RPC)을 누르지 않은 건을 자동으로
-- 'guardian_confirmed' 로 전환합니다.
--
--   사람이 직접 확정한 것과 똑같은 종착 상태(guardian_confirmed)로 만드는 것뿐이라 외부 API 호출이
--   전혀 없습니다(결제/환불이 걸려 있던 cancel-expired-applications 와는 달리 돈이 움직이지 않음) —
--   그래서 Edge Function 없이 pg_cron 이 이 SQL 함수를 직접 호출하는 가장 단순한 형태로 만듭니다.
--
--   매니저 완료 실적·정산(admin_manager_monthly_settlements)은 이미 care_schedules.status='completed'
--   만 보고 보호자 확정 여부와 무관하게 집계되므로(점검해 재확인함), 이 자동 전환은 보호자 쪽 "확인 대기"
--   목록이 끝없이 쌓이는 UX 문제만 해결하면 됩니다 — 정산 숫자에는 아무 영향이 없습니다.
--
--   확정 기준: confirm_service_application() RPC(supabase-guardian-confirm-completion.sql)가 인정하는
--   것과 완전히 같은 '완료' 문자열 매칭을 그대로 씁니다(완료/complete/done/finished/care_completed/
--   "케어 완료" 포함) — 수동 확정과 자동 확정이 서로 다른 기준으로 갈라지지 않게.
-- ============================================================================

create or replace function public.auto_confirm_overdue_applications()
returns setof uuid
language sql security definer set search_path = public as $$
  update public.service_applications sa
     set status = 'guardian_confirmed'
    from public.care_schedules cs
    join public.care_reports cr on cr.schedule_id = cs.id
   where cs.application_id = sa.id
     and (
       lower(btrim(coalesce(sa.status, ''))) in ('completed', 'complete', 'done', 'finished', 'care_completed')
       or sa.status ~ '케어\s*완료'
     )
     and cr.created_at < now() - interval '24 hours'
  returning sa.id;
$$;

revoke all on function public.auto_confirm_overdue_applications() from public, anon, authenticated;
-- service_role/postgres(pg_cron 실행 주체)는 revoke 와 무관하게 항상 호출 가능 — 다른 cron 전용
-- 함수(list_expired_unmatched_applications 등)와 같은 패턴입니다.


-- ----------------------------------------------------------------------------
-- pg_cron 스케줄 — 매시간 정각에 실행. 외부 HTTP 호출이 없으므로 pg_net/Vault/서비스키가 필요 없고,
-- 이 함수 하나만 직접 부릅니다(cancel-expired-virtual-accounts 와 같은 단순 패턴).
-- ----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'auto-confirm-overdue-applications';
select cron.schedule(
  'auto-confirm-overdue-applications',
  '0 * * * *',
  $$select public.auto_confirm_overdue_applications();$$
);

notify pgrst, 'reload schema';
