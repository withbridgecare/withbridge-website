-- ============================================================================
-- cleanup_test_data.sql
-- ⚠️⚠️⚠️ 되돌릴 수 없는 삭제 작업입니다 — 반드시 백업을 먼저 떠 두고 실행하세요 ⚠️⚠️⚠️
--   (Supabase 대시보드 → Database → Backups, 또는 pg_dump로 전체 스냅샷)
--
-- 목적: 정식 런칭 전, 테스트 중 쌓인 모든 테스트 계정(보호자/매니저)과 그에 연결된 거래
-- 데이터(서비스 신청, 케어 진행 일정, 결제/가상계좌, 쿠폰/패키지/적립금, 케어 리포트/
-- 체크포인트/현장인증로그/만족도평가/현장이슈, 환불·조정 로그, 매니저 지원서 등)를 전부
-- 지웁니다. 아래 KEEP_EMAIL 계정 — 그 계정 자신의 profiles/managers 행은 물론, 그 계정이 보호자
-- 또는 매니저로 관련된 모든 데이터까지 — 은 그대로 남깁니다(단, KEEP_EMAIL이 매니저로 수락한
-- 신청/일정이 있다면 그 상대방 보호자 계정까지 함께 남을 수 있습니다 — 아래 "보존 계정이 1개보다
-- 많아질 수 있습니다" 설명 참고).
--
-- KEEP_EMAIL = 'suseung396@gmail.com' (관리자/매니저 겸용 계정으로 보존)
--   → 다른 이메일로 바꾸려면 이 파일 안의 'suseung396@gmail.com' 문자열을 전부 바꾸세요
--     (Part A, Part B 양쪽 모두에 각 1곳씩 있습니다).
--
-- 건드리지 않는 것: public.admin_logs(관리자 활동 로그)는 이 스크립트가 손대지 않습니다 —
--   sql/admin_logs.sql 의 RLS 설계 자체가 "service_role 이 아닌 한 그 누구도(관리자 포함)
--   고치거나 지울 수 없다"는 의도로 만들어진 감사 로그라, 테스트 데이터 정리 대상에서
--   의도적으로 제외했습니다. 꼭 지우고 싶다면 이 파일을 기반으로 별도 문장을 추가하세요.
--
-- 외래키 의존 관계는 이 저장소의 모든 CREATE TABLE문을 다시 읽어 직접 확인했습니다
-- (추측이 아님) — 자식 테이블부터 부모 테이블 순서로 지워서, 운영 DB의 실제 ON DELETE
-- 설정이 CASCADE든 RESTRICT든 NO ACTION이든 전부 안전하게 통과합니다.
--
-- 보존 계정이 1개보다 많아질 수 있습니다: service_applications(user_id/manager_id)와
-- care_schedules(manager_id/guardian_id)는 양쪽 다 on delete 미지정(=RESTRICT)으로 profiles를
-- 참조합니다. 그래서 KEEP_EMAIL 계정이 매니저로 "수락"한 신청/일정이 있다면, 그 신청의 보호자
-- 계정까지 함께 보존하지 않으면 Part B 뒷부분(계정 삭제 단계)에서 외래 키 위반이 납니다. 이
-- 스크립트는 KEEP_EMAIL 에서 시작해 이런 "서로 참조" 관계로 연결된 계정을 전부 재귀적으로 따라가
-- 보존 대상에 포함시키므로, 아래 '보존 계정' 건수가 2 이상이어도 정상입니다 — 몇 건인지, 어떤
-- 신청/일정 때문에 연결됐는지(제일 아래 '보존 신청' 결과로 확인 가능)만 확인하면 됩니다.
--
-- 사용법 (반드시 순서대로):
--   1) Part A(미리보기) 전체를 SQL Editor에 붙여넣고 실행 — 읽기 전용, 몇 건이 지워질지
--      보여주기만 합니다. 보존 계정이 예상 밖으로 많다면(연결 관계가 의도와 다르다면) 여기서
--      멈추고 확인하세요.
--   2) 결과가 맞으면 Part B(실제 삭제) 전체를 새로 붙여넣고 실행 — 하나의 트랜잭션이라
--      중간에 오류가 나면 전부 자동 롤백됩니다(부분 삭제 없음).
--   3) Part B 맨 끝의 '사후 확인' 쿼리로 정리가 끝났는지 확인하세요.
-- ============================================================================


-- ============================================================================
-- PART A — 미리보기 (읽기 전용, 안전함, 여러 번 실행해도 무해)
-- ============================================================================
do $$
begin
  if not exists (select 1 from auth.users where email = 'suseung396@gmail.com') then
    raise exception 'KEEP_EMAIL(suseung396@gmail.com) 계정을 찾을 수 없습니다 — 이메일을 다시 확인하세요.';
  end if;
end $$;

drop table if exists _keep_user, _keep_senior, _keep_application, _keep_package, _keep_coupon, _keep_schedule;

-- KEEP_EMAIL 계정에서 출발해 "매니저로 수락한 신청/배정된 일정"을 타고 연결된 상대방 계정까지
-- 재귀적으로 전부 모읍니다(위 상단 설명 참고) — service_applications.user_id<->manager_id,
-- care_schedules.manager_id<->guardian_id 양쪽 다 RESTRICT라서 한쪽만 보존하면 안 됩니다.
create temp table _keep_user as
with recursive edges(a, b) as (
  select user_id, manager_id from public.service_applications
   where user_id is not null and manager_id is not null
  union all
  select manager_id, user_id from public.service_applications
   where user_id is not null and manager_id is not null
  union all
  select manager_id, guardian_id from public.care_schedules
   where manager_id is not null and guardian_id is not null
  union all
  select guardian_id, manager_id from public.care_schedules
   where manager_id is not null and guardian_id is not null
), reachable(id) as (
  select id from auth.users where email = 'suseung396@gmail.com'
  union
  select e.b from edges e join reachable r on r.id = e.a
)
select distinct id from reachable;

create temp table _keep_senior as
  select senior_id from public.seniors where user_id in (select id from _keep_user);

create temp table _keep_application as
  select id from public.service_applications
   where user_id    in (select id from _keep_user)
      or manager_id in (select id from _keep_user);

-- user_packages/user_coupons 는 service_applications.package_id / .coupon_id 가 on delete 미지정
-- (= RESTRICT)으로 참조합니다. _keep_application 에는 "매니저로만" keep 계정과 연결된 신청(신청의
-- 실제 보호자는 keep 계정이 아닐 수 있음)도 들어가므로, 그 신청이 가리키는 패키지/쿠폰까지 보존
-- 대상에 넣지 않으면 — 소유자(user_id) 기준으로만 "삭제 대상"을 판단하는 user_packages/user_coupons
-- 가 보존되는 신청에 의해 여전히 참조된 채로 삭제 대상에 집계/삭제되어 외래 키 제약 위반이 납니다.
create temp table _keep_package as
  select up.id from public.user_packages up
   where up.user_id in (select id from _keep_user)
      or up.id in (
           select sa.package_id from public.service_applications sa
            where sa.id in (select id from _keep_application) and sa.package_id is not null
         );

create temp table _keep_coupon as
  select uc.id from public.user_coupons uc
   where uc.user_id in (select id from _keep_user)
      or uc.id in (
           select sa.coupon_id from public.service_applications sa
            where sa.id in (select id from _keep_application) and sa.coupon_id is not null
         );

create temp table _keep_schedule as
  select id from public.care_schedules
   where manager_id     in (select id from _keep_user)
      or guardian_id    in (select id from _keep_user)
      or application_id in (select id from _keep_application);

select '보존 계정' as 구분, count(*) as 건수 from _keep_user
union all select '보존 어르신 프로필', count(*) from _keep_senior
union all select '보존 신청(보호자/매니저 양쪽)', count(*) from _keep_application
union all select '보존 패키지(신청이 참조 중인 것 포함)', count(*) from _keep_package
union all select '보존 쿠폰(신청이 참조 중인 것 포함)', count(*) from _keep_coupon
union all select '보존 케어 일정', count(*) from _keep_schedule
union all select '— 아래부터 삭제될 건수 —', null
union all select '삭제될 계정(auth.users)', count(*) from auth.users u where not exists (select 1 from _keep_user k where k.id = u.id)
union all select '삭제될 어르신 프로필', count(*) from public.seniors s where not exists (select 1 from _keep_senior k where k.senior_id = s.senior_id)
union all select '삭제될 서비스 신청', count(*) from public.service_applications a where not exists (select 1 from _keep_application k where k.id = a.id)
union all select '삭제될 케어 일정', count(*) from public.care_schedules c where not exists (select 1 from _keep_schedule k where k.id = c.id)
union all select '삭제될 케어 리포트', count(*) from public.care_reports x where not exists (select 1 from _keep_schedule k where k.id = x.schedule_id)
union all select '삭제될 현장 체크포인트', count(*) from public.care_checkpoints x where not exists (select 1 from _keep_schedule k where k.id = x.schedule_id)
union all select '삭제될 도착인증 로그', count(*) from public.arrival_verification_logs x where not exists (select 1 from _keep_schedule k where k.id = x.schedule_id)
union all select '삭제될 만족도 평가', count(*) from public.care_reviews x where not exists (select 1 from _keep_schedule k where k.id = x.schedule_id)
union all select '삭제될 현장 이슈 접수', count(*) from public.care_issue_reports x
  where not exists (select 1 from _keep_application k where k.id = x.application_id)
    and not exists (select 1 from _keep_schedule k where k.id = x.schedule_id)
union all select '삭제될 관리자 중단/조정 내역', count(*) from public.admin_care_adjustments x
  where not exists (select 1 from _keep_application k where k.id = x.application_id)
    and not exists (select 1 from _keep_schedule k where k.id = x.schedule_id)
union all select '삭제될 환불 로그', count(*) from public.service_application_refund_logs x where not exists (select 1 from _keep_application k where k.id = x.application_id)
union all select '삭제될 가상계좌', count(*) from public.virtual_accounts x where not exists (select 1 from _keep_application k where k.id = x.application_id)
union all select '삭제될 적립금 내역', count(*) from public.point_transactions x where not exists (select 1 from _keep_user k where k.id = x.user_id)
union all select '삭제될 CS 메모', count(*) from public.admin_member_notes x where not exists (select 1 from _keep_user k where k.id = x.user_id)
union all select '삭제될 쿠폰', count(*) from public.user_coupons x where not exists (select 1 from _keep_coupon k where k.id = x.id)
union all select '삭제될 패키지(회차권)', count(*) from public.user_packages x where not exists (select 1 from _keep_package k where k.id = x.id)
union all select '삭제될 패키지 주문', count(*) from public.package_orders x where not exists (select 1 from _keep_user k where k.id = x.user_id)
union all select '삭제될 매니저 지원서', count(*) from public.manager_applications x where not exists (select 1 from _keep_user k where k.id = x.user_id)
union all select '삭제될 지원서 레이트리밋(전체 truncate)', count(*) from public.manager_application_rate_limits
union all select '삭제될 매니저 프로필', count(*) from public.managers x where not exists (select 1 from _keep_user k where k.id = x.id)
union all select '삭제될 회원 프로필', count(*) from public.profiles x where not exists (select 1 from _keep_user k where k.id = x.id);

-- Part B를 바로 이어서 실행할 거면 아래 drop은 생략해도 됩니다(Part B가 다시 만듭니다).
drop table if exists _keep_user, _keep_senior, _keep_application, _keep_package, _keep_coupon, _keep_schedule;


-- ============================================================================
-- PART B — 실제 삭제 (되돌릴 수 없음!) — Part A 결과를 확인한 뒤에만 실행하세요.
-- ============================================================================
begin;

drop table if exists _keep_user, _keep_senior, _keep_application, _keep_package, _keep_coupon, _keep_schedule;

-- Part A와 동일한 재귀 탐색(상단 설명 참고) — 매니저<->보호자로 서로 참조하는 계정을 전부 모아야
-- 아래 10)/11)에서 profiles/auth.users 를 지울 때 RESTRICT 위반 없이 끝까지 통과합니다.
create temp table _keep_user as
with recursive edges(a, b) as (
  select user_id, manager_id from public.service_applications
   where user_id is not null and manager_id is not null
  union all
  select manager_id, user_id from public.service_applications
   where user_id is not null and manager_id is not null
  union all
  select manager_id, guardian_id from public.care_schedules
   where manager_id is not null and guardian_id is not null
  union all
  select guardian_id, manager_id from public.care_schedules
   where manager_id is not null and guardian_id is not null
), reachable(id) as (
  select id from auth.users where email = 'suseung396@gmail.com'
  union
  select e.b from edges e join reachable r on r.id = e.a
)
select distinct id from reachable;

do $$
begin
  if not exists (select 1 from _keep_user) then
    raise exception '보존 계정(suseung396@gmail.com)을 찾을 수 없어 중단합니다 — 아무것도 삭제되지 않았습니다.';
  end if;
end $$;

create temp table _keep_senior as
  select senior_id from public.seniors where user_id in (select id from _keep_user);

create temp table _keep_application as
  select id from public.service_applications
   where user_id    in (select id from _keep_user)
      or manager_id in (select id from _keep_user);

-- Part A와 동일한 이유로 필요합니다: 아래 7)에서 user_packages/user_coupons 를 user_id 기준으로만
-- 지우면, 6)에서 보존되는 신청(매니저로만 keep 계정과 연결된 경우)이 가리키는 패키지/쿠폰까지
-- 지우려다 외래 키 제약(service_applications_package_id_fkey / coupon_id_fkey, 둘 다 on delete
-- 미지정 = RESTRICT) 위반으로 트랜잭션 전체가 롤백됩니다.
create temp table _keep_package as
  select up.id from public.user_packages up
   where up.user_id in (select id from _keep_user)
      or up.id in (
           select sa.package_id from public.service_applications sa
            where sa.id in (select id from _keep_application) and sa.package_id is not null
         );

create temp table _keep_coupon as
  select uc.id from public.user_coupons uc
   where uc.user_id in (select id from _keep_user)
      or uc.id in (
           select sa.coupon_id from public.service_applications sa
            where sa.id in (select id from _keep_application) and sa.coupon_id is not null
         );

create temp table _keep_schedule as
  select id from public.care_schedules
   where manager_id     in (select id from _keep_user)
      or guardian_id    in (select id from _keep_user)
      or application_id in (select id from _keep_application);

-- 1) care_schedules 의 자식들 (schedule_id 기준, 전부 not null FK)
delete from public.care_reports cr
 where not exists (select 1 from _keep_schedule k where k.id = cr.schedule_id);

delete from public.care_checkpoints cc
 where not exists (select 1 from _keep_schedule k where k.id = cc.schedule_id);

delete from public.arrival_verification_logs avl
 where not exists (select 1 from _keep_schedule k where k.id = avl.schedule_id);

delete from public.care_reviews rv
 where not exists (select 1 from _keep_schedule k where k.id = rv.schedule_id);

-- 2) service_applications/care_schedules 둘 다를(nullable FK로) 참조하는 테이블 —
--    둘 중 하나라도 보존 대상과 연결되면 지우지 않습니다.
delete from public.care_issue_reports cir
 where not exists (select 1 from _keep_application k where k.id = cir.application_id)
   and not exists (select 1 from _keep_schedule k where k.id = cir.schedule_id);

delete from public.admin_care_adjustments aca
 where not exists (select 1 from _keep_application k where k.id = aca.application_id)
   and not exists (select 1 from _keep_schedule k where k.id = aca.schedule_id);

-- 3) service_applications 의 나머지 자식들 (application_id 기준)
delete from public.service_application_refund_logs sarl
 where not exists (select 1 from _keep_application k where k.id = sarl.application_id);

delete from public.virtual_accounts va
 where not exists (select 1 from _keep_application k where k.id = va.application_id);

delete from public.point_transactions pt
 where not exists (select 1 from _keep_user k where k.id = pt.user_id);

-- 4) 관리자 CS 메모 (profiles.id 기준 — cascade가 걸려 있지만 명시적으로 한 번 더)
delete from public.admin_member_notes amn
 where not exists (select 1 from _keep_user k where k.id = amn.user_id);

-- 5) care_schedules — 참조하는 자식(1~4)이 모두 비워졌으므로 이제 안전
delete from public.care_schedules cs
 where not exists (select 1 from _keep_schedule k where k.id = cs.id);

-- 6) service_applications — 참조하는 자식들이 모두 비워졌으므로 이제 안전
--    (coupon_id/package_id 로 user_coupons/user_packages 를 가리키므로, 저 두 테이블보다
--    반드시 먼저 지워야 합니다 — 7)번보다 앞에 있는 이유)
delete from public.service_applications sa
 where not exists (select 1 from _keep_application k where k.id = sa.id);

-- 7) 쿠폰/패키지/패키지주문/매니저지원서 — service_applications 가 더 이상 참조하지 않으므로 안전
--    (_keep_package/_keep_coupon 기준으로 지웁니다 — 보존되는 신청이 참조 중인 행은 소유자가
--    keep 계정이 아니어도 함께 보존해야 위 6)에서 이미 지워진 FK 정합성이 깨지지 않습니다)
delete from public.user_coupons uc
 where not exists (select 1 from _keep_coupon k where k.id = uc.id);

delete from public.user_packages up
 where not exists (select 1 from _keep_package k where k.id = up.id);

delete from public.package_orders po
 where not exists (select 1 from _keep_user k where k.id = po.user_id);

delete from public.manager_applications ma
 where not exists (select 1 from _keep_user k where k.id = ma.user_id);

-- 8) 지원서 레이트리밋 — IP 기준이라 특정 계정과 연결할 수 없는 운영 데이터, 조건 없이 비웁니다
truncate public.manager_application_rate_limits;

-- 9) 어르신 프로필
delete from public.seniors s
 where not exists (select 1 from _keep_user k where k.id = s.user_id);

-- 10) 매니저/회원 프로필 (managers.id = profiles.id = auth.users.id, 같은 값을 공유)
delete from public.managers m
 where not exists (select 1 from _keep_user k where k.id = m.id);

delete from public.profiles p
 where not exists (select 1 from _keep_user k where k.id = p.id);

-- 11) 계정 자체 — 여기서 권한 오류가 나더라도 위 1~10은 이미 전부 지워진 상태입니다. 그 경우
--     Supabase 대시보드 → Authentication → Users 에서 남은 테스트 계정을 수동으로 지우세요
--     (auth.* 내부 테이블(세션/리프레시 토큰 등)은 Supabase가 자체적으로 cascade 처리합니다).
delete from auth.users u
 where not exists (select 1 from _keep_user k where k.id = u.id);

drop table if exists _keep_user, _keep_senior, _keep_application, _keep_package, _keep_coupon, _keep_schedule;

commit;


-- ----------------------------------------------------------------------------
-- 사후 확인 — 남은 계정 수는 Part A 미리보기의 '보존 계정' 건수와 같아야 정상입니다(KEEP_EMAIL과
-- 매니저<->보호자로 연결된 계정이 있었다면 1보다 클 수 있습니다). 남은 계정 이메일 목록을 보고
-- 의도한 계정만 남았는지 확인하세요. 그 외 수치는 전부 0이어야 합니다.
-- ----------------------------------------------------------------------------
select
  (select count(*) from auth.users) as 남은_계정_수,
  (select string_agg(email, ', ') from auth.users) as 남은_계정_이메일_목록,
  (select count(*) from public.service_applications) as 남은_신청_수,
  (select count(*) from public.care_schedules) as 남은_케어일정_수,
  (select count(*) from public.seniors) as 남은_어르신프로필_수,
  (select count(*) from public.user_coupons) as 남은_쿠폰_수,
  (select count(*) from public.user_packages) as 남은_패키지_수;
