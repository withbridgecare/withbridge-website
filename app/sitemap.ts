import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

/** /sitemap.xml — 검색엔진에 알려 줄 공개 페이지 목록. 새 공개 페이지를 만들면 여기에 추가하세요. */
const PUBLIC_PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/story', priority: 0.8 },
  { path: '/pricing', priority: 0.8 },
  { path: '/package', priority: 0.7 },
  { path: '/manager-landing', priority: 0.7 },
  { path: '/partner', priority: 0.6 },
  { path: '/notice', priority: 0.5 },
  { path: '/terms', priority: 0.3 },
  { path: '/privacy', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({ url: SITE_URL + p.path, changeFrequency: 'weekly', priority: p.priority }));
}
