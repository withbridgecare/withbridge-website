-- =====================================================================
-- 위드브릿지: 역할 기반 마이페이지(보호자 / 케어매니저)용 스키마
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. (여러 번 실행해도 안전하도록 작성)
--
-- 보안 원칙
--  * role 은 클라이언트가 바꿀 수 없음: profiles 는 SELECT 만 허용 (수정은 대시보드/서비스 키로만)
--  * 매니저는 '자기 일정/리포트'만 조회, 일정은 status 컬럼만 수정 가능 (정산금액 payout_amount 수정 불가)
--  * 상태 변경은 assigned → departed → arrived → completed 순서만 허용 (트리거)
--  * 신청 대기(pending, 담당자 없음) 건은 '인증된 매니저(is_manager())'만 조회하고, 수락은 accept_care_request() 함수로만 가능
--    (조건 확인과 갱신이 한 문장이라 두 명이 동시에 눌러도 한 명만 성공)
-- =====================================================================

-- 1) profiles : auth.users 와 1:1, 역할 보관 -----------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text default 'guardian',
  name       text,
  phone      text,
  created_at timestamptz not null default now()
);
-- 이미 profiles 테이블이 있는 경우를 위해 필요한 컬럼만 보강
alter table public.profiles add column if not exists role  text default 'guardian';
alter table public.profiles add column if not exists name  text;
alter table public.profiles add column if not exists phone text;

alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant  select on public.profiles to authenticated;

-- 신규 가입자는 자동으로 guardian 프로필 생성 (카카오 이름 복사)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'guardian',
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 기존 가입자 백필
insert into public.profiles (id, role)
select id, 'guardian' from auth.users
on conflict (id) do nothing;

-- ★ 케어매니저 지정 방법 (예시: 대시보드/서비스 키로만 가능 — 브라우저에서는 수정할 수 없음)
--   화면(전환 메뉴·매니저 페이지)은 'managers 테이블에 행이 있는가', 데이터 접근(RLS)은 거기에 certification_verified = true 까지 필요합니다.
--   (user_metadata / localStorage 는 사용자가 직접 고칠 수 있어 권한 판단에 쓰지 않습니다)
--        insert into public.managers (id, certification)
--        values ('<해당 사용자 UUID>', '요양보호사');          -- certification_verified 를 생략하면 기본값 true (인증 전으로 등록하려면 false 를 직접 지정)
--        update public.profiles set name = '김은지' where id = '<해당 사용자 UUID>';   -- (선택)
--   자격 회수: update public.managers set certification_verified = false where id = '<UUID>';

-- 2) managers : 매니저 전용 정보 (자격 / 활동 상태) -----------------------
create table if not exists public.managers (
  id                     uuid primary key references public.profiles(id) on delete cascade,
  certification          text,                                   -- 예: 요양보호사, 간호조무사
  certification_verified boolean not null default true,           -- 새로 등록하는 매니저는 기본 '인증 완료' (인증 전으로 두려면 false 를 직접 지정)
  activity_status        text not null default 'break'
                         check (activity_status in ('online', 'break'))
);
-- 이미 만들어 둔 표에는 위 CREATE 가 적용되지 않으므로 기본값을 따로 맞춥니다 (이미 있는 행의 값은 바뀌지 않음).
-- ⚠ 기본값이 true 이므로 managers 에 행을 추가할 수 있는 사람은 운영자뿐이어야 합니다 (아래 revoke 가 그 역할 → supabase-manager-default-verified.sql 참고)
alter table public.managers alter column certification_verified set default true;

-- is_manager(): '지금 로그인한 사용자가 인증된 매니저인가?' 의 기준 (RLS·수락 함수가 사용).
--   ※ 웹페이지(auth-header.js 의 checkIsManager)는 화면을 보여줄지만 정하며 '내 managers 행이 있는가'만 봅니다
--     (인증 전 매니저도 전환 메뉴·매니저 화면은 보이고 '자격 확인 중'으로 표시). 실제 데이터 접근은 이 함수가
--     certification_verified 까지 확인하므로, 인증 전에는 배정 일정 같은 데이터가 DB 규칙상 보이지 않습니다.
--  * auth.uid() 는 서버가 검증한 로그인 토큰에서 나오므로 브라우저에서 조작할 수 없음
--  * 자격 인증(certification_verified)이 끝난 매니저만 true
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.managers m
    where m.id = auth.uid() and m.certification_verified
  );
$$;
revoke all on function public.is_manager() from public, anon;
grant  execute on function public.is_manager() to authenticated;

alter table public.managers enable row level security;
drop policy if exists managers_select_own on public.managers;
drop policy if exists managers_update_own on public.managers;
create policy managers_select_own on public.managers
  for select to authenticated using (id = auth.uid());
create policy managers_update_own on public.managers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.managers from anon, authenticated;
grant  select on public.managers to authenticated;
grant  update (activity_status) on public.managers to authenticated;   -- 자격/인증 여부는 수정 불가

-- 3) care_schedules : 동행 신청/일정 -----------------------------------------
--    status 흐름:  pending(신청 대기, manager_id 없음) → assigned(수락·배정)
--                  → departed(출발) → arrived(병원 도착) → completed(케어 완료)
create table if not exists public.care_schedules (
  id             uuid primary key default gen_random_uuid(),
  manager_id     uuid references public.profiles(id),   -- NULL = 아직 수락한 매니저 없음
  guardian_id    uuid references public.profiles(id),
  guardian_name  text,                       -- 매니저 화면 표시용 스냅샷 (보호자 프로필 접근 권한 불필요)
  guardian_phone text,
  guardian_email text,                       -- 구글폼에 보호자가 적은 이메일 (보호자 계정 연결용, 아래 5번 참고)
  senior_name    text not null,
  origin         text,                       -- 출발지 (자택)
  destination    text not null,              -- 목적지 (병원 등)
  scheduled_at   timestamptz not null,
  notes          text,                       -- 요청사항 / 특이사항
  status         text not null default 'pending',
  payout_amount  integer not null default 0, -- 이 건의 매니저 정산 금액(원)
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- 이미 예전 버전(신청 대기 기능 이전)으로 테이블을 만들어 둔 경우를 위한 보강 (신규 설치에서는 no-op)
alter table public.care_schedules alter column manager_id drop not null;
alter table public.care_schedules add column if not exists notes text;
alter table public.care_schedules add column if not exists guardian_email text;
alter table public.care_schedules alter column status set default 'pending';
alter table public.care_schedules drop constraint if exists care_schedules_status_check;
alter table public.care_schedules add constraint care_schedules_status_check
  check (status in ('pending', 'assigned', 'departed', 'arrived', 'completed'));
-- 불변 조건: 'pending' 이면 반드시 미배정, 그 외 상태는 반드시 담당 매니저가 있어야 함
alter table public.care_schedules drop constraint if exists care_schedules_pending_unassigned_check;
alter table public.care_schedules add constraint care_schedules_pending_unassigned_check
  check ((status = 'pending') = (manager_id is null));

create index if not exists care_schedules_manager_time_idx
  on public.care_schedules (manager_id, scheduled_at);
create index if not exists care_schedules_manager_completed_idx
  on public.care_schedules (manager_id, completed_at) where status = 'completed';
create index if not exists care_schedules_pending_idx
  on public.care_schedules (scheduled_at) where status = 'pending' and manager_id is null;

alter table public.care_schedules enable row level security;
drop policy if exists care_schedules_select_own on public.care_schedules;
drop policy if exists care_schedules_update_own on public.care_schedules;
-- 조회: 내가 맡은 일정 + (인증된 매니저에 한해) 아직 아무도 수락하지 않은 신청 대기 건
create policy care_schedules_select_own on public.care_schedules
  for select to authenticated using (
    manager_id = auth.uid()
    or (
      manager_id is null and status = 'pending'
      and public.is_manager()
    )
  );
-- 수정: 내가 맡은 일정의 status 만 (수락은 아래 accept_care_request() 함수로만 가능)
create policy care_schedules_update_own on public.care_schedules
  for update to authenticated using (manager_id = auth.uid()) with check (manager_id = auth.uid());

revoke insert, update, delete on public.care_schedules from anon, authenticated;
grant  select on public.care_schedules to authenticated;
grant  update (status) on public.care_schedules to authenticated;      -- status 외 컬럼은 수정 불가

-- 상태 진행 순서 강제 + 완료 시각은 서버 시간으로 기록
create or replace function public.enforce_care_status_flow() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'  and new.status = 'assigned')
            or (old.status = 'assigned' and new.status = 'departed')
            or (old.status = 'departed' and new.status = 'arrived')
            or (old.status = 'arrived'  and new.status = 'completed')) then
      raise exception 'invalid status transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists care_schedules_status_flow on public.care_schedules;
create trigger care_schedules_status_flow before update on public.care_schedules
  for each row execute function public.enforce_care_status_flow();

-- 신청 수락 (매니저 직접 수락): 미배정 pending 건을 '한 문장으로' 내 것으로 바꿉니다.
--  * UPDATE 한 번으로 조건(pending + manager_id IS NULL)을 확인하고 바꾸므로,
--    두 매니저가 동시에 누르면 한 명만 성공하고 나머지는 REQUEST_UNAVAILABLE 오류를 받습니다.
--  * 인증된 매니저(is_manager())만 호출 가능
create or replace function public.accept_care_request(p_schedule_id uuid)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.care_schedules;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_manager() then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;

  update public.care_schedules
     set manager_id = auth.uid(), status = 'assigned'
   where id = p_schedule_id and status = 'pending' and manager_id is null
  returning * into v_row;

  if not found then
    raise exception 'REQUEST_UNAVAILABLE' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

revoke all on function public.accept_care_request(uuid) from public, anon;
grant  execute on function public.accept_care_request(uuid) to authenticated;

-- ★ 신청 대기 건 만들기: 구글폼으로 접수된 신청을 운영자가 대시보드(SQL Editor / Table Editor)에서 입력합니다.
--   ※ guardian_email 에는 구글폼에서 받은 이메일을 그대로 넣으세요 (보호자가 로그인하는 카카오 계정 이메일과 같아야
--     보호자 마이페이지에 리포트가 연결됩니다. 자세한 규칙은 아래 5번 참고)
--   insert into public.care_schedules
--     (guardian_name, guardian_phone, guardian_email, senior_name, origin, destination,
--      scheduled_at, notes, status, payout_amount)
--   values
--     ('홍보호', '010-1234-5678', 'guardian@example.com', '홍길동 어르신', '인천 남동구 소래역로 93',
--      '서울아산병원 내과', now() + interval '1 day', '휠체어 이용, 보청기 착용', 'pending', 44000);

-- 4) care_reports : 매니저가 제출하는 케어 리포트 ---------------------------
create table if not exists public.care_reports (
  id               uuid primary key default gen_random_uuid(),
  schedule_id      uuid not null unique references public.care_schedules(id) on delete cascade,
  manager_id       uuid not null references public.profiles(id),
  physician_notes  text not null,            -- 진료 소견 / 의사 안내사항
  senior_condition text not null,            -- 어르신 컨디션 기록
  created_at       timestamptz not null default now()
);

alter table public.care_reports enable row level security;
drop policy if exists care_reports_select_own on public.care_reports;
drop policy if exists care_reports_insert_own on public.care_reports;
create policy care_reports_select_own on public.care_reports
  for select to authenticated using (manager_id = auth.uid());
-- 본인 일정 중 '완료된' 건에 대해서만 리포트 제출 가능
create policy care_reports_insert_own on public.care_reports
  for insert to authenticated with check (
    manager_id = auth.uid()
    and exists (
      select 1 from public.care_schedules s
      where s.id = schedule_id and s.manager_id = auth.uid() and s.status = 'completed'
    )
  );

revoke insert, update, delete on public.care_reports from anon, authenticated;
grant  select, insert on public.care_reports to authenticated;

-- 5) 보호자 계정 연결 + 보호자용 케어 리포트 조회 ------------------------------
-- 신청은 구글폼(외부)으로 접수되고 운영자가 care_schedules 에 직접 입력하므로, '어느 보호자의 건인지'는 아래 두 가지로 연결합니다.
--   (A) 이메일 자동 연결 : care_schedules.guardian_email  =  보호자가 로그인한 계정의 '인증된' 이메일 (대소문자·공백 무시)
--   (B) 수동 연결        : care_schedules.guardian_id      =  보호자 계정 UUID  (이메일이 다르거나 카카오 이메일이 없을 때 운영자가 지정)
--   → (A) 또는 (B) 중 하나만 맞으면 그 보호자의 건입니다.
--
-- 보안 원칙
--  * 이메일 연결은 '인증된 이메일'(auth.users.email_confirmed_at 이 있는 것)일 때만 인정합니다.
--    (인증되지 않은 이메일로 남의 리포트를 볼 수 없게 하기 위함)
--  * 보호자는 care_reports / care_schedules 테이블에 직접 접근할 수 없고, 아래 view 로만 읽습니다.
--  * view 에는 리포트 내용과 방문 정보만 있고 payout_amount(정산금액), manager_id, 다른 사람의 연락처는 없습니다.

-- 현재 로그인 사용자의 '인증된' 이메일 (없으면 NULL). 클라이언트에서 직접 호출 불가 (view 안에서만 사용)
create or replace function public.my_verified_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(btrim(u.email))
  from auth.users u
  where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
$$;
revoke all on function public.my_verified_email() from public, anon, authenticated;

-- 이 일정이 '지금 로그인한 보호자'의 것인지 (위 A 또는 B)
create or replace function public.is_my_care_schedule(p_guardian_id uuid, p_guardian_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() is not null and (
      p_guardian_id = auth.uid()
      or (p_guardian_email is not null and lower(btrim(p_guardian_email)) = public.my_verified_email())
    ),
    false
  )
$$;
revoke all on function public.is_my_care_schedule(uuid, text) from public, anon, authenticated;
-- ★ 주의: SECURITY DEFINER 는 "함수 안에서" 하는 일만 소유자 권한으로 실행할 뿐, "함수를 호출할 수
--   있는지"(EXECUTE)는 별개로 검사됩니다. 아래 guardian_care_reports 는 함수가 아니라 뷰라서, 뷰 안의
--   where 절에서 이 함수를 부를 때는 뷰 소유자가 아니라 '뷰를 조회하는 로그인 사용자' 권한으로 EXECUTE
--   가 검사됩니다. 그래서 위에서 전부 revoke 만 하면 guardian_care_reports 를 조회하는 모든 보호자가
--   "permission denied for function is_my_care_schedule" 를 받게 됩니다 — 아래 grant 로 다시 열어 줍니다
--   (이 함수는 auth.uid() 로만 판단하는 boolean 반환 함수라 EXECUTE 를 열어도 데이터가 새지 않습니다).
grant  execute on function public.is_my_care_schedule(uuid, text) to authenticated, anon;

-- 보호자용 케어 리포트 view
--  * 일부러 '소유자 권한'으로 실행되는 view 입니다 (보호자는 원본 테이블을 못 읽으므로). 대신 where 절이
--    is_my_care_schedule() 로 '내 것'만 걸러내고, security_barrier 로 사용자가 붙인 필터가 그 전에 실행되어
--    다른 사람 데이터를 엿보는 일을 막습니다.
--  * 로그인하지 않은(anon) 사용자는 접근 권한 자체가 없습니다.
create or replace view public.guardian_care_reports
with (security_barrier = true) as
select
  r.id               as report_id,
  r.schedule_id      as schedule_id,
  r.created_at       as submitted_at,
  r.physician_notes  as physician_notes,
  r.senior_condition as senior_condition,
  s.senior_name      as senior_name,
  s.origin           as origin,
  s.destination      as destination,
  s.scheduled_at     as scheduled_at,
  s.completed_at     as completed_at,
  p.name             as manager_name          -- 담당 매니저 이름만 (연락처·정산 정보 없음)
from public.care_reports r
join public.care_schedules s on s.id = r.schedule_id
left join public.profiles p on p.id = s.manager_id
where public.is_my_care_schedule(s.guardian_id, s.guardian_email);

revoke all on public.guardian_care_reports from public, anon, authenticated;
grant  select on public.guardian_care_reports to authenticated;

-- ★ 연결이 안 될 때 운영자가 확인하는 방법 (SQL Editor)
--   1) 보호자 계정의 이메일이 '인증'되어 있는지:
--        select id, email, email_confirmed_at from auth.users where email ilike '%보호자이메일%';
--      email_confirmed_at 이 비어 있으면 (A) 자동 연결이 되지 않습니다 → 아래 수동 연결(B)을 사용하세요.
--   2) 수동 연결 (본인 확인을 마친 뒤): 해당 보호자의 신청 건에 계정 UUID 를 지정
--        update public.care_schedules set guardian_id = '<보호자 계정 UUID>' where guardian_email = 'guardian@example.com';
--   3) 연결 상태 점검 (guardian_id 도 이메일도 없는 건 = 어느 보호자에게도 안 보임):
--        select id, senior_name, scheduled_at from public.care_schedules where guardian_id is null and guardian_email is null;

-- 6) 동행 서비스 신청서 (apply.html) -----------------------------------------
-- public.service_applications 테이블은 Supabase 대시보드에서 이미 만들어 두셨으므로, 여기서는 만들지 않습니다.
-- (이전에 여기 있던 다른 컬럼 이름의 CREATE TABLE 은 실제 테이블과 달라서 제거했습니다 — 실행하지 마세요)
--
-- apply.html 의 toDbRow() 가 보내는 컬럼 (이 컬럼들이 테이블에 있어야 신청서가 저장됩니다):
--   service_type     신청 서비스 (시니어 병원 동행 / 생활 편의 대행 / 복합 매칭 서비스 (동행 + 생활편의))
--   user_relation    신청자와 어르신의 관계
--   user_contact     신청자 성함 및 연락처
--   address          출발지 및 목적지/방문 장소
--   request_details  요청 상세 내용 + 희망 일시 + 어르신 거동 상태 (줄바꿈으로 구분해 함께 저장)
--   privacy_agreed   개인정보 수집 동의 (true)
-- 보내지 않는 컬럼(DB 기본값이 채움): id, created_at, user_id, status
--
-- ★ 신청서의 user_id 가 비어 저장되는 문제 / 비로그인 신청을 로그인 후 계정에 연결하려면 supabase-claim-applications.sql 을 실행하세요
--
-- ★ 웹 신청서를 매니저 페이지의 '신청 대기 목록'에 나타내려면 supabase-applications-to-manager.sql 을 실행하세요
--   (매니저용 조회 정책 + 수락 함수 accept_service_application()). 실행하지 않으면 웹에서 낸 신청이 매니저에게 보이지 않습니다.
--
-- ★ 대시보드에서 한 번 확인해 두면 좋은 것 (SQL Editor 에서 실행 / 이미 되어 있으면 그대로 두세요)
--   1) 신청 내용이 인터넷에 공개되지 않도록 RLS 켜기 + '조회(SELECT) 정책은 만들지 않기':
--        alter table public.service_applications enable row level security;
--   2) 방문자가 신청서를 '넣을 수만' 있는 정책 (이미 만드셨다면 생략):
--        create policy service_applications_insert on public.service_applications
--          for insert to anon, authenticated with check (privacy_agreed = true);
--   3) 새 신청의 상태와 로그인 계정 연결이 자동으로 채워지도록 기본값 (원하는 값으로 바꾸세요):
--        alter table public.service_applications alter column status  set default 'pending';
--        alter table public.service_applications alter column user_id set default auth.uid();
--   3-1) 마이페이지가 '내 신청 내역'을 읽도록 하는 SELECT 정책(auth.uid() = user_id)과 anon 조회 권한 회수는
--        supabase-service-applications-select.sql 을 실행하세요 (위 3)의 기본값 설정도 그 파일에 들어 있습니다).
--   4) 신청 확인:  select created_at, service_type, user_relation, user_contact, address, request_details, status
--                    from public.service_applications order by created_at desc;
--   5) care_schedules 로 옮길 때 로그인한 신청자의 계정 연결이 필요하면 user_id 로 auth.users 의 이메일을 찾아
--      guardian_email 로 사용하세요 (본인 확인 후. 위 5번 참고).