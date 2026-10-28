-- ============================================================================
-- profile-edit.html 고도화(주소지 관리 · 알림 수신 설정 · 회원 탈퇴)를 위한 profiles 컬럼 확장 +
-- update_user_profile() 확장 + 회원 탈퇴용 deactivate_own_account() 추가.
--
--   [비밀번호 변경] 섹션은 이 사이트가 카카오 OAuth 전용(이메일/비밀번호 로그인 없음, login.html의
--   아이디/비밀번호 입력란은 "카카오 소셜 로그인을 이용해 주세요" 안내만 띄우는 비활성 UI)이라 넣지
--   않았습니다 — 모든 계정에 "현재 비밀번호"라는 게 존재하지 않아 검증할 방법이 없습니다.
--
--   [회원 탈퇴]는 하드 삭제(auth.users 행 삭제)가 아닙니다. profiles.id 를 참조하는 여러 테이블
--   (예: care_schedules.guardian_id/manager_id — on delete cascade 가 안 걸린 FK) 때문에 하드 삭제는
--   거의 항상 외래키 제약 위반으로 실패하고, 설령 성공해도 결제/정산 이력을 실제로 지우는 것은
--   전자상거래법상 바람직하지 않습니다. 그래서 "탈퇴"는 (1) 이 함수로 profiles 의 개인식별정보만
--   지우고 (2) supabase/functions/delete-account 가 GoTrue Admin API로 이 계정을 매우 긴 기간
--   차단(ban)해 다시 로그인할 수 없게 만드는 두 단계로 구현합니다.
--
--   실행 순서: sql/profile_self_update.sql 이후 아무 때나. create or replace / alter table add column
--   if not exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists address          text;
alter table public.profiles add column if not exists address_detail   text;
-- 케어 안내(배정/일정/결제 등 서비스 운영에 필요한 알림)는 기본 수신 — 마케팅과 성격이 다릅니다.
alter table public.profiles add column if not exists notify_care      boolean not null default true;
-- 마케팅/프로모션 알림은 정보통신망법상 별도 동의가 필요하므로 기본값은 false(수신안함)입니다.
alter table public.profiles add column if not exists notify_marketing boolean not null default false;
alter table public.profiles add column if not exists withdrawn_at     timestamptz;

-- ----------------------------------------------------------------------------
-- 2) 컬럼 단위 권한 — sql/profile_self_update.sql 이 열어 둔 name/phone 에 새 컬럼들을 더합니다.
--    (profiles_update_own RLS 정책은 이미 있으므로 다시 만들지 않습니다.)
-- ----------------------------------------------------------------------------
grant update (name, phone, address, address_detail, notify_care, notify_marketing) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 3) 자가 수정 RPC 확장 — 기존 update_user_profile(text, text) 를 대체합니다(시그니처가 바뀌므로
--    이전 2-인자 버전은 명시적으로 drop). 이름/연락처 검증 로직은 sql/profile_self_update.sql 과
--    동일하고, 주소/알림 수신 여부가 추가됐습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.update_user_profile(text, text);

create or replace function public.update_user_profile(
  p_name             text,
  p_phone            text,
  p_address          text default null,
  p_address_detail   text default null,
  p_notify_care      boolean default true,
  p_notify_marketing boolean default false
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name           text := nullif(btrim(coalesce(p_name, '')), '');
  v_digits         text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone          text;
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

  if v_digits = '' then
    v_phone := null; -- 연락처는 선택 입력
  elsif length(v_digits) < 9 or length(v_digits) > 11 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  elsif length(v_digits) <= 10 then
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7);
  else
    v_phone := substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4);
  end if;

  if v_address is not null and length(v_address) > 200 then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  if v_address_detail is not null and length(v_address_detail) > 100 then
    raise exception 'INVALID_ADDRESS_DETAIL' using errcode = '22023';
  end if;

  update public.profiles
     set name             = v_name,
         phone            = v_phone,
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

-- ----------------------------------------------------------------------------
-- 4) 회원 탈퇴 1단계 — profiles 의 개인식별정보 스크럽. 2단계(로그인 영구 차단)는
--    supabase/functions/delete-account 가 이 RPC 호출 *다음*에 GoTrue Admin API로 수행합니다.
-- ----------------------------------------------------------------------------
create or replace function public.deactivate_own_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.profiles
     set name             = '탈퇴한 회원',
         phone            = null,
         address          = null,
         address_detail   = null,
         notify_care      = false,
         notify_marketing = false,
         withdrawn_at     = now()
   where id = auth.uid();
end $$;

revoke all on function public.deactivate_own_account() from public, anon;
grant  execute on function public.deactivate_own_account() to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
