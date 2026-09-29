-- ============================================================================
-- 보호자 [확인 및 이용 완료] 처리 (mypage.html '진행 중인 신청' → '이용 내역' 전환)
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-applications-to-manager.sql / supabase-fix-status-sync.sql 이 먼저 실행되어 service_applications
--  에 user_id, status 컬럼이 있다고 가정합니다. CREATE OR REPLACE 로만 작성되어 여러 번 실행해도 안전합니다)
--
-- ▶ 배경: 케어가 '완료(completed)'되면 mypage.html '진행 중인 신청' 카드에 [확인 및 이용 완료] 버튼이
--   뜹니다. 보호자가 눌러 최종 확인하면 ① 이 신청은 '진행 중인 신청'에서 곧바로 빠지고 ② 하단
--   '이용 내역 & 케어 리포트'에서만 계속 조회되어야 합니다(mypage.html 의 effectiveStatusInfo() 참고).
--
-- ▶ 왜 새 상태 문자열이 필요한가
--   care_schedules.status 는 CHECK 제약으로 'pending'/'assigned'/'departed'/'arrived'/'completed' 만
--   허용합니다(supabase-manager-schema.sql). 그래서 이 최종 확인은 care_schedules 가 아니라
--   service_applications.status 에만 'guardian_confirmed' 로 남깁니다 — 이 컬럼은 자유 텍스트라 제약이 없고,
--   mypage.html 의 statusInfo()/normalizeCareStep() 이 이미 영어·한글 여러 동의어를 관대하게 매칭하는
--   구조라 새 값을 추가해도 기존 상태 판정을 건드리지 않습니다.
--
-- ▶ 이 파일이 하는 일
--   confirm_service_application(): 보호자(user_id = auth.uid())가 자신의 신청이고, 현재 상태가 '케어
--   완료'(completed 및 그 동의어)일 때만 status 를 'guardian_confirmed' 로 바꾸는 SECURITY DEFINER 함수.
--   (service_applications 에는 보호자용 UPDATE 정책이 없으므로, 직접 update 대신 이 함수로 좁혀서 열어 줍니다)
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

revoke all on function public.confirm_service_application(uuid) from public, anon;
grant  execute on function public.confirm_service_application(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ★ 확인용 (SQL Editor)
--   1) RPC 등록됐는지:
--        select proname from pg_proc
--        where proname = 'confirm_service_application' and pronamespace = 'public'::regnamespace;
--   2) 실제로 값이 바뀌는지 (보호자 계정 세션에서 rpc 호출 후):
--        select id, status, user_id from public.service_applications where id = '<application uuid>';
--      → status 가 'guardian_confirmed' 로 바뀌어 있어야 정상입니다.
--   3) SQL Editor 는 관리자 권한이라 auth.uid() 가 없어 NOT_AUTHENTICATED 만 돌려줍니다 — 실제 확인은
--      로그인한 보호자 세션(anon key + 로그인)에서 rpc 호출을 테스트하세요.
