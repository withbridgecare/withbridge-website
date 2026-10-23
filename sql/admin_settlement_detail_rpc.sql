-- ============================================================================
-- 어드민 콘솔 '매니저 정산 (월별)' — 매니저 행 [상세보기] 시, 그 달에 집계된 완료 건을
-- 하나씩 펼쳐서 보여주기 위한 상세 내역 RPC.
--
--   admin_manager_monthly_settlements() 의 completed_rows CTE(sql/admin_settlement_fixes_v3.sql)
--   와 완전히 똑같은 WHERE 조건(status='completed', manager_id, completed_at not null, 월 비교,
--   취소/환불 신청서 제외)에 manager_id 필터만 추가한 것이라, 이 함수가 돌려주는 행들의
--   manager_payout 합계는 항상 요약 행의 payout_subtotal과 정확히 같습니다 — 요약 숫자가
--   "왜" 이렇게 나왔는지 건별로 검증할 수 있게 하는 목적이므로, 조건이 한 글자라도 달라지면
--   합계가 안 맞아 보이는 원인이 되니 두 함수의 WHERE 절은 항상 같이 수정하세요.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlement_details(date, uuid);

create or replace function public.admin_manager_monthly_settlement_details(p_month date, p_manager_id uuid)
returns table (
  schedule_id    uuid,
  service_type   text,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  payment_amount bigint,
  manager_payout bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;
  if p_manager_id is null then
    raise exception 'MANAGER_REQUIRED' using errcode = '22004';
  end if;

  return query
    select
      cs.id,
      sa.service_type,
      cs.scheduled_at,
      cs.completed_at,
      coalesce(cs.payment_amount, 0)::bigint,
      coalesce(cs.manager_payout, 0)::bigint
    from public.care_schedules cs
    left join public.service_applications sa on sa.id = cs.application_id
   where cs.status = 'completed'
     and cs.manager_id = p_manager_id
     and cs.completed_at is not null
     and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
       = date_trunc('month', p_month::timestamp)
     and not exists (
       select 1 from public.service_applications x
        where x.id = cs.application_id
          and (x.status in ('CANCELLED', 'EXPIRED_CANCELLED') or x.payment_status = 'REFUNDED')
     )
   order by cs.completed_at desc;
end $$;

revoke all on function public.admin_manager_monthly_settlement_details(date, uuid) from public, anon;
grant  execute on function public.admin_manager_monthly_settlement_details(date, uuid) to authenticated;

notify pgrst, 'reload schema';
