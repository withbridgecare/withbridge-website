import type { Config } from 'tailwindcss';

/**
 * Next.js 화면용 Tailwind 설정.
 * 색상은 DESIGN_HANDOFF.md 3장의 하드코딩 값을 이름으로 모은 것입니다 (NEXTJS_MIGRATION_PLAN.md 3.3).
 * 새 화면에서는 #78866B 같은 값을 직접 쓰지 말고 bg-brand, text-ink 처럼 이름으로 쓰세요.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#78866B', light: '#8FA482', dark: '#3B4B3C', soft: '#F1F6F0', line: '#E2ECE0' },
        // 딥그린 3종(#1F5C45/#245742/#2E6D53) 통합 여부는 디자인 담당 확인 필요 — 우선 대표값만 등록
        deep: { DEFAULT: '#1F5C45', 2: '#245742', 3: '#2E6D53' },
        accent: { DEFAULT: '#556B2F', dark: '#455822' },
        sand: { DEFAULT: '#F4F1E2', 2: '#ECE4D1', 3: '#FAF8F0', 4: '#F9F9F7' },
        ink: { DEFAULT: '#1A1D21', sub: '#6B7280', mute: '#4B5563' },
        line: { DEFAULT: '#E2E4E8', soft: '#F0F1F3' },
        navy: { DEFAULT: '#1E293B', 2: '#1E2A4A' },
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '"Noto Sans KR"', '-apple-system', 'BlinkMacSystemFont', '"Malgun Gothic"', 'sans-serif'],
      },
      maxWidth: { site: '1380px' },
    },
  },
  // 기존 HTML 페이지는 Tailwind 초기화(preflight) 없이 만들어졌습니다. 옮긴 화면이 똑같이 보이도록 끕니다.
  corePlugins: { preflight: false },
  plugins: [],
};

export default config;
