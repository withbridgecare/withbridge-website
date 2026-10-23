-- ============================================================================
-- 랜딩 페이지(index.html) '첫 이용 & 회원가입 특별 혜택' — 첫 동행 웰컴 쿠폰(5,000원) 발급
--   - index.html 의 [쿠폰 받고 시작하기] 버튼이 client.rpc('claim_welcome_coupon') 로 호출합니다.
--   - 사용자당 1회만 발급되도록 (user_id, coupon_code) UNIQUE 제약 + 동시 클릭(race) 시
--     unique_violation 을 already_issued 로 흡수해 중복 발급을 막습니다.
--   - create or replace / drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
--   - (2026 마진율 개편: 할인액 2,000원 → 5,000원. coupon_code 자체는 내부 식별자일 뿐 화면에 노출되지
--     않아(COUPON_LABELS 가 사람이 읽는 이름으로 바꿔 보여줌) 'WELCOME_2000' 문자열은 그대로 두고
--     금액만 올립니다 — 코드를 바꾸면 이미 발급된 쿠폰과 별개로 새 쿠폰이 또 발급돼 중복 혜택이 생깁니다.
--     이미 발급돼 있지만 아직 쓰지 않은 기존 쿠폰도 5번에서 5,000원으로 함께 올려 둡니다.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) user_coupons : 사용자별로 발급된 쿠폰
-- ----------------------------------------------------------------------------
create table if not exists public.user_coupons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  coupon_code text not null,
  amount      integer not null,
  status      text not null default 'active' check (status in ('active', 'used', 'expired')),
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  unique (user_id, coupon_code)
);

alter table public.user_coupons enable row level security;
drop policy if exists user_coupons_select_own on public.user_coupons;
create policy user_coupons_select_own on public.user_coupons
  for select to authenticated using (user_id = auth.uid());

-- 발급/사용 처리는 모두 아래 SECURITY DEFINER 함수를 통해서만 이뤄지므로, 클라이언트에는 조회 권한만 줍니다.
revoke insert, update, delete on public.user_coupons from anon, authenticated;
grant  select on public.user_coupons to authenticated;


-- ----------------------------------------------------------------------------
-- 2) claim_welcome_coupon() : 로그인한 사용자에게 '첫 동행 웰컴 쿠폰(5,000원)'을 발급
--    이미 발급받은 적이 있으면 새로 만들지 않고 status='already_issued' 로 기존 쿠폰 정보를 돌려줍니다.
-- ----------------------------------------------------------------------------
drop function if exists public.claim_welcome_coupon();

create or replace function public.claim_welcome_coupon()
returns table (status text, amount integer, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_row         public.user_coupons;
  v_coupon_code constant text := 'WELCOME_2000'; -- 내부 식별자 — 금액 인상과 무관하게 그대로 유지(위 설명 참고)
  v_amount      constant integer := 5000;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_row from public.user_coupons
   where user_id = auth.uid() and coupon_code = v_coupon_code;

  if found then
    return query select 'already_issued'::text, v_row.amount, v_row.expires_at;
    return;
  end if;

  begin
    insert into public.user_coupons (user_id, coupon_code, amount, expires_at)
    values (auth.uid(), v_coupon_code, v_amount, now() + interval '30 days')
    returning * into v_row;
  exception when unique_violation then
    -- 거의 동시에 두 번 클릭된 경우: 두 번째 요청이 중복 삽입 대신 기존 행을 already_issued 로 돌려줍니다.
    select * into v_row from public.user_coupons
     where user_id = auth.uid() and coupon_code = v_coupon_code;
    return query select 'already_issued'::text, v_row.amount, v_row.expires_at;
    return;
  end;

  return query select 'issued'::text, v_row.amount, v_row.expires_at;
end $$;

revoke all on function public.claim_welcome_coupon() from public, anon;
grant  execute on function public.claim_welcome_coupon() to authenticated;


-- ----------------------------------------------------------------------------
-- 3) 기존에 2,000원으로 이미 발급됐지만 아직 쓰지 않은 웰컴 쿠폰을 5,000원으로 소급 인상.
--    (이미 'used' 된 쿠폰은 과거 결제에 실제로 2,000원만 할인됐던 것이라 손대지 않습니다.)
-- ----------------------------------------------------------------------------
update public.user_coupons
   set amount = 5000
 where coupon_code = 'WELCOME_2000'
   and status = 'active'
   and amount <> 5000;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
