-- ============================================================================
-- [운영 DB] 2026-11-20 릴리스 — 마이페이지(보호자) 조회 속도 개선
-- ============================================================================
-- 원본: sql/mypage_performance.sql (개발 DB 에서 먼저 실행해 확인함)
-- 실행 위치: 운영 Supabase 프로젝트 → SQL Editor → 이 파일 전체 붙여 넣고 Run
-- 코드 배포와 순서 상관없음 (화면 코드 변경 없이 DB 만 빨라집니다).
--
-- 하는 일
--   1) 인덱스 6개 추가 — 마이페이지가 거르는 열(user_id, guardian_id 등)을 매번 전체 훑지 않게
--   2) RLS 정책 식의 auth.uid() / my_verified_email() / is_admin() 을 (SELECT ...) 로 감싸기
--      → '행마다' 실행되던 함수가 '조회당 한 번'만 실행됩니다. 누가 무엇을 볼 수 있는지는 똑같습니다.
--      (Supabase 권장: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)
--      바꾸기 전 원래 식은 public.rls_policy_backup 에 저장됩니다(맨 아래 되돌리기용).
--
-- 여러 번 실행해도 안전합니다(이미 바뀐 정책·있는 인덱스는 건너뜀).
-- 하나라도 실패하면 전체가 취소됩니다(트랜잭션).
--
-- 실행 전 (권장): 맨 아래 [확인 A] 로 바뀔 정책 목록을 먼저 보세요.
-- 실행 후: [확인 B] 결과가 0줄이어야 합니다. 마이페이지·매니저 페이지·어드민 목록이 예전과 같은지 확인.
-- ============================================================================

begin;


-- 1) 인덱스 -----------------------------------------------------------------------
-- 내 신청 목록: user_id 로 조회 + RLS 의 이메일 경로(lower(btrim(applicant_email)) = my_verified_email())
create index if not exists service_applications_user_idx
  on public.service_applications (user_id, created_at desc);
create index if not exists service_applications_applicant_email_idx
  on public.service_applications (lower(btrim(applicant_email)))
  where applicant_email is not null;

-- 보호자 일정·추가 요금: guardian_id 로 조회 (care_schedules_select_guardian 정책도 같은 열)
create index if not exists care_schedules_guardian_idx
  on public.care_schedules (guardian_id);

-- 동행 리포트: 일정 → 리포트 연결 (guardian_care_reports 뷰의 join)
create index if not exists care_reports_schedule_idx
  on public.care_reports (schedule_id);

-- 쿠폰·어르신: user_id 로 조회
create index if not exists user_coupons_user_idx
  on public.user_coupons (user_id, issued_at desc);
create index if not exists seniors_user_idx
  on public.seniors (user_id);

analyze public.service_applications, public.care_schedules, public.care_reports,
        public.user_coupons, public.seniors;


-- 2) RLS 정책 식 최적화 ---------------------------------------------------------------
create or replace function pg_temp.wb_wrap_rls_calls(expr text) returns text
language sql immutable as $$
  select regexp_replace(
    expr,
    '(?<!SELECT )\m(auth\.uid|(?:public\.)?my_verified_email|(?:public\.)?is_admin)\(\)',
    '(SELECT \1())',
    'g')
$$;

-- 백업 테이블 — 화면(API)에서는 보이지 않게 RLS 를 켜고 정책을 두지 않습니다.
create table if not exists public.rls_policy_backup (
  id           bigserial primary key,
  backed_up_at timestamptz not null default now(),
  reason       text not null,
  tablename    text not null,
  policyname   text not null,
  qual         text,
  with_check   text
);
alter table public.rls_policy_backup enable row level security;
revoke all on public.rls_policy_backup from anon, authenticated;

do $$
declare
  r       record;
  v_qual  text;
  v_check text;
  v_count int := 0;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('service_applications', 'care_schedules', 'care_reports', 'care_checkpoints',
                        'user_coupons', 'user_packages', 'seniors', 'profiles', 'managers', 'care_reviews')
  loop
    v_qual  := pg_temp.wb_wrap_rls_calls(r.qual);
    v_check := pg_temp.wb_wrap_rls_calls(r.with_check);
    if v_qual is not distinct from r.qual and v_check is not distinct from r.with_check then
      continue;
    end if;

    insert into public.rls_policy_backup (reason, tablename, policyname, qual, with_check)
    values ('mypage_performance', r.tablename, r.policyname, r.qual, r.with_check);

    execute format('alter policy %I on public.%I %s %s',
      r.policyname, r.tablename,
      case when r.qual       is not null then format('using (%s)', v_qual)       else '' end,
      case when r.with_check is not null then format('with check (%s)', v_check) else '' end);
    v_count := v_count + 1;
  end loop;
  raise notice '[2026-11-20 mypage_performance] 정책 % 개를 최적화했습니다.', v_count;
end $$;

notify pgrst, 'reload schema';

commit;


-- ============================================================================
-- [확인 A] 실행 전: 바뀔 정책 미리보기 (조회만). 위 begin~commit 을 실행하기 전에 이 블록만 따로 실행하세요.
-- ============================================================================
/*
create or replace function pg_temp.wb_wrap_rls_calls(expr text) returns text
language sql immutable as $$
  select regexp_replace(expr,
    '(?<!SELECT )\m(auth\.uid|(?:public\.)?my_verified_email|(?:public\.)?is_admin)\(\)',
    '(SELECT \1())', 'g')
$$;
select tablename, policyname, cmd,
       qual,       pg_temp.wb_wrap_rls_calls(qual)       as new_qual,
       with_check, pg_temp.wb_wrap_rls_calls(with_check) as new_with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('service_applications', 'care_schedules', 'care_reports', 'care_checkpoints',
                    'user_coupons', 'user_packages', 'seniors', 'profiles', 'managers', 'care_reviews')
  and (pg_temp.wb_wrap_rls_calls(qual)       is distinct from qual
    or pg_temp.wb_wrap_rls_calls(with_check) is distinct from with_check)
order by tablename, policyname;
*/

-- ============================================================================
-- [확인 B] 실행 후: 감싸지 않은 호출이 남아 있으면 그 정책이 나옵니다 → 0줄이어야 정상
-- ============================================================================
/*
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('service_applications', 'care_schedules', 'care_reports', 'care_checkpoints',
                    'user_coupons', 'user_packages', 'seniors', 'profiles', 'managers', 'care_reviews')
  and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
      ~ '(?<!SELECT )\m(auth\.uid|(?:public\.)?my_verified_email|(?:public\.)?is_admin)\(\)';

-- 새 인덱스 6개가 보여야 합니다
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('service_applications_user_idx', 'service_applications_applicant_email_idx',
                    'care_schedules_guardian_idx', 'care_reports_schedule_idx',
                    'user_coupons_user_idx', 'seniors_user_idx');
*/

-- ============================================================================
-- [되돌리기] 문제가 있을 때만: 정책을 백업해 둔 원래 식으로 복구 (인덱스는 결과에 영향이 없어 그대로 둠)
-- ============================================================================
/*
begin;
do $$
declare
  r record;
begin
  for r in
    select distinct on (tablename, policyname) tablename, policyname, qual, with_check
    from public.rls_policy_backup
    where reason = 'mypage_performance'
    order by tablename, policyname, backed_up_at asc, id asc
  loop
    execute format('alter policy %I on public.%I %s %s',
      r.policyname, r.tablename,
      case when r.qual       is not null then format('using (%s)', r.qual)       else '' end,
      case when r.with_check is not null then format('with check (%s)', r.with_check) else '' end);
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';
*/
