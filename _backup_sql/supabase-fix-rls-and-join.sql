-- ============================================================================
-- 보호자 마이페이지(mypage.html)가 service_applications 를 조회할 때 care_schedules 를
-- PostgREST 임베드(JOIN)로 한 번에 가져올 수 있도록, FK 관계를 명확히 하고 RLS 를 보강합니다.
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.
-- (supabase-manager-schema.sql, supabase-applications-to-manager.sql, supabase-fix-schedule-links.sql 을
--  먼저 실행했다고 가정합니다 — care_schedules.application_id 컬럼이 이미 있어야 합니다)
--
-- ▶ 지금까지의 증상 재정리: 보호자 콘솔에 `care_schedules 연결: false` 가 계속 남는 근본 원인은
--   (1) care_schedules 에 대한 보호자 SELECT 권한이 오직 guardian_id 스냅샷 컬럼 하나에만 의존했고
--       (accept 시점에 채워지는 값이라, 그 이전에 만들어진 행이나 채워지는 과정에서 놓친 행은 영영 못 봄),
--   (2) service_applications ↔ care_schedules 사이에 PostgREST 가 자동으로 JOIN 할 수 있는 '정식' FK 가
--       느슨하게만 있어서(mypage.html 이 두 번 따로 쿼리해서 애플리케이션 코드로 직접 이어붙여야 했음),
--   두 가지가 겹쳐 있었기 때문입니다. 이 파일은 둘 다 application_id 라는 하나의 확실한 키로 통일합니다.
-- ============================================================================

-- 1) FK 관계를 이름 있는 제약으로 명확히 정의 -----------------------------------
--    (application_id 컬럼 자체는 supabase-fix-schedule-links.sql 이 이미 추가했습니다 — 여기서는 그
--    관계를 PostgREST 가 스키마 캐시에서 확실히 찾을 수 있는 '이름 있는' FK/UNIQUE 제약으로 못박습니다)
alter table public.care_schedules add column if not exists application_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'care_schedules_application_id_fkey'
  ) then
    alter table public.care_schedules
      add constraint care_schedules_application_id_fkey
      foreign key (application_id) references public.service_applications(id) on delete set null;
  end if;
end $$;

-- 신청 1건당 일정은 최대 1건(1:1)입니다 — UNIQUE 제약을 걸어야 PostgREST 임베드가 배열이 아니라
-- 객체 하나(또는 null)로 내려와서, mypage.html 에서 care_schedules(*) 를 배열 인덱싱 없이 바로 씁니다.
-- (NULL 은 UNIQUE 제약에서 여러 번 허용되므로, 아직 일정이 없는 신청이 여러 건이어도 문제 없습니다)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'care_schedules_application_id_key'
  ) then
    alter table public.care_schedules add constraint care_schedules_application_id_key unique (application_id);
  end if;
end $$;

-- 2) 보호자 RLS: service_applications.user_id = auth.uid() 를 거쳐 확인 --------------
--    기존 care_schedules_select_guardian(= guardian_id 스냅샷 컬럼 기준) 정책은 그대로 두고, 이 정책을
--    OR 로 추가합니다 — 매니저가 배정될 때 guardian_id 채우기를 놓친 행이 있어도, service_applications 쪽
--    소유권(이미 다른 화면에서도 신뢰하고 있는 user_id = auth.uid())만 맞으면 이 정책으로 보이게 됩니다.
drop policy if exists care_schedules_select_guardian_via_application on public.care_schedules;
create policy care_schedules_select_guardian_via_application on public.care_schedules
  for select to authenticated using (
    exists (
      select 1 from public.service_applications a
      where a.id = care_schedules.application_id
        and a.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';   -- PostgREST 가 새 FK/제약을 스키마 캐시에 바로 반영하도록

-- ★ 확인용 (SQL Editor)
--   FK/UNIQUE 제약이 등록됐는지:
--     select conname, contype from pg_constraint
--     where conname in ('care_schedules_application_id_fkey', 'care_schedules_application_id_key');
--   RLS 정책 목록:
--     select policyname, cmd, qual from pg_policies
--     where schemaname = 'public' and tablename = 'care_schedules';
--   PostgREST 임베드 쿼리 예시(브라우저 콘솔/앱 코드에서, service_applications RLS 로 이미 user_id 필터됨):
--     supabase.from('service_applications')
--       .select('*, care_schedules!care_schedules_application_id_fkey(*)')
--       .eq('user_id', '<내 계정 uuid>');
--   보호자 계정으로 로그인한 세션(anon key + 로그인, SQL Editor 아님)에서 위 쿼리가 care_schedules 를
--   포함해 돌려주는지 확인하세요 — SQL Editor 는 auth.uid() 가 없어 이 정책이 빈 결과만 돌려줍니다.
