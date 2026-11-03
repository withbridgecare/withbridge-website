-- ============================================================================
-- 회원가입 시 웰컴 쿠폰(5,000원) 자동 발급
--   - sql/welcome_coupons.sql 의 user_coupons 테이블을 전제로 합니다.
--   - 기존에는 index.html '쿠폰 받고 시작하기' 버튼을 눌러야만 claim_welcome_coupon() 으로 발급됐지만,
--     이제는 auth.users 에 INSERT 되는 시점(회원가입 완료)에 트리거로 자동 발급합니다.
--   - claim_welcome_coupon() RPC 는 그대로 남겨 둡니다 — 이 트리거가 생기기 전에 가입한 기존 사용자가
--     index.html 버튼으로 쿠폰을 받을 수 있는 경로이자, 혹시 이 트리거가 실패했을 때의 복구 경로입니다.
--   - user_coupons 의 (user_id, coupon_code) UNIQUE 제약 덕분에 on conflict do nothing 만으로
--     중복 발급(재가입 트리거 재실행, 동시 INSERT 등)이 막힙니다.
--
-- 실행 순서: sql/supabase_schema_latest.sql → sql/welcome_coupons.sql → 이 파일.
-- ============================================================================

create or replace function public.issue_welcome_coupon_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_coupons (user_id, coupon_code, amount, expires_at)
  values (new.id, 'WELCOME_2000', 5000, now() + interval '30 days')
  on conflict (user_id, coupon_code) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_welcome_coupon on auth.users;
create trigger on_auth_user_created_welcome_coupon after insert on auth.users
  for each row execute function public.issue_welcome_coupon_on_signup();


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
