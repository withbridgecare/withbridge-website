import type { NextConfig } from 'next';

/**
 * 위드브릿지 Next.js 설정
 *
 * ── 전환 중 구조 (NEXTJS_MIGRATION_PLAN.md 4장) ──────────────────────────────
 * 아직 Next.js 로 옮기지 않은 페이지는 public/*.html 에 그대로 있습니다.
 *   /apply        → (app/apply/page.tsx 가 없으면) public/apply.html 을 보여 줌   ← rewrites.fallback
 *   /apply.html   → /apply 로 308 리다이렉트 (예전 링크·북마크 유지)            ← redirects
 * 어떤 페이지를 app/<이름>/page.tsx 로 새로 만들면 Next.js 페이지가 자동으로 우선합니다.
 * 그때 public/<이름>.html 은 삭제하세요(남겨 두면 /<이름>.html 리다이렉트만 타고 화면엔 안 쓰임).
 *
 * ── 보안 헤더 ──────────────────────────────────────────────────────────────
 * 예전 vercel.json 의 headers 를 그대로 옮겼습니다. 로컬(next dev)에서도 똑같이 적용됩니다.
 */

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
  },
  {
    // 아직 Report-Only(차단하지 않고 위반만 보고). 실제 적용 전환은 7단계에서 검토.
    key: 'Content-Security-Policy-Report-Only',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdn.portone.io https://challenges.cloudflare.com https://dapi.kakao.com https://*.kakao.com https://*.kakaocdn.net https://*.daumcdn.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://dapi.kakao.com https://*.kakao.com https://*.portone.io https://challenges.cloudflare.com; frame-src 'self' https:; worker-src 'self' blob:",
  },
];

// 검색엔진에 노출하지 않고 캐시하지 않는 개인/관리자 페이지
const PRIVATE_PAGES = 'admin|admin-logs|super-admin|mypage|mypage-manager|profile-edit';

const nextConfig: NextConfig = {
  // Vercel 에는 SUPABASE_URL / SUPABASE_ANON_KEY 이름으로 이미 등록돼 있으므로,
  // 같은 값을 Next.js 브라우저 코드용 이름(NEXT_PUBLIC_*)으로도 넘겨 줍니다. (환경 변수를 두 번 등록할 필요 없음)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_WB_ENV_NAME: process.env.NEXT_PUBLIC_WB_ENV_NAME || process.env.WB_ENV_NAME || 'production',
  },

  trailingSlash: false,

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: `/:page(${PRIVATE_PAGES})`,
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: `/:page(${PRIVATE_PAGES}).html`,
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/js/env.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },

  async redirects() {
    return [
      // 예전 주소(/index.html, /apply.html …)를 확장자 없는 주소로 — 예전 vercel.json 의 cleanUrls 와 같은 동작
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/:page([A-Za-z0-9_-]+)\\.html', destination: '/:page', permanent: true },
      { source: '/test/:page([A-Za-z0-9_-]+)\\.html', destination: '/test/:page', permanent: true },
    ];
  },

  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      // Next.js 페이지(app/)와 public 파일에서 못 찾았을 때만 레거시 HTML 로 연결
      fallback: [
        { source: '/', destination: '/index.html' },
        { source: '/:page([A-Za-z0-9_-]+)', destination: '/:page.html' },
        { source: '/test/:page([A-Za-z0-9_-]+)', destination: '/test/:page.html' },
      ],
    };
  },
};

export default nextConfig;
