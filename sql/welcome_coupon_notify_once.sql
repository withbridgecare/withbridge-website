-- ============================================================================
-- 웰컴 쿠폰 발급 토스트가 로그인마다 반복 노출되던 버그 수정
--   - 기존 index.html 의 wbNotifyWelcomeCouponIfAny() 는 localStorage(브라우저 저장소)만으로
--     "이미 안내했는지"를 판단했습니다. localStorage 는 기기/브라우저마다 따로 저장되고
--     모바일 사생활 보호 모드·앱 웹뷰 등에서는 쉽게 사라지므로, 같은 계정이라도 다른 기기/
--     브라우저로 로그인하거나 저장소가 지워지면 "발급되었습니다" 토스트가 매번 다시 떴습니다.
--   - 이 파일은 "안내했는지"를 DB(user_coupons.notified_at)에 기록해, 쿠폰이 이미 있으면
--     (active/used/expired 상태 무관) 기기와 상관없이 평생 단 1회만 토스트가 뜨도록 만듭니다.
--
-- 실행 순서: sql/supabase_schema_latest.sql → sql/welcome_coupons.sql
--           → sql/welcome_coupon_auto_issue.sql → 이 파일.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) notified_at 컬럼 추가 — "토스트로 안내를 마쳤는지"를 서버에 기록
-- ----------------------------------------------------------------------------
alter table public.user_coupons
  add column if not exists notified_at timestamptz;

-- 기존에 이미 발급된(이 마이그레이션 이전에 가입/클레임한) 쿠폰은 전부 "안내 완료"로
-- 백필합니다. 이렇게 하지 않으면 이 마이그레이션 배포 자체가 기존 사용자 전원에게
-- 한 번씩 새로 토스트를 띄우는 또 다른 "엉뚱한 재노출"이 됩니다.
update public.user_coupons
   set notified_at = coalesce(notified_at, issued_at)
 where coupon_code = 'WELCOME_2000';


-- ----------------------------------------------------------------------------
-- 2) mark_welcome_coupon_notified() : "지금 이 호출이 최초 안내인지"를 원자적으로 판정
--    notified_at 이 null -> now() 로 바뀌는 그 한 번만 쿠폰 정보를 돌려주고,
--    이미 안내된 적이 있으면(다른 기기/브라우저에서든) 빈 결과를 돌려줍니다.
-- ----------------------------------------------------------------------------
drop function if exists public.mark_welcome_coupon_notified();

create or replace function public.mark_welcome_coupon_notified()
returns table (id uuid, amount integer)
language plpgsql security definer set search_path = public as $$
declare
  v_row public.user_coupons;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.user_coupons
     set notified_at = now()
   where user_id = auth.uid()
     and coupon_code = 'WELCOME_2000'
     and notified_at is null
  returning * into v_row;

  if not found then
    return; -- 쿠폰이 없거나, 이미(다른 기기 포함) 안내된 적이 있음 -> 토스트 띄우지 않음
  end if;

  return query select v_row.id, v_row.amount;
end $$;

revoke all on function public.mark_welcome_coupon_notified() from public, anon;
grant  execute on function public.mark_welcome_coupon_notified() to authenticated;


-- ----------------------------------------------------------------------------
-- 3) claim_welcome_coupon() : 버튼 클릭으로 즉시 발급할 때는 그 자리에서 바로
--    "웰컴 쿠폰이 발급되었습니다!" 토스트를 띄우므로, notified_at 을 발급 시점에 바로
--    채워 둡니다 — 그래야 다음 페이지 로드 때 wbNotifyWelcomeCouponIfAny() 가 같은 발급을
--    또 한 번 안내(중복 토스트)하지 않습니다.
-- ----------------------------------------------------------------------------
drop function if exists public.claim_welcome_coupon();

create or replace function public.claim_welcome_coupon()
returns table (status text, amount integer, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_row         public.user_coupons;
  v_coupon_code constant text := 'WELCOME_2000';
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
    insert into public.user_coupons (user_id, coupon_code, amount, expires_at, notified_at)
    values (auth.uid(), v_coupon_code, v_amount, now() + interval '30 days', now())
    returning * into v_row;
  exception when unique_violation then
    select * into v_row from public.user_coupons
     where user_id = auth.uid() and coupon_code = v_coupon_code;
    return query select 'already_issued'::text, v_row.amount, v_row.expires_at;
    return;
  end;

  return query select 'issued'::text, v_row.amount, v_row.expires_at;
end $$;

revoke all on function public.claim_welcome_coupon() from public, anon;
grant  execute on function public.claim_welcome_coupon() to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
