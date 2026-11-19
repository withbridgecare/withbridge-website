'use client';

/**
 * 화면 오류 안내 — 페이지를 그리다 예상치 못한 오류가 나면 빈 화면 대신 이 안내가 보입니다.
 * 오류 내용은 브라우저 콘솔과 Vercel 로그에서 확인하세요.
 */
import { useEffect } from 'react';
import { SITE } from '@/lib/config';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[화면 오류]', error);
  }, [error]);

  return (
    <main style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', fontFamily: "'Noto Sans KR', sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1A1D21' }}>일시적인 오류가 발생했어요</h1>
      <p style={{ margin: 0, color: '#6B7280', lineHeight: 1.6 }}>
        잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터({SITE.phone})로 문의해 주세요.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={reset} style={{ padding: '10px 22px', background: '#8FA482', color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, cursor: 'pointer' }}>
          다시 시도
        </button>
        <a href="/" style={{ padding: '10px 22px', border: '1px solid #D1D5DB', color: '#374151', borderRadius: 9999, fontWeight: 700, textDecoration: 'none' }}>
          메인으로
        </a>
      </div>
    </main>
  );
}
