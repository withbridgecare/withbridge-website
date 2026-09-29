-- ============================================================================
-- 케어 리포트 '읽음' 추적 (상단 '케어 현황' 완충 상태 지원)
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql 이 먼저 실행되어 있다고 가정합니다 — care_reports 테이블 /
--  guardian_care_reports view 를 그 파일이 만듭니다. 이 파일은 CREATE OR REPLACE / IF NOT EXISTS 로만
--  작성되어 있어 여러 번 실행해도 안전합니다)
--
-- ▶ 배경: 매니저가 '케어 완료'를 누르면 mypage.html 상단 '케어 현황'에서 그 카드가 바로 사라지던 문제를
--   고치기 위해, 완료된 케어를 '리포트를 확인하기 전까지'(또는 완료 후 24시간까지) 상단에 완충 상태로
--   붙잡아 두도록 프론트를 바꿨습니다(mypage.html 의 careReportBuffer() 참고). 이 완충 판단에 필요한
--   '리포트를 보호자가 읽었는지'는 지금까지 DB 어디에도 없던 정보라, 이 파일이 추가합니다.
--
-- ▶ 이 파일이 하는 일
--   1) care_reports 에 read_at(보호자가 리포트를 연 시각) 컬럼 추가
--   2) guardian_care_reports view 에 read_at 노출 (schedule_id 는 원래도 있었지만 mypage.html 이 이제야
--      select 하기 시작했을 뿐입니다 — 이 view 자체는 안 바뀌어도 되지만, read_at 을 더하려면 다시 만들어야 합니다)
--   3) mark_care_report_read(): 보호자가 리포트를 열 때 호출하는 함수. care_reports 에는 보호자용 UPDATE
--      권한이 전혀 없으므로(care_reports_select_own/insert_own 둘 다 manager_id = auth.uid() 로만 제한),
--      SECURITY DEFINER 로 '내 케어 일정의 리포트인지'(is_my_care_schedule, 이미 5번에서 정의됨)를 확인한 뒤
--      본인 것일 때만 read_at 을 채웁니다.
-- ============================================================================

-- 1) 읽음 시각 컬럼 추가 --------------------------------------------------------
alter table public.care_reports add column if not exists read_at timestamptz;

-- 2) guardian_care_reports view 에 read_at 노출 ---------------------------------
--    ★ 주의: PostgreSQL 의 CREATE OR REPLACE VIEW 는 "이미 있는 뷰"의 기존 컬럼 이름·순서를 절대 바꿀 수
--    없고, 새 컬럼은 반드시 맨 끝에만 추가할 수 있습니다(중간에 끼워 넣으면 "cannot change name of view
--    column ..." 에러로 실행 자체가 실패합니다). 그래서 read_at 을 supabase-manager-schema.sql 5번이 만든
--    원래 컬럼 순서(report_id, schedule_id, submitted_at, physician_notes, senior_condition, senior_name,
--    origin, destination, scheduled_at, completed_at, manager_name) 그대로 두고 맨 끝에 덧붙입니다.
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
  p.name             as manager_name,         -- 담당 매니저 이름만 (연락처·정산 정보 없음)
  r.read_at          as read_at                -- 새 컬럼은 반드시 맨 끝에
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule(s.guardian_id, s.guardian_email);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

-- 3) 보호자가 리포트를 열 때 '읽음' 처리 (care_reports 에 UPDATE 권한이 없어 SECURITY DEFINER 필요) --------
create or replace function public.mark_care_report_read(p_schedule_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_guardian_id    uuid;
  v_guardian_email text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select guardian_id, guardian_email into v_guardian_id, v_guardian_email
  from public.care_schedules where id = p_schedule_id;

  if not found or not public.is_my_care_schedule(v_guardian_id, v_guardian_email) then
    raise exception 'NOT_YOUR_SCHEDULE' using errcode = '42501';
  end if;

  update public.care_reports set read_at = now()
  where schedule_id = p_schedule_id and read_at is null;
end $$;

revoke all on function public.mark_care_report_read(uuid) from public, anon;
grant  execute on function public.mark_care_report_read(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   1) 이 파일이 이번에 실제로 (에러 없이) 끝까지 실행됐는지부터 확인하세요 — 위 2)번 view 구문에서
--      "cannot change name of view column ..." 에러가 났다면 그 아래 3)번 RPC 도 만들어지지 않았을 수 있습니다.
--   2) 컬럼 추가됐는지:
--        select column_name from information_schema.columns
--        where table_schema = 'public' and table_name = 'care_reports' and column_name = 'read_at';
--   3) view 에도 read_at 이 보이는지 (맨 끝 컬럼이어야 정상):
--        select column_name, ordinal_position from information_schema.columns
--        where table_schema = 'public' and table_name = 'guardian_care_reports' order by ordinal_position;
--   4) RPC 등록됐는지:
--        select proname from pg_proc
--        where proname = 'mark_care_report_read' and pronamespace = 'public'::regnamespace;
--   5) ★ 요청 1번(schedule_id 매칭 점검): 매니저가 제출한 리포트가 실제로 존재하고, 그 일정의
--      guardian_id/guardian_email 이 채워져 있는지 확인합니다 — 이게 비어 있거나 보호자 계정과 다르면
--      view 가 정상 작동해도(is_my_care_schedule() 조건 때문에) 그 보호자에게는 0건으로 보입니다.
--      대시보드 SQL Editor 는 관리자 권한으로 실행되어 RLS 를 우회하므로 원본 테이블을 직접 볼 수 있습니다:
--        select r.id as report_id, r.schedule_id, r.created_at, r.read_at,
--               s.guardian_id, s.guardian_email, s.senior_name, s.status
--        from public.care_reports r
--        join public.care_schedules s on s.id = r.schedule_id
--        order by r.created_at desc
--        limit 20;
--      → guardian_id 와 guardian_email 이 둘 다 비어 있거나, 보호자가 로그인한 계정과 다른 이메일이면
--        supabase-fix-guardian-visibility.sql 을 참고해 그 일정을 올바른 보호자 계정에 연결해야 합니다.
--   6) 보호자 계정으로 로그인한 세션(anon key + 로그인)에서 rpc 호출을 테스트하세요 — SQL Editor 는 auth.uid() 가
--      없어 NOT_AUTHENTICATED 만 돌려줍니다.
