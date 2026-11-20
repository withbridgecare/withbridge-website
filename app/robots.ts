import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

/** /robots.txt — 검색엔진이 개인·관리자 화면을 수집하지 않도록 (화면 자체에도 noindex 가 있음) */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin-logs', '/super-admin', '/mypage', '/mypage-manager', '/profile-edit', '/reset-password', '/test/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
