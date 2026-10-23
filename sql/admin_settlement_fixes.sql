-- ============================================================================
-- 관리자 정산(매니저 월별) 대시보드 버그 수정 2건
--
--   1) "이름 미등록" 표시 — admin_manager_monthly_settlements() 가 지금까지 매니저 이름을
--      public.profiles.name 에서만 가져왔는데, 이 컬럼은 카카오 로그인 메타데이터가 있을 때만
--      handle_new_user() 트리거가 채우고(sql/supabase_schema_latest.sql), 매니저 승인 절차
--      (approve_manager_application(), sql/manager_applications.sql·manager_applications_v2.sql)는
--      profiles.name/phone 을 전혀 건드리지 않습니다. 실제 매니저 이름/연락처는 매니저가 지원서에
--      직접 적은 manager_applications(status='approved') 에만 있습니다 — admin.js 의
--      fetchActiveManagersWithNames() 가 '활동 중인 매니저' 목록에서 이미 이 보강 조회로 같은 문제를
--      해결해 둔 패턴을 그대로 가져와, profiles.name 이 비어 있으면 승인된 지원서의 이름/연락처로
--      대체합니다.
--
--   2) 완료 건수/금액 불일치 — RPC 자체는 처음부터 completed_at 을 'Asia/Seoul' 기준으로 월 경계를
--      나눠 올바르게 집계하고 있었습니다(변경 없음). 실제 원인은 mypage-manager.html 쪽에 있었습니다 —
--      "이번 달 완료 건수/예상 정산 금액" 카드가 completed_at 을 브라우저의 로컬 시간대 getter
--      (new Date().getFullYear()/getMonth())로 비교하고 있어, KST 가 아닌 기기(또는 서버 환경)에서는
--      월 경계 부근 완료 건이 하루 어긋나 다른 달로 집계될 수 있었습니다 — 이 파일은 그 JS 버그를
--      mypage-manager.html 에서 함께 고칩니다(SQL 변경 없음, 참고용 설명입니다).
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) →
--             sql/manager_applications.sql · manager_applications_v2.sql(manager_applications 테이블) →
--             sql/manager_settlement_70_30.sql(이 함수의 원본) → 이 파일.
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
    select
      cs.manager_id,
      -- profiles.name/phone 이 비어 있으면(매니저 승인 절차가 이 컬럼을 채우지 않아 흔한 경우)
      -- 승인된 지원서(manager_applications)의 이름/연락처로 대체합니다(admin.js
      -- fetchActiveManagersWithNames() 와 같은 보강 순서: profiles 우선, 지원서는 보조).
      coalesce(nullif(btrim(p.name), ''), ma.name, '이름 미등록')  as manager_name,
      coalesce(nullif(btrim(p.phone), ''), ma.phone, '-')         as manager_phone,
      count(*)::bigint                             as completed_count,
      coalesce(sum(cs.manager_payout), 0)::bigint  as payout_subtotal,
      floor(coalesce(sum(cs.manager_payout), 0) * 0.033)::bigint as withholding_tax,
      (coalesce(sum(cs.manager_payout), 0)
        - floor(coalesce(sum(cs.manager_payout), 0) * 0.033))::bigint as net_payout
    from public.care_schedules cs
    left join public.profiles p on p.id = cs.manager_id
    left join lateral (
      select a.name, a.phone
        from public.manager_applications a
       where a.user_id = cs.manager_id and a.status = 'approved'
       order by a.reviewed_at desc nulls last
       limit 1
    ) ma on true
    where cs.status = 'completed'
      and cs.manager_id is not null
      and cs.completed_at is not null
      and date_trunc('month', cs.completed_at at time zone 'Asia/Seoul')
        = date_trunc('month', p_month::timestamp)
    group by cs.manager_id, p.name, p.phone, ma.name, ma.phone
    order by payout_subtotal desc;
end $$;

revoke all on function public.admin_manager_monthly_settlements(date) from public, anon;
grant  execute on function public.admin_manager_monthly_settlements(date) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
