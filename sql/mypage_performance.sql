-- ============================================================================
-- 마이페이지(보호자) 조회 속도 개선 — 인덱스 추가 + RLS 정책 식 최적화
-- ============================================================================
-- 배경 (2026-11-20 측정): 서버 왕복 자체는 약 0.03초인데, 마이페이지의 DB 조회(신청·쿠폰·패키지·
-- 어르신·리포트 등)는 하나당 0.42~0.94초 걸렸습니다. 원인 두 가지:
--   1) 마이페이지가 거르는 열(user_id, guardian_id 등)에 인덱스가 없어 매번 테이블 전체를 훑음
--   2) RLS 정책 식의 auth.uid() / my_verified_email() / is_admin() 이 '행마다' 다시 실행됨
--      (my_verified_email() 은 실행될 때마다 auth.users 를 조회합니다)
--      → Supabase 공식 권장대로 (select auth.uid()) 형태로 감싸면 '조회당 한 번'만 실행됩니다.
--        결과(누가 무엇을 볼 수 있는지)는 똑같고 속도만 바뀝니다.
--        https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 실행 방법 (Supabase → SQL Editor, 운영 DB):
--   STEP 0  지금 상태 확인 (조회만)              — 선택
--   STEP 1  인덱스 추가                            — 결과·권한에 영향 없음, 바로 실행해도 안전
--   STEP 2  정책 변경 미리보기 (조회만)            — 무엇이 어떻게 바뀌는지 표로 확인
--   STEP 3  정책 변경 적용                          — 바꾸기 전 원래 식을 백업 테이블에 저장
--   STEP 4  되돌리기                                — 문제가 있을 때만
-- 각 STEP 을 하나씩 블록 선택 후 실행하세요. 여러 번 실행해도 안전합니다(이미 바뀐 정책은 건너뜀).
-- ============================================================================


-- ============================================================================
-- STEP 0. 지금 상태 확인 (조회만)
-- ============================================================================
-- 0-a) 대상 테이블의 인덱스
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('service_applications', 'care_schedules', 'care_reports', 'care_checkpoints',
                    'user_coupons', 'user_packages', 'seniors', 'profiles', 'managers', 'care_reviews')
order by tablename, indexname;

-- 0-b) 대상 테이블의 행 수 (클수록 이번 개선 효과가 큼)
select relname as tablename, n_live_tup as approx_rows
from pg_stat_user_tables
where schemaname = 'public'
  and relname in ('service_applications', 'care_schedules', 'care_reports', 'care_checkpoints',
                  'user_coupons', 'user_packages', 'seniors', 'profiles', 'managers', 'care_reviews')
order by n_live_tup desc;


-- ============================================================================
-- STEP 1. 인덱스 추가 — 조회 결과와 권한에는 영향이 없고 속도만 빨라집니다.
-- ============================================================================
-- 행이 수천 건 이하라 일반 create index 로 충분합니다(잠깐의 쓰기 잠금, 보통 1초 미만).
-- 같은 열에 이미 다른 이름의 인덱스가 있으면(STEP 0-a 결과) 그 줄은 빼고 실행해도 됩니다.

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

-- 통계 갱신 (새 인덱스를 바로 쓰도록)
analyze public.service_applications, public.care_schedules, public.care_reports,
        public.user_coupons, public.seniors;


-- ============================================================================
-- STEP 2. 정책 변경 미리보기 (조회만 — 아무것도 바꾸지 않습니다)
-- ============================================================================
-- 정책 식 안의 auth.uid() / my_verified_email() / is_admin() 만 (SELECT ...) 로 감쌉니다.
-- 이미 감싸져 있는 것("SELECT auth.uid() AS uid")은 건드리지 않습니다.
-- 결과 표의 qual → new_qual, with_check → new_with_check 를 비교해 보세요.
-- 결과가 0줄이면 바꿀 정책이 없다는 뜻입니다(STEP 3 불필요).
create or replace function pg_temp.wb_wrap_rls_calls(expr text) returns text
language sql immutable as $$
  select regexp_replace(
    expr,
    '(?<!SELECT )\m(auth\.uid|(?:public\.)?my_verified_email|(?:public\.)?is_admin)\(\)',
    '(SELECT \1())',
    'g')
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


-- ============================================================================
-- STEP 3. 정책 변경 적용 — 한 트랜잭션으로 실행(하나라도 실패하면 전부 취소)
-- ============================================================================
-- 바꾸기 전 원래 식을 public.rls_policy_backup 에 저장합니다(STEP 4 되돌리기용).
-- 정책 이름·대상 역할·명령(select/insert…)은 그대로이고 식만 바뀝니다.
begin;

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
  raise notice '[mypage_performance] 정책 % 개를 최적화했습니다.', v_count;
end $$;

commit;

notify pgrst, 'reload schema';


-- ============================================================================
-- STEP 4. 되돌리기 — 문제가 있을 때만 실행
-- ============================================================================
-- STEP 3 이 바꾼 정책을 백업해 둔 원래 식으로 되돌립니다(정책마다 가장 처음 백업한 식 사용).
-- 인덱스(STEP 1)는 결과에 영향이 없어 되돌릴 필요가 없습니다.
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
