-- ============================================================================
-- 관리자 콘솔(admin.html) '수동 배정' 버튼 — admin_assign_manager() RPC
--
--   이전까지 admin.js 의 [수동 배정] 버튼은 service_applications.manager_id 만 직접 UPDATE 했습니다
--   (sql/admin_rls_policies.sql 의 service_applications_update_admin 정책 + grant update 로 가능했던
--   일입니다). 이 방식에는 두 가지 구멍이 있었습니다:
--
--   1) status 가 'MATCHED' 로 안 바뀔 수 있었습니다 — sync_application_status() 트리거(sql/
--      supabase_schema_latest.sql)는 manager_id 가 채워질 때 "현재 status 가 대기류 동의어일 때만" status 를
--      올려 줍니다(is_pending_application_status()). 그런데 이 함수는 'PAYMENT_PENDING'(대문자 표준값)을
--      대기류로 인식하지 못해서(동의어 목록엔 'pending'/'matching_pending' 등만 있고 'payment_pending'은
--      없음), 아직 입금 확인 전(PAYMENT_PENDING)인 신청을 관리자가 수동 배정하면 manager_id 는 채워져도
--      status 는 PAYMENT_PENDING 에 그대로 멈춰 있었습니다.
--   2) care_schedules 행이 아예 생기지 않았습니다 — care_schedules 행은 매니저가 mypage-manager.html 에서
--      직접 수락할 때(accept_service_application() RPC)만 만들어집니다. 관리자의 수동 배정은 그 RPC를
--      타지 않고 service_applications 테이블만 고쳤으므로, admin.html 의 '배정 완료(진행 중) 케어 현황'
--      카드(care_schedules 기반 조회)에는 수동 배정한 건이 영원히 나타나지 않았습니다 — 이 카드의 쿼리
--      자체에 결제 상태로 거르는 조건은 없었고(원인은 쿼리가 아니라 애초에 행이 없었던 것), manager_id
--      IS NOT NULL AND status <> 'completed' 조건은 그대로 맞는데 행 자체가 없어서 안 보인 것입니다.
--
--   이 파일의 admin_assign_manager() 는 accept_service_application() 과 같은 규칙으로 care_schedules
--   행까지 함께 만들어서 이 두 구멍을 한 번에 막습니다:
--     ① service_applications.manager_id 설정
--     ② status 를 'MATCHED' 로 명시적으로 확정(트리거의 동의어 목록에 기대지 않음)
--     ③ 그 신청이 PAYMENT_PENDING(미입금)이었다면, 수동 배정 자체를 "매칭을 확정한다"는 관리자 선언으로
--        보고 연결된 virtual_accounts.is_paid 도 함께 true 로 맞춤(admin_confirm_manual_payment() 와 같은 처리) —
--        MATCHED 인데 미입금으로 남는 상태 불일치를 막기 위함
--     ④ care_schedules 행 생성(없으면) → '배정 완료(진행 중) 케어 현황' 카드에 즉시 나타남. scheduled_at 은
--        service_applications 에 희망 일시를 담는 전용 컬럼이 없어(apply.html 이 request_details 안에
--        "희망 일시: 9월 25일 (목) 오전 10시 30분" 형식의 한 줄로만 저장함, desired_date/start_time 같은
--        컬럼은 DB에 존재하지 않음) parse_desired_datetime_kst() 로 그 줄을 파싱해 KST 기준으로 복원합니다.
--        파싱에 실패하면(형식이 다르거나 요청사항을 아예 안 썼으면) now() 로 대체합니다.
--
--   실행 순서: sql/supabase_schema_latest.sql → sql/admin_rls_policies.sql(is_admin() 필요) → 이 파일.
--   create or replace 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

drop function if exists public.admin_assign_manager(uuid, uuid);


-- ----------------------------------------------------------------------------
-- 0-1) request_details 안의 "희망 일시: N월 N일 (요일) 오전/오후 N시 [N분]" 한 줄을 파싱해 KST 기준
--      timestamptz 로 복원합니다 (apply.html 의 formatDesiredDateTime() 이 만드는 형식과 정확히 맞춤 —
--      그 함수가 포맷을 바꾸면 이 정규식도 같이 고쳐야 합니다). 연도가 문자열에 없으므로 p_reference(보통
--      신청 접수 시각 created_at) 의 연도를 기본으로 쓰고, "접수월보다 파싱된 월이 많이 이르면"(예: 12월에
--      접수하면서 1월을 희망) 해를 넘긴 요청으로 보고 연도를 +1 합니다. 형식이 안 맞거나 범위를 벗어난
--      값(13월, 25시 등)이면 NULL 을 돌려줘서 호출부가 now() 등으로 대체하게 합니다.
-- ----------------------------------------------------------------------------
create or replace function public.parse_desired_datetime_kst(p_request_details text, p_reference timestamptz)
returns timestamptz
language plpgsql stable as $$
declare
  v_m       text[];
  v_month   int;
  v_day     int;
  v_ampm    text;
  v_hour12  int;
  v_minute  int;
  v_hour24  int;
  v_year    int;
  v_ref_month int;
begin
  v_m := regexp_match(
    coalesce(p_request_details, ''),
    '(\d{1,2})월\s*(\d{1,2})일(?:\s*\([^)]*\))?\s*(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?'
  );
  if v_m is null then
    return null;
  end if;

  v_month  := v_m[1]::int;
  v_day    := v_m[2]::int;
  v_ampm   := v_m[3];
  v_hour12 := v_m[4]::int;
  v_minute := coalesce(v_m[5]::int, 0);

  if v_month not between 1 and 12 or v_day not between 1 and 31
     or v_hour12 not between 1 and 12 or v_minute not between 0 and 59 then
    return null;
  end if;

  v_hour24 := case
    when v_ampm = '오후' and v_hour12 <> 12 then v_hour12 + 12
    when v_ampm = '오전' and v_hour12 = 12 then 0
    else v_hour12
  end;

  v_ref_month := extract(month from (coalesce(p_reference, now()) at time zone 'Asia/Seoul'))::int;
  v_year := extract(year from (coalesce(p_reference, now()) at time zone 'Asia/Seoul'))::int;
  if v_month < v_ref_month - 1 then
    v_year := v_year + 1;
  end if;

  return (
    to_char(v_year, 'FM0000') || '-' || to_char(v_month, 'FM00') || '-' || to_char(v_day, 'FM00') ||
    ' ' || to_char(v_hour24, 'FM00') || ':' || to_char(v_minute, 'FM00') || ':00+09:00'
  )::timestamptz;
exception when others then
  -- 2월 30일처럼 달력에 없는 날짜 등 예외적인 입력은 조용히 NULL(= 호출부가 now() 로 대체)로 처리합니다.
  return null;
end $$;

revoke all on function public.parse_desired_datetime_kst(text, timestamptz) from public, anon, authenticated;

create or replace function public.admin_assign_manager(p_application_id uuid, p_manager_id uuid)
returns public.service_applications
language plpgsql security definer set search_path = public as $$
declare
  v_app         public.service_applications;
  v_is_active   boolean;
  v_schedule_id uuid;
  v_phone_re    constant text := '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}';
  v_sep         int;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.managers m where m.id = p_manager_id and m.certification_verified = true
  ) into v_is_active;
  if not v_is_active then
    raise exception 'MANAGER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  -- ① manager_id 설정 + ② status 명시적으로 'MATCHED' 확정 (트리거의 동의어 판정에 기대지 않음)
  update public.service_applications
     set manager_id  = p_manager_id,
         accepted_at = coalesce(accepted_at, now()),
         status      = 'MATCHED'
   where id = p_application_id
     and manager_id is null
  returning * into v_app;

  if not found then
    raise exception 'APPLICATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  -- ③ 결제가 아직 안 끝난 상태였다면(가상계좌 미입금), 수동 배정을 "입금도 확인됐다"는 선언으로 간주해 함께 맞춥니다.
  update public.virtual_accounts
     set is_paid = true
   where application_id = v_app.id
     and is_paid = false;

  -- ④ care_schedules 행 생성 — 이미 있으면(이례적인 재배정 등) manager_id 만 맞추고 끝냅니다.
  if v_app.schedule_id is not null then
    update public.care_schedules set manager_id = p_manager_id where id = v_app.schedule_id;
    select * into v_app from public.service_applications where id = v_app.id;
    return v_app;
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
    coalesce(public.parse_desired_datetime_kst(v_app.request_details, v_app.created_at), now()),
    nullif(btrim(concat_ws(E'\n', '[' || coalesce(v_app.service_type, '동행 서비스') || ']', v_app.request_details)), ''),
    'assigned',
    0,
    v_app.id,
    v_app.origin_lat, v_app.origin_lng, v_app.destination_lat, v_app.destination_lng
  )
  returning id into v_schedule_id;

  update public.service_applications set schedule_id = v_schedule_id where id = v_app.id;
  select * into v_app from public.service_applications where id = v_app.id;
  return v_app;
end $$;

revoke all on function public.admin_assign_manager(uuid, uuid) from public, anon;
grant  execute on function public.admin_assign_manager(uuid, uuid) to authenticated;


-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
