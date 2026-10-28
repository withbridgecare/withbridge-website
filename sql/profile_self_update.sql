-- ============================================================================
-- 보호자 본인 프로필(이름/연락처) 자가 수정 — 헤더 드롭다운(js/auth-header.js)의 '내 정보 수정'
-- 모달이 update_user_profile() RPC를 호출해 씁니다.
--
--   profiles.role 은 매니저 승인/해제(approve_manager_application 등, sql/manager_applications.sql)
--   같은 서버 로직만 바꿀 수 있어야 합니다 — 그래서 authenticated 에게 테이블 전체 UPDATE를 열어주지
--   않고, name/phone 두 컬럼만 "컬럼 단위 권한 + 내 행만"으로 좁힙니다(아래 1번). 그 위에 올라가는
--   update_user_profile() RPC(2번)는 입력값을 서버에서 다시 검증(이름 trim/길이, 연락처 숫자 개수)한
--   뒤 저장하고 갱신된 행을 그대로 돌려줍니다 — SECURITY DEFINER 로 실행하지만 auth.uid() 로만 자기
--   행을 찾고 다른 사용자 id 를 파라미터로 받지 않으므로 권한 상승 경로가 없습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql(profiles 테이블) 이후 아무 때나. create or replace /
--   grant / create policy 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 단위 권한 + RLS — "role 은 빼고 name/phone 만, 내 행만" 을 DB 레벨에서 강제합니다.
--    (update_user_profile() 이 SECURITY DEFINER 라 이 그랜트/정책이 없어도 RPC 경로는 동작하지만,
--     PostgREST 로 profiles 를 직접 PATCH 하는 경로까지 같은 기준으로 막아 두기 위해 함께 둡니다.)
-- ----------------------------------------------------------------------------
grant update (name, phone) on public.profiles to authenticated;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2) 자가 수정 RPC — 이름은 trim 후 1~30자, 연락처는 선택 입력(빈 값이면 null 로 저장)이고 입력하면
--    숫자 9~11자리여야 합니다. 저장 형식은 apply.html formatPhoneDigits() 와 같은 3-3-3/3-3-4/3-4-4
--    하이픈 규칙으로 서버에서 다시 정규화해, 클라이언트가 무엇을 보내든 저장된 형식이 항상 같습니다.
-- ----------------------------------------------------------------------------
create or replace function public.update_user_profile(p_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone  text;
  v_row    public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if v_digits = '' then
    v_phone := null; -- 연락처는 선택 입력
  elsif length(v_digits) < 9 or length(v_digits) > 11 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  elsif length(v_digits) <= 10 then
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7);
  else
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4);
  end if;

  update public.profiles
     set name = v_name,
         phone = v_phone
   where id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.update_user_profile(text, text) from public, anon;
grant  execute on function public.update_user_profile(text, text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
