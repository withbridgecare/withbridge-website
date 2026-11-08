-- ============================================================================
-- B2B 기관/기업 제휴 문의 (partner.html)
--
--   요양원·주야간보호센터·복지관·의료기관 등이 partner.html 하단 폼으로 제출하는 제휴
--   문의를 저장합니다. 로그인 여부와 무관하게(기관 담당자는 위드브릿지 계정이 없는 게
--   보통이라) 익명으로 제출하므로, 다른 신청서(manager_applications 등)처럼 Edge
--   Function을 거치지 않고 anon 키로 테이블에 직접 insert합니다 — 주민번호·계좌정보처럼
--   민감한 데이터가 없는 단순 리드(lead) 폼이라 그 정도 위험은 감수합니다.
--
--   조회는 관리자만 가능합니다(admin_rls_policies.sql 의 is_admin() 재사용).
--   admin.html에 이 문의를 보여주는 화면은 아직 없습니다 — 필요하면 별도로 요청해 주세요.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   create/drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

create table if not exists public.partner_inquiries (
  id               uuid primary key default gen_random_uuid(),
  org_name         text not null,
  contact_name     text not null,
  phone            text not null,
  email            text not null,
  org_type         text not null check (org_type in ('요양원', '주야간보호센터', '복지관', '의료기관', '기타')),
  message          text,
  privacy_consent  boolean not null default false,
  status           text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at       timestamptz not null default now()
);

comment on table public.partner_inquiries is 'partner.html 제휴 문의 폼 제출 내역 (요양원/복지관/의료기관 등 B2B 리드)';

-- 이 파일을 먼저 실행해 테이블이 이미 privacy_consent 없이 만들어져 있던 경우를 위한 보정
-- (폼 개편으로 '개인정보 동의' 체크박스가 새로 추가됨 — 동의하지 않으면 제출 자체가 안 되므로
-- false 값이 저장될 일은 없지만, 과거 테스트 데이터와의 호환을 위해 기본값은 false로 둡니다).
alter table public.partner_inquiries add column if not exists privacy_consent boolean not null default false;

alter table public.partner_inquiries enable row level security;

-- 1) 누구나(비로그인 포함) 제출 가능 - 공개 리드 폼
drop policy if exists partner_inquiries_insert_public on public.partner_inquiries;
create policy partner_inquiries_insert_public on public.partner_inquiries
  for insert to anon, authenticated
  with check (true);

-- 2) 조회/수정/삭제는 관리자만
drop policy if exists partner_inquiries_select_admin on public.partner_inquiries;
create policy partner_inquiries_select_admin on public.partner_inquiries
  for select to authenticated
  using (public.is_admin());

drop policy if exists partner_inquiries_update_admin on public.partner_inquiries;
create policy partner_inquiries_update_admin on public.partner_inquiries
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists partner_inquiries_delete_admin on public.partner_inquiries;
create policy partner_inquiries_delete_admin on public.partner_inquiries
  for delete to authenticated
  using (public.is_admin());

grant insert (org_name, contact_name, phone, email, org_type, message, privacy_consent) on public.partner_inquiries to anon, authenticated;
grant select, update, delete on public.partner_inquiries to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
