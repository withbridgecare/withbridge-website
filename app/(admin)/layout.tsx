/**
 * 어드민 화면 공통 틀 — 일반 사이트 머리글·바닥글 없이 페이지가 직접 사이드바/상단바를 그립니다.
 * 로그인·관리자 권한 확인은 각 화면의 스크립트가 하고, 실제 데이터 보호는 DB 의 RLS·RPC 가 합니다 (원칙 4).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
