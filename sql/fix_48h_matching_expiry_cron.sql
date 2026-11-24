-- ==========================================================================
-- 48시간 미매칭 자동 취소/환불 크론 복구
--
-- 대상은 취소 완료된 행이 아니라, 결제 후 MATCHING_PENDING 상태에서
-- 48시간 이상 매니저가 배정되지 않은 신청입니다.
--
-- Supabase SQL Editor에서 실행하기 전에 Database → Extensions에서 pg_cron,
-- pg_net이 활성화되어 있는지 확인하세요. service_role_key가 Vault에 없으면
-- 실행을 중단합니다. 대시보드의 Project Settings → API에서 service_role 키를
-- 복사해 다음을 한 번 실행한 뒤 이 파일을 다시 실행하세요. 이미 Vault에
-- 같은 이름의 키가 있더라도 현재 프로젝트의 최신 service_role 키인지 확인하세요
-- (키를 회전했다면 Vault 값도 갱신해야 합니다; 키를 SQL 파일에 저장 금지):
--   select vault.create_secret('<service_role key>', 'service_role_key');
-- ==========================================================================

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'service_role_key'
  ) then
    raise exception 'Vault에 service_role_key가 없습니다. 주석의 vault.create_secret 안내를 먼저 실행하세요.';
  end if;
end;
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 MATCHING_PENDING 건 중 결제 시작 시각이 비어 있는 행을 보완합니다.
-- 해당 상태는 결제가 확인된 뒤에만 설정되므로 created_at을 보수적인 기준 시각으로 사용합니다.
update public.service_applications
   set matching_started_at = created_at
 where status = 'MATCHING_PENDING'
   and manager_id is null
   and matching_started_at is null
   and created_at is not null;

-- 이후 생성되는 대상도 matching_started_at 누락 때문에 영구히 빠지지 않도록 보완합니다.
create or replace function public.list_expired_unmatched_applications()
returns setof public.service_applications
language sql security definer set search_path = public as $$
  select *
    from public.service_applications
   where status = 'MATCHING_PENDING'
     and manager_id is null
     and coalesce(matching_started_at, created_at) < now() - interval '48 hours';
$$;

revoke all on function public.list_expired_unmatched_applications() from public, anon, authenticated;
grant execute on function public.list_expired_unmatched_applications() to service_role;
grant execute on function public.expire_unmatched_application(uuid, text) to service_role;

-- 같은 이름의 이전 작업을 제거한 뒤 운영 프로젝트 URL로 10분 간격 재등록합니다.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'expire-unmatched-applications';

select cron.schedule(
  'expire-unmatched-applications',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://layvjisfeivkzowopkco.supabase.co/functions/v1/cancel-expired-applications',
    headers := jsonb_build_object(
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

notify pgrst, 'reload schema';
