-- ============================================================================
-- 매니저 이름/연락처 '미등록' 2차 진단 — id 매핑 / 데이터 자체 확인
--
--   sql/admin_names_phones_diagnostic_and_fix.sql(관리자 RLS 재적용)을 실행한 뒤에도 여전히
--   '미등록'이 뜬다면, 아래 두 가지 중 하나일 가능성이 매우 큽니다:
--
--   1) RLS가 아니라 "데이터 자체가 없음" — admin_manager_monthly_settlements() RPC(sql/
--      admin_settlement_fixes_v4_restore_and_rpc.sql)는 SECURITY DEFINER라 RLS를 완전히
--      무시합니다. 그런데도 '매니저 정산 (월별)' 표에서 이름이 '미등록'으로 보인다면, RLS는
--      원인이 아니고 실제로 profiles.name/phone 과 manager_applications 양쪽 모두에 그 매니저의
--      이름/연락처가 없다는 뜻입니다.
--
--   2) id 매핑이 어긋남 — managers.id 는 profiles.id 를 참조하는 FK라 DB 제약상 어긋날 수 없지만,
--      과거에 제약을 끄고 수기로 넣은 행이나 테스트 데이터가 있다면 확인이 필요합니다.
--
--   아래 0번 쿼리를 Supabase SQL Editor에서 실행한 뒤(SQL Editor는 postgres 권한으로 돌아서
--   RLS와 무관하게 "실제로 뭐가 들어있는지"를 그대로 보여줍니다), 결과를 알려주시면 정확히
--   어느 매니저의 어떤 값이 비어 있는지 짚어 드릴 수 있습니다.
-- ============================================================================

-- 0) 매니저별 전체 매핑 현황 — 이 결과의 profile_name/phone, latest_application_* 열이 전부
--    비어 있는 행이 바로 '미등록'으로 보이는 매니저입니다.
select
  m.id                        as manager_id,
  m.certification_verified,
  m.activity_status,
  m.approved_at,
  p.id                        as profile_id,
  (p.id is null)              as profile_row_missing,     -- true 면 managers.id 와 같은 id의 profiles 행이 아예 없음(심각 — FK 제약상 원래는 불가능)
  p.role                      as profile_role,
  p.name                      as profile_name,
  p.phone                     as profile_phone,
  ma.id                       as latest_application_id,
  ma.status                   as latest_application_status,
  ma.name                     as latest_application_name,
  ma.phone                    as latest_application_phone,
  (ma.id is null)             as no_application_at_all,    -- true 면 manager_applications 에 이 유저 행이 전혀 없음(승인 절차 없이 만들어진 매니저)
  coalesce(nullif(btrim(p.name), ''), ma.name)   as resolved_name,
  coalesce(nullif(btrim(p.phone), ''), ma.phone) as resolved_phone
from public.managers m
left join public.profiles p on p.id = m.id
left join lateral (
  select a.id, a.user_id, a.name, a.phone, a.status
    from public.manager_applications a
   where a.user_id = m.id
   order by (a.status = 'approved') desc, a.reviewed_at desc nulls last, a.created_at desc
   limit 1
) ma on true
order by (coalesce(nullif(btrim(p.name), ''), ma.name) is null) desc, m.approved_at desc nulls last;


-- 1) care_schedules.manager_id 중 managers 테이블에 아예 없는 id가 있는지 — '배정 완료 케어 현황'
--    카드의 "담당 매니저" 가 깨지는 또 다른 경로입니다(있으면 수동 배정/오래된 테스트 데이터로
--    managers 행 없이 manager_id 만 꽂힌 경우).
select cs.manager_id, count(*) as schedules_count
  from public.care_schedules cs
 where cs.manager_id is not null
   and not exists (select 1 from public.managers m where m.id = cs.manager_id)
 group by cs.manager_id;


-- 2) manager_applications.user_id 중 profiles 에 없는 id(있으면 FK 제약이 깨진 것 — 정상 운영에서는
--    나올 수 없지만, 과거 제약 없이 들어간 이행 데이터가 있을 수 있어 확인용으로 둡니다).
select a.user_id, a.name, a.phone, a.status
  from public.manager_applications a
 where not exists (select 1 from public.profiles p where p.id = a.user_id);
