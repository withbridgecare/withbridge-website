-- ============================================================================
-- seniors : '어르신 프로필 관리' 등록 정보 보강 — 성별 / 어르신 본인 연락처 / 거동 상태 상세 /
--           자주 가는 병원 / 거주지 상세주소 / 병원 상세위치
--
--   mypage.html '어르신 프로필 관리' 등록/수정 모달에 여섯 항목을 추가합니다. apply.html '어르신 프로필
--   원클릭 불러오기'가 이 값들을 그대로 신청서 입력칸에 채우므로(거동 상태 라디오, 출발지/목적지 상세
--   주소란 등), 값의 의미와 표기를 apply.html 쪽과 반드시 맞춰 둡니다.
--
--     1) gender                 text — '남' | '여' (선택 입력)
--     2) senior_phone           text — 어르신 본인 휴대폰 번호 (선택 입력). 보호자 연락처와 같으면 등록
--        모달의 체크박스로 보호자 자신의 번호를 그대로 복사해 넣을 뿐, DB 에는 항상 입력된 값 그대로
--        저장합니다(체크박스 자체는 저장하지 않음 — 입력을 돕는 UI 보조 기능).
--     3) mobility_level         text — apply.html '어르신 거동 상태' 라디오와 같은 네 값 중 하나:
--        '혼자 걸음 가능' | '지팡이·보행기 사용' | '휠체어 사용' | '매니저 부축 필수'.
--        (기존 health_note 자유 입력은 그대로 남겨 두고, 구조화된 값이 필요한 이 용도로 새 컬럼을 추가함.
--        apply.html 은 health_note 키워드 추측 대신 이 컬럼을 우선 사용합니다 — loadSeniorProfiles 참고.)
--     4) frequent_hospital      text — 자주 가는 병원 (선택 입력, 예: '길병원'). apply.html 목적지(병원명)
--        입력칸을 함께 채웁니다.
--     5) address_detail         text — 거주지 상세주소(동/호수 등, 선택 입력). apply.html 출발지의
--        '상세 주소 (동/호수 등)' 입력칸(routeOriginDetail)을 함께 채웁니다.
--     6) frequent_hospital_detail text — 자주 가는 병원의 상세 위치(진료과, 층수 등, 선택 입력).
--        apply.html 목적지의 '상세 위치 (진료과, 층수 등)' 입력칸(routeDestinationDetail)을 함께 채웁니다.
--
--   seniors 는 RLS(select/insert/update/delete own, sql/supabase_schema_latest.sql 7번)와
--   grant(authenticated 에 select/insert/update/delete)가 테이블 단위로 이미 걸려 있어, 컬럼만 추가하는
--   이 마이그레이션에는 별도 권한/정책 변경이 필요 없습니다. PostgREST 스키마 캐시만 새로고침합니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   alter table add column if not exists 는 멱등이라 여러 번 실행해도 안전합니다.
-- ============================================================================

alter table public.seniors add column if not exists gender text;
alter table public.seniors drop constraint if exists seniors_gender_check;
alter table public.seniors add constraint seniors_gender_check check (gender is null or gender in ('남', '여'));

alter table public.seniors add column if not exists senior_phone text;

alter table public.seniors add column if not exists mobility_level text;
alter table public.seniors drop constraint if exists seniors_mobility_level_check;
alter table public.seniors add constraint seniors_mobility_level_check
  check (mobility_level is null or mobility_level in ('혼자 걸음 가능', '지팡이·보행기 사용', '휠체어 사용', '매니저 부축 필수'));

alter table public.seniors add column if not exists frequent_hospital text;

alter table public.seniors add column if not exists address_detail text;
alter table public.seniors add column if not exists frequent_hospital_detail text;

notify pgrst, 'reload schema';
