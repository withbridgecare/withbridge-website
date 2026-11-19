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
