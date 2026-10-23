-- ============================================================================
-- 출발/병원 도착 인증 시 "위치/사진은 저장하지 못했어요. 관리자에게 DB 설정을
-- 요청해 주세요." 토스트가 뜨는 문제 — 근본 원인 수정
--
--   원인: public.record_care_verification() 이 두 개의 오버로드로 중복 존재합니다.
--     1) (uuid, text, text,  text)  — 예전 버전. verification_location/verification_photo
--        제네릭 컬럼에만 쓰고, departed_*/arrived_* 컬럼도 모르고, manager_id 검증도 없음.
--     2) (uuid, text, jsonb, text)  — 현재 버전(supabase-fix-status-sync.sql). departed_at/
--        departed_location/departed_photo, arrived_at/arrived_location/arrived_photo 를
--        정확히 채우고, manager_id = auth.uid() 로 소유권 검증 + service_applications 미러링.
--
--   mypage-manager.html 의 verifyAdvance() 는 위치 객체를 그대로 넘기므로 jsonb 오버로드를
--   의도한 것이지만, PostgREST 가 두 오버로드 중 하나를 결정하지 못해("Could not choose
--   the best candidate function between: ...record_care_verification(uuid, text, text, text),
--   ...record_care_verification(uuid, text, jsonb, text)") PGRST203 오류를 던집니다.
--   클라이언트의 폴백 분기(err.message 안에 'record_care_verification' 문자열이 있으면
--   "RPC 미배포"로 간주)가 이 오류 메시지에도 매칭되어, 실제로는 함수가 이미 배포돼
--   있는데도 "DB 설정 필요" 폴백 경로로 빠져 위치/사진 저장을 건너뛰고 있었습니다.
--
--   care_schedules.departed_location/departed_photo/arrived_location/arrived_photo 컬럼,
--   그리고 전용 Storage 버킷 — 이 플로우는 사진을 캔버스에서 워터마크 처리한 뒤 base64
--   data URL 문자열로 바로 저장합니다(mypage-manager.html resizeReceiptPhoto 등) — 둘 다
--   이미 정상이며 누락된 것이 없습니다. 유일한 문제는 아래 중복 오버로드였습니다.
--
--   수정: 예전 text 오버로드를 제거하고 jsonb 버전만 남깁니다. 코드베이스 전체에서
--   record_care_verification 을 호출하는 곳은 mypage-manager.html 의 이 한 곳뿐이며,
--   위치를 객체(jsonb)로 넘기므로 text 오버로드에 의존하는 호출부는 없습니다.
-- ============================================================================

drop function if exists public.record_care_verification(uuid, text, text, text);

-- 남는 jsonb 오버로드의 권한을 다시 한 번 명시적으로 고정합니다(기존과 동일 — 변경 없음,
-- 그냥 확인 차원).
revoke all on function public.record_care_verification(uuid, text, jsonb, text) from public, anon;
grant  execute on function public.record_care_verification(uuid, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
