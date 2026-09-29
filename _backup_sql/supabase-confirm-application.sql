-- ============================================================================
-- confirm_service_application(p_application_id uuid) RPC 생성 + 권한 부여
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--
-- ▶ 배경: mypage.html '진행 중인 신청' 카드에서 [확인 및 이용 완료] 클릭 시
--   "Could not find the function public.confirm_service_application(p_application_id)
--   in the schema cache" 에러가 발생하는 것은, 이 함수를 만드는 SQL이 아직 실제
--   Supabase 프로젝트에 한 번도 실행되지 않았기 때문입니다(PostgREST 스키마 캐시에
--   함수 자체가 없는 상태). 이 파일을 SQL Editor 에서 실행하면 해결됩니다.
--
-- ▶ 참고: 이 함수는 supabase-guardian-confirm-completion.sql 에도 동일하게 정의돼
--   있습니다(같은 함수를 만드는 CREATE OR REPLACE 라 두 파일을 모두 실행해도 안전
--   합니다). 이 파일은 "이 에러 하나만 보고 바로 실행할 수 있는" 독립 스크립트로
--   요청받아 별도로 둡니다.
--
-- ▶ 전제: service_applications 테이블에 user_id, status 컬럼이 있어야 합니다
--   (supabase-applications-to-manager.sql / supabase-fix-status-sync.sql 참고).
-- ============================================================================

create or replace function public.confirm_service_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_row public.service_applications;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- 본인(user_id = auth.uid())의 신청이고, 현재 상태가 '케어 완료' 계열일 때만
  -- 'guardian_confirmed' 로 전환합니다. service_applications 에는 보호자용 UPDATE
  -- 정책이 없으므로, 직접 update 대신 이 SECURITY DEFINER 함수로 좁혀서 열어 줍니다.
  update public.service_applications
     set status = 'guardian_confirmed'
   where id = p_application_id
     and user_id = auth.uid()
     and (
       lower(btrim(coalesce(status, ''))) in ('completed', 'complete', 'done', 'finished', 'care_completed')
       or coalesce(status, '') ~ '케어\s*완료'
     )
  returning * into v_row;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

-- ── 권한 부여: authenticated 만 호출 가능(익명 접근 불필요) ─────────────────
revoke all on function public.confirm_service_application(uuid) from public, anon;
grant  execute on function public.confirm_service_application(uuid) to authenticated;

-- ── PostgREST 스키마 캐시 갱신: 이게 빠지면 함수를 만들어도 API 에서 계속
--    "Could not find the function ... in the schema cache" 가 날 수 있습니다 ──
notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   1) RPC 등록됐는지:
--        select proname from pg_proc
--        where proname = 'confirm_service_application' and pronamespace = 'public'::regnamespace;
--   2) 권한이 제대로 붙었는지:
--        select grantee, privilege_type from information_schema.routine_privileges
--        where routine_name = 'confirm_service_application';
--   3) SQL Editor 는 관리자 권한이라 auth.uid() 가 없어 NOT_AUTHENTICATED 만 돌려줍니다 —
--      실제 확인은 로그인한 보호자 세션(anon key + 로그인)에서 mypage.html 의
--      [확인 및 이용 완료] 버튼을 눌러 테스트하세요.
