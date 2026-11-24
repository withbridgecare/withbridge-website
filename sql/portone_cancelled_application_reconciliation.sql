-- PortOne에서 최종 결제 상태가 CANCELLED로 확인된 신청 건을 DB에 반영합니다.
--
-- 결제 완료 웹훅이 먼저 처리되어 신청서가 MATCHING_PENDING/PAID가 된 뒤 전체 취소 웹훅이 도착하면,
-- 기존 cancel_unpaid_application()은 PAYMENT_PENDING만 바꾸므로 DB가 PAID로 남을 수 있습니다.
-- 이 RPC는 Edge Function이 PortOne API에서 현재 상태 CANCELLED를 확인한 뒤에만 호출합니다.
--
-- 적용 대상:
--   1) PAYMENT_PENDING: 결제 전 취소로 신청 상태만 CANCELLED로 전환
--   2) 아직 매니저가 배정되지 않은 PAID 신청: 실제 전체 취소를 확인하고 CANCELLED/REFUNDED 반영
--
-- 이미 매니저가 배정된 건이나 그 외 상태는 자동 변경하지 않습니다. 해당 건은 운영자가 대조해야 합니다.

create or replace function public.reconcile_portone_cancelled_application(p_application_id uuid)
returns public.service_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.service_applications;
begin
  select * into v_app
    from public.service_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_app.status = 'PAYMENT_PENDING' then
    update public.service_applications
       set status = 'CANCELLED'
     where id = p_application_id
    returning * into v_app;
    return v_app;
  end if;

  -- 전액 취소가 PortOne에서 확인됐고 매니저가 아직 배정되지 않은 신청만 자동 반영합니다.
  -- 기존에 사용자가 신청을 취소했더라도 결제 상태가 PAID로 남아 있으면 같은 기준으로 정리합니다.
  if v_app.manager_id is null
     and v_app.status in ('MATCHING_PENDING', 'CANCELLED', 'EXPIRED_CANCELLED')
     and v_app.payment_status in ('PAID', 'PARTIALLY_REFUNDED') then
    if coalesce(v_app.final_amount, 0) <= 0 then
      raise exception 'FINAL_AMOUNT_MISSING' using errcode = 'P0001';
    end if;

    update public.service_applications
       set status = 'CANCELLED',
           payment_status = 'REFUNDED',
           refund_amount = final_amount,
           refunded_at = coalesce(refunded_at, now())
     where id = p_application_id
    returning * into v_app;
  end if;

  return v_app;
end;
$$;

revoke all on function public.reconcile_portone_cancelled_application(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_portone_cancelled_application(uuid) to service_role;

notify pgrst, 'reload schema';
