import '../styles/site-chrome.css';
import { AuthProvider } from '@/components/site/AuthProvider';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

/**
 * 일반 사이트 페이지 공통 틀: 띠배너·헤더·드로어 + 본문 + 바닥글.
 * app/(site)/ 아래에 만든 페이지는 모두 이 틀 안에 들어갑니다. (괄호 폴더는 주소에 나타나지 않음)
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SiteHeader />
      {children}
      <SiteFooter />
    </AuthProvider>
  );
}
