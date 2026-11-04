-- ============================================================================
-- Supabase 보안 어드바이저(Security Advisor) 경고 2건 해결
--   1) public.users — RLS가 꺼져 있음 (RLS Disabled in Public)
--   2) public.guardian_care_reports — SECURITY DEFINER 뷰 (Security Definer View)
--
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 그대로 실행하세요. 여러 번 실행해도 안전합니다
-- (멱등). 두 섹션은 서로 독립적이라 한쪽만 실행해도 됩니다.
-- ============================================================================


-- ============================================================================
-- 1) public.users — RLS 활성화 + 본인 행만 조회/수정
--
--   이 저장소의 어떤 SQL 마이그레이션 파일에도 public.users 테이블을 만드는 구문이 없습니다 — 이
--   프로젝트는 실제 사용자 데이터를 public.profiles 에 저장합니다(auth.users 와 1:1). public.users 는
--   Supabase 기본 "User Management" 템플릿이 초기에 만들어 두고 이후 profiles 로 옮겨가며 남은 레거시
--   테이블이거나, 대시보드에서 별도로 만든 테이블일 가능성이 높습니다 — 정확한 컬럼 구성을 코드만으로는
--   알 수 없으므로, 아래 블록은 실제 테이블/컬럼 존재 여부를 스스로 확인한 뒤 가장 안전한 조치를 합니다:
--     - 테이블이 없으면: 아무 것도 하지 않고 안내만 남깁니다(에러 없이 조용히 건너뜀).
--     - 테이블이 있으면: RLS 를 무조건 켭니다 — 이것만으로도 advisor 경고 자체는 해결됩니다(정책이
--       하나도 없으면 기본적으로 "모든 접근 차단"이라는 가장 안전한 상태가 되기 때문입니다).
--     - 그 위에 id 컬럼(가장 흔한 패턴: id uuid references auth.users) 또는 user_id 컬럼 중 실제로
--       존재하는 쪽을 찾아 "본인 행만 select" 정책을 자동으로 만듭니다.
--     - update 정책은 role/is_admin/permissions 처럼 "권한"을 뜻할 법한 컬럼이 테이블에 보이면 일부러
--       만들지 않습니다 — 그런 컬럼이 있는데 본인이 자기 행을 자유롭게 update 할 수 있게 열면, 사용자가
--       자기 role 을 'admin' 으로 바꾸는 등 권한 상승에 악용될 수 있기 때문입니다(이 프로젝트가 profiles
--       테이블에 protect_admin_role 트리거까지 따로 둔 이유와 같은 우려 — sql/protect_admin_role.sql
--       참고). 그런 컬럼이 없을 때만 본인 행 update 정책도 함께 만듭니다.
--
--   실행 후 RAISE NOTICE/WARNING 메시지가 Supabase SQL Editor 하단 "Results"/"Messages" 탭에
--   출력되니, 어떤 정책이 만들어졌는지(혹은 왜 못 만들었는지) 거기서 확인하세요.
-- ============================================================================
do $$
declare
  v_has_table    boolean;
  v_has_id       boolean;
  v_has_userid   boolean;
  v_has_priv_col boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) into v_has_table;

  if not v_has_table then
    raise notice '[security_advisor_fixes] public.users 테이블이 존재하지 않습니다 — 이 블록은 건너뜁니다.';
    return;
  end if;

  execute 'alter table public.users enable row level security';
  execute 'revoke all on public.users from anon';
  raise notice '[security_advisor_fixes] public.users: RLS를 켜고 anon 권한을 회수했습니다.';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'id'
  ) into v_has_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'user_id'
  ) into v_has_userid;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name in ('role', 'is_admin', 'permissions', 'admin')
  ) into v_has_priv_col;

  if v_has_id then
    execute 'drop policy if exists users_select_own on public.users';
    execute 'create policy users_select_own on public.users for select to authenticated using (id = auth.uid())';
    raise notice '[security_advisor_fixes] public.users: id = auth.uid() 기준 본인 행 select 정책을 만들었습니다.';

    if v_has_priv_col then
      raise warning '[security_advisor_fixes] public.users 에 role/is_admin/permissions 로 보이는 컬럼이 있어 '
        'update 정책은 만들지 않았습니다(본인이 자기 행을 자유롭게 고칠 수 있게 열면 권한 상승에 악용될 '
        '수 있습니다). 어떤 컬럼이 실제 권한 컬럼인지 확인한 뒤, 그 컬럼은 제외하고 update 정책을 다시 '
        '요청해 주세요.';
    else
      execute 'drop policy if exists users_update_own on public.users';
      execute 'create policy users_update_own on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid())';
      raise notice '[security_advisor_fixes] public.users: id = auth.uid() 기준 본인 행 update 정책을 만들었습니다.';
    end if;

  elsif v_has_userid then
    execute 'drop policy if exists users_select_own on public.users';
    execute 'create policy users_select_own on public.users for select to authenticated using (user_id = auth.uid())';
    raise notice '[security_advisor_fixes] public.users: user_id = auth.uid() 기준 본인 행 select 정책을 만들었습니다.';

    if v_has_priv_col then
      raise warning '[security_advisor_fixes] public.users 에 role/is_admin/permissions 로 보이는 컬럼이 있어 '
        'update 정책은 만들지 않았습니다. 실제 권한 컬럼을 확인한 뒤 다시 요청해 주세요.';
    else
      execute 'drop policy if exists users_update_own on public.users';
      execute 'create policy users_update_own on public.users for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
      raise notice '[security_advisor_fixes] public.users: user_id = auth.uid() 기준 본인 행 update 정책을 만들었습니다.';
    end if;

  else
    raise warning '[security_advisor_fixes] public.users 에 id/user_id 로 보이는 컬럼이 없어 "본인 행" 판별 '
      '정책을 자동으로 만들 수 없습니다. RLS는 이미 켜졌고 정책이 없으므로 지금은 모든 접근이 차단된 '
      '안전한 상태입니다 — Table Editor에서 실제 컬럼 구성과 용도를 확인한 뒤 알려주시면 맞는 정책으로 '
      '다시 작성해 드리겠습니다.';
  end if;
end $$;


-- ============================================================================
-- 2) public.guardian_care_reports — SECURITY DEFINER(뷰 소유자 권한 실행) → SECURITY INVOKER 전환
--
--   뷰 자체는 "SECURITY DEFINER" 라는 키워드로 만들어진 게 아닙니다 — 뷰는 함수와 달리 그런 문법이
--   없고, 대신 PostgreSQL은 기본적으로 모든 뷰를 "뷰 소유자(대개 postgres/supabase_admin)의 권한으로"
--   실행합니다. 이게 사실상 SECURITY DEFINER 함수와 똑같은 효과를 내서(RLS를 소유자 권한으로 우회)
--   Supabase 어드바이저가 "Security Definer View" 로 분류해 경고합니다. 이 효과를 끄려면(= 조회하는
--   사용자 본인 권한으로 실행되게 하려면) PostgreSQL 15+ 의 security_invoker 뷰 옵션을 켜야 합니다.
--
--   ⚠ 이 뷰를 그냥 security_invoker = true 로만 바꾸면 보호자 쪽 기능이 깨집니다 — 왜냐하면:
--     - public.care_reports 의 RLS 정책(care_reports_select_own, sql/supabase_schema_latest.sql)은
--       "manager_id = auth.uid()" 만 허용합니다. 지금까지 보호자가 이 뷰를 통해 리포트를 볼 수 있었던
--       건 뷰가 "소유자 권한"으로 돌면서 이 RLS를 우회하고, 대신 뷰의 WHERE 절(is_my_care_schedule_id())
--       이 보호자 본인 것만 걸러주고 있었기 때문입니다. security_invoker 로 바꾸면 이제 RLS가 실제로
--       적용되는데, 보호자용 select 정책이 care_reports 에는 아예 없으므로 보호자가 보는 모든 리포트가
--       0건이 되어 버립니다.
--     - 뷰가 LEFT JOIN 하는 public.profiles 도 마찬가지로 "id = auth.uid()" 만 허용해서, 보호자가 담당
--       매니저(자기 자신이 아닌 다른 사람)의 이름을 조회할 권한이 없습니다 — security_invoker 전환 시
--       manager_name 컬럼만 조용히 비어 보이는 부분 회귀가 생깁니다.
--
--   그래서 이 섹션은 세 가지를 함께 합니다:
--     (a) care_reports 에 "내 케어 일정에 속한 리포트" 보호자용 select 정책을 추가합니다 — 뷰의 WHERE
--         절과 똑같은 판별 함수(is_my_care_schedule_id)를 그대로 재사용해 기준을 어긋나지 않게 합니다.
--     (b) profiles 테이블 자체에는 새 정책을 추가하지 않습니다 — 그러면 보호자가 담당 매니저의 phone 등
--         name 외 다른 컬럼까지 테이블을 직접 조회해 볼 수 있게 되는 의도치 않은 부작용이 생기므로,
--         대신 "이름 한 줄"만 돌려주는 좁은 SECURITY DEFINER 함수(manager_name_for_schedule)를 새로
--         만들어 뷰의 LEFT JOIN profiles 를 대체합니다 — 노출 범위를 꼭 필요한 값 하나로 좁힙니다.
--     (c) 뷰를 create or replace 로 다시 정의하면서 security_invoker = true 를 추가합니다.
--
--   선행 조건: sql/supabase_schema_latest.sql (is_my_care_schedule_id(), care_reports, care_schedules,
--   profiles, 그리고 기존 guardian_care_reports 뷰)이 이미 적용되어 있어야 합니다.
-- ============================================================================

-- (a) 보호자용 care_reports select 정책 — 뷰의 WHERE 절과 동일한 기준(is_my_care_schedule_id)
drop policy if exists care_reports_select_guardian on public.care_reports;
create policy care_reports_select_guardian on public.care_reports
  for select to authenticated using (public.is_my_care_schedule_id(schedule_id));

-- (b) 매니저 이름만 돌려주는 좁은 헬퍼 — 뷰의 LEFT JOIN profiles 를 대체
create or replace function public.manager_name_for_schedule(p_schedule_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select p.name
  from public.care_schedules s
  join public.profiles p on p.id = s.manager_id
  where s.id = p_schedule_id
$$;
revoke all on function public.manager_name_for_schedule(uuid) from public, anon;
grant  execute on function public.manager_name_for_schedule(uuid) to authenticated;

-- (c) 뷰 재정의 — 기존 컬럼 순서/이름은 그대로 유지(create or replace view 제약)하고, manager_name 값만
--     LEFT JOIN profiles 대신 위 함수 호출로 바꾸고, security_invoker = true 를 추가합니다.
create or replace view public.guardian_care_reports
with (security_barrier = true, security_invoker = true) as
select
  r.id                                    as report_id,
  r.schedule_id                           as schedule_id,
  r.created_at                            as submitted_at,
  r.physician_notes                       as physician_notes,
  r.senior_condition                      as senior_condition,
  s.senior_name                           as senior_name,
  s.origin                                as origin,
  s.destination                           as destination,
  s.scheduled_at                          as scheduled_at,
  s.completed_at                          as completed_at,
  public.manager_name_for_schedule(s.id)  as manager_name,
  r.read_at                               as read_at,
  s.application_id                        as application_id,
  r.condition_tags                        as condition_tags,
  r.photos                                as photos,
  r.next_visit_date                       as next_visit_date
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
where public.is_my_care_schedule_id(s.id);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
