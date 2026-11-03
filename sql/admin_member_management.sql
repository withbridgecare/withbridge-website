-- ============================================================================
-- 어드민 콘솔(admin.html) '회원 관리' CS 대응 기능 확장
--
--   1) admin_list_members() 재정의 — 계정 정지 여부(banned_until)와, 페이지네이션에 필요한 전체
--      건수(total_count, window 함수로 이 호출의 where 조건 기준 총 개수를 매 행에 함께 돌려줌 —
--      별도 count 쿼리 없이 한 번의 호출로 "몇 번째 페이지"를 그릴 수 있게 합니다)를 추가합니다.
--      RETURNS TABLE 의 컬럼 구성이 바뀌므로 CREATE OR REPLACE 로는 안 되고, 먼저 DROP 해야 합니다.
--   2) admin_member_notes — 회원별 CS 메모(운영자 전용, 누적 로그 — 수정/삭제 없이 쌓이기만 함).
--   3) admin_update_member_profile() — 관리자가 CS 응대 중 회원의 이름/전화번호/주소를 직접 고칩니다.
--      전화번호는 sql/profile_phone_uniqueness.sql 의 normalize_phone() 으로 포맷을 통일하고, 같은
--      파일의 UNIQUE 인덕스(profiles_phone_unique_idx)로 다른 회원과의 중복도 그대로 막힙니다.
--   4) user_coupons / seniors 관리자 전체 조회 정책 — 회원 상세 모달에 보유 쿠폰·등록된 어르신
--      프로필을 보여주기 위해 필요합니다(user_packages 는 sql/admin_package_management.sql 에서
--      이미 열려 있음).
--   5) 계정 정지/활성화는 GoTrue Admin API(auth.admin.updateUserById, ban_duration) 로만 할 수 있어
--      SQL이 아니라 service-role Edge Function(supabase/functions/admin-set-member-status)이 담당합니다.
--   6) admin_update_member_profile() / admin_add_member_note() 는 성공 시 sql/admin_logs.sql 의
--      log_admin_action() 을 호출해 admin-logs.html 감사 로그에도 함께 남깁니다.
--
--   실행 순서: sql/admin_user_management.sql → sql/admin_rls_policies.sql(is_admin()) →
--             sql/profile_phone_uniqueness.sql(normalize_phone()) → sql/welcome_coupons.sql
--             (user_coupons) → sql/supabase_schema_latest.sql(seniors) → sql/admin_logs.sql
--             (log_admin_action()) → 이 파일.
--   전부 drop/create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) admin_list_members() 재정의 — banned_until(계정 정지 여부) + total_count(페이지네이션용) 추가
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_members(integer, integer, text, text, text);

create or replace function public.admin_list_members(
  p_limit    integer default 21,
  p_offset   integer default 0,
  p_search   text    default null, -- 이름/휴대폰 부분일치(대소문자 무시). null/빈 문자열이면 전체.
  p_provider text    default null, -- 'email' | 'kakao' | null(전체)
  p_verified text    default null  -- 'verified' | 'unverified' | null(전체)
)
returns table (
  id                  uuid,
  name                text,
  phone               text,
  email               text,
  provider            text,
  email_confirmed_at  timestamptz,
  banned_until        timestamptz,
  created_at          timestamptz,
  address             text,
  address_detail      text,
  total_count         bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    p.name,
    p.phone,
    u.email::text,
    -- Supabase Auth 가 가입 시 자동으로 채우는 필드 — 'email'(이메일/비밀번호) | 'kakao' 등.
    -- 과거 데이터 중 이 값이 비어 있는 경우는 이메일/비밀번호 가입으로 간주합니다.
    coalesce(u.raw_app_meta_data->>'provider', 'email') as provider,
    u.email_confirmed_at,
    u.banned_until,
    u.created_at,
    p.address,
    p.address_detail,
    count(*) over() as total_count
  from auth.users u
  left join public.profiles p on p.id = u.id
  where
    (v_search is null
      or p.name  ilike '%' || v_search || '%'
      or p.phone ilike '%' || v_search || '%')
    and (p_provider is null
      or coalesce(u.raw_app_meta_data->>'provider', 'email') = p_provider)
    and (p_verified is null
      or (p_verified = 'verified'   and u.email_confirmed_at is not null)
      or (p_verified = 'unverified' and u.email_confirmed_at is null))
  order by u.created_at desc
  limit p_limit offset p_offset;
end $$;

revoke all on function public.admin_list_members(integer, integer, text, text, text) from public, anon;
grant  execute on function public.admin_list_members(integer, integer, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 2) admin_member_notes — 회원별 CS 메모(운영자 전용, 누적 로그)
--    '누가 언제 무슨 메모를 남겼는지' 전부 남기는 것이 CS 이력 추적의 목적이라, 수정/삭제를 만들지
--    않고 insert만 허용합니다(admin_care_adjustments 와 같은 "되돌릴 수 없는 이력" 성격).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_member_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  admin_id   uuid not null references public.profiles(id),
  note       text not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_member_notes_user_idx
  on public.admin_member_notes (user_id, created_at desc);

alter table public.admin_member_notes enable row level security;
drop policy if exists admin_member_notes_select_admin on public.admin_member_notes;
create policy admin_member_notes_select_admin on public.admin_member_notes
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.admin_member_notes from anon, authenticated;
grant  select on public.admin_member_notes to authenticated;
revoke all on public.admin_member_notes from anon;

create or replace function public.admin_add_member_note(p_user_id uuid, p_note text)
returns public.admin_member_notes
language plpgsql security definer set search_path = public as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_row  public.admin_member_notes;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if v_note = '' then
    raise exception 'NOTE_REQUIRED' using errcode = '22004';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.admin_member_notes (user_id, admin_id, note)
  values (p_user_id, auth.uid(), v_note)
  returning * into v_row;

  -- 감사 로그 기록 실패(예: sql/admin_logs.sql 이 아직 적용되지 않아 log_admin_action() 자체가
  -- 없는 경우)가 CS 메모 저장까지 함께 롤백시키지 않도록 별도 블록으로 감쌉니다 — 실패해도 메모는
  -- 그대로 저장되고, 원인은 Postgres 로그의 WARNING 으로 확인할 수 있습니다.
  begin
    perform public.log_admin_action('member_note_add', 'member', p_user_id::text,
      jsonb_build_object('note_preview', left(v_note, 120)));
  exception when others then
    raise warning 'admin_add_member_note: log_admin_action 호출 실패(메모 저장 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_add_member_note(uuid, text) from public, anon;
grant  execute on function public.admin_add_member_note(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3) admin_update_member_profile() — 관리자가 회원의 이름/전화번호/주소를 직접 수정
--    (profile-edit.html 의 update_user_profile() 과 달리 auth.uid() 본인이 아니라 p_user_id 를
--    대상으로 하고, phone 컬럼도 함께 바꿀 수 있습니다 — sql/profile_phone_lock.sql 의 self-service
--    잠금은 authenticated 롤의 테이블 권한을 거둔 것이라, SECURITY DEFINER 로 도는 이 함수에는
--    적용되지 않습니다.)
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_member_profile(
  p_user_id        uuid,
  p_name           text,
  p_phone          text default null,
  p_address        text default null,
  p_address_detail text default null
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text;
  v_row   public.profiles;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 30 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  -- 빈 값으로 보내면(번호를 지우는 CS 상황) null 로 저장하고, 값이 있으면 normalize_phone() 으로
  -- 포맷을 통일해 "010-1234-5678" 형태로 맞춥니다. 형식을 알 수 없는 값은 저장을 거부합니다.
  if coalesce(btrim(p_phone), '') = '' then
    v_phone := null;
  else
    v_phone := public.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'INVALID_PHONE' using errcode = '22023';
    end if;
  end if;

  begin
    update public.profiles
       set name           = v_name,
           phone          = v_phone,
           address        = nullif(btrim(coalesce(p_address, '')), ''),
           address_detail = nullif(btrim(coalesce(p_address_detail, '')), '')
     where id = p_user_id
    returning * into v_row;
  exception when unique_violation then
    raise exception '이미 해당 휴대폰 번호로 가입된 다른 계정이 존재합니다.' using errcode = '23505';
  end;

  if v_row.id is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    perform public.log_admin_action('member_profile_update', 'member', p_user_id::text,
      jsonb_build_object('name', v_row.name, 'phone', v_row.phone, 'address', v_row.address, 'address_detail', v_row.address_detail));
  exception when others then
    raise warning 'admin_update_member_profile: log_admin_action 호출 실패(정보 수정 자체는 완료됨) — %', sqlerrm;
  end;

  return v_row;
end $$;

revoke all on function public.admin_update_member_profile(uuid, text, text, text, text) from public, anon;
grant  execute on function public.admin_update_member_profile(uuid, text, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4) user_coupons / seniors — 관리자 전체 조회 (회원 상세 모달의 '보유 쿠폰' / '등록된 어르신 프로필')
--    기존 본인 전용 정책(user_coupons_select_own, seniors_select_own)은 그대로 두고, permissive
--    정책이라 OR 로 합쳐집니다 — is_admin() 인 세션만 추가로 전체 행을 볼 수 있습니다.
-- ----------------------------------------------------------------------------
drop policy if exists user_coupons_select_admin on public.user_coupons;
create policy user_coupons_select_admin on public.user_coupons
  for select to authenticated using (public.is_admin());

drop policy if exists seniors_select_admin on public.seniors;
create policy seniors_select_admin on public.seniors
  for select to authenticated using (public.is_admin());


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
