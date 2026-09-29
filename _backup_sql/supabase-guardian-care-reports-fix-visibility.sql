-- ============================================================================
-- guardian_care_reports 뷰 접근 권한 보완 (application_id 경로로도 '내 것' 인정)
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-fix-status-sync.sql, supabase-guardian-care-reports-application-id.sql
--  이 먼저 실행되어 있다고 가정합니다. CREATE OR REPLACE 로만 작성되어 여러 번 실행해도 안전합니다)
--
-- ▶ 증상: mypage.html 폴링·렌더링을 다 고쳐도 '진행 중인 신청' 카드가 계속 "리포트 작성 중"에 멈춰 있고,
--   브라우저 콘솔의 'Fetched Reports:' 로그 자체가 null 이거나 빈 배열([])로 찍힘 — 즉 JS 매칭 문제가
--   아니라 Supabase 쿼리 응답 자체에 그 리포트 행이 아예 없는 상태.
--
-- ▶ 원인: guardian_care_reports 뷰는 그 리포트가 '내 것'인지를 오직 is_my_care_schedule(guardian_id,
--   guardian_email) 하나로만 판단합니다 —
--     (A) care_schedules.guardian_id = auth.uid()  또는
--     (B) care_schedules.guardian_email = 내 인증된 이메일
--   웹 신청서를 매니저가 수락(accept_service_application())할 때 guardian_id 는
--     "(select p.id from public.profiles p where p.id = v_app.user_id)"
--   로 채워지는데, 그 시점에 profiles 행이 아직 없는 계정(예: 트리거 지연·소셜 로그인 초기 가입 등)이면
--   이 서브쿼리가 NULL 을 반환해 guardian_id 가 비어 버립니다. guardian_email 도 신청 당시 auth.users.email
--   이 비어 있거나 인증(email_confirmed_at)되지 않았으면 함께 비어, (A)(B) 둘 다 실패 → 뷰가 그 보호자에게
--   0건으로 보입니다.
--
--   같은 문제를 care_schedules 테이블 자체는 이미 한 번 겪었고, 그 때는 아래처럼 "신청서(application_id)를
--   거쳐 내가 낸 신청인지"를 추가로 확인하는 정책을 더해 고쳤습니다(supabase-fix-status-sync.sql):
--     care_schedules_select_guardian_via_application:
--       exists (select 1 from service_applications a where a.id = care_schedules.application_id and a.user_id = auth.uid())
--   그런데 guardian_care_reports 뷰는 이 application_id 경로를 전혀 안 보고 있었던 게 이번 버그의 진짜 원인입니다
--   — '내 신청 목록'과 '내 일정(care_schedules)'은 보이는데 '그 일정의 리포트'만 안 보이는 것도 이 때문입니다.
--
-- ▶ 수정: is_my_care_schedule(uuid, text) 함수 자체는 다른 곳(mark_care_report_read 등)에서도 쓰이므로
--   시그니처를 건드리지 않고, application_id 경로까지 포함한 새 헬퍼 is_my_care_schedule_id(schedule_id)
--   를 추가해 뷰와 mark_care_report_read() 가 이걸 쓰도록 바꿉니다.
-- ============================================================================

-- 1) 스케줄 id 하나로 '내 것'인지 판단하는 새 헬퍼 (guardian_id/email 경로 + application_id 경로 모두 확인) ---
create or replace function public.is_my_care_schedule_id(p_schedule_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() is not null and exists (
      select 1 from public.care_schedules s
      where s.id = p_schedule_id
        and (
          public.is_my_care_schedule(s.guardian_id, s.guardian_email)
          or exists (
            select 1 from public.service_applications a
            where a.id = s.application_id and a.user_id = auth.uid()
          )
        )
    ),
    false
  )
$$;
-- ★ 뷰 안에서 이 함수를 부를 때는 뷰 소유자가 아니라 '뷰를 조회하는 로그인 사용자' 권한으로 EXECUTE 가
--   검사됩니다(is_my_care_schedule() 때도 같은 이유로 supabase-fix-is-my-care-schedule-grant.sql 이 필요했음) —
--   그래서 여기서도 authenticated(+ anon, 안전하게 항상 false 로 평가됨)에게 미리 열어 둡니다.
revoke all on function public.is_my_care_schedule_id(uuid) from public, anon;
grant  execute on function public.is_my_care_schedule_id(uuid) to authenticated, anon;

-- 2) guardian_care_reports 뷰가 새 헬퍼를 쓰도록 교체 (컬럼 구성은 그대로, WHERE 절만 바뀜) --------------
create or replace view public.guardian_care_reports
with (security_barrier = true) as
select
  r.id               as report_id,
  r.schedule_id      as schedule_id,
  r.created_at       as submitted_at,
  r.physician_notes  as physician_notes,
  r.senior_condition as senior_condition,
  s.senior_name      as senior_name,
  s.origin           as origin,
  s.destination      as destination,
  s.scheduled_at     as scheduled_at,
  s.completed_at     as completed_at,
  p.name             as manager_name,
  r.read_at          as read_at,
  s.application_id   as application_id
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule_id(s.id);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

-- 3) mark_care_report_read() 도 같은 기준으로 넓힘 (application_id 로만 연결된 건은 '읽음' 처리가 막혀
--    있었을 것이므로) --------------------------------------------------------------------------------
create or replace function public.mark_care_report_read(p_schedule_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.is_my_care_schedule_id(p_schedule_id) then
    raise exception 'NOT_YOUR_SCHEDULE' using errcode = '42501';
  end if;

  update public.care_reports set read_at = now()
  where schedule_id = p_schedule_id and read_at is null;
end $$;

revoke all on function public.mark_care_report_read(uuid) from public, anon;
grant  execute on function public.mark_care_report_read(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor) — 관리자 권한(SQL Editor)에서는 RLS 를 우회하므로 원본 테이블을 직접 볼 수 있습니다 ---
--   1) 이 함수·뷰가 실제로 갱신됐는지:
--        select proname from pg_proc where proname = 'is_my_care_schedule_id' and pronamespace = 'public'::regnamespace;
--        select column_name, ordinal_position from information_schema.columns
--        where table_schema = 'public' and table_name = 'guardian_care_reports' order by ordinal_position;
--
--   2) ★ 실제로 안 보이던 그 리포트를 찾아서, 왜 guardian_id/email 경로가 실패했는지 직접 확인:
--        select r.id as report_id, r.schedule_id, s.application_id, s.guardian_id, s.guardian_email,
--               a.id as app_id, a.user_id as app_user_id
--        from public.care_reports r
--        join public.care_schedules s on s.id = r.schedule_id
--        left join public.service_applications a on a.id = s.application_id
--        order by r.created_at desc
--        limit 20;
--      → guardian_id 가 비어 있거나 로그인 계정과 다르고, guardian_email 도 비어 있거나 다르다면 바로 이번
--        버그의 그 케이스입니다. app_user_id 가 로그인한 보호자 계정과 같아야(= application_id 경로로 구제됨)
--        이 파일 실행 후 정상적으로 보입니다.
--
--   3) 보호자 계정 세션에서 (SQL Editor 가 아니라 실제 로그인한 브라우저에서) 아래를 콘솔에 붙여넣어 직접 테스트:
--        await window.WBAuth.client.rpc('is_my_care_schedule_id', { p_schedule_id: '<위 schedule_id>' })
--      → { data: true } 가 나와야 정상입니다.
