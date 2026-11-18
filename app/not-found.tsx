import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>페이지를 찾을 수 없어요</h1>
      <p style={{ margin: 0, color: '#6B7280' }}>주소가 바뀌었거나 삭제된 페이지일 수 있어요.</p>
      <Link href="/" style={{ padding: '10px 22px', background: '#8FA482', color: '#fff', borderRadius: 9999, fontWeight: 700, textDecoration: 'none' }}>
        메인으로 가기
      </Link>
    </main>
  );
}
