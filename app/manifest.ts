import type { MetadataRoute } from 'next';

/**
 * 웹앱(PWA) 설정 — 휴대폰에서 '홈 화면에 추가'하면 주소창 없이 앱처럼 열립니다 (NEXTJS_MIGRATION_PLAN.md 8장).
 * 오프라인 캐시(서비스 워커)는 일부러 넣지 않았습니다: 결제·예약 화면이 옛 데이터를 보여 주면 위험하기 때문입니다.
 * 아이콘은 public/icons/ (원본: public/images/withbridge_logo.png 256px — 더 선명한 512px 이상 원본이 생기면 교체).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '위드브릿지 — 시니어 병원 동행',
    short_name: '위드브릿지',
    description: '사람과 사람을 잇는 따뜻한 연결, 위드브릿지 — 부모님의 안전한 병원길을 든든하게 동행합니다.',
    lang: 'ko',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#78866B',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
