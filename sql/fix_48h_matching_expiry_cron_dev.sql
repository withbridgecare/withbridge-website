-- ==========================================================================
-- 개발 Supabase 전용: 48시간 미매칭 자동 취소/환불 크론 복구
--
-- 주의: 운영용 sql/fix_48h_matching_expiry_cron.sql과 별개입니다.
-- 아래 v_project_ref를 개발 프로젝트의 Project Reference ID로 바꾸고,
-- 개발 Edge Function을 먼저 배포한 뒤 개발 DB의 SQL Editor에서 실행하세요.
-- 이 SQL은 실행 시 개발 데이터에 대해 PortOne 취소를 자동 요청하게 됩니다.
-- 개발 프로젝트의 PORTONE_API_SECRET도 반드시 PortOne 테스트용으로 설정하세요.
--
-- 개발 DB Vault에는 개발 프로젝트 Settings → API Keys → Legacy API Keys의
-- service_role 키(eyJ... JWT)를 저장해야 합니다. 이 Edge Function은 현재 이 키를
-- Authorization Bearer와 대조합니다. 새 sb_secret 키를 여기에 넣으면 인증되지 않습니다:
--   select vault.create_secret('<개발 프로젝트 legacy service_role 키>', 'service_role_key');
-- 이미 같은 이름의 항목이 있으면 현재 개발 키와 일치하는지 확인하세요.
-- 배포: supabase functions deploy cancel-expired-applications --project-ref <개발 프로젝트 ref>
-- ==========================================================================

-- REF와 Vault를 확인하고 잘못된 프로젝트에 적용하지 않도록 안전장치합니다.
do $$
declare
  v_project_ref text := '__DEV_PROJECT_REF__'; -- 개발 프로젝트 ref로 교체
begin
  if v_project_ref = '__DEV_PROJECT_REF__' or v_project_ref !~ '^[a-z0-9-]+$' then
    raise exception 'v_project_ref를 개발 Supabase 프로젝트의 Project Reference ID로 바꾼 뒤 실행하세요.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    raise exception '개발 DB Vault에 service_role_key가 없습니다. 이 파일 상단 안내에 따라 저장하세요.';
  end if;
end;
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 미기록된 과거 매칭 대기 건은 신청 생성 시각으로 기준을 채웁니다.
update public.service_applications
   set matching_started_at = created_at
 where status = 'MATCHING_PENDING'
   and manager_id is null
   and matching_started_at is null
   and created_at is not null;

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

-- 기존 크론을 교체합니다. ref는 개발 프로젝트 ID로 동적 조합하므로 운영 URL로 실행되지 않습니다.
do $$
declare
  v_project_ref text := '__DEV_PROJECT_REF__'; -- 위와 동일한 개발 프로젝트 ref로 교체
  v_job record;
  v_command text;
begin
  for v_job in select jobid from cron.job where jobname = 'expire-unmatched-applications' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  v_command := format(
    $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $job$,
    'https://' || v_project_ref || '.supabase.co/functions/v1/cancel-expired-applications'
  );

  perform cron.schedule('expire-unmatched-applications', '*/10 * * * *', v_command);
end;
$$;

notify pgrst, 'reload schema';
