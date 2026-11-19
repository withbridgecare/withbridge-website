# 위드브릿지 Next.js 전환 — 운영자 확인 체크리스트

> Next.js 로 옮긴 사이트(`nextjs` 브랜치)를 **운영에 내보내기 전에 사람이 직접 확인해야 하는 항목**입니다.
> 코드 쪽 점검(화면 비교·타입·코드 규칙·빌드)은 끝났고, 여기 남은 것은 **실제 계정·실결제·외부 서비스 설정**이 있어야만 확인할 수 있는 것들입니다.
> 확인한 항목은 `[ ]` 를 `[x]` 로 바꿔 두세요. 문제가 있으면 항목 옆에 메모를 남기고 개발 담당(또는 AI)에게 이 파일을 보여 주세요.
>
> 작성: 2026-11-19 · 관련 문서: [NEXTJS_MIGRATION_PLAN.md](NEXTJS_MIGRATION_PLAN.md)

**권장 순서**: 1 → 2 → 3(SQL 붙여 넣기) → Vercel 미리보기 배포 → 5·6(기능 테스트) → 4·7 → 운영 반영

---

## 1. Vercel 배포 설정

- [ ] Project Settings → General → **Framework Preset = Next.js** (Build Command·Output Directory 를 직접 적어 둔 게 있으면 비우기 — `vercel.json` 에 `"framework": "nextjs"` 있음)
- [ ] Project Settings → General → **Node.js 버전 22 이상** (supabase-js 가 20 지원 종료 예고)
- [ ] Environment Variables (Production 과 Preview 각각):
  - [ ] `SUPABASE_URL` — Supabase 프로젝트 주소
  - [ ] `SUPABASE_ANON_KEY` — anon(공개) 키. **service_role 키를 넣으면 안 됩니다**
  - [ ] `SITE_URL` — 운영 주소 (예: `https://www.withbridge.kr`). 비우면 `lib/config.ts` 기본값 `https://www.withbridge.kr` 사용 → **실제 운영 도메인과 같은지 확인**
  - [ ] (선택) `WB_ENV_NAME` = `production` / Preview 는 `development`
- [ ] 미리보기 배포 주소에서 사이트가 열리는지 (`git push` 하면 Vercel 이 자동으로 만듦)
- [ ] GitHub 저장소의 **Actions** 탭에서 `CI` 가 초록색(통과)인지 — 코드 규칙·타입·빌드 자동 점검

## 2. 외부 서비스 설정 (주소·도메인 등록)

새 사이트는 주소 형식이 `/apply.html` → `/apply` 로 바뀌었지만, 예전 주소도 자동으로 새 주소로 이동합니다.

**Supabase → Authentication → URL Configuration**
- [ ] Site URL 이 운영 도메인인지
- [ ] Redirect URLs 에 아래가 들어 있는지 (운영 도메인 + Vercel 미리보기 도메인 각각):
  - `https://<도메인>/index.html` (카카오 로그인 후 돌아오는 곳 — 자동으로 `/` 로 이동)
  - `https://<도메인>/signup.html` (이메일 인증 링크)
  - `https://<도메인>/reset-password.html` (비밀번호 재설정 링크)
- [ ] Authentication → Providers → **Kakao** 사용 중이고 키가 맞는지

**카카오 디벨로퍼스** (내 애플리케이션 → 플랫폼 → Web)
- [ ] 사이트 도메인에 운영 도메인 + Vercel 미리보기 도메인 등록 — 메인 **'서비스 지역' 지도**(JS 키 `d4e5f004…`)가 이 등록이 없으면 안 뜸
- [ ] REST API 키(`4e94e702…`, 신청서 주소→좌표·장소 검색)도 같은 앱이면 도메인 제한 확인 — 이 키는 브라우저에 노출되므로 **도메인 제한 권장**

**Cloudflare Turnstile** (매니저 지원서 봇 방지, site key `0x4AAAAAAFikvWaQUCBnw-hV`)
- [ ] Turnstile 위젯의 허용 도메인(Hostname)에 운영 도메인 + 미리보기 도메인 등록
- [ ] Supabase Edge Function Secret `TURNSTILE_SECRET_KEY` 설정

**PortOne (포트원) V2** — store `store-d049e114…`, channel `channel-key-9b483b99…` (**운영·실결제 채널**)
- [ ] 콘솔의 웹훅 주소가 `https://<Supabase 프로젝트>.supabase.co/functions/v1/portone-webhook` 인지 (Next.js 전환과 무관하지만 결제 확정에 필수)
- [ ] Edge Function Secrets: `PORTONE_STORE_ID`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`, `PORTONE_VIRTUAL_ACCOUNT_CHANNEL_KEY`
- [ ] 테스트 방법 결정: (a) 테스트 채널 키를 받아 미리보기에서만 쓰기(`lib/payments/portone.ts` 의 `PORTONE_CHANNEL_KEY`) 또는 (b) 소액 실결제 후 즉시 취소

**Supabase Edge Functions 배포 상태** (`supabase functions list` 또는 대시보드 → Edge Functions)
- [ ] 아래 16개가 모두 배포돼 있음:
  `issue-virtual-account` `confirm-extra-charge-payment` `confirm-package-order-payment` `cancel-payment` `admin-refund-application`
  `cancel-expired-applications` `admin-set-member-status` `delete-account` `generate-care-report` `submit-manager-application`
  `portone-webhook` `send-status-alimtalk` `notify-care-request` `notify-care-report-alimtalk` `notify-partner-inquiry` `telegram-webhook`
- [ ] 알림 관련 Secrets: `SOLAPI_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_MANAGER_CHAT_ID`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL`
- [ ] AI 리포트 초안: `OPENAI_API_KEY` 또는 `GEMINI_API_KEY` (없으면 AI 초안만 꺼지고 직접 작성은 됨)

## 3. DB 점검 — 사이트가 쓰는 테이블·함수가 모두 있는지

Supabase 대시보드 → **SQL Editor** 에 아래를 붙여 넣고 실행하세요. **결과가 0행이면 정상**, 이름이 나오면 그 테이블/함수가 DB 에 없는 것입니다(`sql/` 폴더의 해당 파일을 실행해야 함).

```sql
-- 1) 사이트가 쓰는 테이블 중 DB 에 없는 것
select t as missing_table from unnest(array[
  'admin_logs','admin_member_notes','arrival_verification_logs','care_checkpoints','care_issue_reports',
  'care_reports','care_reviews','care_schedules','guardian_care_reports','manager_applications',
  'manager_telegram_links','managers','notices','package_orders','partner_inquiries','profiles',
  'seniors','service_applications','user_coupons','user_packages'
]) t
where to_regclass('public.' || t) is null;

-- 2) 사이트가 부르는 DB 함수(RPC) 중 DB 에 없는 것
select f as missing_function from unnest(array[
  'accept_care_request','accept_service_application','admin_add_member_note','admin_adjust_member_sessions',
  'admin_adjust_package_session','admin_adjust_user_package','admin_assign_manager','admin_cancel_extra_charge',
  'admin_confirm_manual_payment','admin_delete_member_coupon','admin_force_complete_care','admin_grant_member_coupon',
  'admin_grant_member_package','admin_list_members','admin_manager_care_overview','admin_manager_monthly_settlement_details',
  'admin_manager_monthly_settlements','admin_mark_refund_completed','admin_reassign_care_manager','admin_request_extra_charge',
  'admin_resolve_care_issue','admin_restore_package_session','admin_reveal_manager_account','admin_set_manager_activity_status',
  'admin_update_member_profile','advance_care_status','approve_manager_application','cancel_my_application',
  'claim_service_applications','claim_welcome_coupon','confirm_service_application','deactivate_own_account',
  'is_phone_registered','is_super_admin','manager_my_review_stats','mark_care_report_read','mark_welcome_coupon_notified',
  'my_application_managers','my_application_schedules','record_care_verification','reject_manager_application',
  'report_care_duration_and_bill_extra','request_telegram_link_token','revoke_manager','set_initial_phone_if_missing',
  'super_admin_grant_admin','super_admin_list_admins','super_admin_revoke_admin','update_user_profile',
  -- 결제 금액 서버 검증 (화면이 보낸 금액을 서버가 다시 계산)
  'expected_service_price','expected_overtime_rate_per_30min','expected_addon_total'
]) f
where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);

-- 3) 사이트가 쓰는 테이블 중 RLS(행 단위 보안)가 꺼진 것 — 0행이어야 안전
select c.relname as rls_off_table from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  and c.relname = any(array['admin_logs','admin_member_notes','arrival_verification_logs','care_checkpoints','care_issue_reports',
  'care_reports','care_reviews','care_schedules','manager_applications','manager_telegram_links','managers','notices',
  'package_orders','partner_inquiries','profiles','seniors','service_applications','user_coupons','user_packages']);

-- 4) 저장소 버킷이 '비공개'인지 — public 이 false 여야 함
select id, public from storage.buckets where id in ('care-departure-photos','manager-id-cards');
```

- [ ] 1) 테이블 누락 0행
- [ ] 2) 함수 누락 0행
- [ ] 3) RLS 꺼진 테이블 0행
- [ ] 4) 두 버킷 모두 `public = false`

## 4. 보안 점검 — 브라우저가 직접 쓰는(저장·수정·삭제) 데이터

이 사이트는 아래 테이블을 **브라우저에서 직접** 바꿉니다. 보호는 전적으로 DB 의 RLS 정책이 합니다(원칙 4).
각 항목을 **다른 사람 계정·비로그인으로 시도했을 때 막히는지** 확인하세요. (SQL Editor 의 `Run as` 역할 전환 또는 테스트 계정 2개 사용)

| 테이블 | 하는 일 (화면) | 막혀야 하는 것 |
|---|---|---|
| `service_applications` | 신청서 저장(신청서) · 상태 수정(어드민) | 남의 신청서 조회·수정, 비관리자의 상태 수정 |
| `seniors` | 어르신 프로필 등록·수정·삭제(신청서·마이페이지) | 남의 어르신 프로필 조회·수정·삭제 |
| `care_reviews` | 후기 작성(보호자 마이페이지) | 내 일정이 아닌 후기 작성·수정 |
| `care_schedules` | 상태 변경(매니저 마이페이지) | 배정되지 않은 매니저·보호자의 수정 |
| `care_reports`·`care_checkpoints`·`arrival_verification_logs`·`care_issue_reports` | 리포트·인증 기록(매니저) | 배정되지 않은 사람의 기록 추가 |
| `managers` | 활동 상태 변경(매니저) | 남의 매니저 정보 수정, 인증 여부(`certification_verified`) 스스로 변경 |
| `manager_telegram_links` | 텔레그램 연결 해제(매니저) | 남의 연결 삭제 |
| `package_orders` | 패키지 주문서 생성(패키지 구매) | 남의 주문 조회, 결제 없이 충전 (충전은 서버 함수만) |
| `notices` | 공지 등록·수정·삭제(어드민) | 비관리자의 쓰기 |
| `partner_inquiries` | 제휴 문의 저장(누구나) · 상태 수정(어드민) | 비관리자의 문의 목록 조회·수정 |
| 저장소 `manager-id-cards`, `care-departure-photos` | 신분증·출발 인증 사진 | 본인·담당자·관리자 외 열람 |

- [ ] 위 표의 '막혀야 하는 것'을 대표로 3개 이상 직접 시도해 봤고 모두 막힘
- [ ] `profiles.role` 을 사용자가 스스로 `admin` 으로 바꿀 수 없음 (`sql/protect_admin_role.sql`, `role_hierarchy_hardening.sql`)
- [ ] 결제 금액 조작 방지: 신청서에서 금액을 바꿔 보내도(개발자 도구) 서버 결제 확인에서 `AMOUNT_MISMATCH` 로 막힘

## 5. 기능 테스트 — 결제·신청 (미리보기 배포에서)

- [ ] 카드 결제로 신청 → 완료 화면 → 마이페이지에 신청 표시 → 관리자 화면에 결제 완료
- [ ] 계좌이체 결제
- [ ] 결제창을 그냥 닫기 → "결제가 취소되었습니다" 안내, 신청서는 저장된 상태
- [ ] 웰컴 쿠폰 적용 / 적립금 사용 / 긴급 매칭 옵션 → 결제 금액이 화면 요약과 같음
- [ ] 보유 패키지 차감으로 예약 (결제창 없이 접수, 잔여 횟수 1 감소)
- [ ] 패키지(10시간권) 구매 → 완료 모달 → 마이페이지에 잔여 시간 표시
- [ ] 추가 요금 결제 (관리자가 요청 → 보호자 마이페이지에서 결제)
- [ ] 서비스 지역 밖 주소 선택 시 '서비스 준비 중' 안내 + 제출 버튼 비활성
- [ ] 결제 후 알림톡·텔레그램 알림 도착
- [ ] 위 결제 건을 관리자 화면에서 환불(전액/부분) → PortOne 콘솔에도 취소 반영

## 6. 기능 테스트 — 계정별 (미리보기 배포에서, 테스트 계정 권장)

**비로그인**
- [ ] 메인 히어로 슬라이드·FAQ·서비스 지역 지도(카카오) 표시
- [ ] 예약하기 → '로그인이 필요해요' → 로그인 후 신청서로 돌아옴
- [ ] 제휴 문의 제출 → 담당자 메일 도착
- [ ] 휴대폰에서 '홈 화면에 추가' → 위드브릿지 아이콘으로 앱처럼 열림

**회원가입·로그인**
- [ ] 카카오 로그인 → 메인으로 돌아와 헤더에 프로필 사진 표시
- [ ] 이메일 회원가입 → 인증 메일 → [인증 완료 확인] → 로그인
- [ ] 이미 가입된 휴대폰 번호로 가입 시 막힘
- [ ] 내 정보 수정 저장 · 주소 검색(우편번호) · 이메일 변경 메일 · 회원 탈퇴(테스트 계정으로만!)
- [ ] 로그아웃 → 마이페이지에서 로그아웃하면 메인으로 이동

**보호자 마이페이지**
- [ ] 예약 목록·상태 표시, 신청 취소, 매니저 배정 후 확정
- [ ] 케어 진행 단계·체크포인트 사진(비공개 사진이 보이는지)
- [ ] 케어 리포트 열람(읽음 처리) · 후기 작성
- [ ] 어르신 프로필 추가/수정/삭제 (주소 검색, 병원 검색)
- [ ] 쿠폰·적립금·패키지 잔여 표시

**케어 매니저 마이페이지**
- [ ] 헤더 메뉴에서 '케어 매니저 모드로 전환' ↔ '보호자 모드로 전환'
- [ ] 활동 상태 변경, 새 요청 수락(희망 일시 선택)
- [ ] 출발·도착 인증(위치 권한·사진 업로드) → 보호자 마이페이지에 실시간 반영
- [ ] 케어 리포트 작성(AI 초안 버튼 포함) · 실제 소요 시간 보고(추가 요금 자동 산정)
- [ ] 정산 내역 · 텔레그램 연결/해제

**매니저 지원**
- [ ] 4단계 지원서 작성 → Turnstile 인증 → 제출 → 관리자 화면에 지원서, 텔레그램 알림

**관리자 (`/admin`)**
- [ ] 관리자 계정으로만 열림 (일반 계정은 메인으로)
- [ ] 매니저 지원 승인/반려, 신청 수동 배정·재배정
- [ ] 수동 입금 확인, 환불, 결제 취소, 추가 요금 요청/취소, 케어 강제 완료
- [ ] 정산(월별·상세), 회원 관리(정지·쿠폰·패키지 지급), 공지 등록/수정/삭제, 제휴 문의 상태 변경
- [ ] 관리자 로그(`/admin-logs`) · 엑셀 다운로드
- [ ] 최고 관리자(`/super-admin`)에서 관리자 권한 부여/회수 — 최고 관리자 계정으로만 열림

## 7. 마무리 설정

- [ ] **CSP 실제 적용**: 5·6 테스트 중 브라우저 개발자 도구 콘솔에 `[Report Only]` 경고가 없었다면 `next.config.ts` 의 `ENFORCE_CSP` 를 `true` 로 (경고가 있었다면 그 주소를 목록에 추가)
- [ ] **DB 타입 자동 생성**: `npx supabase login` 후 `npx supabase gen types typescript --project-id <프로젝트 ref> > lib/types/database.ts` (지금은 일부만 손으로 적음)
- [ ] 푸터의 SNS 링크(인스타그램·유튜브·틱톡)가 아직 `#` 임시 주소 → 실제 주소로 (`components/site/SiteFooter.tsx`)
- [ ] 푸터 '통신판매업 신고번호: 신고 예정' → 신고 후 번호로
- [ ] 앱 아이콘 원본이 256px — 512px 이상 원본이 있으면 `public/icons/` 교체
- [ ] 운영 반영 후 `https://<도메인>/sitemap.xml`, `/robots.txt` 가 열리는지, Google Search Console 에 사이트맵 등록

---

## 참고: 이번 점검에서 코드로 고친 것 (2026-11-19)

- **신청서 결제 수단·어드민 환불 유형·공지 '게시' 체크가 바뀌지 않던 문제** 수정 — 처음부터 선택된 항목이 React 에 '고정값'으로 잡혀 다른 항목을 골라도 되돌아가던 버그(3곳)
- React 규칙 위반 수정: 화면을 불필요하게 두 번 그리던 코드 4곳, 매번 새로 만들어지던 부품 1곳
- 코드 규칙 점검(ESLint) 도입 — `npm run lint`, GitHub Actions 자동 점검(`.github/workflows/ci.yml`)
- 검색엔진용 `robots.txt`·`sitemap.xml`, 오류 안내 화면(`app/error.tsx`), 공유 미리보기 기본값, 빈 페이지 설명 2곳 채움
- `X-Powered-By` 헤더 제거, AI·개발자 작업 규칙 파일(`CLAUDE.md`) 추가
