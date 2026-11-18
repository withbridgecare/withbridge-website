import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  // 운영 도메인은 Vercel 환경 변수 NEXT_PUBLIC_SITE_URL 에 등록하세요 (검색엔진·공유 미리보기 주소 기준)
  ...(process.env.NEXT_PUBLIC_SITE_URL ? { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL) } : {}),
  title: { default: '위드브릿지', template: '%s | 위드브릿지' },
  description: '사람과 사람을 잇는 따뜻한 연결, 위드브릿지 — 시니어 병원 동행·생활 편의 케어 서비스',
  icons: { icon: '/images/withbridge_logo.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* ?embed=1 : 다른 페이지의 팝업(iframe) 안에서 열릴 때 머리글·바닥글 숨김. 화면을 그리기 전에 적용해야 깜빡이지 않습니다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embed');",
          }}
        />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
