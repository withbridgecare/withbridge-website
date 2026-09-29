-- ============================================================================
-- care_schedules ↔ service_applications status 동기화 : 백필 + 영구 트리거
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-fix-status-sync.sql 이 먼저 실행되어 있다고 가정합니다. 이 파일도 CREATE OR REPLACE /
--  DROP ... IF EXISTS 로만 작성되어 있어 여러 번 실행해도 안전합니다)
--
-- ▶ 배경: supabase-verify-status-sync.sql 의 4번 진단 쿼리로 확인한 결과, care_schedules.status 는
--   assigned/departed/arrived/completed 로 진행됐는데 연결된 service_applications.status 는 여전히
--   'matched' 에 머물러 있는 건(in_sync = false)이 8건 발견됐습니다. 원인은 advance_care_status /
--   record_care_verification RPC 를 거치지 않고 care_schedules.status 만 직접 update 된 이력(RPC 배포
--   이전 데이터, 또는 mypage-manager.html 의 RPC-없음 raw fallback 경로, PGRST202/42883)입니다.
--
--   mypage.html 의 resolveCareStep()/effectiveStatusInfo() 는 이미 care_schedules(a._schedule)와
--   service_applications(a.status) 두 값 중 더 진행된 쪽을 신뢰하도록 짜여 있어(2026-09-24 기준 코드
--   확인함), 화면 자체는 이 8건에서도 이미 정확한 단계("이동 중"/"병원 도착"/"케어 완료")를 보여주고
--   있었습니다 — 따라서 mypage.html 은 별도 수정이 필요 없습니다. 다만 service_applications.status 를
--   그대로 읽는 다른 화면/리포트/추출(예: 관리자용 CSV, 향후 대시보드)은 이 두 값 신뢰 로직이 없어
--   여전히 'matched' 로 잘못 보일 수 있으므로, DB 값 자체를 맞추는 이 파일이 근본적인 수정입니다.
--
-- ▶ 이 파일이 하는 일
--   1) 지금 어긋나 있는 기존 데이터를 한 번에 백필 (care_schedules.status 를 진실로 간주)
--   2) 앞으로는 care_schedules.status 가 "어떤 경로로" 바뀌든(RPC 경유든, 예전처럼 raw update
--      경유든) DB 트리거가 무조건 service_applications.status 에 같은 값을 미러링하도록 만들어,
--      클라이언트 코드 경로(RPC 배포 여부)에 더 이상 의존하지 않게 합니다. 이후로는
--      supabase-fix-status-sync.sql 의 advance_care_status/record_care_verification 안에 있는
--      "if v_row.application_id is not null then update service_applications ..." 미러링 줄은
--      트리거와 중복 동작하지만(같은 값을 두 번 쓰는 것뿐이라) 그대로 둬도 안전합니다.
-- ============================================================================


-- 1) 기존에 어긋난 데이터 일괄 백필 -------------------------------------------------
update public.service_applications a
set status = s.status
from public.care_schedules s
where s.application_id = a.id
  and s.status is distinct from a.status;


-- 2) 영구 동기화 트리거 --------------------------------------------------------------
create or replace function public.sync_application_status_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.application_id is not null and new.status is distinct from old.status then
    update public.service_applications
       set status = new.status
     where id = new.application_id
       and status is distinct from new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_application_status on public.care_schedules;
create trigger trg_sync_application_status
after update of status on public.care_schedules
for each row
execute function public.sync_application_status_from_schedule();

notify pgrst, 'reload schema';


-- ★ 확인용 (SQL Editor) --------------------------------------------------------------
--   백필 후 남은 불일치 건수 (0이어야 정상):
select count(*) as still_out_of_sync
from public.care_schedules s
join public.service_applications a on a.id = s.application_id
where s.status is distinct from a.status;

--   트리거가 실제로 등록됐는지:
--     select tgname from pg_trigger where tgname = 'trg_sync_application_status';
--   앞으로 매니저가 care_schedules.status 를 raw update 로만 바꿔도(RPC 없이) 자동 미러링되는지 확인하려면:
--     update public.care_schedules set status = status where id = '<schedule uuid>'; -- no-op 테스트
--     또는 실제로 상태를 한 단계 바꾼 뒤:
--       select id, status, application_id from public.care_schedules where id = '<schedule uuid>';
--       select id, status, schedule_id from public.service_applications where id = '<application uuid>';
--       (두 status 값이 서로 같아야 정상)
