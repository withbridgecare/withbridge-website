-- ============================================================================
-- 휴대폰 번호(profiles.phone) 자기서비스 수정 잠금 — profile-edit.html 의 '휴대폰 번호' 입력칸을
-- 읽기 전용으로 바꾸면서, 백엔드도 같은 기준으로 막습니다(화면만 잠그고 API는 열려 있으면 소용없음).
--
--   ※ 중요한 사실 확인(향후 유지보수자를 위한 기록): 이 사이트는 카카오 OAuth 로그인 시 전화번호
--   scope(카카오싱크의 "카카오 계정과 연결된 전화번호" 동의 항목)를 요청하지 않고, 지금까지 카카오로부터
--   실제 전화번호를 받아온 적이 없습니다(코드 전체에 phone scope 처리가 전혀 없음 — js/auth-header.js
--   의 signInWithOAuth 호출에 scopes 옵션 자체가 없습니다). profiles.phone 은 여전히 자기기입 값이고,
--   이 마이그레이션은 "카카오가 실제로 동기화해 주는 값"으로 바뀌는 게 아니라 "사용자가 더 이상
--   스스로 바꿀 수 없게" 만드는 것뿐입니다 — 화면 안내 문구와 실제 데이터 소스가 다르다는 점을
--   알고 있어야 번호가 비어 있거나 틀린 계정을 만났을 때 당황하지 않습니다. 고치려면 Supabase
--   대시보드에서 관리자가 직접 profiles.phone 을 수정하는 것이 지금은 유일한 경로입니다.
--
--   실행 순서: sql/profile_account_management.sql 이후 아무 때나.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 단위 권한에서 phone 제외 — PostgREST 로 profiles 를 직접 PATCH 하는 경로까지 막습니다
--    (sql/profile_account_management.sql 이 name/phone/address/address_detail/notify_* 를 한 번에
--    열어 줬던 것에서 phone 만 다시 거둬들입니다).
-- ----------------------------------------------------------------------------
revoke update (phone) on public.profiles from authenticated;

-- ----------------------------------------------------------------------------
-- 2) update_user_profile() 재정의 — p_phone 파라미터는 호환을 위해 시그니처에 남겨 두지만(기존
--    호출부가 이 값을 보내도 에러가 나지 않도록 default null 로 바꿈), UPDATE SET 절에서 완전히
--    빼서 어떤 값을 보내도 phone 컬럼은 손대지 않습니다 — 클라이언트가 보내는 값을 신뢰하지 않는
--    것이 아니라, 아예 읽지도 않습니다(가장 안전한 방어).
-- ----------------------------------------------------------------------------
create or replace function public.update_user_profile(
  p_name             text,
  p_phone            text default null, -- 더 이상 사용하지 않음(호환용) — phone 은 이 함수로 바꿀 수 없습니다
  p_address          text default null,
  p_address_detail   text default null,
  p_notify_care      boolean default true,
  p_notify_marketing boolean default false
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name           text := nullif(btrim(coalesce(p_name, '')), '');
  v_address        text := nullif(btrim(coalesce(p_address, '')), '');
  v_address_detail text := nullif(btrim(coalesce(p_address_detail, '')), '');
  v_row            public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if v_address is not null and length(v_address) > 200 then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  if v_address_detail is not null and length(v_address_detail) > 100 then
    raise exception 'INVALID_ADDRESS_DETAIL' using errcode = '22023';
  end if;

  update public.profiles
     set name             = v_name,
         -- phone 은 의도적으로 빠져 있습니다 — p_phone 에 무엇이 들어오든 기존 값이 그대로 유지됩니다.
         address          = v_address,
         address_detail   = v_address_detail,
         notify_care      = coalesce(p_notify_care, true),
         notify_marketing = coalesce(p_notify_marketing, false)
   where id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.update_user_profile(text, text, text, text, boolean, boolean) from public, anon;
grant  execute on function public.update_user_profile(text, text, text, text, boolean, boolean) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
