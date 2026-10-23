-- ============================================================================
-- manager_duty_status.sql
-- 매니저 마이페이지(mypage-manager.html)에 '출근하기(근무 가능)/휴식하기' 수동 토글을 추가하면서,
--   1) 관리자 콘솔(admin.html/admin.js)이 "최근 활동" 기준으로 매니저를 보여줄 수 있도록
--      managers.last_active_at 을 추가하고 (activity_status 가 바뀔 때마다 트리거가 자동으로 채웁니다),
--   2) 진행 중이거나 배정 완료된 동행 예약이 있는 매니저가 '휴식'으로 전환하는 것을
--      DB 레벨에서도 막습니다(클라이언트 쪽 사전 확인(hasActiveSchedule())을 우회해도 이 트리거가
--      최종 방어선입니다).
--
-- managers.activity_status('online'/'break') 컬럼 자체는 이미 sql/supabase_schema_latest.sql 에
-- 있던 컬럼이라 새로 만들지 않습니다 — 지금까지는 이 컬럼을 바꾸는 화면 컨트롤이 없었을 뿐입니다.
--
-- 이미 sql/supabase_schema_latest.sql 에도 같은 변경이 반영돼 있습니다 — 전체 스키마를 처음부터
-- 다시 돌리는 대신, 이미 배포된 DB에 이 변경만 빠르게 추가하고 싶을 때 이 파일만 실행하면 됩니다
-- (전부 멱등적이라 몇 번을 다시 실행해도 안전합니다).
-- ============================================================================

-- 1) 최근 활동일시 — activity_status 가 바뀔 때마다(출근/휴식 전환) 아래 트리거가 자동으로 채웁니다.
alter table public.managers add column if not exists last_active_at timestamptz;

-- 2) 휴식 전환 가드 + last_active_at 자동 갱신
--    '진행 중'이거나 '배정 완료'된 예약(= care_schedules.status 가 completed 가 아니면서 이미 배정된
--    상태) 이 하나라도 있으면 activity_status 를 'break' 로 바꾸는 UPDATE 자체를 막습니다.
create or replace function public.enforce_manager_break_guard() returns trigger
language plpgsql as $$
begin
  if new.activity_status = 'break' and old.activity_status is distinct from new.activity_status then
    if exists (
      select 1 from public.care_schedules cs
      where cs.manager_id = new.id
        and cs.status in ('assigned', 'departed', 'arrived', 'treatment_done', 'returning')
    ) then
      raise exception '현재 진행 중인 동행 예약 건이 있습니다. 일정을 완료한 후 상태를 변경해 주세요.';
    end if;
  end if;
  if new.activity_status is distinct from old.activity_status then
    new.last_active_at := now();
  end if;
  return new;
end $$;

drop trigger if exists managers_break_guard on public.managers;
create trigger managers_break_guard before update on public.managers
  for each row execute function public.enforce_manager_break_guard();

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
select pg_notify('pgrst', 'reload schema');
