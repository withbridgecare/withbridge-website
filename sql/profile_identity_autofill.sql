-- ============================================================================
-- profiles.name / profiles.phone 자동 보정
--
--   지금까지는 profiles.name/phone 이 비어 있을 때 "읽는 시점"에만 보조 값을 찾아 보여주는
--   방식이었습니다(예: sql/manager_applications.sql 의 my_application_managers(),
--   admin.js 의 fetchActiveManagersWithNames()/fillMissingGuardianContact()) — 화면마다 각자
--   COALESCE/fallback 쿼리를 따로 짜야 했고, 아직 그 fallback을 안 넣은 화면은 여전히 "미등록"이
--   보였습니다(어드민 콘솔 디버깅 세션에서 확인된 근본 원인 — profiles.name/phone 이 실제로
--   NULL인 행이 존재함: 카카오 로그인은 전화번호를 전혀 주지 않고, 닉네임 제공을 거부하면
--   이름도 없습니다).
--
--   이 파일은 그 보조 값들을 "쓰는 시점"에 profiles 테이블에 직접 채워 넣습니다 — 한 번 채워지면
--   그 뒤로는 모든 화면이 fallback 없이 profiles.name/phone 만 읽어도 값이 보입니다:
--
--     1) handle_new_user() 보강 — 가입 시 auth 메타데이터에 phone(또는 phone_number)이 있으면
--        profiles.phone 도 같이 채웁니다(지금까지는 name만 복사했습니다).
--     2) manager_applications 트리거 — 신청서가 '승인'되는 순간, 그 신청서에 적힌(가입 시
--        필수 입력이라 비어 있을 수 없는) name/phone 으로 profiles 의 빈 칸만 채웁니다.
--     3) service_applications 트리거 — 보호자가 신청서를 낼 때마다, 그 신청서의
--        user_contact("이름 / 연락처", apply.html 에서 매번 직접 입력) 로 profiles 의 빈 칸만
--        채웁니다.
--     4) 위 두 트리거가 "앞으로" 생기는 데이터에만 적용되므로, 이미 쌓여 있는 기존 행도 한 번
--        같은 규칙으로 보정합니다(멱등 — 이미 채워진 행은 WHERE 조건에서 자연히 빠집니다).
--
--   전부 "이미 값이 있으면 절대 덮어쓰지 않고, 비어 있을 때만 채운다"는 원칙입니다 — 사용자가
--   나중에 직접 수정한 이름/번호를 트리거가 되돌리는 일은 없습니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/manager_applications.sql → 이 파일.
--   전부 create or replace / drop trigger if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) handle_new_user() 재정의 — 가입 시점에 메타데이터의 phone/phone_number 도 함께 복사.
--    (name 쪽 로직은 sql/supabase_schema_latest.sql 원본과 동일 — phone만 추가)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, phone)
  values (
    new.id, 'guardian',
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number')
  )
  on conflict (id) do nothing;
  return new;
end $$;
-- 트리거(on_auth_user_created)는 sql/supabase_schema_latest.sql 에 이미 있고 함수만 바뀌면
-- 충분합니다 — 다시 만들 필요 없습니다.


-- ----------------------------------------------------------------------------
-- 2) manager_applications 승인 시 profiles 보정 — status 가 'approved' 로 바뀌는(또는 바로
--    'approved' 로 insert되는) 순간, name/phone(둘 다 신청서 제출 시 필수 입력이라 not null)으로
--    profiles 의 빈 칸만 채웁니다. sql/protect_admin_role.sql 의 approve_manager_application()
--    이 하는 UPDATE 를 그대로 타므로, 그 함수를 또 고칠 필요 없이 트리거 하나로 해결됩니다 — 누가
--    어떤 경로로 status 를 'approved' 로 바꾸든(직접 UPDATE 포함) 항상 적용됩니다.
-- ----------------------------------------------------------------------------
create or replace function public.backfill_profile_from_manager_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set name  = coalesce(nullif(btrim(name), ''), nullif(btrim(new.name), '')),
         phone = coalesce(nullif(btrim(phone), ''), nullif(btrim(new.phone), ''))
   where id = new.user_id
     and (nullif(btrim(name), '') is null or nullif(btrim(phone), '') is null);
  return new;
end $$;

drop trigger if exists manager_applications_backfill_profile on public.manager_applications;
create trigger manager_applications_backfill_profile
  after insert or update of status on public.manager_applications
  for each row
  when (new.status = 'approved')
  execute function public.backfill_profile_from_manager_application();


-- ----------------------------------------------------------------------------
-- 3) service_applications 신청 시 profiles 보정 — apply.html 이 신청서를 낼 때마다 함께 입력받는
--    user_contact("신청자 성함 / 신청자 연락처", apply.html 의 applicant_name + ' / ' + applicant_phone
--    형식)를 분해해 profiles 의 빈 칸만 채웁니다. 구분자 ' / '가 없으면(형식이 다른 옛 데이터 등)
--    전체를 이름으로 보고 연락처는 비워 둡니다 — admin.js 의 parseUserContact() 와 같은 규칙입니다.
-- ----------------------------------------------------------------------------
create or replace function public.backfill_profile_from_service_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_phone text;
  v_sep   int;
begin
  if new.user_contact is null or btrim(new.user_contact) = '' then
    return new;
  end if;

  v_sep := position(' / ' in new.user_contact);
  if v_sep > 0 then
    v_name  := nullif(btrim(substr(new.user_contact, 1, v_sep - 1)), '');
    v_phone := nullif(btrim(substr(new.user_contact, v_sep + 3)), '');
  else
    v_name  := nullif(btrim(new.user_contact), '');
    v_phone := null;
  end if;

  update public.profiles
     set name  = coalesce(nullif(btrim(name), ''), v_name),
         phone = coalesce(nullif(btrim(phone), ''), v_phone)
   where id = new.user_id
     and (nullif(btrim(name), '') is null or nullif(btrim(phone), '') is null);
  return new;
end $$;

drop trigger if exists service_applications_backfill_profile on public.service_applications;
create trigger service_applications_backfill_profile
  after insert on public.service_applications
  for each row
  execute function public.backfill_profile_from_service_application();


-- ----------------------------------------------------------------------------
-- 4) 기존 행 한 번 보정 — 위 두 트리거는 "앞으로" 일어나는 INSERT/UPDATE에만 반응하므로, 이미
--    쌓여 있던 행은 한 번 같은 규칙으로 직접 채웁니다. 이미 채워진 profiles 행은 WHERE 조건에서
--    빠지므로 여러 번 실행해도 안전합니다(멱등).
-- ----------------------------------------------------------------------------

-- 4a) 매니저 — 승인된 신청서 중 가장 최근 것으로 채움
update public.profiles p
   set name  = coalesce(nullif(btrim(p.name), ''), nullif(btrim(ma.name), '')),
       phone = coalesce(nullif(btrim(p.phone), ''), nullif(btrim(ma.phone), ''))
  from (
    select distinct on (user_id) user_id, name, phone
      from public.manager_applications
     where status = 'approved'
     order by user_id, reviewed_at desc nulls last
  ) ma
 where ma.user_id = p.id
   and (nullif(btrim(p.name), '') is null or nullif(btrim(p.phone), '') is null);

-- 4b) 보호자 — user_contact 가 있는 신청서 중 가장 최근 것으로 채움
update public.profiles p
   set name  = coalesce(nullif(btrim(p.name), ''), nullif(btrim(split_part(sa.user_contact, ' / ', 1)), '')),
       phone = coalesce(nullif(btrim(p.phone), ''), nullif(btrim(split_part(sa.user_contact, ' / ', 2)), ''))
  from (
    select distinct on (user_id) user_id, user_contact
      from public.service_applications
     where user_contact is not null and btrim(user_contact) <> ''
     order by user_id, created_at desc
  ) sa
 where sa.user_id = p.id
   and (nullif(btrim(p.name), '') is null or nullif(btrim(p.phone), '') is null);


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
