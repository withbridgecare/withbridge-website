-- ============================================================================
-- admin_refund_button_legacy_payment_status_fix.sql
-- 어드민 '취소된 신청 내역' 카드에서 일부 취소 건(예: test3)에만 [환불 처리]/[PG 콘솔에서 이미
-- 환불함 (수동 확인)] 버튼이 안 보이던 문제를 고칩니다.
--
--   원인: admin.js renderCancelledApplicationRow() 가 버튼 노출 여부를 판단하는 isManualUnrefunded
--   조건이 payment_status === 'PAID' 를 정확히 요구했습니다. 그런데 payment_status 컬럼은
--   sql/matching_expiry_auto_refund.sql 도입 이전 데이터에는 백필되지 않고 영원히 null 로 남고
--   (그 파일 주석: "기존 행은 전부 null, 이 정책 도입 이전 데이터라 추적 안 함"), SQL Editor 로
--   직접 넣은 테스트 행(test3 등)도 final_amount(실제 결제 확정 금액)만 채우고 payment_status 는
--   비워 두기 쉽습니다. 실제로 PortOne을 호출하는 admin_apply_application_refund()(sql/
--   admin_application_refund_system.sql)는 애초에 payment_status 를 보지 않고 final_amount/
--   refund_amount 잔액만으로 판단하므로, 이 null 데이터에서도 "환불 처리" 자체는 原래 문제없이
--   동작했습니다 — 화면 쪽 조건만 그보다 더 엄격해서 버튼이 숨겨진 것입니다(admin.js 쪽은 이번
--   변경과 함께 수정됨).
--
--   이 파일은 그 화면 쪽 완화에 맞춰, [수동 확인] 버튼이 호출하는 admin_mark_refund_completed()도
--   느슨하게 맞춥니다 — 그렇지 않으면 화면엔 버튼이 보이는데 눌러도 WHERE 조건에 안 걸려 아무 것도
--   안 바뀌는(조용한 무동작) 채로 "완료" 토스트만 뜨는 불일치가 생깁니다.
--
--   v2(이 버전): 처음엔 "payment_status 가 'PAID' 거나 비어 있고 final_amount > 0"으로만 풀었는데,
--   그 뒤에도 test3/test4 같은 건에서 여전히 버튼이 안 보인다는 재보고가 있었습니다. payment_status
--   가 null/'PAID' 두 값만이 아니라 대소문자가 다르거나 전혀 다른 값(예: 수기 테스트 데이터의 오타·
--   다른 스펠링)으로 들어있을 가능성까지 고려해, 이제는 payment_status 문자열을 전혀 검사하지 않고
--   "REFUNDED 로 명시되지 않았고, final_amount − refund_amount(돌려줄 잔액)가 남아 있는가" 하나로만
--   판단합니다 — admin_apply_application_refund()(실제 PortOne 환불 RPC)가 원래부터 쓰던 기준과
--   동일합니다. admin.js 의 isManualUnrefunded 도 이번에 같은 기준으로 다시 맞췄습니다.
--
--   v3(이 버전): admin.js 쪽 재점검에서, status 가 정확히 'EXPIRED_CANCELLED'(표준 "48시간 자동취소"
--   값)인 test3/test4 같은 행이 여전히 버튼을 못 받는 걸 발견했습니다 — 화면 쪽 isManualUnrefunded가
--   "status='EXPIRED_CANCELLED' 면 cancel-expired-applications Edge Function이 이미 성공적으로
--   PortOne 환불까지 끝냈을 것"이라고 가정해 무조건 제외하고 있었는데, 그 가정은 실제 배치를 거치지
--   않고 SQL Editor 로 status 만 수기로 'EXPIRED_CANCELLED' 로 넣은 테스트 행에는 성립하지 않습니다.
--   이 파일의 두 RPC도 "status 가 정확히 'CANCELLED'/'EXPIRED_CANCELLED' 중 하나"라는 화이트리스트
--   대신, status 문자열에 'CANCEL'(대소문자 무관) 또는 '취소'가 포함되는지로 판단하도록 느슨하게
--   맞춥니다 — USER_CANCELLED/ADMIN_CANCELLED 같은 아직 안 쓰인 변형이 나중에 생겨도 버튼/RPC가
--   같은 기준으로 계속 맞물려 동작하도록 하기 위함입니다. 전액 환불을 실제로 PortOne에 요청하는
--   admin_apply_application_refund()(sql/admin_application_refund_system.sql)도 이번에 같은 기준으로
--   다시 정의합니다.
--
--   실행 순서: sql/matching_expiry_auto_refund.sql → sql/admin_application_refund_system.sql → 이 파일.
--   create or replace 기반이라 여러 번 실행해도 안전합니다(이 파일을 이미 한 번 실행했어도 다시
--   실행하면 가장 최신(v3) 조건으로 덮어써집니다).
-- ============================================================================

create or replace function public.admin_mark_refund_completed(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.service_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.service_applications
     set payment_status = 'REFUNDED',
         refunded_at = now()
   where id = p_application_id
     and upper(coalesce(payment_status, '')) is distinct from 'REFUNDED'
     and (coalesce(final_amount, 0) - coalesce(refund_amount, 0)) > 0
     and (status ilike '%cancel%' or status like '%취소%')
  returning * into v_app;

  if not found then
    select * into v_app from public.service_applications where id = p_application_id;
    if v_app.id is null then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- 이미 환불 완료 처리됐거나(멱등 재클릭), 애초에 환불 대상이 아닌 건(결제 전 취소/아직 미취소/
    -- final_amount 가 없는 건) — 전부 "지금 바꿀 게 없다"는 뜻이라 에러 대신 현재 행을 그대로 돌려줍니다.
    return v_app;
  end if;

  return v_app;
end $$;

revoke all on function public.admin_mark_refund_completed(uuid) from public, anon;
grant  execute on function public.admin_mark_refund_completed(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- admin_apply_application_refund() — [환불 처리] 모달이 PortOne 환불 성공 후 호출하는 RPC
-- (원래 정의: sql/admin_application_refund_system.sql). status 체크만 위와 같은 기준으로 완화하고,
-- 나머지 로직(잔액 검증, refund_amount 누적, 로그 기록)은 그대로 들고 옵니다.
-- ----------------------------------------------------------------------------
create or replace function public.admin_apply_application_refund(
  p_application_id uuid,
  p_amount         integer,
  p_reason         text,
  p_portone_ref    text default null
)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app       public.service_applications;
  v_total     integer;
  v_already   integer;
  v_remaining integer;
  v_new_total integer;
  v_status    text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = '22004';
  end if;

  select * into v_app from public.service_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_app.status ilike '%cancel%' or v_app.status like '%취소%') then
    raise exception 'NOT_CANCELLED' using errcode = 'P0001';
  end if;

  v_total     := coalesce(v_app.final_amount, 0);
  v_already   := coalesce(v_app.refund_amount, 0);
  v_remaining := v_total - v_already;
  if p_amount > v_remaining then
    raise exception 'REFUND_EXCEEDS_REMAINING: remaining=%, requested=%', v_remaining, p_amount
      using errcode = '22023';
  end if;

  v_new_total := v_already + p_amount;
  v_status    := case when v_new_total >= v_total then 'REFUNDED' else 'PARTIALLY_REFUNDED' end;

  update public.service_applications
     set refund_amount  = v_new_total,
         payment_status = v_status,
         refund_memo    = p_reason,
         refunded_at    = now()
   where id = p_application_id
  returning * into v_app;

  insert into public.service_application_refund_logs
    (application_id, admin_id, amount, is_full, reason, portone_cancellation_id)
  values
    (p_application_id, auth.uid(), p_amount, v_status = 'REFUNDED', p_reason, p_portone_ref);

  return v_app;
end $$;

revoke all on function public.admin_apply_application_refund(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_apply_application_refund(uuid, integer, text, text) to service_role;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
