-- ============================================================================
-- 매니저(287ae61a-c3d9-428d-a9d9-46782aba65ce)의 9월·10월 수행 완료 11건을
-- 일괄 CANCELLED 처리에서 되돌립니다. 결제가 테스트(무결제)였어도 매니저가
-- 실제로 수행을 끝낸 건이므로 completed 로 복원합니다.
--
-- ※ 9245bfc8-7bd2-49cb-8a1d-4c838694ef7e 1건은 취소 전 금액을 기록해두지 못해
--   같은 서비스 유형(시니어 병원 동행) 형제 건들의 패턴에 맞춰 44,000원/30,800원으로
--   추정 복원합니다 — 실제 금액을 알고 있다면 이 UPDATE 줄의 숫자만 바꿔서 실행하세요.
-- ============================================================================

alter table public.care_schedules disable trigger care_schedules_status_flow;

update public.care_schedules set status='completed', payment_amount=44000, manager_payout=30800 where id='9245bfc8-7bd2-49cb-8a1d-4c838694ef7e'; -- 추정값(위 주석 참고)
update public.care_schedules set status='completed', payment_amount=50000, manager_payout=35000 where id='c7b8d631-3420-4fe7-863a-f80b68f4dd62';
update public.care_schedules set status='completed', payment_amount=46000, manager_payout=32200 where id='ae800e58-a514-444c-b372-3e6953987a44';
update public.care_schedules set status='completed', payment_amount=46000, manager_payout=32200 where id='6aaee5cf-64e8-4b07-adfd-a30d67a8426f';
update public.care_schedules set status='completed', payment_amount=54000, manager_payout=37800 where id='4ff796dd-ec89-4a20-8401-36f3440a28cb';
update public.care_schedules set status='completed', payment_amount=54000, manager_payout=37800 where id='13140d60-00f6-41cd-a37e-ae654859f9a1';
update public.care_schedules set status='completed', payment_amount=64000, manager_payout=44800 where id='f6a1e627-60b8-41a3-bc0b-e6082c9738b2';
update public.care_schedules set status='completed', payment_amount=44000, manager_payout=30800 where id='5b2ee4e8-4223-485a-867b-8e262526491b';
update public.care_schedules set status='completed', payment_amount=44000, manager_payout=30800 where id='fc2ae19e-767a-4792-91a0-7f9ea0a884db';
update public.care_schedules set status='completed', payment_amount=36000, manager_payout=25200 where id='88db757b-cec1-4fdf-8e77-cb0a94b98c6b';
update public.care_schedules set status='completed', payment_amount=44000, manager_payout=30800 where id='b359de01-ba6f-4740-92f3-2c1ffcec6347';

alter table public.care_schedules enable trigger care_schedules_status_flow;

-- service_applications 쪽도 취소 이전 상태로 되돌립니다(10건은 completed, 1건은
-- 완료 전 단계였던 guardian_confirmed 그대로).
update public.service_applications set status='completed' where id in (
  '1e9bc7ec-1fdd-4a65-b005-03e4f828e244','15816768-4c4d-4b93-855f-756fa1b90d2f',
  'facbfc9a-5efc-4f20-844b-e531c0182ae9','7b7d57a7-24cb-4840-9318-36c159e99f57',
  'b54f1e4d-1f7b-4f49-9e0c-00dc68f7e28b','3b43712b-2696-44d0-ae9f-e5b815da7fe2',
  'd403ce59-3906-4a38-b182-e399ab2b0214','803bc208-9963-4a77-9fcb-3a5d6bf7beea',
  '91577056-1e84-4297-a3cd-bcea97a951b3','5059aca3-7ae4-478f-9560-5b9f29b6d843'
);
update public.service_applications set status='guardian_confirmed' where id = '933656a2-304e-4cbf-a2ed-66aff8236ba6';

-- ============================================================================
-- 어드민 정산 RPC를 "완료 상태면 결제 여부와 무관하게 집계, 단 취소/환불 신청서만
-- 제외"하는 올바른 버전(sql/admin_settlement_fixes_v3.sql)으로 교체합니다.
-- 지금 배포돼 있는 버전은 이 제외 로직이 없는 더 오래된/다른 버전입니다.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_phone   text,
  completed_count bigint,
  payout_subtotal bigint,
  withholding_tax bigint,
  net_payout      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'MONTH_REQUIRED' using errcode = '22004';
  end if;

  return query
    with completed_rows as (
      select cs.id, cs.manager_id, cs.manager_payout
        from public.care_schedules cs
       where cs.status = 'completed'
         and cs.manager_id is not null
         and cs.completed_at is not null
         and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
           = date_trunc('month', p_month::timestamp)
         and not exists (
           select 1 from public.service_applications sa
            where sa.id = cs.application_id
              and (sa.status in ('CANCELLED', 'EXPIRED_CANCELLED') or sa.payment_status = 'REFUNDED')
         )
    )
    select
      c.manager_id,
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(distinct c.id)::bigint                as completed_count,
      coalesce(sum(c.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(c.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(c.manager_payout), 0)
        - floor(coalesce(sum(c.manager_payout), 0) * 0.033))::bigint as net_payout
    from completed_rows c
    left join public.profiles p on p.id = c.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = c.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    group by c.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;

notify pgrst, 'reload schema';
