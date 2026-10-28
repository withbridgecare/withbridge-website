-- ============================================================================
-- 휴대폰 번호(profiles.phone) — 카카오 자동 동기화 + "번호가 없는 유저"를 위한 결제 시점 1회 입력.
--
--   이 파일은 sql/profile_phone_lock.sql(authenticated 의 자기서비스 수정을 막는 락)과 짝입니다.
--   "사용자가 스스로 못 고친다"는 그대로 유지하면서, phone 이 실제로 채워질 수 있는 두 경로만 열어
--   둡니다 — 둘 다 authenticated 롤의 테이블 권한이 아니라 SECURITY DEFINER 함수/트리거를 통해서만
--   동작하므로 profile_phone_lock.sql 의 revoke 와 충돌하지 않습니다.
--
--   ⚠ 1번(카카오 자동 동기화)은 이 저장소의 코드만으로는 100% 보장할 수 없는 외부 의존성이 두 개
--   있습니다 — login.html 의 scopes 요청 주석에 적어 둔 그대로입니다:
--     (1) 카카오 디벨로퍼스 콘솔에서 "전화번호" 동의항목이 비즈 앱 심사를 통과해야 카카오가 번호를
--         내려줍니다(사업자가 외부에서 진행하는 절차 — 코드로 할 수 없음).
--     (2) Supabase Auth(GoTrue)의 카카오 프로바이더가 그 값을 raw_user_meta_data 에 실제로 넣어
--         줘야 아래 트리거가 읽을 수 있습니다 — Supabase 쪽 구현에 달려 있어 이 저장소 코드로
--         확인/보장할 수 없습니다.
--   두 조건 중 하나라도 안 맞으면 아래 트리거는 그냥 조용히 아무 것도 하지 않고 넘어갑니다(필수
--   경로가 아니라 "되면 좋은" 보강 경로) — 그래서 2번(결제 시점 1회 입력)이 실제로는 더 중요한,
--   항상 동작하는 안전망입니다.
--
--   실행 순서: sql/profile_phone_lock.sql 이후 아무 때나.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 카카오 로그인 → profiles.phone 자동 동기화 (있을 때만, 되면 좋은 보강 경로)
--
--    auth.users.raw_user_meta_data 안에서 전화번호가 들어올 수 있는 몇 가지 경로를 방어적으로
--    다 찾아봅니다 — Supabase 카카오 프로바이더가 실제로 어떤 키에 매핑하는지 코드만으로는 확신할
--    수 없으므로, 흔히 쓰이는 키 이름들을 전부 시도합니다. 로그인 때마다(INSERT/UPDATE 모두) 실행해
--    매번 최신 값으로 맞추되, 카카오가 값을 안 줬을 때는(이 세션에서 scope 동의가 없었거나, 비즈
--    앱 승인 전이거나) 기존 값을 절대 지우지 않습니다 — "없다"와 "안 알려줬다"를 구분할 방법이
--    없어서, 더 보수적인 쪽(기존 값 보존)으로 처리합니다.
-- ----------------------------------------------------------------------------
create or replace function public.sync_kakao_phone_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_raw     text;
  v_digits  text;
  v_phone   text;
begin
  v_raw := coalesce(
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data#>>'{kakao_account,phone_number}'
  );
  if v_raw is null or btrim(v_raw) = '' then
    return new; -- 카카오가 번호를 안 줬음 — 기존 profiles.phone 은 그대로 둡니다.
  end if;

  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  -- 카카오는 보통 국가코드(+82)를 포함해 주므로 '820...' 형태면 맨 앞 82 를 떼고 0을 다시 붙입니다.
  if length(v_digits) = 11 and left(v_digits, 2) = '82' then
    v_digits := '0' || substr(v_digits, 3);
  end if;
  if length(v_digits) < 9 or length(v_digits) > 11 then
    return new; -- 형식을 알 수 없는 값 — 잘못된 번호를 저장하는 것보다 건너뛰는 쪽이 안전합니다.
  end if;

  v_phone := case
    when length(v_digits) <= 10 then substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7)
    else substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
  end;

  update public.profiles set phone = v_phone where id = new.id and phone is distinct from v_phone;
  return new;
end $$;

drop trigger if exists on_auth_user_kakao_phone_sync on auth.users;
create trigger on_auth_user_kakao_phone_sync
  after insert or update on auth.users
  for each row execute function public.sync_kakao_phone_from_auth();

-- ----------------------------------------------------------------------------
-- 2) 결제/예약 시점의 1회 입력 — profiles.phone 이 NULL 인 유저가 케어 패키지 구매(package.html)
--    같은 결제 플로우에서 알림톡 받을 번호를 한 번 입력하면 그때만 저장됩니다. 이미 값이 있으면
--    (카카오 동기화로 채워졌든, 과거에 이 함수로 채워졌든) 조용히 기존 값을 그대로 반환합니다 —
--    "1회"라는 말 그대로, 이 함수로 이미 채워진 뒤에는 다시 바꿀 수 없습니다(그 다음엔 사용자
--    자신도 못 고치는 sql/profile_phone_lock.sql 의 잠금과 같은 성격이 됩니다).
-- ----------------------------------------------------------------------------
create or replace function public.set_initial_phone_if_missing(p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone  text;
  v_row    public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.profiles where id = auth.uid();
  if v_row.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.phone is not null then
    return v_row; -- 이미 번호가 있음 — 그대로 반환(덮어쓰지 않음, 에러도 아님)
  end if;

  if length(v_digits) < 9 or length(v_digits) > 11 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  v_phone := case
    when length(v_digits) <= 10 then substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7)
    else substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
  end;

  update public.profiles set phone = v_phone where id = auth.uid() returning * into v_row;
  return v_row;
end $$;

revoke all on function public.set_initial_phone_if_missing(text) from public, anon;
grant  execute on function public.set_initial_phone_if_missing(text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
