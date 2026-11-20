/** 헤더·메뉴에서 쓰는 선 아이콘 (예전 js/auth-header.js 의 SVG 문자열) */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  focusable: false,
  'aria-hidden': true,
};

export const SwitchIcon = () => (
  <svg {...base}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);
export const UserIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);
export const ShieldIcon = () => (
  <svg {...base}>
    <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
  </svg>
);
export const LogoutIcon = () => (
  <svg {...base}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
export const ChatIcon = () => (
  <svg {...base}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
export const QuestionIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 2-3 4" />
    <line x1="12" y1="17" x2="12" y2="17.01" />
  </svg>
);

export const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect width="44" height="44" fill="#E5E7EB"/><circle cx="22" cy="17" r="8" fill="#9CA3AF"/><path d="M6 44c0-9 7-15 16-15s16 6 16 15z" fill="#9CA3AF"/></svg>',
  );
