-- ============================================================================
-- 취소된 신청 건 — 어드민 콘솔에서 PortOne 전액/부분 환불을 직접 호출
--
--   지금까지 '취소된 신청 내역' 카드는 PG 환불을 관리자가 PortOne 콘솔에서 직접 처리한 뒤, 그 사실만
--   확인하는 [환불 완료 처리] 버튼(admin_mark_refund_completed, sql/matching_expiry_auto_refund.sql —
--   payment_status 만 바꾸고 PortOne을 호출하지 않음)만 있었습니다. 이 파일은 그 대신 실제로 PortOne
--   환불 API를 호출하는 [환불 처리] 버튼의 DB 쪽 절반을 추가합니다 — PortOne 호출은
--   supabase/functions/admin-refund-application 가 맡고, 그 호출이 성공한 뒤에만 아래 RPC로 DB를
--   반영합니다(이 프로젝트 전체에 깔린 "돈이 실제로 움직인 뒤에만 DB를 바꾼다" 원칙과 동일).
--
--   전액 환불을 여러 번에 걸쳐 나눠(부분) 처리할 수 있도록, service_applications.refund_amount
--   (sql/care_interruption_refund_system.sql 에서 추가된 컬럼)를 "이 건에 지금까지 누적으로 돌려준
--   금액"으로 재사용합니다. 그 파일의 admin_apply_partial_refund() 는 '진행 중인 케어'가 현장에서
--   중단됐을 때 한 번만 값을 덮어쓰는 별개의 흐름이라(끝나면 status가 'PARTIALLY_REFUNDED'로 바뀌고
--   care_schedules 가 'completed' 로 닫힘) 서로 겹치지 않습니다 — 이 파일이 다루는 건 이미
--   CANCELLED/EXPIRED_CANCELLED 로 끝난 신청의 payment_status 만 바꿉니다(status는 그대로 유지해야
--   '취소된 신청 내역' 목록 조건(status in ('CANCELLED','EXPIRED_CANCELLED'))에서 사라지지 않습니다).
--
--   payment_status 전이 (총액은 final_amount, sql/user_coupons_checkout.sql 에서 추가된 "최종 결제
--   확정 금액" 컬럼을 기준으로 삼습니다):
--     PAID / PARTIALLY_REFUNDED → (누적 환불액 == final_amount) → REFUNDED
--     PAID / PARTIALLY_REFUNDED → (누적 환불액 <  final_amount) → PARTIALLY_REFUNDED
--
--   실행 순서: sql/matching_expiry_auto_refund.sql(payment_status/refunded_at 컬럼) →
--   sql/user_coupons_checkout.sql(final_amount 컬럼) → sql/care_interruption_refund_system.sql
--   (refund_amount/refund_memo 컬럼) → 이 파일.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) 처리 이력 — 전액/부분 환불 호출마다 사유와 PortOne 응답 참조값을 남깁니다(고객센터 문의 대비 +
--    사후 조작 방지). admin_care_adjustments(sql/care_interruption_refund_system.sql)와 같은
--    패턴이지만, 이 건은 care_schedules 와 무관하고 application_id만으로 식별되어 별도 테이블로 둡니다.
-- ----------------------------------------------------------------------------
create table if not exists public.service_application_refund_logs (
  id                      uuid primary key default gen_random_uuid(),
  application_id          uuid not null references public.service_applications(id) on delete cascade,
  admin_id                uuid references public.profiles(id),
  amount                  integer not null check (amount > 0),
  is_full                 boolean not null,
  reason                  text not null,
  portone_cancellation_id text,
  created_at              timestamptz not null default now()
);

create index if not exists service_application_refund_logs_application_idx
  on public.service_application_refund_logs (application_id);

alter table public.service_application_refund_logs enable row level security;

drop policy if exists service_application_refund_logs_select_admin on public.service_application_refund_logs;
create policy service_application_refund_logs_select_admin on public.service_application_refund_logs
  for select to authenticated using (public.is_admin());

-- insert/update/delete 는 전부 아래 SECURITY DEFINER 함수를 통해서만 — 환불 이력이 관리자 손으로
-- 사후 조작되지 않도록 합니다.
revoke insert, update, delete on public.service_application_refund_logs from anon, authenticated;
grant  select on public.service_application_refund_logs to authenticated;
revoke select on public.service_application_refund_logs from anon;


-- ----------------------------------------------------------------------------
-- 2) 환불 적용 — PortOne 환불 API 호출이 성공한 뒤에만
--    supabase/functions/admin-refund-application 가 service_role 로 호출합니다. 호출자 권한 확인은
--    그 Edge Function이 이미 수행하므로(cancel-payment와 같은 패턴 — profiles.role 직접 조회), 이
--    함수는 is_admin() 을 다시 묻지 않고 "service_role만 실행 가능"으로 막습니다(맨 아래 revoke all —
--    list_expired_unmatched_applications/expire_unmatched_application 과 같은 패턴). service_role 로
--    호출되는 요청은 auth.uid() 가 비어 있어(로그인 사용자 JWT가 아님) is_admin() 체크를 넣으면 항상
--    실패하므로, 애초에 넣지 않습니다.
--
--    p_amount: "이번에" 실제로 돌아간 금액(PortOne 취소 응답의 실제 취소 금액) — refund_amount 에
--    누적으로 더해집니다. 이미 누적 환불액이 final_amount 에 도달한 뒤 또 호출되면(중복 클릭 등)
--    REFUND_EXCEEDS_REMAINING 으로 막혀 멱등하게 거부됩니다(0원을 추가로 깎지 않음).
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
  if v_app.status not in ('CANCELLED', 'EXPIRED_CANCELLED') then
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


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
