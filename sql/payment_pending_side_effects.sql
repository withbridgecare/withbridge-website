-- ============================================================================
-- 결제 전(PAYMENT_PENDING) 신청서의 부작용 정리
--
--   배경: apply 는 결제창을 열기 전에 신청서를 PAYMENT_PENDING 으로 먼저 저장합니다(신청서 id 가 곧 PortOne
--   paymentId 이고, 결제 후 서버가 DB 금액과 PortOne 결제 금액을 대조해 승인하므로 이 순서는 유지해야 함).
--   그런데 그 '결제 전 저장' 때문에 생기던 두 가지 문제를 고칩니다.
--
--   1) 접수 완료 알림톡(ORDER_RECEIVED)이 결제 전에 발송되던 문제
--      예전: service_applications INSERT 즉시 발송 → 결제창을 닫아도 고객에게 '접수 완료'가 감.
--      변경: · 결제 확인으로 PAYMENT_PENDING → MATCHING_PENDING 이 되는 순간 발송
--              (카드 결제 확인 issue-virtual-account, 가상계좌 입금 portone-webhook, 관리자 수동 입금 확인 모두 해당)
--            · 패키지 차감 신청처럼 처음부터 결제가 필요 없는 신청(INSERT 시 이미 MATCHING_PENDING)은 저장 즉시 발송
--      참고: 가상계좌 고객은 이제 '입금 후'에 접수 완료 알림톡을 받습니다.
--            (PAYMENT_PENDING 은 다시 PAYMENT_PENDING 으로 돌아가지 않으므로 신청 1건당 최대 1회 발송)
--
--   2) 결제창을 닫고 떠난 카드 결제 신청서가 PAYMENT_PENDING 으로 영원히 남던 문제
--      기존 cancel_expired_virtual_accounts() 는 '가상계좌 입금 기한이 지난 건'만 취소합니다.
--      추가: 가상계좌가 발급되지 않았고 24시간이 지난 PAYMENT_PENDING 건을 CANCELLED 로 정리(1시간마다).
--      24시간으로 넉넉히 두는 이유: 드물게 결제는 승인됐는데 상태 반영이 늦거나 실패한 건(관리자 텔레그램
--      '결제 승인 후 신청 상태 반영 실패' 알림 대상)을 운영자가 확인할 시간을 주기 위해서입니다.
--
--   실행: 개발 프로젝트에서 먼저 실행해 확인한 뒤 운영 프로젝트 SQL Editor 에서 전체 실행.
--         create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
--   선행: sql/care_status_alimtalk_webhook.sql(notify_booking_status_webhook),
--         sql/payment_confirmation_functions.sql(pg_cron, virtual_accounts) 가 이미 적용돼 있어야 합니다.
--   데이터: 이 파일을 실행하는 것만으로는 기존 신청서가 바뀌지 않습니다. 단, 2)의 정리 작업이 처음 돌 때
--           24시간 넘게 PAYMENT_PENDING 인 예전 건들이 CANCELLED 로 바뀝니다 — 실행 전에 맨 아래
--           [미리 보기] 쿼리로 어떤 건이 대상인지 확인하세요.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 접수 완료 알림톡 — 결제 확인 후(또는 결제 없는 신청은 저장 즉시) 발송
-- ----------------------------------------------------------------------------
create or replace function public.trg_notify_order_received() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- 결제가 필요한 신청은 PAYMENT_PENDING 으로 저장되므로 여기서는 보내지 않음(결제 확인 후 UPDATE 에서 발송).
    -- 패키지 차감 신청은 BEFORE INSERT 트리거(consume_package_on_application)가 MATCHING_PENDING 으로 바꿔 저장함.
    if coalesce(new.status, 'PAYMENT_PENDING') not in ('PAYMENT_PENDING', 'CANCELLED') then
      perform public.notify_booking_status_webhook('ORDER_RECEIVED', null, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'PAYMENT_PENDING' and new.status = 'MATCHING_PENDING' then
      perform public.notify_booking_status_webhook('ORDER_RECEIVED', null, new.id);
    end if;
  end if;
  return new;
end $$;

revoke all on function public.trg_notify_order_received() from public, anon, authenticated;

drop trigger if exists service_applications_notify_order_received on public.service_applications;
create trigger service_applications_notify_order_received
  after insert or update of status on public.service_applications
  for each row execute function public.trg_notify_order_received();


-- ----------------------------------------------------------------------------
-- 2) 결제하지 않고 떠난 신청서 정리 — 가상계좌가 없고 24시간 지난 PAYMENT_PENDING → CANCELLED
--    (가상계좌가 발급된 건은 입금 기한 기준으로 기존 cancel_expired_virtual_accounts() 가 처리)
-- ----------------------------------------------------------------------------
create or replace function public.cancel_abandoned_unpaid_applications()
returns setof public.service_applications
language sql security definer set search_path = public as $$
  update public.service_applications a
     set status = 'CANCELLED'
   where a.status = 'PAYMENT_PENDING'
     and a.created_at < now() - interval '24 hours'
     and not exists (
       select 1 from public.virtual_accounts v where v.application_id = a.id
     )
  returning a.*;
$$;

revoke all on function public.cancel_abandoned_unpaid_applications() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'cancel-abandoned-unpaid-applications';
select cron.schedule(
  'cancel-abandoned-unpaid-applications',
  '15 * * * *', -- 매시 15분
  $$select public.cancel_abandoned_unpaid_applications();$$
);

notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- [미리 보기] 정리 작업이 처음 돌 때 CANCELLED 로 바뀔 건 (읽기만 함 — 위 내용을 실행하기 전에 따로 실행해 확인)
-- ----------------------------------------------------------------------------
-- select a.id, a.created_at, a.status, a.payment_status, a.user_contact
--   from public.service_applications a
--  where a.status = 'PAYMENT_PENDING'
--    and a.created_at < now() - interval '24 hours'
--    and not exists (select 1 from public.virtual_accounts v where v.application_id = a.id)
--  order by a.created_at desc;
