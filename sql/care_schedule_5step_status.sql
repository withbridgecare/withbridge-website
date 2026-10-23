-- ============================================================================
-- care_schedule_5step_status.sql
-- 매니저 현장 인증 흐름을 실제 5클릭(출발 (이동 중)→병원 도착→진료/대행 완료→귀가 이동→케어 완료)으로
-- 복원하기 위해, care_schedules.status 에 'treatment_done'·'returning' 두 값을 추가합니다.
--
-- 지금까지는 '진료/대행 완료'·'귀가 이동'이 care_checkpoints 테이블에만 기록되고(참고용 체크포인트일 뿐,
-- 실제 status 전환이 아님) 매니저는 '병원 도착' 다음 곧바로 '케어 완료'(status='completed')로 넘어갔습니다.
-- 이 스크립트 이후에는 두 단계도 실제 care_schedules.status 값이 되어, 어드민 콘솔(admin.js)·보호자
-- 마이페이지(mypage.html)의 Realtime 구독이 다른 상태 변경과 똑같은 방식으로 즉시 반영합니다.
--
-- 이미 sql/supabase_schema_latest.sql 에도 같은 변경이 반영돼 있습니다 — 전체 스키마를 처음부터 다시
-- 돌리는 대신, 이미 배포된 DB에 이 두 상태만 빠르게 추가하고 싶을 때 이 파일만 실행하면 됩니다(완전히
-- 멱등적이라 몇 번을 다시 실행해도 안전합니다).
-- ============================================================================

-- 1) CHECK 제약 확장: 기존 5개(pending/assigned/departed/arrived/completed) → 7개
alter table public.care_schedules drop constraint if exists care_schedules_status_check;
alter table public.care_schedules add constraint care_schedules_status_check
  check (status in ('pending', 'assigned', 'departed', 'arrived', 'treatment_done', 'returning', 'completed'));

-- 2) 상태 진행 순서 강제 트리거: 중간 단계를 건너뛰거나 되돌릴 수 없도록 전이 규칙을 7단계로 확장
create or replace function public.enforce_care_status_flow() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'        and new.status = 'assigned')
            or (old.status = 'assigned'       and new.status = 'departed')
            or (old.status = 'departed'       and new.status = 'arrived')
            or (old.status = 'arrived'        and new.status = 'treatment_done')
            or (old.status = 'treatment_done' and new.status = 'returning')
            or (old.status = 'returning'      and new.status = 'completed')) then
      raise exception 'invalid status transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists care_schedules_status_flow on public.care_schedules;
create trigger care_schedules_status_flow before update on public.care_schedules
  for each row execute function public.enforce_care_status_flow();

-- 참고: advance_care_status(schedule_id, status) RPC 는 이미 status 값을 화이트리스트로 검증하지 않고
-- 트리거(enforce_care_status_flow)에만 맡기므로 별도 수정이 필요 없습니다. record_care_verification()
-- RPC(출발/병원 도착 전용, GPS·사진을 departed_*/arrived_* 전용 컬럼에 저장)도 'treatment_done'·'returning'
-- 에는 쓰이지 않습니다 — 그 두 단계의 GPS/사진 증빙은 기존 care_checkpoints 테이블(step='treatment_complete'
-- /'return_departure', supabase-care-checkpoints.sql)에 그대로 남기고, 상태 전환만 advance_care_status() 로
-- 분리해서 처리합니다(mypage-manager.html performAdvance 참고) — care_schedules 에 새 컬럼을 추가하지
-- 않기 위한 선택입니다.

select pg_notify('pgrst', 'reload schema'); -- PostgREST 스키마 캐시 즉시 갱신(제약/트리거는 캐시 대상이 아니지만, 습관적으로 함께 알립니다)
