-- ============================================================================
-- 공지사항 관리 (admin.html '공지사항 관리' 섹션 ↔ notice.html 공개 페이지)
--
--   admin.html에서 등록/수정/삭제한 공지를 notice.html이 그대로 읽어 보여줍니다.
--   비로그인 방문자도 notice.html을 보므로, 게시(is_published = true)된 공지는 익명으로도
--   조회 가능해야 합니다(partner_inquiries.sql과 같은 공개 조회 패턴). 등록/수정/삭제와 비공개
--   초안 조회는 관리자만 가능합니다(admin_rls_policies.sql의 is_admin() 재사용).
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   sql/admin_rls_policies.sql(is_admin())이 먼저 적용돼 있어야 합니다.
--   create/drop ... if exists 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

create table if not exists public.notices (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null default 'service' check (category in ('service', 'maintenance', 'event')),
  badge         text check (badge is null or badge in ('must', 'important')),
  pinned        boolean not null default false,
  body          text not null,
  is_published  boolean not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.notices is 'admin.html 공지사항 관리 ↔ notice.html 공개 목록';

alter table public.notices enable row level security;

-- 1) 공개 조회: 비로그인 포함 누구나 게시된(is_published = true) 공지만 — notice.html
drop policy if exists notices_select_public on public.notices;
create policy notices_select_public on public.notices
  for select to anon, authenticated
  using (is_published = true);

-- 2) 관리자 조회: 비공개(초안) 포함 전체 — admin.html 공지사항 관리
drop policy if exists notices_select_admin on public.notices;
create policy notices_select_admin on public.notices
  for select to authenticated
  using (public.is_admin());

-- 3) 등록/수정/삭제는 관리자만
drop policy if exists notices_insert_admin on public.notices;
create policy notices_insert_admin on public.notices
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists notices_update_admin on public.notices;
create policy notices_update_admin on public.notices
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notices_delete_admin on public.notices;
create policy notices_delete_admin on public.notices
  for delete to authenticated
  using (public.is_admin());

grant select on public.notices to anon, authenticated;
grant insert, update, delete on public.notices to authenticated;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
