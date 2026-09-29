-- ============================================================================
-- 테스트용: 9월 25일 케어 리포트(care_reports)가 이미 제출된 일정(care_schedules)을 자동으로 찾아,
-- 그 schedule_id 로 현장 수행 5단계(care_checkpoints)를 강제로 생성/삽입합니다.
-- mypage.html 케어 리포트 모달을 열었을 때 '(미기록)' 대신 아래 5개 시각이 뜨는지 확인하기 위한 용도입니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-care-checkpoints.sql 이 이미 적용되어 있어야 합니다 — care_checkpoints 테이블 필요)
--
-- ▶ 대상 스케줄 찾는 법: care_reports 와 join 해서 "리포트가 실제로 제출된" 일정 중, scheduled_at 이
--   (한국시간 기준) 월-일 = 09-25 인 것을 최신순으로 1건 선택합니다. 연도를 고정하지 않으므로
--   2025-09-25 / 2026-09-25 어느 쪽이든 화면에 띄워둔 그 리포트를 그대로 찾습니다.
-- ▶ step 문자열(departure/hospital_arrival/treatment_complete/return_departure/return_complete)은
--   mypage.html 의 REPORT_TIMELINE_STEPS 와 반드시 같아야 합니다.
-- ============================================================================

with target as (
  select
    s.id         as schedule_id,
    coalesce(s.manager_id, r.manager_id) as manager_id,
    (s.scheduled_at at time zone 'Asia/Seoul')::date as care_date
  from public.care_reports r
  join public.care_schedules s on s.id = r.schedule_id
  where to_char(s.scheduled_at at time zone 'Asia/Seoul', 'MM-DD') = '09-25'
  order by s.scheduled_at desc
  limit 1
),
steps as (
  select * from (values
    ('departure',           time '16:00'),
    ('hospital_arrival',    time '16:30'),
    ('treatment_complete',  time '17:19'),
    ('return_departure',    time '17:40'),
    ('return_complete',     time '18:00')
  ) as s(step, tm)
)
insert into public.care_checkpoints (schedule_id, manager_id, step, checkpoint_at)
select
  t.schedule_id,
  t.manager_id,
  st.step,
  (t.care_date + st.tm) at time zone 'Asia/Seoul'
from target t
cross join steps st;

-- ★ 확인용 (SQL Editor) ------------------------------------------------------
--   방금 어떤 스케줄에 삽입됐는지:
--     select r.schedule_id, s.senior_name, s.scheduled_at
--     from public.care_reports r join public.care_schedules s on s.id = r.schedule_id
--     where to_char(s.scheduled_at at time zone 'Asia/Seoul', 'MM-DD') = '09-25'
--     order by s.scheduled_at desc limit 1;
--
--   삽입된 5단계 값(step 별 최신값, mypage.html 이 읽는 방식과 동일):
--     select distinct on (step) step, checkpoint_at at time zone 'Asia/Seoul' as checkpoint_at_kst
--     from public.care_checkpoints
--     where schedule_id = (
--       select r.schedule_id from public.care_reports r
--       join public.care_schedules s on s.id = r.schedule_id
--       where to_char(s.scheduled_at at time zone 'Asia/Seoul', 'MM-DD') = '09-25'
--       order by s.scheduled_at desc limit 1
--     )
--     order by step, checkpoint_at desc;
