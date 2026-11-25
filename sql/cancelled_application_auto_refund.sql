-- ============================================================================
-- 취소 신청 후 48시간 동안 환불 처리가 안 된 건 자동 환불
--
--   흐름: 보호자가 마이페이지에서 [신청 취소하기](cancel_my_application) → status = 'CANCELLED',
--         결제는 그대로(payment_status = 'PAID') → 어드민 '취소된 신청 내역'에서 관리자가 [환불 처리]
--         (admin-refund-application). 관리자가 48시간 안에 처리하지 않으면 cron 이 대신 전액 환불합니다.
--
--   이 파일이 하는 일:
--     1) service_applications.cancelled_at 추가 + 취소로 바뀌는 순간 자동 기록(트리거 — 보호자 취소·관리자
--        취소 등 어떤 경로로 취소돼도 기록). 이 파일 실행 전에 이미 취소된 건은 cancelled_at 이 비어 있어
--        자동 환불 대상이 아닙니다(예전 건은 관리자가 직접 처리).
--     2) list_overdue_cancelled_refunds(): 자동 환불 대상 목록
--          · status = 'CANCELLED' (매니저 배정 전 취소. 자동 만료 EXPIRED_CANCELLED 는 이미 환불됨)
--          · payment_status = 'PAID' 이고 아직 한 푼도 환불되지 않음(부분 환불 중인 건은 관리자 처리 중으로 보고 제외)
--          · 결제 금액 > 0, 패키지 차감 신청 아님
--          · cancelled_at 이 48시간 이상 지남
--     3) 기존 pg_cron 작업 'expire-unmatched-applications'(10분마다 cancel-expired-applications 호출)이
--        이 목록도 함께 처리합니다 — 새 cron 등록은 필요 없습니다.
--        (함께 배포: supabase functions deploy cancel-expired-applications)
--
--   자동 환불하지 않는 경우(관리자 처리로 남김): PortOne 에 결제 기록이 없는 건(무통장 수동 입금 등),
--   PortOne 결제 상태가 PAID 가 아닌 건, 가상계좌 결제 건(환불 계좌 정보가 필요해 자동 취소가 실패할 수 있음).
--
--   개발 프로젝트에서 먼저 실행해 확인한 뒤 운영 프로젝트 SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--   데이터: 컬럼 추가와 함수/트리거 생성만 합니다. 기존 신청서 값은 바꾸지 않습니다.
-- ============================================================================

-- 1) 취소 시각
alter table public.service_applications add column if not exists cancelled_at timestamptz;
comment on column public.service_applications.cancelled_at is
  '신청이 CANCELLED 로 바뀐 시각 — 취소 후 48시간 미환불 자동 환불(list_overdue_cancelled_refunds) 기준';

create or replace function public.set_application_cancelled_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'CANCELLED'
     and (tg_op = 'INSERT' or old.status is distinct from 'CANCELLED')
     and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;
  return new;
end $$;

drop trigger if exists service_applications_set_cancelled_at on public.service_applications;
create trigger service_applications_set_cancelled_at
  before insert or update of status on public.service_applications
  for each row execute function public.set_application_cancelled_at();

create index if not exists service_applications_cancelled_refund_idx
  on public.service_applications (cancelled_at)
  where status = 'CANCELLED' and payment_status = 'PAID';

-- 2) 자동 환불 대상
create or replace function public.list_overdue_cancelled_refunds()
returns setof public.service_applications
language sql stable security definer set search_path = public as $$
  select a.*
    from public.service_applications a
   where a.status = 'CANCELLED'
     and a.payment_status = 'PAID'
     and coalesce(a.refund_amount, 0) = 0
     and coalesce(a.final_amount, 0) > 0
     and coalesce(a.is_package_used, false) = false
     and a.cancelled_at is not null
     and a.cancelled_at < now() - interval '48 hours'
     and not exists (select 1 from public.virtual_accounts v where v.application_id = a.id)
   order by a.cancelled_at
   limit 20; -- 한 번(10분 주기)에 최대 20건 — PortOne 호출이 몰리지 않도록
$$;

revoke all on function public.list_overdue_cancelled_refunds() from public, anon, authenticated;
grant execute on function public.list_overdue_cancelled_refunds() to service_role;

notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- [확인용 — 읽기만 함]
--   · pg_cron 작업이 살아 있는지:  select jobname, schedule, active from cron.job;
--     → 'expire-unmatched-applications' 가 active = true 여야 합니다(없으면 sql/fix_48h_matching_expiry_cron.sql 실행).
--   · 최근 cron 실행 결과:          select status, return_message, start_time from cron.job_run_details
--                                   order by start_time desc limit 10;
--   · 지금 자동 환불 대상:          select id, cancelled_at, final_amount from public.list_overdue_cancelled_refunds();
-- ----------------------------------------------------------------------------
