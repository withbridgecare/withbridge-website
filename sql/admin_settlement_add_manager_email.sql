-- ============================================================================
-- 매니저 정산(월별) 표에 매니저의 로그인 이메일(auth.users.email)을 함께 보여주기 위해
-- admin_manager_monthly_settlements() 의 반환 컬럼에 manager_email 을 추가합니다.
--
-- profiles/manager_applications 어디에도 이메일 컬럼이 없고, 이메일은 auth.users 에만
-- 있습니다 — auth 스키마는 PostgREST(클라이언트)에 노출돼 있지 않으므로, 이 저장소의
-- 기존 패턴(SECURITY DEFINER 함수 안에서 auth.users 를 직접 조회 — sql/manager_applications_v2.sql
-- my_application_managers(), sql/admin_manual_assignment.sql 등)을 그대로 따라 이 함수
-- 안에서 auth.users 를 left join 합니다.
--
-- 원본(현재 배포된 최신 버전): sql/admin_settlement_fixes_v4_restore_and_rpc.sql
-- 실행 순서: 그 파일 다음. Supabase 대시보드 → SQL Editor 에서 전체 실행.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlements(date);

create or replace function public.admin_manager_monthly_settlements(p_month date)
returns table (
  manager_id      uuid,
  manager_name    text,
  manager_email   text,
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
      nullif(btrim(u.email), '')                                   as manager_email,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(distinct c.id)::bigint                as completed_count,
      coalesce(sum(c.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(c.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(c.manager_payout), 0)
        - floor(coalesce(sum(c.manager_payout), 0) * 0.033))::bigint as net_payout
    from completed_rows c
    left join public.profiles p on p.id = c.manager_id
    left join auth.users u      on u.id = c.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = c.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    group by c.manager_id, p.name, p.phone, u.email, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;

notify pgrst, 'reload schema';
