-- ============================================================================
-- service_applications.status 4종 표준화
--   PAYMENT_PENDING   : 신청서 작성 완료, 결제/입금 대기 (매니저에게 비노출)
--   MATCHING_PENDING  : 결제 완료(또는 가상계좌 입금 확인 완료), 매니저 배정 신청 대기
--   MATCHED           : 매니저 배정 완료
--   CANCELLED         : 결제 취소 / 미입금 만료 / 사용자 취소
--
--   지금까지 PENDING_PAYMENT / WAITING_MATCHING(sql/reservations_virtual_accounts.sql) 이름을 썼고,
--   그 전에는 'pending' 등 느슨한 동의어로 기본값이 들어가 있었습니다. 이 스크립트는
--     1) 기존 행을 위 4종 값으로 백필
--     2) 신규 신청 기본값 / 결제 확인 함수들이 새 이름을 쓰도록 재정의
--     3) 관리자가 PAYMENT_PENDING 건을 수동으로 입금 확인 처리하는 RPC 추가
--   를 합니다. 전부 update/create or replace 기반이라 여러 번 실행해도 안전합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → ... → sql/reservations_virtual_accounts.sql → 이 파일.
--   실행 후에는 supabase/functions/issue-virtual-account, supabase/functions/portone-webhook 이
--   호출하는 리터럴도 PAYMENT_PENDING / MATCHING_PENDING 으로 함께 바뀌어 있어야 합니다(이번 커밋에서 같이 수정).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 기존 행 백필 (대소문자/구버전 이름 → 표준 4종)
-- ----------------------------------------------------------------------------
update public.service_applications
   set status = 'PAYMENT_PENDING'
 where lower(btrim(coalesce(status, ''))) = 'pending_payment';

update public.service_applications
   set status = 'MATCHING_PENDING'
 where lower(btrim(coalesce(status, ''))) = 'waiting_matching';

-- 결제 개념이 생기기 전(가상계좌 도입 전)에 쌓인 '접수 대기' 동의어 값들은 전부 입금 없이 접수된
-- 건이므로, 매칭 가능한 'MATCHING_PENDING'으로 승격합니다(PENDING_PAYMENT 로 되돌리지 않음).
update public.service_applications
   set status = 'MATCHING_PENDING'
 where manager_id is null
   and status is distinct from 'PAYMENT_PENDING'
   and status is distinct from 'CANCELLED'
   and (
     lower(btrim(coalesce(status, ''))) in ('', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested')
     or status ~ '접수|대기|신청'
   );

-- 취소류 동의어 전부 'CANCELLED' 로 통일
update public.service_applications
   set status = 'CANCELLED'
 where lower(btrim(coalesce(status, ''))) in ('cancelled', 'canceled', 'cancel')
    or status ~ '취소';

-- 매니저가 이미 배정됐는데 과거 소문자 'matched' 로 남아 있는 행만 표준 대문자로 통일
-- (departed/arrived/completed/guardian_confirmed 등 그 이후 진행 단계 값은 care_schedules 진행 상태
--  미러링이므로 건드리지 않습니다 — 이 표준화는 결제/매칭 단계 4종에 대한 것입니다)
update public.service_applications
   set status = 'MATCHED'
 where manager_id is not null
   and lower(btrim(coalesce(status, ''))) = 'matched';


-- ----------------------------------------------------------------------------
-- 2) 신규 신청 기본값
-- ----------------------------------------------------------------------------
alter table public.service_applications alter column status set default 'PAYMENT_PENDING';


-- ----------------------------------------------------------------------------
-- 3) 매니저 "접수 대기" 판정 함수 — 표준 이름 'matching_pending' 추가(기존 느슨한 동의어는
--    구버전 데이터 호환을 위해 유지). PAYMENT_PENDING/CANCELLED 는 계속 false 입니다.
-- ----------------------------------------------------------------------------
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in
      ('matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' then true
    else false
  end
$$;

-- ----------------------------------------------------------------------------
-- 4) 가상계좌 입금 확인(웹훅/서버) 시 전환하는 상태값 이름을 표준으로 교체
-- ----------------------------------------------------------------------------
create or replace function public.confirm_virtual_account_payment(p_virtual_account_id uuid)
returns public.virtual_accounts
language plpgsql security definer set search_path = public as $$
declare
  v_row public.virtual_accounts;
begin
  update public.virtual_accounts
     set is_paid = true
   where id = p_virtual_account_id
     and is_paid = false
     and expired_at > now()
  returning * into v_row;

  if not found then
    raise exception 'VIRTUAL_ACCOUNT_UNAVAILABLE' using errcode = 'P0002';
  end if;

  update public.service_applications
     set status = 'MATCHING_PENDING'
   where id = v_row.application_id
     and status = 'PAYMENT_PENDING';

  return v_row;
end $$;

revoke all on function public.confirm_virtual_account_payment(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) 관리자 수동 입금 확인 — admin_confirm_manual_payment() 정의는
--    sql/payment_confirmation_functions.sql 로 옮겼습니다(결제 관련 함수들을 한 파일에 모아 두려고요).
--    "Could not find the function in the schema cache" 오류가 나면 이 파일이 아니라 그 파일을
--    Supabase SQL Editor 에서 실행하세요.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
