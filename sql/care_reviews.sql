-- ============================================================================
-- care_reviews : 보호자가 케어 리포트 모달에서 남기는 만족도 평가(별점 1~5 + 선택 리뷰)
--
--   mypage.html 의 '만족도 평가' 패널(careReportViewRatePanel)은 지금까지 세션 한정(새로고침하면
--   초기화)으로만 동작했습니다 — 이 테이블이 그 백엔드입니다. care_schedules 에 rating/review 컬럼을
--   바로 추가하지 않고 별도 테이블로 분리한 이유: care_schedules 는 지금 매니저만 UPDATE 할 수 있고
--   (care_schedules_update_own, manager_id = auth.uid()) 보호자용 UPDATE 정책이 전혀 없습니다 — 보호자가
--   평가를 쓸 수 있게 하려고 거기에 새 UPDATE 정책을 추가하면, 그 정책이 의도와 달리 payment_amount 같은
--   다른 컬럼까지 보호자가 바꿀 수 있는 문을 여는 위험이 있습니다. care_reports(매니저가 쓰는 리포트)와
--   똑같은 패턴으로 완전히 분리된 테이블 + 좁게 스코프된 RLS 정책을 쓰는 쪽이 안전합니다.
--
--   조회 측 연동:
--     - 관리자: admin_manager_monthly_settlement_details() RPC(sql/admin_settlement_detail_rpc.sql)에
--       rating/review_text 를 추가해, 매니저 정산 상세 모달에서 바로 보입니다.
--     - 매니저: mypage-manager.html 이 care_schedules 를 읽을 때 PostgREST 리소스 임베딩으로
--       care_reviews(rating, review_text) 를 함께 받습니다(schedule_id 가 UNIQUE FK라 1:1로 임베딩됨).
-- ============================================================================

create table if not exists public.care_reviews (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references public.care_schedules(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  review_text text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.care_reviews enable row level security;

drop policy if exists care_reviews_select on public.care_reviews;
drop policy if exists care_reviews_insert_own on public.care_reviews;
drop policy if exists care_reviews_update_own on public.care_reviews;

-- 조회: (1) 이 케어의 보호자 본인, (2) 담당 매니저, (3) 관리자 — 셋 중 하나면 볼 수 있습니다.
create policy care_reviews_select on public.care_reviews
  for select to authenticated using (
    public.is_my_care_schedule_id(schedule_id)
    or exists (select 1 from public.care_schedules s where s.id = schedule_id and s.manager_id = auth.uid())
    or public.is_admin()
  );

-- 작성: 이 케어의 보호자 본인만, 그리고 그 케어가 'completed' 로 끝난 뒤에만 (케어 완료 전에 미리
-- 평가를 남길 수 없게 — mypage.html 카드 흐름상 리포트 모달 자체가 완료 후에만 열리지만, DB 단에서도
-- 한 번 더 막아 둡니다).
create policy care_reviews_insert_own on public.care_reviews
  for insert to authenticated with check (
    public.is_my_care_schedule_id(schedule_id)
    and exists (select 1 from public.care_schedules s where s.id = schedule_id and s.status = 'completed')
  );

-- 수정: 이 케어의 보호자 본인만 자신이 남긴 평가를 고칠 수 있습니다(별점을 잘못 눌렀을 때 재제출 등).
create policy care_reviews_update_own on public.care_reviews
  for update to authenticated using (public.is_my_care_schedule_id(schedule_id))
  with check (public.is_my_care_schedule_id(schedule_id));

revoke all on public.care_reviews from public, anon;
grant select, insert, update on public.care_reviews to authenticated;
-- delete 는 의도적으로 안 엽니다 — 평가를 지우고 싶으면(드묾) 관리자가 직접 처리합니다.

create index if not exists care_reviews_schedule_id_idx on public.care_reviews(schedule_id);


-- ============================================================================
-- admin_manager_monthly_settlement_details() 에 rating/review_text 추가 — 매니저 정산 상세 모달에서
-- "이 케어, 보호자가 몇 점을 줬는지"를 바로 볼 수 있게 합니다. WHERE 조건은 손대지 않습니다(완료 건수/
-- 금액 집계 기준에는 영향 없음) — SELECT 목록에 care_reviews 좌측 조인만 추가합니다.
-- ============================================================================

drop function if exists public.admin_manager_monthly_settlement_details(date, uuid);

create or replace function public.admin_manager_monthly_settlement_details(p_month date, p_manager_id uuid)
returns table (
  schedule_id    uuid,
  service_type   text,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  payment_amount bigint,
  manager_payout bigint,
  rating         smallint,
  review_text    text
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
      coalesce(cs.manager_payout, 0)::bigint,
      cr.rating,
      cr.review_text
    from public.care_schedules cs
    left join public.service_applications sa on sa.id = cs.application_id
    left join public.care_reviews cr on cr.schedule_id = cs.id
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
