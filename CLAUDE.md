# 위드브릿지 웹사이트 — 작업 규칙 (AI·개발자 공용)

이 저장소에서 작업하기 전에 **[NEXTJS_MIGRATION_PLAN.md](NEXTJS_MIGRATION_PLAN.md) 1장 '반드시 지켜야 할 원칙'** 을 따르세요. 요약:

1. 결제·환불·권한·금액 계산·알림 같은 핵심 로직은 **Supabase(Edge Functions, RLS, RPC)** 에 둔다. Next.js Server Actions / API Routes 에 두지 않는다.
2. 화면 코드에서 `supabase.from(...)` 을 직접 부르지 말고 **`lib/api/`** 의 함수를 쓴다. `lib/api/` 에는 `next/*`·브라우저 전용 코드를 넣지 않는다.
3. 운영자가 자주 바꾸는 내용(가격·공지·문구)은 코드가 아니라 DB 에 둔다.
4. 화면에서 숨기는 것은 보안이 아니다 — 차단은 RLS·RPC 권한 검사로.
5. TypeScript. 비밀 키를 `NEXT_PUBLIC_` 환경 변수에 넣지 않는다.
6. 기존 URL 을 바꾸지 않는다(바꾸면 리다이렉트 추가).
7. 결제 redirect 주소 등 앱 확장 때 바뀔 값은 `lib/config.ts` 한 곳에서.

## 구조
- `app/(site)/` 일반 페이지(공통 머리글·바닥글: `components/site/`), `app/(admin)/` 어드민(별도 틀)
- `lib/api/` DB·서버 함수 호출, `lib/browser/` 웹 전용(저장소·스크립트 로더·개인정보 보호), `lib/payments/portone.ts` 결제창
- `*Script.ts`, `applyForm.ts`, `app/(admin)/**/*.ts` 는 예전 HTML 스크립트를 로직 그대로 옮긴 파일(`// @ts-nocheck`).
  고칠 때는 동작이 바뀌지 않게 주의하고, 가능하면 상태 기반 React 컴포넌트로 조금씩 옮기세요.
- 페이지 이동은 일부러 전체 새로 고침(`<a>`)을 씁니다 — 옮긴 스크립트가 페이지가 열릴 때 한 번만 동작을 붙이기 때문.

## 명령어
- `npm run dev` (http://localhost:5500) · `npm run lint` · `npm run typecheck` · `npm run build` / `npm start`
- 로컬 `.env` 는 **운영 DB** 를 가리킵니다 — 신청·결제·탈퇴 등 데이터가 바뀌는 동작을 함부로 실행하지 마세요.

## 배포 전 확인
[VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md) 를 따르세요.
