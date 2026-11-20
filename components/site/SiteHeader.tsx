'use client';

/**
 * 사이트 공통 머리글: 상단 롤링 띠배너 + 헤더 + 모바일 드로어 메뉴.
 * 예전에는 HTML 페이지마다 같은 마크업이 복사돼 있었고(js/mobile-nav.js, js/auth-header.js 가 동작 담당),
 * 이제 이 컴포넌트 하나만 고치면 Next.js 로 옮긴 모든 페이지에 반영됩니다.
 *
 * 띠배너 문구는 원칙 3(운영자가 바꾸는 내용은 DB로)에 따라 나중에 site_settings 테이블로 옮길 대상입니다.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { DesktopAuthMenu, DrawerAuthMenu } from './AuthMenu';
import { ROUTES, SITE } from '@/lib/config';

const BANNER_ITEMS: { text: string; href: string; external?: boolean }[] = [
  { text: '첫 방문 고객 서비스 이용료 할인', href: '/#contact' },
  { text: '사람과 사람을 잇는 따뜻한 연결, 위드브릿지', href: '/#contact' },
  { text: '지금 문의하기로 간편하게 상담받기', href: SITE.kakaoChannelUrl, external: true },
];

const NAV_ITEMS = [
  { label: '소개', href: ROUTES.story },
  { label: '서비스', href: ROUTES.services },
  { label: '이용 방법', href: ROUTES.howItWorks },
  { label: '공지사항', href: ROUTES.notice },
  { label: '자주 묻는 질문(FAQ)', href: ROUTES.faq },
];

function ArrowUpRight({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function TopBanner() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % BANNER_ITEMS.length), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="wb-top-banner"
      style={{ backgroundColor: '#78866B', color: '#ffffff', fontSize: 12.5, fontWeight: 500, height: 38, overflow: 'hidden', position: 'relative', fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div style={{ transition: 'transform 0.5s ease-in-out', width: '100%', transform: `translateY(-${index * 38}px)` }}>
        {BANNER_ITEMS.map((item) => (
          <div key={item.text} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <a
              href={item.href}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{ color: '#ffffff', textDecoration: 'none', letterSpacing: '-0.2px' }}
            >
              {item.text}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 지금 페이지에 해당하는 메뉴에 표시. 메인(/)에서는 스크롤 위치에 따라 섹션 메뉴를 표시합니다. */
function useActiveNav(): string | null {
  const pathname = usePathname();
  const [activeHash, setActiveHash] = useState<string | null>(null);

  useEffect(() => {
    if (pathname !== '/') return;
    const hashes = NAV_ITEMS.map((n) => n.href).filter((h) => h.startsWith('/#')).map((h) => h.slice(2));
    const sections = hashes.map((h) => document.getElementById(h)).filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const header = document.querySelector('header');
      const line = (header ? header.getBoundingClientRect().bottom : 0) + window.innerHeight * 0.3;
      let current: string | null = null;
      sections.forEach((sec) => {
        const r = sec.getBoundingClientRect();
        if (r.top <= line && r.bottom > line) current = sec.id;
      });
      if (!current && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = sections[sections.length - 1];
        if (last.getBoundingClientRect().top < window.innerHeight) current = last.id;
      }
      setActiveHash(current);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        setTimeout(update, 50);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', update);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      window.removeEventListener('hashchange', update);
    };
  }, [pathname]);

  if (pathname === '/') return activeHash ? '/#' + activeHash : null;
  return NAV_ITEMS.some((n) => n.href === pathname) ? pathname : null;
}

export function SiteHeader() {
  const { goIfLoggedIn } = useAuth();
  const pathname = usePathname();
  const active = useActiveNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerHidden, setDrawerHidden] = useState(true); // 닫힘 애니메이션(0.3s)이 끝난 뒤에만 완전히 숨김
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyActive = pathname === ROUTES.apply;
  const isManagerLanding = pathname === '/manager-landing';

  const openDrawer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDrawerHidden(false);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setDrawerHidden(true), 300);
  };

  useEffect(() => {
    document.body.classList.toggle('wb-drawer-open', drawerOpen);
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    const onResize = () => window.innerWidth > 768 && closeDrawer();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [drawerOpen]);

  const navLinkClass = (href: string) => (active === href ? 'wb-nav-active' : undefined);
  const ctaClass = (extra?: string) => [extra, applyActive ? 'wb-nav-active-cta' : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="site-chrome">
      <TopBanner />

      <header style={{ width: '100%', backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 50, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div className="wb-header-row" style={{ maxWidth: 1380, margin: '0 auto', padding: '6px 40px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', columnGap: 24 }}>
          {/* 모바일 전용 햄버거 버튼 */}
          <button
            type="button"
            className="wb-mobile-toggle"
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="wbMobileDrawer"
            onClick={() => (drawerOpen ? closeDrawer() : openDrawer())}
            style={{ alignItems: 'center', justifyContent: 'center', width: 40, height: 40, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', justifySelf: 'start' }}
          >
            {drawerOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A1D21" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A1D21" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            )}
          </button>

          {/* 로고 */}
          <a href={ROUTES.home} style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', textDecoration: 'none', flex: 'none' }}>
            { }
            <img src="/images/logo_main.webp" alt="위드브릿지 로고" style={{ height: 48, width: 'auto', display: 'block', objectFit: 'contain', margin: 0, padding: 0, position: 'relative', top: 3 }} />
          </a>

          {/* 중앙 메뉴 */}
          <nav className="wb-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            {NAV_ITEMS.map((item, i) => (
              <span key={item.href} style={{ display: 'contents' }}>
                {i > 0 && <span aria-hidden="true" style={{ flex: 'none', display: 'inline-block', width: 1, height: 14, backgroundColor: '#E2E4E8' }} />}
                <a
                  href={item.href}
                  className={navLinkClass(item.href)}
                  aria-current={active === item.href ? (item.href.includes('#') ? 'location' : 'page') : undefined}
                  style={{ color: '#1A1D21', textDecoration: 'none', transition: 'color 0.2s' }}
                >
                  {item.label}
                </a>
              </span>
            ))}
          </nav>

          {/* 우측 버튼 */}
          <div className="wb-desktop-actions" style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 18, whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5, fontWeight: 500, color: '#6B7280' }}>
              <a href={SITE.kakaoChannelUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6B7280', textDecoration: 'none', transition: 'color 0.2s' }}>
                문의하기
              </a>
              <span aria-hidden="true" style={{ flex: 'none', display: 'inline-block', width: 1, height: 12, backgroundColor: '#E2E4E8' }} />
              <DesktopAuthMenu />
            </div>
            {isManagerLanding ? (
              // 매니저 모집 페이지: '예약하기' 대신 '지원하기 ↗'(지원서 새 탭)
              <a
                href="/manager-apply"
                target="_blank"
                rel="noopener noreferrer"
                style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 22px', backgroundColor: '#8FA482', color: '#ffffff', borderRadius: 9999, fontSize: 14.5, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(143, 164, 130, 0.35)', transition: 'background-color 0.2s, transform 0.2s' }}
              >
                지원하기
                <ArrowUpRight size={14} />
              </a>
            ) : (
            <a
                href={ROUTES.apply}
                className={ctaClass()}
                onClick={(e) => goIfLoggedIn(e, ROUTES.apply)}
                style={{ flex: 'none', display: 'inline-block', padding: '10px 22px', backgroundColor: '#8FA482', color: '#ffffff', borderRadius: 9999, fontSize: 14.5, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(143, 164, 130, 0.35)', transition: 'background-color 0.2s, transform 0.2s' }}
              >
                예약하기
              </a>
            )}
          </div>

          {/* 모바일 전용 예약하기 버튼 */}
          {isManagerLanding ? (
            <a
              href="/manager-apply"
              target="_blank"
              rel="noopener noreferrer"
              className="wb-mobile-cta"
              style={{ justifySelf: 'end', gap: 5, padding: '8px 16px', backgroundColor: '#8FA482', color: '#ffffff', borderRadius: 9999, fontSize: 13.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              지원하기
              <ArrowUpRight size={13} />
            </a>
          ) : (
          <a
              href={ROUTES.apply}
              className={ctaClass('wb-mobile-cta')}
              onClick={(e) => goIfLoggedIn(e, ROUTES.apply)}
              style={{ justifySelf: 'end', padding: '8px 16px', backgroundColor: '#8FA482', color: '#ffffff', borderRadius: 9999, fontSize: 13.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              예약하기
            </a>
          )}
        </div>
      </header>

      {/* 모바일 드로어 메뉴 (768px 이하) */}
      <div className={'wb-drawer-overlay' + (drawerOpen ? ' is-open' : '')} onClick={closeDrawer} />
      <aside
        className={'wb-drawer' + (drawerOpen ? ' is-open' : '')}
        id="wbMobileDrawer"
        role="dialog"
        aria-modal="true"
        aria-label="모바일 메뉴"
        aria-hidden={!drawerOpen}
        style={drawerHidden ? { visibility: 'hidden' } : undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) closeDrawer(); // 드로어 안 링크를 누르면 닫기
        }}
      >
        <div className="wb-drawer-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F0F1F3', flex: 'none' }}>
          <a href={ROUTES.home} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            { }
            <img src="/images/logo_main.webp" alt="위드브릿지 로고" style={{ height: 32, width: 'auto', display: 'block', objectFit: 'contain' }} />
          </a>
          <button type="button" id="wbDrawerClose" aria-label="메뉴 닫기" onClick={closeDrawer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A1D21" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px 16px', gap: 2, fontFamily: "'Noto Sans KR', sans-serif" }}>
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className={'wb-drawer-link' + (active === item.href ? ' wb-nav-active' : '')}>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ padding: '18px 20px 24px', borderTop: '1px solid #F0F1F3', display: 'flex', flexDirection: 'column', gap: 14, flex: 'none', fontFamily: "'Noto Sans KR', sans-serif" }}>
          <DrawerAuthMenu />
        </div>
      </aside>
    </div>
  );
}
