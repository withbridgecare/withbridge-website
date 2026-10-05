-- ============================================================================
-- 케어 매니저 지원서 - 4단계 폼 확장 마이그레이션
--   manager-apply.html 이 기존 "이름/연락처/자격증/경력/동기" 5개 항목짜리 단일 폼에서,
--   구글폼 수준의 4단계(기본정보 → 활동조건/경력 → 정산계좌 → 서약/약관) 폼으로 바뀌면서
--   필요해진 컬럼을 sql/manager_applications.sql 의 manager_applications 테이블에 추가합니다.
--   또한 신분증 사본을 담을 비공개 Storage 버킷(manager-id-cards)과 RLS 정책을 만듭니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql → sql/manager_applications.sql
--             → 이 파일. Supabase 대시보드 → SQL Editor 에서 전체 실행.
--   add column/drop constraint if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 신규 컬럼 추가 (STEP 1~4 입력값)
-- ----------------------------------------------------------------------------
alter table public.manager_applications add column if not exists birth_date       date;
alter table public.manager_applications add column if not exists address         text;
alter table public.manager_applications add column if not exists id_image_path   text; -- storage.objects 의 object path (manager-id-cards 버킷, 본인 폴더 하위)

alter table public.manager_applications add column if not exists activity_areas    text[] not null default '{}'; -- STEP2: 활동 가능 지역 (다중)
alter table public.manager_applications add column if not exists activity_schedule text[] not null default '{}'; -- STEP2: 활동 가능 요일/시간대 (다중)
alter table public.manager_applications add column if not exists certifications    text[] not null default '{}'; -- STEP2: 보유 자격증 (다중, '해당 없음' 포함 가능)
alter table public.manager_applications add column if not exists career_experience text; -- STEP2: 관련 경력 및 경험 (자유 서술, 없으면 '없음')

alter table public.manager_applications add column if not exists bank_name       text; -- STEP3: 정산 은행명
alter table public.manager_applications add column if not exists account_number  text; -- STEP3: 계좌번호
alter table public.manager_applications add column if not exists account_holder  text; -- STEP3: 예금주명

alter table public.manager_applications add column if not exists agree_safety         boolean not null default false; -- STEP4: 범죄이력·안전 자가확인 서약
alter table public.manager_applications add column if not exists agree_no_direct_deal boolean not null default false; -- STEP4: 직거래(우회 거래) 금지 동의
alter table public.manager_applications add column if not exists agree_privacy        boolean not null default false; -- STEP4: 개인정보 수집·이용 동의

-- ----------------------------------------------------------------------------
-- 2) 옛 컬럼(certification/experience_years/motivation) → 새 컬럼으로 데이터 이전 후 제거
--    (admin.js / manager-apply.html 모두 새 컬럼만 사용하도록 이번 커밋에서 함께 바꿉니다)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'manager_applications' and column_name = 'certification') then
    update public.manager_applications
       set certifications = array[certification]
     where certification is not null and coalesce(array_length(certifications, 1), 0) = 0;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'manager_applications' and column_name = 'motivation')
     or exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'manager_applications' and column_name = 'experience_years') then
    update public.manager_applications a
       set career_experience = coalesce(
             a.career_experience,
             nullif(to_jsonb(a) ->> 'motivation', ''),
             case when (to_jsonb(a) ->> 'experience_years') is not null
                  then (to_jsonb(a) ->> 'experience_years') || '년' end
           );
  end if;
end $$;

-- 기존 행(과거 단일 폼으로 접수됨) 중 새 필수 컬럼이 비어 있는 경우를 위한 백필 —
-- 실제 운영 데이터가 있다면 반려 처리 후 재지원을 받는 편이 맞지만, 여기서는 NOT NULL 제약을
-- 걸기 위한 최소한의 placeholder 만 채웁니다.
update public.manager_applications set career_experience = '없음' where career_experience is null;
update public.manager_applications set address = '-' where address is null;
update public.manager_applications set bank_name = '-' where bank_name is null;
update public.manager_applications set account_number = '-' where account_number is null;
update public.manager_applications set account_holder = name where account_holder is null;

alter table public.manager_applications alter column career_experience set not null;
alter table public.manager_applications alter column address         set not null;
alter table public.manager_applications alter column bank_name       set not null;
alter table public.manager_applications alter column account_number  set not null;
alter table public.manager_applications alter column account_holder  set not null;

alter table public.manager_applications drop column if exists certification;
alter table public.manager_applications drop column if exists experience_years;
alter table public.manager_applications drop column if exists motivation;

-- ----------------------------------------------------------------------------
-- 3) 체크 제약: 활동 지역/시간대 최소 1개, 약관은 전부 동의해야 insert 가능
-- ----------------------------------------------------------------------------
-- 주의: array_length('{}', 1) 은 0 이 아니라 NULL 을 반환하므로(빈 배열은 해당 차원이 아예 없음),
-- "array_length(...) > 0" 로만 쓰면 NULL > 0 → NULL 이 되어 CHECK 를 통과시켜 버립니다(빈 배열이 그대로 insert됨).
-- coalesce 로 NULL 을 0 으로 바꿔야 빈 배열을 실제로 막을 수 있습니다.
alter table public.manager_applications drop constraint if exists manager_applications_areas_check;
alter table public.manager_applications add constraint manager_applications_areas_check
  check (coalesce(array_length(activity_areas, 1), 0) > 0);

alter table public.manager_applications drop constraint if exists manager_applications_schedule_check;
alter table public.manager_applications add constraint manager_applications_schedule_check
  check (coalesce(array_length(activity_schedule, 1), 0) > 0);

alter table public.manager_applications drop constraint if exists manager_applications_agree_check;
alter table public.manager_applications add constraint manager_applications_agree_check
  check (agree_safety and agree_no_direct_deal and agree_privacy);

-- ----------------------------------------------------------------------------
-- 4) approve_manager_application(): certifications(배열) → managers.certification(text) 로 합쳐 저장
--    (sql/manager_applications.sql 의 정의를 certifications 배열에 맞게 교체)
-- ----------------------------------------------------------------------------
create or replace function public.approve_manager_application(p_application_id uuid)
returns public.manager_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app public.manager_applications;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  update public.manager_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null
   where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.managers (id, certification, certification_verified, activity_status, approved_at)
  values (
    v_app.user_id,
    nullif(array_to_string(v_app.certifications, ', '), ''),
    true, 'break', now()
  )
  on conflict (id) do update
    set certification = excluded.certification,
        certification_verified = true,
        approved_at = now();

  update public.profiles set role = 'manager' where id = v_app.user_id;

  return v_app;
end $$;

revoke all on function public.approve_manager_application(uuid) from public, anon;
grant  execute on function public.approve_manager_application(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) 신분증 사본 Storage 버킷 (비공개) + RLS
--    경로 규칙: "<auth.uid()>/<timestamp>_<파일명>" — 폴더명이 본인 uid 와 일치해야 업로드/조회 가능.
--    관리자는 is_admin() 이면 전체 조회 가능 (지원서 검토 화면에서 서명 URL로 열람).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manager-id-cards', 'manager-id-cards', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists manager_id_cards_insert_own on storage.objects;
create policy manager_id_cards_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'manager-id-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists manager_id_cards_select_own_or_admin on storage.objects;
create policy manager_id_cards_select_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'manager-id-cards'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- 제출 전 다시 첨부하는 경우를 위해 본인 폴더 안에서만 삭제 허용 (덮어쓰기는 새 파일명으로 올리고 이전 파일을 지우는 방식)
drop policy if exists manager_id_cards_delete_own on storage.objects;
create policy manager_id_cards_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'manager-id-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
