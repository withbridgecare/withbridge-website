-- ============================================================================
-- [원복] 매니저 '신청 대기 목록'은 PAYMENT_PENDING(결제/입금 확인 전) 건을 다시 숨깁니다
--
--   이전 버전의 이 파일은 PAYMENT_PENDING 건도 매니저에게 노출하도록 RLS를 넓혔습니다. 이후
--   "매니저는 결제가 완료되어 수락 가능한 건만 봐야 한다"는 결정에 따라 그 변경을 되돌립니다 —
--   mypage-manager.html 의 isAwaitingPaymentStatus() 관련 코드도 함께 제거했습니다.
--
--   service_applications_select_managers 정책을 sql/supabase_schema_latest.sql 원본과 똑같이
--   (is_pending_application_status(status) 만 — PAYMENT_PENDING 은 제외) 다시 정의합니다. 이전에
--   PAYMENT_PENDING 도 허용하는 버전을 이미 실행하셨더라도, 이 파일을 다시 실행하면 그 완화분이
--   덮어써져 원래대로(결제 확인 전 신청서는 매니저에게 안 보임) 돌아갑니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → 이 파일. drop policy if exists / create 기반이라
--   여러 번 실행해도 안전합니다.
-- ============================================================================

drop policy if exists service_applications_select_managers on public.service_applications;
create policy service_applications_select_managers on public.service_applications
  for select to authenticated
  using (
    public.is_manager()
    and manager_id is null
    and public.is_pending_application_status(status)
  );

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
