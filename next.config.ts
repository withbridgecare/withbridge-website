import type { NextConfig } from 'next';

/**
 * 위드브릿지 Next.js 설정
 *
 * ── 옛 HTML 페이지 ─────────────────────────────────────────────────────
 * 모든 화면은 app/ 의 Next.js 페이지입니다. 일부러 남겨 둔 옛 HTML 2개만 public/ 에 있습니다:
 *   /about_old (예전 소개 페이지), /test/child-care-landing (아동 케어 실험 랜딩)
 * 이 둘은 public/js 의 옛 공용 스크립트(auth-header.js 등)와 public/js/env.js(빌드 시 생성)를 씁니다.
 *   /about_old       → public/about_old.html          ← rewrites.fallback
 *   /어떤페이지.html  → /어떤페이지 로 308 리다이렉트 (예전 링크·북마크 유지)  ← redirects
 *
 * ── 보안 헤더 ──────────────────────────────────────────────────────────────
 * 예전 vercel.json 의 headers 를 그대로 옮겼습니다. 로컬(next dev)에서도 똑같이 적용됩니다.
 */

/**
 * 콘텐츠 보안 정책(CSP) — 페이지가 불러올 수 있는 외부 주소 목록.
 *
 * 지금은 '보고만'(Report-Only) 합니다: 목록에 없는 주소를 불러와도 막지 않고 브라우저 개발자 도구 콘솔에
 * "[Report Only] Refused to …" 경고만 남깁니다.
 * 7단계 점검(2026-11-19): 로컬에서 열리는 모든 페이지가 불러오는 외부 주소는 전부 이 목록 안에 있었습니다.
 * 로컬에서 확인할 수 없었던 것: PortOne 결제창, 카카오 지도 타일, 카카오 로그인 후 화면.
 *
 * ▶ 실제 적용으로 바꾸는 방법: Vercel 미리보기 주소에서 결제·지도·매니저 지원·카카오 로그인을 해 보고
 *   콘솔에 "[Report Only]" 경고가 하나도 없으면 아래 ENFORCE_CSP 를 true 로 바꾸세요. (경고가 있으면 그 주소를 목록에 추가)
 */
const ENFORCE_CSP = false;
const isProduction = process.env.NODE_ENV === 'production';

const CSP_POLICY = [
  "default-src 'self'",
  // 'unsafe-inline': Next.js 와 남은 옛 HTML 의 인라인 스크립트 / 'unsafe-eval': 결제·지도 SDK 호환용(필요 없으면 빼 보세요)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.portone.io https://dapi.kakao.com https://*.kakao.com https://*.kakaocdn.net https://*.daumcdn.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://dapi.kakao.com https://*.kakao.com https://*.portone.io",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }] : []),
  // interest-cohort(구글 FLoC 차단)는 FLoC 가 폐기되어 브라우저가 인식하지 못해 콘솔 오류만 내므로 뺐습니다.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
  {
    // 항상 적용: 다른 사이트가 이 사이트를 iframe 으로 감싸지 못하게(클릭재킹 방지) 등 기본 규칙
    key: 'Content-Security-Policy',
    value:
      "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" +
      (isProduction ? '; upgrade-insecure-requests' : '') +
      (ENFORCE_CSP ? '; ' + CSP_POLICY : ''),
  },
  ...(ENFORCE_CSP ? [] : [{ key: 'Content-Security-Policy-Report-Only', value: CSP_POLICY }]),
];

// 검색엔진에 노출하지 않고 캐시하지 않는 개인/관리자 페이지
const PRIVATE_PAGES = 'admin|admin-logs|super-admin|mypage|mypage-manager|profile-edit';

const nextConfig: NextConfig = {
  // Vercel 에는 SUPABASE_URL / SUPABASE_ANON_KEY 이름으로 이미 등록돼 있으므로,
  // 같은 값을 Next.js 브라우저 코드용 이름(NEXT_PUBLIC_*)으로도 넘겨 줍니다. (환경 변수를 두 번 등록할 필요 없음)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '',
    NEXT_PUBLIC_WB_ENV_NAME: process.env.NEXT_PUBLIC_WB_ENV_NAME || process.env.WB_ENV_NAME || 'production',
  },

  trailingSlash: false,
  // 응답 헤더에 'X-Powered-By: Next.js' 를 붙이지 않음 (사용 기술을 외부에 알리지 않기)
  poweredByHeader: false,

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
        { source: '/:page([A-Za-z0-9_-]+)', destination: '/:page.html' },
        { source: '/test/:page([A-Za-z0-9_-]+)', destination: '/test/:page.html' },
      ],
    };
  },
};

export default nextConfig;
