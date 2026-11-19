// 코드 점검(ESLint) 설정 — `npm run lint` 로 실행합니다.
// Next.js 권장 규칙 + React Hooks 규칙 + 접근성 기본 규칙(core-web-vitals)과 TypeScript 규칙을 씁니다.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**', // 옛 HTML·공용 스크립트 (about_old, test, js/)
      'supabase/**', // Edge Function(Deno) 은 별도 런타임
      'scripts/**',
      'mockups/**',
      'next-env.d.ts',
    ],
  },
  {
    // 이 사이트에서 일부러 쓰는 방식 — 규칙을 끄는 이유를 함께 적어 둡니다.
    rules: {
      // 페이지 이동은 일부러 '전체 새로 고침'(<a>, location.href)으로 합니다. 옮긴 화면 스크립트(마이페이지·어드민 등)가
      // 페이지가 처음 열릴 때 한 번만 동작을 붙이는 구조라, Next.js 의 화면 전환(<Link>, router.push)을 쓰면 동작이 안 붙습니다.
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-location-assign-relative-destination': 'off',
      // 예전 화면과 똑같이 보이도록 이미지는 <img> 그대로 둡니다 (next/image 는 크기·로딩 방식이 달라짐).
      '@next/next/no-img-element': 'off',
      // 한글 문장 속 따옴표(' ")를 HTML 엔티티로 바꾸라는 형식 규칙 — 화면에는 영향이 없어 끕니다.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // 예전 스크립트를 로직 그대로 옮긴 파일들 — 맨 위 @ts-nocheck 와 같은 이유로 스타일 규칙은 끄고,
    // 실제 버그로 이어지는 규칙(정의되지 않은 이름 등)만 TypeScript 쪽 점검에 맡깁니다.
    files: [
      'app/(site)/mypage/mypageScript.ts',
      'app/(site)/mypage-manager/managerMypageScript.ts',
      'app/(site)/apply/applyForm.ts',
      'app/(admin)/**/*.ts',
      'lib/api/guardian-mypage.ts',
      'lib/api/manager-mypage.ts',
      'lib/api/admin-*.ts',
      'lib/api/super-admin.ts',
    ],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
];

export default config;
