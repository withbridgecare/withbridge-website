'use client';

/**
 * '전화 상담' 링크: 휴대폰이면 바로 전화 앱을, PC 면 번호·운영시간 안내 창을 띄웁니다.
 * (예전 onclick="window.WBAuth.handlePhoneClick(event)")
 */
import { useAuth } from './AuthProvider';
import { SITE } from '@/lib/config';

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function PhoneLink({ children, ...rest }: Props) {
  const { handlePhoneClick } = useAuth();
  return (
    <a href={'tel:' + SITE.phone.replace(/-/g, '')} {...rest} onClick={handlePhoneClick}>
      {children}
    </a>
  );
}
