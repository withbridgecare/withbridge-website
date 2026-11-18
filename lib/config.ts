/**
 * 사이트 전역 설정값 — 여러 화면이 함께 쓰는 주소·연락처를 한 곳에 모읍니다.
 * (NEXTJS_MIGRATION_PLAN.md 원칙 7: 앱으로 확장할 때 바뀔 수 있는 값은 여기서만 관리)
 *
 * 이 파일에는 next/* 나 브라우저 전용 코드(window, localStorage)를 넣지 않습니다.
 */

export const SITE = {
  name: '위드브릿지',
  nameEn: 'WithBridge',
  kakaoChannelUrl: 'http://pf.kakao.com/_PKxemX',
  phone: '010-5530-5760',
  phoneHours: '평일 08:00 ~ 18:00 (주말/공휴일 휴무)',
  email: 'withbridge.care@outlook.kr',
} as const;

/** 화면 주소. 아직 레거시 HTML 인 페이지도 같은 주소로 열립니다(next.config.ts rewrites). */
export const ROUTES = {
  home: '/',
  story: '/story',
  services: '/#services',
  howItWorks: '/#how-it-works',
  faq: '/#faq',
  notice: '/notice',
  pricing: '/pricing',
  apply: '/apply',
  login: '/login',
  signup: '/signup',
  mypage: '/mypage',
  mypageManager: '/mypage-manager',
  elderProfile: '/mypage?tab=elder',
  profileEdit: '/profile-edit',
  admin: '/admin',
  terms: '/terms',
  privacy: '/privacy',
} as const;

/**
 * 로그인·결제 후 돌아올 주소. 웹은 현재 도메인 기준이고,
 * 앱(WebView/Expo)으로 확장하면 이 함수만 바꾸면 됩니다.
 */
export function authRedirectUrl(origin: string, path: string = '/index.html'): string {
  return origin + path;
}
