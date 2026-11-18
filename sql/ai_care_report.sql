-- ============================================================================
-- ai_care_report : AI 케어 리포트(초안 생성) 기능을 위한 care_reports 확장
--
--   mypage-manager.html '케어 리포트 작성' 모달(#reportModal)에 추가한 기능 — 매니저가 케어 대상
--   유형(어르신/아동)과 빠른 선택 태그 · 핵심 메모만 입력하면, Edge Function(generate-care-report)이
--   OpenAI/Gemini 경량 모델로 보호자에게 보낼 정중한 리포트 초안을 만들어 주고, 매니저가 그 초안을
--   직접 수정한 뒤 제출합니다. 다섯 컬럼을 추가합니다.
--     1) care_type     text  — 'senior'(어르신 케어) | 'child'(아동 케어). 톤·빠른 선택 태그 구성을
--        결정하는 값으로, 과거 리포트는 모두 어르신 병원 동행이었으므로 기본값 'senior'로 채웁니다.
--     2) quick_tags     jsonb — 매니저가 고른 빠른 선택 태그 배열(예: ["진료 완료","안전 귀가"]).
--        기존 condition_tags(어르신 컨디션·보행 상태 전용)와는 다른 목적이라 컬럼을 분리했습니다.
--     3) manager_memo   text  — 매니저가 입력한 한두 줄 현장 메모. AI 초안 생성의 입력(사실 그 자체)이자,
--        리포트 보기 화면에서도 '핵심 메모'로 그대로 보여줍니다.
--     4) ai_message     text  — AI가 만든 초안을 매니저가 다듬은 최종본. 보호자 화면(mypage.html)이
--        이 컬럼이 있으면 이걸 리포트 본문으로 우선 보여주고, 없으면(과거 리포트) physician_notes로
--        대체합니다 — care_reports 는 한 schedule 당 한 행뿐이라(schedule_id unique) 새 UI로 작성한
--        리포트와 기존 병원 동행 상세 리포트를 같은 테이블/뷰로 함께 다룹니다.
--     5) ai_generated_at timestamptz — AI 초안을 실제로 생성해 본 적이 있는지(감사/통계용, nullable).
--
--   physician_notes 는 원래 not null 이었지만, 아동 케어 리포트에는 '진료 소견'이 존재하지 않으므로
--   이번에 not null 을 풉니다(senior_condition 이 sql/care_report_rich_fields.sql 에서 이미 같은 이유로
--   풀렸습니다) — ai_message 만으로도 리포트가 완성될 수 있게 합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   같은 내용을 sql/supabase_schema_latest.sql 의 "4) care_reports"/"5) ... guardian_care_reports"
--   절에도 반영해 뒀으니, 스키마를 처음부터 새로 적용하는 환경이라면 이 파일을 따로 실행하지 않아도 됩니다.
--   alter ... add column if not exists / create or replace 는 모두 멱등이라 여러 번 실행해도 안전합니다.
--   선행 조건: sql/supabase_schema_latest.sql, sql/care_report_rich_fields.sql 이 이미 적용돼 있어야 합니다.
-- ============================================================================

alter table public.care_reports alter column physician_notes drop not null;

alter table public.care_reports add column if not exists care_type text not null default 'senior';
alter table public.care_reports drop constraint if exists care_reports_care_type_check;
alter table public.care_reports add constraint care_reports_care_type_check check (care_type in ('senior', 'child'));

alter table public.care_reports add column if not exists quick_tags       jsonb not null default '[]'::jsonb;
alter table public.care_reports add column if not exists manager_memo     text;
alter table public.care_reports add column if not exists ai_message       text;
alter table public.care_reports add column if not exists ai_generated_at  timestamptz;

-- 뷰 전체를 다시 정의합니다 — 기존 컬럼은 그대로 두고 끝에 다섯 컬럼만 추가(컬럼 순서를 바꾸면
-- "cannot change name of view column" 으로 실패하므로 반드시 기존 순서를 유지해야 합니다).
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
  s.application_id   as application_id,
  r.condition_tags    as condition_tags,
  r.photos            as photos,
  r.next_visit_date   as next_visit_date,
  r.care_type          as care_type,
  r.quick_tags         as quick_tags,
  r.manager_memo        as manager_memo,
  r.ai_message          as ai_message
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule_id(s.id);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

-- care_reports 테이블 권한은 sql/care_reports_grant_fix.sql 이 이미 매니저 본인 select/insert 로
-- 맞춰 뒀고, 컬럼을 추가해도(테이블 단위 grant라) 그대로 적용되므로 다시 손댈 필요가 없습니다.
-- RLS 정책(manager_id = auth.uid())도 컬럼과 무관하게 동일하게 적용됩니다.

notify pgrst, 'reload schema';
