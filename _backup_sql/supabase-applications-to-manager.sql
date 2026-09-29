-- =====================================================================
-- 위드브릿지: 웹 신청서(apply.html → public.service_applications)를 매니저의 '신청 대기 목록'에 연결
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가
--   apply.html 은 신청을 service_applications 에 저장하고, 매니저 페이지(mypage-manager.html)의 '신청 대기 목록'은
--   원래 care_schedules(운영자가 구글폼을 보고 직접 넣던 표)만 읽었습니다. 그래서 웹에서 낸 신청이 매니저에게 안 보였습니다.
--   이제 매니저 페이지가 service_applications 의 '접수 대기' 신청도 함께 읽고, 수락하면 care_schedules 에
--   '배정됨' 일정이 만들어져 기존 진행(출발 → 도착 → 완료 → 리포트) 화면이 그대로 동작합니다.
--
-- 이 파일이 하는 일
--   1) service_applications 에 '누가 수락했는지' 컬럼 추가 (manager_id, accepted_at, schedule_id)
--   2) '접수 대기' 상태인지 판단하는 함수 (pending / 접수 / 대기 / 신청 / 빈 값 = 대기, 취소 = 아님)
--   3) 인증된 매니저(is_manager())가 '아직 아무도 수락하지 않은 접수 대기 신청'을 읽을 수 있는 SELECT 정책
--      → 매니저 본인이 낸 신청도 똑같이 보입니다 (테스트용: 본인 신청을 제외하지 않음)
--   4) accept_service_application(): 수락 함수 — 조건 확인과 갱신이 한 문장이라 두 명이 동시에 눌러도 한 명만 성공
--      (한 번의 UPDATE 로 manager_id 와 status = 'matched' 를 함께 바꾸므로 '매니저는 지정됐는데 상태는 접수 대기'인 중간 상태가 생기지 않음)
--   5) 트리거: manager_id 가 지정되면 대기 상태는 항상 'matched'(배정 완료)가 되도록 보장
--   6) my_application_managers(): 보호자 마이페이지가 '내 신청을 맡은 매니저'의 이름·연락처를 읽는 함수
--
-- 전제: supabase-manager-schema.sql 이 이미 실행되어 있어야 합니다 (is_manager(), care_schedules, profiles).
-- ⚠ 개인정보: 신청서에는 이름·연락처·주소가 있으므로, 이 정책은 '인증된 매니저'에게만 조회를 엽니다.
--   매니저 계정은 managers.certification_verified = true 여야 합니다:
--     update public.managers set certification_verified = true where id = '<매니저 계정 UUID>';
-- =====================================================================

-- 1) 수락 정보 컬럼 -----------------------------------------------------------
alter table public.service_applications add column if not exists manager_id  uuid references public.profiles(id);
alter table public.service_applications add column if not exists accepted_at timestamptz;
alter table public.service_applications add column if not exists schedule_id uuid references public.care_schedules(id) on delete set null;

-- 수락 함수가 채우는 care_schedules 컬럼 보강: 예전 버전으로 만든 care_schedules 에는 notes / guardian_email 이 없어서
-- 이 컬럼들이 없으면 수락 시 42703(undefined_column)으로 실패합니다 (이미 있으면 아무 일도 하지 않음).
-- 나머지 구조(상태 값 · 미배정 허용 등)까지 최신으로 맞추려면 supabase-manager-schema.sql 3번(care_schedules)도 실행하세요.
alter table public.care_schedules add column if not exists notes          text;
alter table public.care_schedules add column if not exists guardian_email text;

-- 새 신청은 '접수 대기'로 시작 (이미 설정해 두셨다면 그대로)
alter table public.service_applications alter column status set default 'pending';

create index if not exists service_applications_open_idx
  on public.service_applications (created_at) where manager_id is null;

-- 2) '접수 대기' 상태 판단 (마이페이지의 '접수 완료' 표시와 같은 기준) ----------------
--    대기: 빈 값, pending/new/received/submitted/waiting/requested, 또는 '접수'·'대기'·'신청' 이 들어간 한글 상태
--    아님: 취소(cancelled/canceled/cancel/'취소' 포함), 그 밖의 상태(matched · completed · '배정' · '완료' 등)
create or replace function public.is_pending_application_status(p_status text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_status, ''))) in ('cancelled', 'canceled', 'cancel') or coalesce(p_status, '') ~ '취소' then false
    when lower(btrim(coalesce(p_status, ''))) in ('', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested') then true
    when coalesce(p_status, '') ~ '접수|대기|신청' then true
    else false
  end
$$;

-- 3) 인증된 매니저의 조회 정책 (내 신청만 보는 기존 select_own 정책과 OR 로 합쳐집니다) ---------
alter table public.service_applications enable row level security;
drop policy if exists service_applications_select_managers on public.service_applications;
create policy service_applications_select_managers on public.service_applications
  for select to authenticated
  using (
    public.is_manager()
    and manager_id is null
    and public.is_pending_application_status(status)
  );
grant select on public.service_applications to authenticated;

-- 4) 신청 수락 -------------------------------------------------------------------
--  * 매니저가 보호자와 확인한 '동행 일시(p_scheduled_at)'를 함께 받습니다 (신청서의 희망 일시는 자유 문장이라 시각으로 바꿀 수 없음)
--  * 신청서를 '수락됨(matched)'으로 바꾸고(→ 보호자 마이페이지에 '매니저 배정'으로 표시),
--    같은 내용의 care_schedules 일정을 '배정됨(assigned)' 상태로 만들어 매니저의 '배정된 일정'에 나타나게 합니다.
--  * 어르신 이름은 신청서에 없어서 '어르신 (자녀 신청)' 처럼 신청자 관계로 표시합니다. 정산금액(payout_amount)은
--    운영 기준이 정해지지 않아 0 으로 두었으니, 필요하면 대시보드에서 수정하세요.
create or replace function public.accept_service_application(p_application_id uuid, p_scheduled_at timestamptz)
returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app      public.service_applications;
  v_row      public.care_schedules;
  v_phone_re constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep      int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_manager() then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;
  if p_scheduled_at is null then
    raise exception 'SCHEDULE_TIME_REQUIRED' using errcode = '22004';
  end if;

  -- 조건(아직 아무도 수락하지 않은 접수 대기 건)을 확인하면서 한 번에 내 것으로 바꿈 → 동시에 눌러도 한 명만 성공
  update public.service_applications
     set manager_id = auth.uid(), accepted_at = now(), status = 'matched'
   where id = p_application_id
     and manager_id is null
     and public.is_pending_application_status(status)
  returning * into v_app;

  if not found then
    raise exception 'REQUEST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  v_sep := strpos(coalesce(v_app.address, ''), ' / ');

  insert into public.care_schedules
    (manager_id, guardian_id, guardian_name, guardian_phone, guardian_email,
     senior_name, origin, destination, scheduled_at, notes, status, payout_amount)
  values (
    auth.uid(),
    (select p.id from public.profiles p where p.id = v_app.user_id),                      -- 계정 연결이 있으면 보호자 리포트와 연결
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
         then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    p_scheduled_at,
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application(uuid, timestamptz) from public, anon;
grant  execute on function public.accept_service_application(uuid, timestamptz) to authenticated;

-- 5) 상태 일관성 보장 (트리거) --------------------------------------------------------
--  * 매니저가 지정된 신청(manager_id 가 있음)이 '접수 대기' 상태로 남아 있지 않도록, 대기 상태면 자동으로 'matched'(배정 완료)로 바꿉니다.
--    수락 함수뿐 아니라 대시보드에서 manager_id 를 직접 채워도 똑같이 적용됩니다.
--  * 신청서를 접수(INSERT)하는 브라우저(비로그인·로그인 사용자)가 manager_id / accepted_at / schedule_id 를 미리 채워 넣어
--    '이미 배정된 신청'으로 위장하지 못하게 비웁니다. (수락은 accept_service_application() 로만 가능)
--    ※ 이 트리거는 오류를 내지 않도록만 작성되어 있어, 신청서 접수(apply.html)에는 영향이 없습니다.
create or replace function public.sync_application_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and current_user in ('anon', 'authenticated') then
    new.manager_id := null;
    new.accepted_at := null;
    new.schedule_id := null;
  end if;
  if new.manager_id is not null then
    -- 매니저가 처음 지정되는 순간의 시각을 기록 (대시보드에서 status 와 manager_id 를 함께 고쳐 배정해도 accepted_at 이 비지 않도록)
    if new.accepted_at is null then
      if tg_op = 'INSERT' then
        new.accepted_at := now();
      elsif old.manager_id is distinct from new.manager_id then
        new.accepted_at := now();
      end if;
    end if;
    -- 대기 상태로 남아 있으면 '배정 완료(matched)'로
    if public.is_pending_application_status(new.status) then
      new.status := 'matched';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists service_applications_sync_status on public.service_applications;
create trigger service_applications_sync_status
  before insert or update of manager_id, status on public.service_applications
  for each row execute function public.sync_application_status();

-- 6) 보호자가 '내 신청을 맡은 매니저'의 이름·연락처를 볼 수 있게 (보호자 마이페이지 카드) -------------
--  * profiles 는 본인 행만 읽을 수 있어서 보호자가 매니저 프로필을 직접 읽을 수 없으므로, 소유자 권한 함수로 필요한 것만 내줍니다.
--  * 내 신청(user_id = 나)이고 매니저가 배정된 건의 '이름 · 연락처 · 자격증'만 돌려줍니다. 다른 사람의 신청·매니저 정보는 나오지 않습니다.
--  * 연락처는 profiles.phone 입니다. 비어 있으면 화면에 '연락처는 담당 매니저가 직접 안내'로 표시됩니다
--    (등록: update public.profiles set phone = '010-0000-0000' where id = '<매니저 계정 UUID>';)
create or replace function public.my_application_managers()
returns table (application_id uuid, manager_name text, manager_phone text, manager_certification text)
language sql stable security definer set search_path = public as $$
  select a.id,
         coalesce(nullif(btrim(p.name), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')),
         nullif(btrim(p.phone), ''),
         nullif(btrim(m.certification), '')
    from public.service_applications a
    left join public.profiles p on p.id = a.manager_id
    left join public.managers m on m.id = a.manager_id
    left join auth.users u      on u.id = a.manager_id
   where a.user_id = auth.uid()
     and a.manager_id is not null
$$;

revoke all on function public.my_application_managers() from public, anon;
grant  execute on function public.my_application_managers() to authenticated;

-- ★ 확인 (각각 실행)
--   0) 수락 후 상태 일관성:  select id, status, manager_id from public.service_applications where manager_id is not null;
--                            → status 가 모두 'matched'(또는 completed 등 진행 상태)여야 하고 '접수 대기' 상태가 없어야 함
--   1) 정책:  select policyname, cmd from pg_policies where tablename = 'service_applications';
--             → service_applications_select_own(마이페이지용) 과 service_applications_select_managers 가 함께 보여야 함
--   2) 대기 중인 신청:  select id, created_at, status, manager_id from public.service_applications order by created_at desc;
--   3) 매니저 화면에 안 보일 때 점검 순서
--        · 매니저 계정의 certification_verified 가 true 인가  (false 면 이 정책이 조회를 막아 '0건'이 됩니다)
--        · 신청 행의 status 가 대기 상태인가 / manager_id 가 비어 있는가
--        · 매니저 페이지를 새로고침 (↻ 새로고침 버튼)
