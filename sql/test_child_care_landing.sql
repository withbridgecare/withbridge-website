-- ============================================================================
-- [테스트용] 아동 케어 타겟 확장 검증 — test/child-care-landing.html 전용
--
--   목적: 기존 시니어 동행 서비스(service_applications)와 완전히 분리된 새 타겟(아동 돌봄
--   동행/매니저 모집) 수요를 가늠하기 위한 리드(lead) 수집 테이블입니다. 메인 서비스 테이블
--   (service_applications, manager_applications 등)은 전혀 건드리지 않고, 이 파일만 실행하면
--   test/child-care-landing.html 의 두 폼(보호자 관심 등록 / 매니저 모집 관심 등록)이 바로
--   동작합니다. 검증이 끝나고 더 안 쓰게 되면 아래 두 테이블만 drop 하면 깨끗이 제거됩니다
--   (다른 테이블이 이 테이블을 참조하지 않음).
--
--   partner_inquiries.sql 과 동일한 패턴: 로그인 여부와 무관하게 익명 제출, 조회는 관리자만.
--   주민번호·계좌정보 등 민감 데이터가 없는 단순 리드 폼이라 Edge Function 없이 anon 키로
--   테이블에 직접 insert합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   create/drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 1) 보호자: 아동 돌봄 동행 서비스 관심 등록 ------------------------------------
create table if not exists public.test_child_care_leads (
  id                uuid primary key default gen_random_uuid(),
  guardian_name     text not null,
  phone             text not null,
  child_age_group   text not null check (child_age_group in ('영유아(0-3세)', '유치원(4-6세)', '초등 저학년(7-9세)', '초등 고학년(10-12세)')),
  region            text not null,
  service_interest  text not null check (service_interest in ('등하원 동행', '학원·과외 동행', '일시 돌봄', '기타')),
  message           text,
  privacy_consent   boolean not null default false,
  status            text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at        timestamptz not null default now()
);

comment on table public.test_child_care_leads is '[테스트] test/child-care-landing.html 보호자용 폼 — 아동 돌봄 동행 서비스 수요 검증용 리드. 운영 테이블과 분리되어 있어 삭제해도 다른 기능에 영향 없음.';

alter table public.test_child_care_leads enable row level security;

drop policy if exists test_child_care_leads_insert_public on public.test_child_care_leads;
create policy test_child_care_leads_insert_public on public.test_child_care_leads
  for insert to anon, authenticated
  with check (true);

drop policy if exists test_child_care_leads_select_admin on public.test_child_care_leads;
create policy test_child_care_leads_select_admin on public.test_child_care_leads
  for select to authenticated
  using (public.is_admin());

drop policy if exists test_child_care_leads_update_admin on public.test_child_care_leads;
create policy test_child_care_leads_update_admin on public.test_child_care_leads
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists test_child_care_leads_delete_admin on public.test_child_care_leads;
create policy test_child_care_leads_delete_admin on public.test_child_care_leads
  for delete to authenticated
  using (public.is_admin());

grant insert (guardian_name, phone, child_age_group, region, service_interest, message, privacy_consent)
  on public.test_child_care_leads to anon, authenticated;
grant select, update, delete on public.test_child_care_leads to authenticated;

-- 2) 아동 돌봄 케어 매니저 모집 관심 등록 ---------------------------------------
create table if not exists public.test_child_care_manager_leads (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text not null,
  region            text not null,
  experience        text,
  has_certificate   boolean not null default false,
  message           text,
  privacy_consent   boolean not null default false,
  status            text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at        timestamptz not null default now()
);

comment on table public.test_child_care_manager_leads is '[테스트] test/child-care-landing.html 매니저 모집용 폼 — 아동 돌봄 가능 매니저 풀 검증용 리드. 운영 테이블과 분리되어 있어 삭제해도 다른 기능에 영향 없음.';

alter table public.test_child_care_manager_leads enable row level security;

drop policy if exists test_child_care_manager_leads_insert_public on public.test_child_care_manager_leads;
create policy test_child_care_manager_leads_insert_public on public.test_child_care_manager_leads
  for insert to anon, authenticated
  with check (true);

drop policy if exists test_child_care_manager_leads_select_admin on public.test_child_care_manager_leads;
create policy test_child_care_manager_leads_select_admin on public.test_child_care_manager_leads
  for select to authenticated
  using (public.is_admin());

drop policy if exists test_child_care_manager_leads_update_admin on public.test_child_care_manager_leads;
create policy test_child_care_manager_leads_update_admin on public.test_child_care_manager_leads
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists test_child_care_manager_leads_delete_admin on public.test_child_care_manager_leads;
create policy test_child_care_manager_leads_delete_admin on public.test_child_care_manager_leads
  for delete to authenticated
  using (public.is_admin());

grant insert (name, phone, region, experience, has_certificate, message, privacy_consent)
  on public.test_child_care_manager_leads to anon, authenticated;
grant select, update, delete on public.test_child_care_manager_leads to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';

-- ★ 나중에 이 테스트를 완전히 걷어낼 때:
--   drop table if exists public.test_child_care_leads;
--   drop table if exists public.test_child_care_manager_leads;
