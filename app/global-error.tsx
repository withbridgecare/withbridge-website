'use client';

/** 최상위(레이아웃까지) 오류 시 보이는 마지막 안내 화면 — 자체 <html>/<body> 를 그립니다. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "'Noto Sans KR', -apple-system, sans-serif" }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>일시적인 오류가 발생했어요</h1>
          <p style={{ margin: 0, color: '#6B7280' }}>잠시 후 다시 시도해 주세요.</p>
          <button type="button" onClick={reset} style={{ padding: '10px 22px', background: '#8FA482', color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, cursor: 'pointer' }}>
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
