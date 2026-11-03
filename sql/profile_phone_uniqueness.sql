-- ============================================================================
-- 1인 1계정 정책 — 휴대폰 번호(profiles.phone) 중복 가입 차단.
--
--   목적: 같은 휴대폰 번호로 여러 개의 계정이 만들어지는 것을 막습니다. 이 저장소에는 phone 이
--   채워지는 경로가 두 곳 있습니다(sql/profile_phone_kakao_sync.sql 참고) — 둘 다 아래에서
--   "이미 등록된 번호면 막기"로 다시 정의합니다:
--     (1) sync_kakao_phone_from_auth() — auth.users INSERT/UPDATE 트리거. signup.html 이 이메일
--         가입 시 options.data.phone 으로 보낸 값도 이 경로로 들어옵니다.
--     (2) set_initial_phone_if_missing() — package.html 등에서 번호가 없는 유저가 결제 시점에
--         1회 입력하는 RPC.
--   여기에 더해, signup.html 이 auth.signUp() 을 호출하기 *전에* 미리 물어볼 수 있는 익명 호출용
--   RPC(is_phone_registered)를 새로 추가해, 계정이 실제로 만들어지기 전에 친절한 한국어 에러를
--   보여줄 수 있게 합니다. DB 의 UNIQUE 인덕스는 이 사전 체크를 우회하는 모든 경로(동시 요청 레이스,
--   향후 추가될 카카오 전화번호 동기화 등)에 대한 최종 방어선입니다.
--
--   ⚠ 실행 전: 이미 같은 번호로 중복 가입된 계정이 있다면 UNIQUE 인덕스 생성이 실패합니다. 먼저
--   아래로 중복 여부를 확인하세요:
--     select phone, count(*) from public.profiles where phone is not null group by phone having count(*) > 1;
--   중복이 있다면 어느 계정을 남길지 운영 판단으로 정리한 뒤 이 파일을 실행하세요.
--
--   실행 순서: sql/profile_phone_kakao_sync.sql 이후 아무 때나(두 함수를 CREATE OR REPLACE 로
--   다시 정의하므로 실행 순서 자체는 중요하지 않습니다).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) 전화번호 정규화 공용 함수 — 숫자만 추출해 "010-1234-5678" 형태로 통일합니다. 형식이 이상하면
--    (9~11자리 범위를 벗어나면) null 을 돌려줍니다. 기존 두 함수에 복붙돼 있던 로직을 하나로 모아,
--    "등록 여부 확인"과 "실제 저장"이 서로 다른 번호로 비교/저장되는 것을 막습니다.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_phone(p_raw text) returns text
language plpgsql immutable as $$
declare
  v_digits text := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
begin
  if length(v_digits) = 11 and left(v_digits, 2) = '82' then
    v_digits := '0' || substr(v_digits, 3);
  end if;
  if length(v_digits) < 9 or length(v_digits) > 11 then
    return null;
  end if;
  return case
    when length(v_digits) <= 10 then substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7)
    else substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
  end;
end $$;

revoke all on function public.normalize_phone(text) from public, anon, authenticated;
grant  execute on function public.normalize_phone(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) DB 단 원천 방어 — phone 이 있는 행끼리는 값이 겹칠 수 없습니다. phone 이 null(아직 입력 전)인
--    행은 여러 개 있어도 됩니다(partial unique index).
-- ----------------------------------------------------------------------------
create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone) where phone is not null;

-- ----------------------------------------------------------------------------
-- 2) 가입 전 사전 확인용 RPC — 로그인하지 않은 사용자(회원가입 폼)도 호출해야 하므로 anon 에게도
--    실행 권한을 줍니다. profiles 테이블 자체는 RLS 로 본인 행만 보이므로, 다른 사람의 전화번호가
--    등록되어 있는지 "여부(boolean)"만 돌려주고 그 외 정보는 노출하지 않습니다.
-- ----------------------------------------------------------------------------
create or replace function public.is_phone_registered(p_phone text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.normalize_phone(p_phone);
begin
  if v_phone is null then
    return false; -- 형식이 이상한 값은 "중복 아님"으로 — 형식 검증은 클라이언트 쪽 책임입니다.
  end if;
  return exists (select 1 from public.profiles where phone = v_phone);
end $$;

revoke all on function public.is_phone_registered(text) from public;
grant  execute on function public.is_phone_registered(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) sync_kakao_phone_from_auth() 재정의 — normalize_phone() 을 쓰도록 바꾸고, UNIQUE 위반을
--    사람이 읽을 수 있는 메시지로 바꿔 던집니다. 이 함수는 auth.users AFTER INSERT 트리거로 실행되므로,
--    예외가 나면 auth.users INSERT 자체가 롤백됩니다 — 즉 중복 번호로는 계정이 "절대" 만들어지지
--    않습니다(signup.html 의 사전 체크를 우회하는 모든 경로에 대한 최종 방어선).
-- ----------------------------------------------------------------------------
create or replace function public.sync_kakao_phone_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_raw   text;
  v_phone text;
begin
  v_raw := coalesce(
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data#>>'{kakao_account,phone_number}'
  );
  if v_raw is null or btrim(v_raw) = '' then
    return new; -- 번호를 안 받았음 — 기존 profiles.phone 은 그대로 둡니다.
  end if;

  v_phone := public.normalize_phone(v_raw);
  if v_phone is null then
    return new; -- 형식을 알 수 없는 값 — 잘못된 번호를 저장하는 것보다 건너뛰는 쪽이 안전합니다.
  end if;

  begin
    update public.profiles set phone = v_phone where id = new.id and phone is distinct from v_phone;
  exception when unique_violation then
    raise exception '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.' using errcode = '23505';
  end;
  return new;
end $$;

-- 트리거는 이미 profile_phone_kakao_sync.sql 에서 만들어져 있으므로 다시 만들 필요 없습니다
-- (함수 본문만 CREATE OR REPLACE 로 바뀝니다). 그래도 안전하게 한 번 더 명시합니다.
drop trigger if exists on_auth_user_kakao_phone_sync on auth.users;
create trigger on_auth_user_kakao_phone_sync
  after insert or update on auth.users
  for each row execute function public.sync_kakao_phone_from_auth();

-- ----------------------------------------------------------------------------
-- 4) set_initial_phone_if_missing() 재정의 — 결제 시점 1회 입력 경로도 같은 기준으로 막습니다.
-- ----------------------------------------------------------------------------
create or replace function public.set_initial_phone_if_missing(p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_row   public.profiles;
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

  if v_phone is null then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  begin
    update public.profiles set phone = v_phone where id = auth.uid() returning * into v_row;
  exception when unique_violation then
    raise exception '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.' using errcode = '23505';
  end;
  return v_row;
end $$;

revoke all on function public.set_initial_phone_if_missing(text) from public, anon;
grant  execute on function public.set_initial_phone_if_missing(text) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
