'use client';

/**
 * 로그인이 필요한 화면(예: 예약하기)으로 가는 링크.
 * 로그인 상태면 바로 이동, 아니면 '로그인이 필요해요' 안내 모달을 띄웁니다.
 * (예전 onclick="window.WBAuth.goIfLoggedIn(event, 'apply.html')" 를 대신함)
 */
import { useAuth } from './AuthProvider';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function LoginGateLink({ href, children, ...rest }: Props) {
  const { goIfLoggedIn } = useAuth();
  return (
    <a href={href} {...rest} onClick={(e) => goIfLoggedIn(e, href)}>
      {children}
    </a>
  );
}
