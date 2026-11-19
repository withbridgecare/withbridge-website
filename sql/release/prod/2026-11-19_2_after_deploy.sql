-- ============================================================================
-- [운영 DB] 2026-11-19 릴리스 — 2단계: 코드 배포 "후"에 실행
-- ============================================================================
-- 포함 내용
--   A) 현장 사진 버킷 비공개 전환 + 신분증 업로드 제한   (sql/private_storage_and_pii_hardening.sql)
--   B) 매니저 계좌번호 암호화 저장 + 기존 데이터 암호화   (sql/manager_bank_account_encryption.sql)
--
-- 왜 배포 후에 실행하나
--   A 를 먼저 하면 옛 코드는 사진을 공개 주소로 열어서 사진이 안 보이고,
--   B 를 먼저 하면 옛 관리자 화면에는 [전체 보기] 버튼이 없어 전체 계좌번호를 볼 수 없습니다.
--   새 코드는 SQL 실행 전/후 모두에서 동작하므로, 배포 직후 바로 실행하면 됩니다.
--
-- 실행 후 확인 (결과가 0 이면 정상):
--   select count(*) from public.manager_applications where account_number ~ '\d{5,}';
--
-- ⚠ Vault 의 'bank_account_key' 는 절대 삭제 금지 (삭제 시 계좌번호 복호화 불가).
-- 여러 번 실행해도 안전합니다. 하나라도 실패하면 전체가 취소됩니다(트랜잭션).
-- ============================================================================

begin;


-- ############################################################################
-- ### 원본: sql/private_storage_and_pii_hardening.sql
-- ############################################################################

-- ============================================================================
-- 개인정보(회원정보) 외부 유출 방지 — Storage 비공개 전환 + 업로드 경로 제한
-- ============================================================================
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다(idempotent).
--
-- 무엇이 문제였나
--   1) care-departure-photos 버킷이 public 이었고, storage.objects 에 "to public" SELECT 정책이 있어
--      로그인하지 않은 누구나(anon 키는 사이트 소스에 공개되어 있음) 버킷 목록을 조회해
--      모든 케어 현장 사진(어르신 얼굴·집 앞·차량 번호 등 + 워터마크의 시각/위치)을 내려받을 수 있었습니다.
--   2) manager-id-cards(신분증) 버킷에 비로그인(anon) 업로드 정책과, 다른 사람 폴더에도 올릴 수 있는
--      업로드 정책이 남아 있었습니다.
--
-- 바뀌는 점
--   - care-departure-photos 를 비공개(private)로 바꾸고, 조회는 "그 일정을 볼 수 있는 사람"
--     (담당 매니저 · 보호자 · 관리자 — care_schedules RLS 를 그대로 상속)만 서명 URL 로 가능하게 합니다.
--     화면은 js/privacy-guard.js 가 예전 공개 URL 을 자동으로 서명 URL 로 바꿔 보여주므로 DB 값을
--     바꿀 필요가 없습니다.
--   - 업로드는 해당 일정의 담당 매니저만, 자기 일정 폴더(<schedule_id>/...)에만 가능합니다.
--   - 신분증 버킷: anon 업로드 제거, 로그인 사용자는 자기 폴더(<user_id>/...)에만 업로드.
-- ============================================================================

-- 1) 출발 인증 사진 버킷 비공개 전환 -------------------------------------------
update storage.buckets set public = false where id = 'care-departure-photos';

drop policy if exists care_departure_photos_select_public on storage.objects;
drop policy if exists care_departure_photos_select_authorized on storage.objects;
create policy care_departure_photos_select_authorized on storage.objects
  for select to authenticated
  using (
    bucket_id = 'care-departure-photos'
    and (
      public.is_admin()
      -- care_schedules 의 기존 RLS(담당 매니저 / 보호자 / 신청자)를 그대로 따릅니다:
      -- 호출자가 볼 수 있는 일정의 폴더일 때만 통과합니다.
      or exists (
        select 1 from public.care_schedules cs
        where cs.id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists care_departure_photos_insert_authenticated on storage.objects;
drop policy if exists care_departure_photos_insert_assigned_manager on storage.objects;
create policy care_departure_photos_insert_assigned_manager on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'care-departure-photos'
    and exists (
      select 1 from public.care_schedules cs
      where cs.id::text = (storage.foldername(name))[1]
        and cs.manager_id = auth.uid()
    )
  );

-- 2) 신분증 버킷 업로드 제한 ----------------------------------------------------
update storage.buckets set public = false where id = 'manager-id-cards';

drop policy if exists manager_id_cards_insert_anon on storage.objects;
drop policy if exists manager_id_cards_insert_authenticated on storage.objects;
drop policy if exists manager_id_cards_insert_own on storage.objects;
create policy manager_id_cards_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'manager-id-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) 확인용 쿼리 (실행 후 결과에서 public = false 인지 확인) ----------------------
-- select id, public from storage.buckets where id in ('care-departure-photos', 'manager-id-cards');
-- select policyname, roles, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';

notify pgrst, 'reload schema';


-- ############################################################################
-- ### 원본: sql/manager_bank_account_encryption.sql
-- ############################################################################

-- ============================================================================
-- 매니저 정산 계좌번호 암호화 저장 (manager_applications.account_number)
-- ============================================================================
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다(idempotent).
-- 선행 조건: sql/admin_rls_policies.sql(is_admin), sql/admin_logs.sql(log_admin_action) 적용 완료.
--
-- 동작 방식
--   1) 암호화 키는 DB 안에서 무작위로 생성해 Supabase Vault('bank_account_key')에만 보관합니다.
--      (저장소·코드·브라우저 어디에도 키가 없습니다. 키를 잃어버리면 복호화할 수 없으니 Vault 를 지우지 마세요.)
--   2) account_number 에 값이 들어오면(INSERT, 또는 값이 바뀌는 UPDATE) 트리거가
--      - 원본 숫자를 pgp_sym_encrypt 로 암호화해 account_number_enc(bytea)에 저장하고
--      - account_number 컬럼에는 '****1234' 처럼 끝 4자리만 남긴 마스킹 값을 저장합니다.
--      → submit-manager-application(Edge Function) 등 기존 저장 코드는 수정 없이 그대로 동작합니다.
--   3) 전체 계좌번호는 관리자만 admin_reveal_manager_account(id) RPC 로 볼 수 있으며,
--      조회할 때마다 admin_logs 에 'reveal_bank_account' 기록이 남습니다.
--   4) 이미 저장돼 있던 평문 계좌번호도 이 스크립트가 한 번에 암호화·마스킹합니다.
--
-- ⚠ 참고: 이 스크립트 실행 이전에 만들어진 DB 백업(Supabase 자동 백업 포함)에는 평문이 남아 있을 수 있습니다.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) 암호화 키 (없을 때만 생성) ---------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bank_account_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'bank_account_key',
      'manager_applications.account_number 암호화 키 (삭제 금지 — 삭제 시 복호화 불가)'
    );
  end if;
end $$;

-- 키 조회 (내부 전용 — 외부 역할에는 실행 권한을 주지 않음)
create or replace function public._bank_account_key() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'bank_account_key' limit 1
$$;
revoke all on function public._bank_account_key() from public, anon, authenticated;

-- 2) 암호문 컬럼 ----------------------------------------------------------------
alter table public.manager_applications add column if not exists account_number_enc bytea;

-- 마스킹 규칙: 숫자만 남긴 뒤 끝 4자리만 노출
create or replace function public._mask_account_number(p_digits text) returns text
language sql immutable as $$
  select case
    when p_digits is null or p_digits = '' then '-'
    when length(p_digits) <= 4 then '****'
    else '****' || right(p_digits, 4)
  end
$$;

-- 3) 기존 평문 데이터 일괄 암호화 (트리거 생성 전에 실행) ---------------------------
drop trigger if exists manager_applications_encrypt_account on public.manager_applications;

update public.manager_applications
   set account_number_enc = extensions.pgp_sym_encrypt(regexp_replace(account_number, '\D', '', 'g'), public._bank_account_key()),
       account_number     = public._mask_account_number(regexp_replace(account_number, '\D', '', 'g'))
 where account_number_enc is null
   and account_number is not null
   and regexp_replace(account_number, '\D', '', 'g') <> '';

-- 4) 저장 시 자동 암호화 트리거 ----------------------------------------------------
create or replace function public.manager_applications_encrypt_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_digits text;
begin
  -- UPDATE 인데 계좌번호가 바뀌지 않았으면(마스킹 값 그대로) 아무것도 하지 않습니다.
  if tg_op = 'UPDATE' and new.account_number is not distinct from old.account_number then
    new.account_number_enc := old.account_number_enc; -- 암호문을 직접 덮어쓰는 것도 막음
    return new;
  end if;

  -- 화면에서 받은 마스킹 값('****1234')이 다시 저장되는 경우: 끝 4자리만 암호화돼 원본이 사라지지
  -- 않도록 기존 값을 그대로 유지합니다.
  if tg_op = 'UPDATE' and new.account_number like '*%' then
    new.account_number     := old.account_number;
    new.account_number_enc := old.account_number_enc;
    return new;
  end if;

  v_digits := regexp_replace(coalesce(new.account_number, ''), '\D', '', 'g');
  if v_digits = '' then
    new.account_number_enc := null;
    new.account_number := coalesce(nullif(btrim(new.account_number), ''), '-');
    return new;
  end if;

  new.account_number_enc := extensions.pgp_sym_encrypt(v_digits, public._bank_account_key());
  new.account_number     := public._mask_account_number(v_digits);
  return new;
end $$;

create trigger manager_applications_encrypt_account
  before insert or update on public.manager_applications
  for each row execute function public.manager_applications_encrypt_account();

-- 5) 관리자 전용 전체 계좌번호 조회 RPC (조회 기록 남김) -------------------------------
create or replace function public.admin_reveal_manager_account(p_application_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_enc bytea;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select account_number_enc into v_enc from public.manager_applications where id = p_application_id;
  if v_enc is null then
    return null;
  end if;

  perform public.log_admin_action('reveal_bank_account', 'manager_application', p_application_id::text, null);
  return extensions.pgp_sym_decrypt(v_enc, public._bank_account_key());
end $$;

revoke all on function public.admin_reveal_manager_account(uuid) from public, anon;
grant  execute on function public.admin_reveal_manager_account(uuid) to authenticated;

-- 6) 확인용 쿼리 -------------------------------------------------------------------
-- 평문이 남아 있는 행이 0건이어야 합니다:
-- select count(*) from public.manager_applications where account_number ~ '\d{5,}';

notify pgrst, 'reload schema';

commit;
