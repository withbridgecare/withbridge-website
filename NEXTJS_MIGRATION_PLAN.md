# 위드브릿지 Next.js 전환 계획

> 이 문서는 현재의 정적 HTML 사이트를 **Next.js**로 옮기는 계획이자, 앞으로 이 사이트를 맡을
> 관리자(그리고 관리자와 함께 작업하는 AI)가 **반드시 지켜야 할 원칙**을 적어 둔 문서입니다.
> 코드를 몰라도 1장(원칙)과 7장(운영자 확인 방법)만 읽으면 작업 방향이 맞는지 판단할 수 있게 썼습니다.
>
> 작성일: 2026-11-18 · 기준 브랜치: `dev_v1` · 관련 문서: [DESIGN_HANDOFF.md](DESIGN_HANDOFF.md)

---

## 진행 상황 (2026-11-19, 브랜치 `nextjs`)

| 단계 | 상태 | 내용 |
|---|---|---|
| 0. 준비 | ✅ 완료 | Next.js 16 + TypeScript + Tailwind 3. 기존 HTML은 `public/`에 그대로 두고 같은 주소로 서비스 (4장 방식) |
| 1. 공통 틀 | ✅ 완료 | `components/site/` 헤더·띠배너·드로어·로그인 메뉴·푸터, `AuthProvider`, `lib/api`·`lib/browser` 분리 |
| 2. 홍보·정보 | ✅ 완료 | 메인(`/`) `terms` `privacy` `story` `notice` `partner` `manager-landing` `pricing`. 원본과 휴대폰·PC 폭에서 요소 위치·크기·글꼴·색이 같은지 자동 비교로 확인 |
| 3. 회원 기능 | ✅ 완료 | `login` `signup` `reset-password` `profile-edit`. 화면 비교·입력 검사·약관 팝업·비로그인 이동 확인. **실제 로그인/가입/탈퇴는 운영 DB라 미확인** |
| 4. 신청·결제 | 🟡 코드 완료, 결제 미검증 | `apply` `package` `manager-apply`. 화면·입력 검사·금액 계산이 원본과 같은지 확인. **실제 결제(PortOne)·신청 저장·지원서 제출은 운영 DB·실결제 채널이라 미확인 → 아래 '결제 테스트' 필수** |
| 5. 마이페이지 | 🟡 코드 완료, 로그인 상태 미검증 | `mypage`(보호자) `mypage-manager`(케어 매니저). 화면(모든 섹션·모달 포함)이 원본과 같은지, 비로그인 시 로그인 화면으로 가는지 확인. **로그인한 상태의 실제 동작은 운영 계정이 필요해 미확인** |
| 6단계 | ⬜ 시작 전 | 관리자(`admin` `admin-logs` `super-admin`)는 아직 `public/*.html` 레거시 |

**5단계 구조** — 두 마이페이지 스크립트(각 2,700·3,000줄)도 4단계처럼 로직을 줄 단위로 옮겼습니다.
`app/(site)/mypage/mypageScript.ts`, `mypage-manager/managerMypageScript.ts`. DB 호출은 `lib/api/guardian-mypage.ts`(21개)·`lib/api/manager-mypage.ts`(28개)로 이름을 붙여 옮김.
예전 전역 도우미(`WBAuth`·`WBEdgeFn`·`PortOne`·`WBPrivacy`)는 `lib/browser/legacy-shims.ts` 가 새 모듈로 연결합니다.
⚠ 이 두 파일은 맨 위에 `// @ts-nocheck`(타입 검사 끔) — 옮긴 코드를 고치지 않기 위해서입니다. 없는 이름 참조는 따로 검사해 0건.
실시간 구독(보호자 마이페이지의 `supabaseClient.channel(...)`)은 화면 갱신과 붙어 있어 아직 화면 코드 안에 있습니다(원칙 2 예외, 정리 대상).
개인정보 보호(`privacy-guard.js`)도 옮김: 운영 도메인 콘솔 로그 끄기(`app/layout.tsx`), 비공개 사진 서명 URL(`lib/browser/privacy.ts`, AuthProvider 에서 실행).

**마이페이지 확인 목록 (보호자/매니저 테스트 계정으로)** — 보호자: 예약 목록·취소·확정, 케어 진행 상태·체크포인트 사진, 케어 리포트 열람·후기 작성,
어르신 프로필 추가/수정/삭제(주소·병원 검색), 쿠폰·적립금·패키지 표시, 추가 요금 결제. 매니저: 활동 상태 전환, 요청 수락, 상태 진행·출발/도착 인증(위치·사진),
케어 리포트 작성(AI 초안), 정산 내역, 텔레그램 연결, 보호자↔매니저 모드 전환.

**4단계 구조** — 결제가 걸린 화면이라 예전 스크립트의 로직을 줄 단위로 그대로 옮겼습니다(할인·금액 계산이 달라지지 않도록).
`app/(site)/apply/applyForm.ts`(신청·결제), `package/PackageBehaviors.tsx`, `manager-apply/ManagerApplyBehaviors.tsx`.
DB 호출은 `lib/api/applications.ts` · `seniors.ts` · `packages.ts` · `managers.ts`, 결제창은 `lib/payments/portone.ts` 한 곳.
화면 요소를 id 로 직접 다루는 방식이라 타입이 느슨합니다 — 상태 기반 React 컴포넌트로 정리하는 건 후속 과제.
날짜 선택기·장소 검색은 마이페이지(레거시)와 함께 쓰는 공용 스크립트(`public/js/wb-datepicker.js`, `wb-place-search.js`)를 그대로 불러옵니다.

**결제 테스트 (배포 전 필수)** — `lib/payments/portone.ts` 의 `PORTONE_CHANNEL_KEY` 는 **운영(실결제) 채널**입니다.
1. PortOne 콘솔에서 테스트 채널 키를 받아 Vercel Preview 에서만 쓰도록 바꾸거나, 소액 실결제 후 즉시 취소로 확인
2. 확인할 흐름: 카드 결제 · 계좌이체 · 쿠폰/적립금 적용 · 긴급 옵션 · 패키지 차감 예약 · 결제창 닫기(취소) · 패키지 구매
3. 각 흐름 뒤 관리자 화면에서 신청서·결제 상태, 알림톡/텔레그램 알림이 정상인지 확인
| 7. 마무리 | ⬜ | |

**배포 전 확인할 것**
- Vercel 프로젝트 설정 → Framework Preset이 **Next.js**인지 (vercel.json에 `"framework": "nextjs"`를 넣어 두었음), Build Command/Output Directory를 수동으로 지정해 두었다면 비우기
- Vercel Node.js 버전을 **22 이상**으로 (supabase-js가 20 지원 종료 예고)
- `lib/types/database.ts`는 아직 손으로 쓴 일부 타입 — `supabase gen types`로 교체 필요 (원칙 5)

**메인 페이지 구조** — 화면은 `app/(site)/(home)/page.tsx`(서버에서 미리 그림), 슬라이더·지도·FAQ·쿠폰 등 동작은
`HomeBehaviors.tsx`가 화면이 뜬 뒤 붙입니다. 마크업의 클래스/id를 바꾸면 `HomeBehaviors.tsx`의 선택자도 같이 바꾸세요.
서비스 지역은 `regions.ts`. 스타일은 원래 적용 순서대로 `home.css` 하나에 이어 붙였습니다(순서 바꾸지 말 것).

**글꼴 주의** — 예전 페이지마다 'Noto Sans KR' 웹폰트를 불러오는 곳/안 불러오는 곳이 섞여 있어(메인·제휴는 안 불러옴),
화면이 바뀌지 않도록 예전에 불러오던 페이지에만 `<NotoSansKr />`를 넣었습니다. 사이트 전체 통일은 디자인 결정 후 `app/layout.tsx`에서.

**카카오 지도** — 로컬에서는 지도 SDK가 막혀 확인하지 못했습니다(원본도 동일). Vercel 미리보기 주소에서 지도가 뜨는지 확인하고,
안 뜨면 카카오 디벨로퍼스 > 플랫폼 > Web 에 그 주소를 등록하세요.

**전환 작업 방법 (페이지 하나 옮길 때)**
1. `app/(site)/<이름>/page.tsx` 만들기 → 같은 주소에서 자동으로 새 페이지가 우선함
2. 페이지 안의 `<script>` 동작은 같은 폴더의 `'use client'` 컴포넌트로, DB 호출은 `lib/api/`로
3. 기존 화면과 나란히 비교한 뒤 `public/<이름>.html` 삭제
4. 그 페이지에서만 쓰던 `public/js/*.js`·CSS도 더 이상 쓰는 곳이 없으면 삭제

---

## 0. 한 줄 요약

**화면은 Next.js, 데이터와 로직은 지금처럼 Supabase.**
한 페이지씩 옮기고, 옮기는 동안에도 사이트는 항상 정상 동작하게 유지합니다.
나중에 PWA → 앱(WebView 또는 React Native)으로 확장할 수 있도록 처음부터 구조를 나눠 둡니다.

---

## 1. 반드시 지켜야 할 원칙 (변경 금지)

이 원칙은 "왜 Next.js인가"보다 중요합니다. 새 기능을 만들거나 AI에게 작업을 맡길 때
**매번 이 목록을 기준으로 확인**하세요.

### 원칙 1. 핵심 로직은 Supabase에 둔다 — Next.js 서버에 두지 않는다

| 이런 일은 | 여기에 둔다 | 절대 두지 않는 곳 |
|---|---|---|
| 결제 확인·취소·환불, 가상계좌 발급 | Supabase **Edge Functions** (`supabase/functions/`) | Next.js Server Actions, API Routes |
| 권한 검사 (관리자/매니저/보호자 구분) | Supabase **RLS 정책 + RPC 함수** (`sql/`) | 화면 코드의 `if (isAdmin)` 만으로 막기 |
| 금액 계산·검증, 쿠폰·패키지 차감 | Supabase RPC / Edge Function | 브라우저 코드만으로 계산한 금액을 그대로 신뢰 |
| 알림 발송 (알림톡·텔레그램·이메일) | Edge Functions (`solapi`, `telegram`, `resend`) | Next.js 서버 |
| 비밀 키 (PortOne, Solapi, Resend 등) | Supabase Secrets | `.env`의 `NEXT_PUBLIC_*`, 코드, git |

**이유:** Next.js의 Server Actions는 Next.js 웹에서만 호출됩니다. 나중에 모바일 앱을 만들면
그 로직을 다시 만들어야 합니다. Supabase에 있으면 웹·앱·관리자 도구가 **같은 API를 그대로** 씁니다.
현재 사이트는 이미 이 구조(Edge Function 17개, RPC 50여 개)라서 이 구조를 **유지**만 하면 됩니다.

**Next.js 서버 기능을 써도 되는 경우 (웹 전용, 데이터 변경 없음):**
SEO 메타태그, 사이트맵, 정적 페이지 미리 생성, 이미지 최적화, 리다이렉트, 보안 헤더.

### 원칙 2. Supabase 호출은 `lib/api/` 한 곳에 모은다

- 페이지/컴포넌트 안에서 `supabase.from(...)`, `supabase.rpc(...)`를 직접 부르지 않습니다.
- `lib/api/applications.ts`, `lib/api/profiles.ts` 처럼 **기능별 함수**로 감싸서 씁니다.
- `lib/api/` 안에서는 **Next.js 전용 코드(`next/*` import)를 쓰지 않습니다.** 그래야 나중에 앱(Expo)에서 이 폴더를 그대로 가져다 쓸 수 있습니다.

### 원칙 3. 운영자가 자주 바꾸는 내용은 코드 밖(DB)에 둔다

공지, 가격, 서비스 목록, FAQ, 배너 문구, 이미지 같은 것은 **관리자 페이지에서 수정**할 수 있어야 합니다.
"문구 하나 바꾸려고 개발자를 부르는" 상황을 없애는 것이 이번 전환의 진짜 목표입니다. (6장 참고)

### 원칙 4. 화면에서 숨기는 것은 보안이 아니다

관리자 메뉴를 숨기거나 버튼을 비활성화하는 것은 편의 기능일 뿐입니다.
실제 차단은 반드시 **RLS 정책과 RPC 함수 안의 권한 검사**가 합니다. 새 테이블·RPC를 만들 때 RLS를 먼저 작성하세요.

### 원칙 5. TypeScript를 쓰고, DB 타입은 자동 생성한다

- 모든 새 코드는 `.ts` / `.tsx`.
- DB 타입은 `supabase gen types typescript`로 `lib/types/database.ts`에 생성해서 씁니다. 테이블이 바뀌면 다시 생성합니다.
- 타입 오류가 있으면 배포가 실패하도록 둡니다 (실수가 운영 사이트에 나가기 전에 막힘).

### 원칙 6. 한 번에 한 페이지씩, URL은 그대로

- 기존 주소(`/apply`, `/mypage`, `/pricing` …)는 **절대 바꾸지 않습니다.** 바꿔야 한다면 리다이렉트를 함께 넣습니다.
- 한 페이지를 옮길 때마다 Vercel **미리보기(Preview) 주소**에서 운영자가 확인하고 승인한 뒤 `main`에 합칩니다.
- 결제·로그인·관리자 기능은 **가장 마지막**에 옮깁니다.

### 원칙 7. 앱 확장을 막는 선택을 하지 않는다

- 브라우저 전용 API(`window`, `localStorage` 등)는 `lib/api/`에 넣지 않고 화면 쪽에서만 씁니다.
- 결제 성공·실패 후 이동할 주소(redirect URL)는 한 곳(`lib/config.ts`)에서 관리합니다 — 앱에서는 이 값이 바뀌기 때문입니다.

---

## 2. 현재 구조 (2026-11-18 기준)

| 구분 | 현재 상태 |
|---|---|
| 화면 | 루트의 정적 HTML 20여 개. 페이지마다 `<style>`과 `<script>`가 길게 들어 있음 (`mypage.html` 5,800줄, `mypage-manager.html` 6,000줄, `admin.js` 5,500줄) |
| 스타일 | 미리 빌드한 Tailwind (`src/tailwind.css` → `css/tailwind.css`) + 페이지별 `wb-*` 클래스. 색상값은 파일마다 하드코딩 |
| 공용 스크립트 | `js/` 폴더 13개 (헤더/로그인 상태, 푸터, 모바일 메뉴, 날짜 선택기, 장소 검색, 가격 계산기 등) |
| 데이터 | Supabase (`supabase-js` CDN 2.119.0). 브라우저에서 직접 테이블 조회 + RPC 호출 |
| 서버 로직 | Supabase Edge Functions 17개 (결제, 환불, 알림톡, 텔레그램, AI 케어 리포트 등) |
| DB 변경 기록 | `sql/` 폴더의 SQL 파일 90여 개 (수동 실행) |
| 인증 | Supabase Auth — 이메일/비밀번호 + 카카오 OAuth (`login.html`, 로그인 후 `/index.html`로 돌아옴) |
| 결제 | PortOne v2 브라우저 SDK (CDN) + `portone-webhook` Edge Function |
| 기타 외부 | Cloudflare Turnstile(매니저 지원), 카카오 지도/장소 검색 |
| 배포 | Vercel. `vercel.json`에 cleanUrls, 보안 헤더, CSP(Report-Only), 관리자 페이지 `noindex` |
| 환경 변수 | `scripts/build-env.mjs`가 `.env` → `js/env.js`(`window.WB_ENV`) 생성 |

---

## 3. 목표 구조

### 3.1 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js (App Router, 시작 시점의 최신 안정 버전) | Vercel과 설정 없이 연동 |
| 언어 | TypeScript | 원칙 5 |
| 스타일 | Tailwind CSS | 지금 쓰는 방식 유지. 색상은 `tailwind.config`의 테마로 모음 (3.3 참고) |
| 데이터 | `@supabase/supabase-js` (npm 패키지) | CDN 대신 npm으로 설치 |
| 결제 | `@portone/browser-sdk` (npm 패키지) | CDN 대신 npm |
| 백엔드 | Supabase (변경 없음) | `supabase/`, `sql/` 폴더 그대로 유지 |
| 배포 | Vercel (같은 프로젝트) | Preview 배포로 운영자 확인 |

### 3.2 폴더 구조

```
withbridge-website/
├─ app/                       ← 화면 (URL = 폴더 이름)
│  ├─ layout.tsx              ← 모든 페이지 공통 틀 (헤더·푸터)
│  ├─ page.tsx                ← /  (메인)
│  ├─ pricing/page.tsx        ← /pricing
│  ├─ apply/page.tsx          ← /apply
│  ├─ mypage/page.tsx         ← /mypage
│  ├─ admin/…                 ← /admin (관리자)
│  └─ …
├─ components/                ← 화면 조각 (버튼, 카드, 헤더, 모달 …)
│  ├─ ui/                     ← 공통 디자인 부품
│  ├─ site/                   ← 헤더, 푸터, 모바일 메뉴
│  └─ admin/                  ← 관리자 화면 부품
├─ lib/
│  ├─ api/                    ← ★ Supabase 호출 전부 여기 (원칙 2, next/* import 금지)
│  ├─ supabase/client.ts      ← Supabase 클라이언트 생성
│  ├─ types/database.ts       ← 자동 생성된 DB 타입
│  └─ config.ts               ← 결제 redirect URL 등 환경별 설정
├─ public/
│  ├─ images/                 ← 기존 images/ 이동
│  └─ legacy/                 ← 아직 안 옮긴 기존 HTML/JS/CSS (전환 중에만 존재)
├─ supabase/                  ← 그대로 (Edge Functions)
├─ sql/                       ← 그대로 (DB 변경 기록)
├─ next.config.ts
└─ NEXTJS_MIGRATION_PLAN.md   ← 이 문서
```

### 3.3 디자인 토큰 정리

[DESIGN_HANDOFF.md](DESIGN_HANDOFF.md) 3장의 하드코딩 색상을 `tailwind.config`의 `theme.extend.colors`로 모읍니다.
예: `brand` = `#78866B`(세이지그린), `brand-light` = `#8FA482`, `deep` = `#1F5C45`, `sand` = `#F4F1E2`, `ink` = `#1A1D21`.
이후 새 화면에서는 `#78866B` 같은 값을 직접 쓰지 않고 `bg-brand`처럼 이름으로 씁니다.
(딥그린 3종 `#1F5C45`/`#245742`/`#2E6D53`을 하나로 합칠지는 디자인 담당과 **확인 필요**)

---

## 4. 전환 방식: "기존 사이트를 품은 채로 한 장씩 교체"

첫날부터 Next.js가 **모든 주소를 받되**, 아직 옮기지 않은 페이지는 기존 HTML을 그대로 보여줍니다.

1. 기존 HTML/JS/CSS를 `public/`으로 옮깁니다 (상대 경로 `js/…`, `images/…`가 그대로 동작하도록 하위 폴더 대신 루트에 둠).
2. `next.config.ts`의 `rewrites`(fallback)로 `/apply` → `/apply.html` 처럼 연결합니다.
3. 어떤 페이지를 Next.js로 새로 만들면(`app/apply/page.tsx`) Next.js 페이지가 우선 적용되고, 해당 rewrite 줄은 지웁니다.
4. 모든 페이지가 옮겨지면 `public/`의 HTML·`public/js`·레거시 CSS와 `legacy/` 폴더(레거시 Tailwind 설정)를 삭제합니다.

이렇게 하면 **중간에 멈춰도 사이트는 항상 정상**이고, 문제가 생긴 페이지 하나만 되돌리면 됩니다.

### ⚠️ 전환 중 로그인 상태 공유

기존 페이지의 `supabase-js`는 로그인 정보를 브라우저 **localStorage**에 저장합니다.
새 페이지와 기존 페이지를 오가도 로그인이 풀리지 않도록, **전환이 끝날 때까지 새 페이지도 같은 방식(브라우저 클라이언트, 기본 localStorage 저장)** 을 씁니다.
**최종 목표는 쿠키 저장(`@supabase/ssr`)** 이며, 7단계(레거시 삭제) 이후에 전환합니다.

| | localStorage (현재) | 쿠키 (`@supabase/ssr`, 최종 목표) |
|---|---|---|
| 서버가 로그인 여부를 아는가 | 모름 → 화면이 뜬 뒤 헤더가 바뀌는 깜빡임 | 앎 → 처음부터 로그인 상태로 그림 |
| `/admin`, `/mypage` 접근 차단 | 페이지가 열린 뒤 JS로 튕겨냄 | 페이지를 보내기 전에 middleware에서 로그인 화면으로 이동 |
| 보안 | 데이터 보호는 RLS가 담당 (동일) | 데이터 보호는 RLS가 담당 (동일). 쿠키도 브라우저 JS가 읽을 수 있어 XSS 방어력이 크게 다르진 않음 |
| WebView 앱 | 동작 | 동작 |

- 전환 시 저장 위치가 바뀌어 **사용자가 한 번 로그아웃될 수 있으니** 공지하거나, 기존 localStorage 토큰을 쿠키로 옮겨 주는 1회성 코드를 넣습니다.
- 네이티브 앱(Expo)은 어느 쪽도 아닌 기기 보안 저장소(SecureStore)를 씁니다. 그래서 `lib/api/` 함수는 Supabase 클라이언트를 **인자로 받게** 만들어 저장 방식과 무관하게 둡니다.
- `active_role`(보호자/매니저 화면 선택), `wb_pending_applications`(비로그인 신청 기억)처럼 권한과 무관한 화면 설정은 계속 localStorage에 둬도 됩니다.

---

## 5. 단계별 계획

각 단계는 별도 브랜치 → Vercel Preview 확인 → `main` 합치기 순서로 진행합니다.
**완료 기준**을 모두 만족해야 다음 단계로 넘어갑니다.

### 0단계 — 준비 (화면 변화 없음)

- Next.js + TypeScript + Tailwind 골격 생성, 기존 Tailwind 설정 이전
- 기존 파일을 `public/legacy/`로 이동, rewrites로 기존 URL 전부 연결
- `vercel.json` 정리: `outputDirectory`·`cleanUrls`·`buildCommand` 제거, **보안 헤더와 관리자 `noindex` 규칙은 유지** (또는 `next.config.ts`의 `headers()`로 이전)
- 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가. 기존 페이지용 `js/env.js` 생성(`scripts/build-env.mjs`)은 레거시가 남아 있는 동안 계속 실행
- `lib/supabase/client.ts`, `lib/types/database.ts`(타입 생성), `lib/config.ts` 작성
- **완료 기준:** Preview 주소에서 모든 기존 페이지가 지금과 똑같이 열리고, 로그인·신청·결제(테스트 모드)가 동작

### 1단계 — 공통 틀

- `js/auth-header.js`, `js/site-footer.js`, `js/mobile-nav.js` → `components/site/` (Header, Footer, MobileNav)
- 디자인 토큰 정리 (3.3)
- 공통 모달 (`js/terms-modal.js`, `js/notice-modal.js`) → 컴포넌트
- **완료 기준:** 새 페이지에서 헤더 로그인 상태·모바일 메뉴가 기존과 똑같이 동작

### 2단계 — 홍보·정보 페이지 (위험 낮음, SEO 효과 큼)

`terms`, `privacy`, `story`, `manager-landing`, `pricing`, `notice`, `partner`, 마지막에 `index`(메인)

- 내용이 고정인 페이지는 **정적 생성**으로 빠르게 + 페이지별 SEO 메타태그
- `notice`는 `notices` 테이블에서 읽기, `partner` 문의 폼은 `partner_inquiries` 저장 (기존과 동일)
- `js/price-calculator.js` → 컴포넌트. 가격은 6장의 DB 이전과 함께 진행
- **완료 기준:** 화면이 기존과 같음(운영자 확인), 모바일 레이아웃 정상, 검색 노출용 제목·설명이 페이지마다 들어감

### 3단계 — 회원 기능

`login`, `signup`, `reset-password`, `profile-edit`

- 카카오 로그인 후 돌아오는 주소(`/index.html`), 이메일 인증 주소(`/signup.html`), 비밀번호 재설정 주소(`/reset-password.html`)는 **Supabase 허용 주소를 바꾸지 않도록 예전 주소 그대로** 두었습니다(새 주소로 자동 이동). 나중에 바꿀 때는 Supabase 대시보드 → Authentication → URL Configuration 도 함께 수정 (`lib/config.ts` 의 `authRedirectUrl`)
- **완료 기준:** 이메일 가입·로그인, 카카오 로그인, 비밀번호 재설정, 프로필 수정이 Preview에서 동작. 기존 페이지로 이동해도 로그인 유지

### 4단계 — 신청·결제 (가장 신중하게)

`apply`, `package`, `manager-apply`

- PortOne SDK를 npm으로 교체. `js/edge-function-fetch.js`의 Edge Function 호출 방식 → `lib/api/`로 이전
- `manager-apply`: Turnstile, 신분증 업로드(`manager-id-cards` 스토리지), `submit-manager-application` 함수 호출
- `js/wb-datepicker.js`, `js/wb-place-search.js`(카카오) → 컴포넌트
- **완료 기준:** PortOne **테스트 모드**로 카드 결제·가상계좌·추가요금·패키지 구매·취소가 모두 성공하고, 웹훅(`portone-webhook`) 처리와 알림톡 발송까지 확인. 운영 전환 직후 실제 결제 1건 소액 확인

### 5단계 — 마이페이지

`mypage`(보호자), `mypage-manager`(케어매니저)

- 파일 하나가 6,000줄 수준이라 **탭/섹션별 컴포넌트로 나누는 것**이 핵심 (예약 목록, 케어 일정, 케어 리포트, 리뷰, 쿠폰·패키지, 체크인/위치 인증 …)
- 위치 기반 출발 인증(geofence)·카메라 권한 등 기기 기능은 이후 앱 전환 때 바뀔 수 있으므로 `components/` 안의 독립 부품으로 분리
- **완료 기준:** 보호자·매니저 테스트 계정으로 주요 흐름(예약 확인, 취소, 케어 상태 진행, 리포트 열람, 리뷰 작성) 확인

### 6단계 — 관리자

`admin`, `admin-logs`, `super-admin`

- `admin.js`(5,500줄)를 메뉴별 화면으로 분리 (회원, 매니저, 신청/배정, 정산, 환불, 패키지, 공지, 로그)
- 이 단계에서 **6장의 "운영자가 직접 수정하는 화면"** 을 함께 만듦
- `noindex`·`no-store` 헤더 유지 확인
- **완료 기준:** 관리자·최고관리자 권한별로 보이는 메뉴와 실제로 가능한 작업이 기존과 같음 (권한 없는 계정으로 RPC 호출 시 거부되는지 확인)

### 7단계 — 마무리

- `public/legacy/` 삭제, 남은 rewrite 제거, `scripts/build-env.mjs`·`js/env.js` 삭제
- `about_old.html`, `test/` 실험 페이지 정리 (삭제 여부 **확인 필요**)
- CSP를 Report-Only → 실제 적용으로 전환 검토
- PWA 적용: `manifest`, 앱 아이콘, 홈 화면 추가 (8장)

---

## 6. 운영자가 직접 수정할 수 있게 DB로 옮길 항목

| 항목 | 현재 | 옮길 곳 | 우선순위 |
|---|---|---|---|
| 공지사항 | `notices` 테이블 + 관리자 화면 (이미 됨) | 유지 | — |
| 서비스 목록·가격 | **네 군데에 같은 값을 따로 적어 둠**: 메인 요금 카드(`app/(site)/(home)/page.tsx`), `lib/pricing.ts`(요금 계산 페이지), `apply.html` `SERVICES`, 서버 `expected_service_price()`·`expected_overtime_rate_per_30min()` (`sql/one_hour_light_care_service.sql`). 2026-11-18 기준 금액은 모두 일치 | `services` 테이블 1곳 (서버 함수도 이 테이블을 읽게 변경) | **높음** — 한 곳만 고치면 화면 금액이 틀리거나 결제가 `AMOUNT_MISMATCH`로 막힘 |
| FAQ | HTML에 하드코딩 | `faqs` 테이블 | 중간 |
| 메인 상단 띠배너·안내 문구 | HTML에 하드코딩 | `site_settings` 테이블 (키-값) | 중간 |
| 메인·소개 페이지 이미지 | `images/` 파일 | Supabase Storage + 관리자 업로드 | 낮음 |
| 이용약관·개인정보처리방침 | `terms.html`, `privacy.html` | `policies` 테이블 (**버전·시행일 기록**) | 중간 |

- 현재 서버는 `expected_service_price()`·`expected_addon_total()`로 결제 금액을 다시 계산해 검증합니다(불일치 시 `AMOUNT_MISMATCH`). 가격을 DB로 옮길 때 **이 함수들이 `services` 테이블을 읽도록 바꿔서** 화면과 서버가 같은 값을 보게 합니다 (원칙 1).
- `index.html` "생활 편의 · 복합 동행" 카드의 "초과 30분당 10,000원~"은 복합 매칭(실제 15,000원) 옆에 붙어 있어 오해 소지가 있음 — 이전할 때 서비스별로 나눠 표시.
- 새 테이블은 "누구나 읽기, 관리자만 쓰기" RLS를 먼저 만들고, 변경은 `admin_logs`에 남깁니다.

---

## 7. 운영자 확인 방법 (코드를 몰라도 되는 부분)

1. 작업자가 브랜치를 올리면 Vercel이 **Preview 주소**를 만듭니다 (GitHub PR 화면 또는 Vercel 대시보드에 링크가 뜸).
2. 그 주소에서 아래를 확인합니다.
   - PC와 휴대폰에서 각각 화면이 깨지지 않는지
   - 바뀐 페이지의 주요 버튼을 눌러 봤을 때 동작하는지
   - (결제 관련 변경이면) 테스트 결제가 되는지
3. 문제가 없으면 승인 → `main`에 합치면 운영 사이트에 반영됩니다.
4. 문제가 생기면 Vercel 대시보드 → Deployments에서 **이전 배포로 즉시 되돌릴(Instant Rollback)** 수 있습니다.

### AI(Claude 등)에게 작업을 맡길 때

- 작업 요청 전에 **"NEXTJS_MIGRATION_PLAN.md의 1장 원칙을 지켜서"** 라고 함께 말하세요.
- 다음과 같은 결과가 나오면 원칙 위반이니 다시 요청하세요.
  - 결제·환불·권한·금액 계산을 Next.js의 `"use server"`, `app/api/` 안에서 처리함 → 원칙 1 위반
  - 페이지 파일 안에서 `supabase.from(...)`을 직접 호출함 → 원칙 2 위반
  - 비밀 키를 `NEXT_PUBLIC_`으로 시작하는 환경 변수에 넣음 → 원칙 1 위반
  - 기존 URL을 리다이렉트 없이 바꿈 → 원칙 6 위반

---

## 8. 이후 확장: PWA와 앱

| 단계 | 내용 | 비고 |
|---|---|---|
| PWA | 홈 화면 추가, 앱처럼 전체 화면 실행, 웹 푸시 | iOS 푸시는 16.4 이상 + 홈 화면에 추가한 경우만 |
| WebView 앱 | Capacitor 또는 Expo로 배포된 사이트를 감싸고 네이티브 푸시 등 추가 | 웹만 수정하면 앱도 같이 바뀜. 가장 현실적 |
| 네이티브 앱 | Expo(React Native)로 화면을 새로 만들고 `lib/api/`, `lib/types/` 재사용 | 원칙 1·2를 지켰을 때만 가능 |

WebView 앱 전환 시 주의:
- **PortOne 결제:** WebView 안에서 카드사·은행 앱(ISP, 뱅크페이 등)으로 넘어가는 URL scheme 처리가 필요합니다. PortOne의 WebView 연동 가이드를 따르세요.
- **카카오 로그인:** 앱에서는 redirect 주소가 달라집니다 (`lib/config.ts`에서 관리 — 원칙 7).
- **애플 심사:** 웹사이트를 감싸기만 한 앱은 거절될 수 있습니다(App Store 가이드라인 4.2). 푸시 알림 등 네이티브 기능을 포함하세요.

---

## 9. 위험 요소와 대응

| 위험 | 대응 |
|---|---|
| 결제 흐름 오류 | 4단계를 가장 늦게, PortOne 테스트 모드로 전 흐름 확인 후 반영. 웹훅 주소는 Supabase Edge Function이라 Next.js 전환과 무관 |
| 전환 중 로그인 풀림 | 4장 "로그인 상태 공유" 방식 유지 |
| URL 변경으로 검색 노출·북마크 깨짐 | 원칙 6. `.html` 붙은 옛 주소(`/apply.html`)도 리다이렉트 유지 |
| 보안 헤더 누락 | 0단계에서 `vercel.json` 헤더 유지, 배포 후 응답 헤더 확인 |
| 카카오·이메일 인증 redirect 불일치 | 3단계에서 Supabase 허용 주소와 함께 수정 |
| 대형 파일(mypage, admin) 이전 중 기능 누락 | 이전 전 기능 목록을 체크리스트로 먼저 작성하고 하나씩 지움 |

---

## 10. 이번 범위 밖 (별도 과제)

- `sql/` 수동 SQL 파일 → Supabase CLI 마이그레이션(`supabase/migrations/`)으로 정리
- 주요 흐름 자동 테스트(Playwright 등) 도입
- 쿠키 기반 서버 인증(`@supabase/ssr`) 전환 (4장 표 참고, 7단계 이후)

---

## 11. 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-18 | React(Vite) 대신 **Next.js** 선택 | 폴더 = 페이지 구조가 기존 HTML 구조와 비슷해 이해하기 쉬움, 홍보 페이지 SEO, Vercel 기본 지원, AI 도움 받기 쉬움 |
| 2026-11-18 | 백엔드 로직은 **Supabase 유지** | 이미 Edge Functions·RPC로 구성됨. 웹·PWA·앱이 같은 API를 쓰도록 하기 위함 |
| 2026-11-18 | **점진 전환** (기존 HTML을 품은 채 한 페이지씩) | 결제·예약이 운영 중이라 한 번에 바꾸면 위험이 큼 |

> 원칙을 바꿔야 할 일이 생기면 이 표에 날짜·결정·이유를 한 줄 추가하고 1장을 고치세요.
