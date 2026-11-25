-- ============================================================================
-- 신규 케어 신청(service_applications) 텔레그램 하이브리드 알림 + 인라인 버튼 수락
-- ============================================================================
-- 이 저장소에는 "care_requests"/"manager_profiles"라는 이름의 테이블이 없습니다 — 실제로 매칭에 쓰는
-- 테이블은 public.service_applications(고객 신청)과 public.managers + public.manager_applications
-- (인증된 매니저와 그 지원서의 activity_areas/activity_schedule)입니다. 아래 전부 이 실제 테이블명을
-- 기준으로 작성했습니다.
--
-- 구성:
--   1) manager_telegram_links      : 매니저 user_id ↔ 개인 텔레그램 chat_id(=Telegram user id) 매핑
--   2) telegram_link_tokens        : 마이페이지 "텔레그램 연결" 버튼이 발급하는 1회용 /start 딥링크 토큰
--   3) service_applications.telegram_notified_at : 같은 신청에 알림을 두 번 보내지 않기 위한 원자적 가드
--   4) care_request_telegram_notifications : 신청 1건당 보낸 모든 텔레그램 메시지(개인/단체)의
--      chat_id+message_id 기록 — 한 매니저가 수락하면 나머지 메시지를 "마감되었습니다"로 고쳐 쓰기 위함
--   5) request_telegram_link_token()        : (authenticated) 연결 토큰 발급
--   6) list_approved_managers_for_telegram() : (service_role 전용) 알림 대상 매니저 + 지역/시간대/chat_id 조회
--   7) claim_telegram_notification()        : (service_role 전용) "이 신청, 아직 알림 안 보냈음" 원자적 선점
--   8) accept_service_application_as()      : (service_role 전용) 텔레그램 버튼 수락 — accept_service_application()
--      과 핵심 로직(배정+care_schedules 생성)은 동일하지만 auth.uid() 대신 호출자가 넘긴 매니저 id를 쓰고,
--      일반 사용자는 호출할 수 없게 service_role 전용으로 잠가 둡니다. accept_service_application() 의
--      care_schedules insert 로직을 고치면 이 함수도 같이 고쳐야 합니다.
--
-- 실행 순서: sql/supabase_schema_latest.sql (service_applications/managers/manager_applications 전제) → 이 파일.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) manager_telegram_links
-- ----------------------------------------------------------------------------
create table if not exists public.manager_telegram_links (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  chat_id   text not null unique,
  linked_at timestamptz not null default now()
);

alter table public.manager_telegram_links enable row level security;

drop policy if exists manager_telegram_links_select_own on public.manager_telegram_links;
create policy manager_telegram_links_select_own on public.manager_telegram_links
  for select to authenticated using (user_id = auth.uid());

-- 매니저가 마이페이지에서 "텔레그램 연결 끊기"를 직접 할 수 있도록 delete만 본인 행에 허용합니다.
-- insert/update(실제 연결)는 telegram-webhook Edge Function이 service_role로만 수행합니다 — 사용자가
-- 임의의 chat_id를 자기 계정에 묶어 다른 사람에게 갈 알림을 가로채지 못하게 하기 위함입니다.
drop policy if exists manager_telegram_links_delete_own on public.manager_telegram_links;
create policy manager_telegram_links_delete_own on public.manager_telegram_links
  for delete to authenticated using (user_id = auth.uid());

revoke insert, update on public.manager_telegram_links from anon, authenticated;
grant  select, delete on public.manager_telegram_links to authenticated;
revoke all on public.manager_telegram_links from anon;

-- ----------------------------------------------------------------------------
-- 2) telegram_link_tokens — 클라이언트는 직접 접근하지 못하고 request_telegram_link_token()/
--    telegram-webhook(service_role)을 통해서만 읽고 씁니다.
-- ----------------------------------------------------------------------------
-- gen_random_bytes() 는 pgcrypto 익스텐션이 있어야 해서(프로젝트에 활성화돼 있는지 보장할 수 없음),
-- Postgres 13+ 코어에 내장된 gen_random_uuid() 두 개를 이어붙여 32바이트(256비트) 무작위 토큰을 만듭니다
-- — 15분짜리 1회용 딥링크 토큰으로는 충분한 엔트로피입니다.
create table if not exists public.telegram_link_tokens (
  token      text primary key
             default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at    timestamptz
);
create index if not exists telegram_link_tokens_user_id_idx on public.telegram_link_tokens (user_id);

alter table public.telegram_link_tokens enable row level security;
revoke all on public.telegram_link_tokens from anon, authenticated;

create or replace function public.request_telegram_link_token()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_manager() then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;

  -- 연결 버튼을 여러 번 눌러도 토큰이 쌓이지 않도록 아직 쓰지 않은 기존 토큰은 지우고 새로 발급합니다.
  delete from public.telegram_link_tokens where user_id = auth.uid() and used_at is null;

  insert into public.telegram_link_tokens (user_id) values (auth.uid())
  returning token into v_token;

  return v_token;
end $$;

revoke all on function public.request_telegram_link_token() from public, anon;
grant  execute on function public.request_telegram_link_token() to authenticated;

-- ----------------------------------------------------------------------------
-- 3) service_applications.telegram_notified_at — 신청 1건당 알림 발송은 단 1회
-- ----------------------------------------------------------------------------
alter table public.service_applications add column if not exists telegram_notified_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4) care_request_telegram_notifications — 발송 기록 (service_role 전용, 순수 내부 운영 데이터)
-- ----------------------------------------------------------------------------
create table if not exists public.care_request_telegram_notifications (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.service_applications(id) on delete cascade,
  target_type    text not null check (target_type in ('broadcast', 'private')),
  manager_id     uuid references public.profiles(id),
  chat_id        text not null,
  message_id     bigint not null,
  -- 보낸 메시지 본문 그대로 — 수락/마감 시 editMessageText 는 전체 텍스트를 다시 보내야 해서
  -- (부분 수정이 안 됨) 뒤에 "✅ 수락됨"/"⛔ 마감됨" 한 줄을 이어붙이려면 원문이 필요합니다.
  message_text   text not null,
  closed_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists care_request_telegram_notifications_app_idx
  on public.care_request_telegram_notifications (application_id);

alter table public.care_request_telegram_notifications enable row level security;
revoke all on public.care_request_telegram_notifications from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) list_approved_managers_for_telegram() — 알림 대상 매니저 + 지역/시간대/개인 chat_id
--    인증된 매니저(managers.certification_verified) 중 텔레그램을 연결한(manager_telegram_links) 사람만
--    돌려줍니다 — 연결 안 한 매니저는 애초에 개인 DM을 보낼 수 없으므로 여기 포함할 이유가 없습니다.
--    activity_areas/activity_schedule은 같은 user_id로 approved 상태인 가장 최근 지원서 값을 씁니다
--    (admin.js 의 "최신순 정렬이라 먼저 나온 값을 채택" 과 동일한 규칙).
-- ----------------------------------------------------------------------------
create or replace function public.list_approved_managers_for_telegram()
returns table (
  manager_id        uuid,
  name              text,
  activity_areas    text[],
  activity_schedule text[],
  chat_id           text
)
language sql stable security definer set search_path = public as $$
  select m.id,
         p.name,
         coalesce(ma.activity_areas, '{}'::text[]),
         coalesce(ma.activity_schedule, '{}'::text[]),
         tl.chat_id
    from public.managers m
    join public.profiles p on p.id = m.id
    join public.manager_telegram_links tl on tl.user_id = m.id
    left join lateral (
      select a.activity_areas, a.activity_schedule
        from public.manager_applications a
       where a.user_id = m.id and a.status = 'approved'
       order by a.created_at desc
       limit 1
    ) ma on true
   where m.certification_verified = true;
$$;

revoke all on function public.list_approved_managers_for_telegram() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) claim_telegram_notification() — "이 신청 아직 알림 안 보냈음"을 원자적으로 선점
--    INSERT 직후(결제 전, PAYMENT_PENDING)에도 Database Webhook이 오지만 이 시점에는 반드시 거절하고,
--    결제 확인 직후(MATCHING_PENDING 진입) 또는 결제 없는 패키지 신청에 대해서만 선점합니다.
--    PAYMENT_PENDING을 명시적으로 차단해 is_pending_application_status()가 구버전으로 남아 있어도
--    결제 전 알림이 나가지 않게 합니다.
-- ----------------------------------------------------------------------------
create or replace function public.claim_telegram_notification(p_application_id uuid)
returns public.service_applications
language sql security definer set search_path = public as $$
  update public.service_applications
     set telegram_notified_at = now()
   where id = p_application_id
     and telegram_notified_at is null
     and manager_id is null
     and upper(btrim(coalesce(status, ''))) <> 'PAYMENT_PENDING'
     and public.is_pending_application_status(status)
  returning *;
$$;

revoke all on function public.claim_telegram_notification(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) accept_service_application_as() — 텔레그램 인라인 버튼 수락
--    accept_service_application(p_application_id, p_scheduled_at) 과 care_schedules insert 로직은 완전히
--    동일합니다(두 함수를 같이 고치세요) — 다른 점은 auth.uid()/is_manager() 대신 p_manager_id 파라미터를
--    쓰고, 일반 로그인 사용자는 호출하지 못하도록 service_role 전용으로 잠근다는 것뿐입니다. 텔레그램
--    웹훅은 Supabase 로그인 세션이 없으므로(버튼을 누른 사람은 텔레그램 user id로만 식별됩니다) 이 별도
--    경로가 필요합니다.
-- ----------------------------------------------------------------------------
create or replace function public.accept_service_application_as(
  p_application_id uuid,
  p_manager_id     uuid,
  p_scheduled_at    timestamptz
) returns public.care_schedules
language plpgsql security definer set search_path = public as $$
declare
  v_app      public.service_applications;
  v_row      public.care_schedules;
  v_phone_re constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep      int;
begin
  if p_manager_id is null then
    raise exception 'MANAGER_REQUIRED' using errcode = '22004';
  end if;
  if not exists (select 1 from public.managers where id = p_manager_id and certification_verified) then
    raise exception 'NOT_A_MANAGER' using errcode = '42501';
  end if;
  if p_scheduled_at is null then
    raise exception 'SCHEDULE_TIME_REQUIRED' using errcode = '22004';
  end if;

  update public.service_applications
     set manager_id = p_manager_id, accepted_at = now(), status = 'matched'
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
     senior_name, senior_age, senior_note, origin, destination, scheduled_at, notes, status, payout_amount, application_id,
     origin_lat, origin_lng, destination_lat, destination_lng)
  values (
    p_manager_id,
    (select p.id from public.profiles p where p.id = v_app.user_id),
    coalesce(nullif(btrim(regexp_replace(coalesce(v_app.user_contact, ''), v_phone_re, '', 'g'), E' \t\r\n/,·-'), ''), '보호자'),
    substring(coalesce(v_app.user_contact, '') from v_phone_re),
    (select lower(btrim(u.email)) from auth.users u where u.id = v_app.user_id and u.email is not null),
    coalesce(nullif(btrim(coalesce(v_app.senior_name, '')), ''),
      case when nullif(btrim(coalesce(v_app.user_relation, '')), '') is not null
           then '어르신 (' || btrim(v_app.user_relation) || ' 신청)' else '어르신' end),
    v_app.senior_age,
    v_app.senior_note,
    case when v_sep > 0 then nullif(btrim(substr(v_app.address, 1, v_sep - 1)), '') else null end,
    coalesce(
      case when v_sep > 0 then nullif(btrim(substr(v_app.address, v_sep + 3)), '') else nullif(btrim(coalesce(v_app.address, '')), '') end,
      '목적지 확인 필요'),
    p_scheduled_at,
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng
  )
  returning * into v_row;

  update public.service_applications set schedule_id = v_row.id where id = v_app.id;
  return v_row;
end $$;

revoke all on function public.accept_service_application_as(uuid, uuid, timestamptz) from public, anon, authenticated;

notify pgrst, 'reload schema';
