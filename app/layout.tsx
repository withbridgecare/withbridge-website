import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PRIVACY_CONSOLE_SCRIPT } from '@/lib/browser/privacy';
import { SITE_URL } from '@/lib/config';

export const metadata: Metadata = {
  // 검색엔진·공유 미리보기의 기준 주소 (lib/config.ts SITE_URL — Vercel 환경 변수 SITE_URL 로 바꿀 수 있음)
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '위드브릿지',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: '위드브릿지' }],
  },
  title: { default: '위드브릿지', template: '%s | 위드브릿지' },
  description: '사람과 사람을 잇는 따뜻한 연결, 위드브릿지 — 시니어 병원 동행·생활 편의 케어 서비스',
  icons: { icon: '/images/withbridge_logo.png', apple: '/icons/apple-touch-icon.png' },
  // iOS 에서 홈 화면에 추가했을 때 앱처럼 열리도록
  appleWebApp: { capable: true, title: '위드브릿지', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#78866B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 운영 도메인에서 디버그 로그 끄기 (회원정보 노출 방지) — lib/browser/privacy.ts */}
        <script dangerouslySetInnerHTML={{ __html: PRIVACY_CONSOLE_SCRIPT }} />
        {/* ?embed=1 : 다른 페이지의 팝업(iframe) 안에서 열릴 때 머리글·바닥글 숨김. 화면을 그리기 전에 적용해야 깜빡이지 않습니다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embed');",
          }}
        />
        {/* Pretendard 웹폰트는 일반 사이트 페이지만 불러옵니다 (app/(site)/layout.tsx) — 예전 어드민 화면은 불러오지 않았음 */}
        {/* 'Noto Sans KR' 은 페이지마다 components/site/NotoSansKr.tsx 로 따로 불러옵니다 (예전 화면 그대로 유지) */}
      </head>
      <body>{children}</body>
    </html>
  );
}
