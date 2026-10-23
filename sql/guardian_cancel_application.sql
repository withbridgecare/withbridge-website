-- ============================================================================
-- guardian_cancel_application.sql
-- 보호자 마이페이지(mypage.html)에서 아직 매니저가 배정되지 않은(= manager_id IS NULL) 본인 신청을
-- 직접 취소할 수 있게 하는 RPC 입니다.
--
-- ── 버그 수정: "내 신청인데도 APPLICATION_NOT_CANCELLABLE 이 뜨는" 문제 ────────────────────────────
-- 이전 버전은 소유권을 user_id = auth.uid() 하나로만 확인했습니다. 그런데 이 신청 목록을 보여주는
-- SELECT 정책(service_applications_select_own, sql/supabase_schema_latest.sql)은 그보다 넓은 기준을
-- 씁니다:
--     auth.uid() = user_id  OR  (applicant_email 이 로그인 계정의 인증된 이메일과 일치)
-- 즉 user_id 연결이 끊긴 신청(비로그인 신청 폴백 경로 등, applicant_email 컬럼 주석 참고)도 보호자
-- 마이페이지에는 정상적으로 "보이고" [신청 취소하기] 버튼까지 뜨지만, 예전 cancel_my_application() 은
-- user_id 만 비교해서 그런 행은 전부 "내 신청이 아님"으로 처리돼 false 로 막혔습니다 — 화면에 보이는
-- 건 취소할 수 있어야 하는데 못 하는 비대칭이 버그의 실체였습니다.
--
-- 지금은 SELECT 정책과 완전히 같은 기준(user_id 일치 OR 인증된 이메일 일치)으로 소유권을 확인합니다.
--
-- 추가로, UPDATE 가 0행을 바꿔도 예전처럼 뭉뚱그려 APPLICATION_NOT_CANCELLABLE 하나로만 끝내지 않고,
-- 정확히 어떤 조건에서 막혔는지(신청이 없음 / 내 신청이 아님 / 이미 매니저 배정됨) 구체적인 에러
-- 코드로 구분해서 던집니다 — 다음에 같은 문제가 또 생기면 로그만 보고 바로 원인을 알 수 있도록.
-- ============================================================================

create or replace function public.cancel_my_application(p_application_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_row public.service_applications;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- 소유권 조건을 service_applications_select_own RLS 정책과 똑같이 맞춰서 한 번에 시도합니다 —
  -- 화면에 보이는 신청이라면(=이 조건을 만족하니까 보였던 것) 이 UPDATE 도 반드시 성공해야 합니다.
  update public.service_applications
     set status = 'CANCELLED'
   where id = p_application_id
     and manager_id is null
     and (
       user_id = auth.uid()
       or (applicant_email is not null and lower(btrim(applicant_email)) = public.my_verified_email())
     )
  returning * into v_row;

  if found then
    return v_row;
  end if;

  -- 여기부터는 "왜 안 됐는지" 를 구체적으로 가려내기 위한 진단 분기입니다 — 운영 로그에 이 에러 코드만
  -- 남아도 바로 원인을 알 수 있습니다.
  select * into v_row from public.service_applications where id = p_application_id;

  if v_row.id is null then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    v_row.user_id = auth.uid()
    or (v_row.applicant_email is not null and lower(btrim(v_row.applicant_email)) = public.my_verified_email())
  ) then
    raise exception 'NOT_YOUR_APPLICATION' using errcode = '42501';
  end if;

  if v_row.manager_id is not null then
    raise exception 'ALREADY_ASSIGNED' using errcode = 'P0002';
  end if;

  -- 소유권도 맞고 manager_id 도 비어 있는데 위 UPDATE 가 실패했다면(동시에 다른 트랜잭션이 막 처리한
  -- 경우 등) 더 구체적으로 설명할 수 없는 일반적인 상태라 기존 에러 코드로 마무리합니다.
  raise exception 'APPLICATION_NOT_CANCELLABLE' using errcode = 'P0002';
end $$;

revoke all on function public.cancel_my_application(uuid) from public, anon;
grant  execute on function public.cancel_my_application(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
