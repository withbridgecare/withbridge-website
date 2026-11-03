-- ============================================================================
-- 어드민 콘솔(admin.html) '회원 관리' 탭 — 전체 회원 목록 + 검색/필터
--
--   화면에 필요한 컬럼 중 이메일 / 이메일 인증 여부(email_confirmed_at) / 가입 수단(provider) 은
--   profiles 가 아니라 auth.users 에만 있고, auth 스키마는 PostgREST(클라이언트) 에 노출돼 있지
--   않습니다. 그래서 일반 RLS 정책이 아니라, admin_assign_manager() 등이 이미 쓰는 것과 같은
--   패턴(SECURITY DEFINER 함수 안에서 auth.users 를 직접 조회 — sql/admin_manual_assignment.sql
--   참고)으로 admin_list_members() RPC 하나를 추가합니다. 함수 맨 앞에서 is_admin() 을 직접 확인해
--   권한 없는 호출은 거부합니다(fail closed) — RLS 가 아니라 이 체크가 유일한 방어선이므로 반드시
--   필요합니다.
--
--   검색(이름/휴대폰)과 두 필터(가입 수단 · 인증 상태)는 모두 이 함수 안에서 서버 쪽으로 적용합니다
--   — admin.js 의 다른 목록들처럼 "불러온 페이지 안에서만" 걸러지면, 예를 들어 '미인증만' 필터가
--   맨 처음 20명 안에 미인증 회원이 없을 때 빈 목록처럼 보이는 문제가 생기기 때문입니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일.
--   Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
--   create or replace 기반이라 여러 번 실행해도 안전합니다.
--
--   참고(상세보기 모달의 '예약 내역'): service_applications 는 이미 sql/admin_service_applications_select.sql
--   의 service_applications_select_admin 정책으로 관리자가 user_id 조건 없이 전체 조회할 수 있으므로,
--   특정 회원의 예약 내역은 admin.js 가 `.from('service_applications').eq('user_id', ...)` 로 바로
--   조회합니다 — 이 파일에서 별도 RPC를 추가하지 않습니다.
-- ============================================================================

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
  created_at          timestamptz,
  address             text,
  address_detail      text
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
    u.created_at,
    p.address,
    p.address_detail
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

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
