'use client';

/**
 * 헤더 우측 로그인 영역 (예전 js/auth-header.js 의 화면 그리기 부분).
 *  - 로그아웃 상태: '로그인 | 회원가입'
 *  - 로그인 상태(데스크톱): 프로필 사진 버튼 + 카드형 드롭다운
 *  - 로그인 상태(모바일 드로어): 같은 내용을 펼친 목록으로
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { ChatIcon, DEFAULT_AVATAR, LogoutIcon, QuestionIcon, ShieldIcon, SwitchIcon, UserIcon } from './icons';
import { displayIdentity } from '@/lib/api/auth';
import { getUserMode, isUserModeKey, setUserMode, type UserMode } from '@/lib/browser/storage';
import { ROUTES, SITE } from '@/lib/config';

/** 지금 보고 있는 화면의 역할: 마이페이지 두 곳은 주소로, 그 밖은 저장된 선택으로 */
function subscribeUserMode(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (isUserModeKey(e.key)) onChange(); // 다른 탭에서 모드를 바꾸면 이 탭 메뉴도 갱신
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function useCurrentRole(): UserMode {
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribeUserMode, getUserMode, () => 'guardian' as UserMode);
  if (/^\/mypage-manager$/.test(pathname)) return 'manager';
  if (/^\/mypage$/.test(pathname)) return 'guardian';
  return stored;
}

function Avatar({ src, style }: { src: string; style?: React.CSSProperties }) {
  return (
     
    <img
      src={src || DEFAULT_AVATAR}
      alt="프로필 이미지"
      referrerPolicy="no-referrer"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== DEFAULT_AVATAR) img.src = DEFAULT_AVATAR;
      }}
    />
  );
}

function LoggedOutLinks({ variant }: { variant: 'desktop' | 'drawer' }) {
  const color = '#6B7280';
  return (
    <>
      <a href={ROUTES.login} style={{ textDecoration: 'none', fontWeight: 500, color, transition: 'color 0.2s' }}>
        로그인
      </a>
      <span style={{ color: '#d1d5db', fontSize: variant === 'desktop' ? 13.5 : undefined, fontWeight: 400 }}>|</span>
      <a href={ROUTES.signup} style={{ textDecoration: 'none', fontWeight: 500, color, transition: 'color 0.2s' }}>
        회원가입
      </a>
    </>
  );
}

function useMenuModel() {
  const { user, isManager, isAdmin, logout } = useAuth();
  const here = useCurrentRole();
  const pathname = usePathname();
  const target: UserMode = here === 'manager' ? 'guardian' : 'manager';
  const roleLabel = isManager === null ? '회원' : !isManager ? '보호자 계정' : here === 'manager' ? '케어 매니저' : '보호자 모드';
  const mypageHref = isManager && here === 'manager' ? ROUTES.mypageManager : ROUTES.mypage;
  const switchMode = () => {
    setUserMode(target);
    window.location.href = target === 'manager' ? ROUTES.mypageManager : ROUTES.mypage;
  };
  // 마이페이지에서 로그아웃하면 메인으로 (예전 <body data-logout-redirect="index.html">)
  const onLogout = () => logout(/^\/mypage(-manager)?$/.test(pathname) ? { redirectTo: ROUTES.home } : undefined);
  const identity = user ? displayIdentity(user) : { avatarUrl: '', name: '' };
  return { user, isManager, isAdmin, target, roleLabel, mypageHref, switchMode, onLogout, identity };
}

function ModeSwitch({ target, onClick }: { target: UserMode; onClick: () => void }) {
  return (
    <div className="wb-mode-section">
      <button type="button" className="wb-mode-item" role="menuitem" onClick={onClick}>
        <span className="wb-mode-left">
          <span className="wb-mode-icon" aria-hidden="true">
            <SwitchIcon />
          </span>
          <span>{target === 'manager' ? '케어 매니저 모드로 전환' : '보호자 모드로 전환'}</span>
        </span>
      </button>
    </div>
  );
}

/** 데스크톱 헤더: 아바타 버튼 + 드롭다운 */
export function DesktopAuthMenu() {
  const { ready } = useAuth();
  const m = useMenuModel();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={'auth-buttons' + (ready ? '' : ' wb-auth-pending')}
      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 500, color: '#6B7280', whiteSpace: 'nowrap' }}
    >
      {!m.user ? (
        <LoggedOutLinks variant="desktop" />
      ) : (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="내 메뉴 열기"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#f3f4f6', overflow: 'hidden', cursor: 'pointer', display: 'block' }}
          >
            <Avatar src={m.identity.avatarUrl} />
          </button>

          {open && (
            <div className="wb-dd-panel" role="menu" onClick={(e) => e.stopPropagation()}>
              <section className="wb-dd-card">
                <div className="wb-dd-profile-top">
                  <div className="wb-dd-avatar">
                    <Avatar src={m.identity.avatarUrl} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="wb-dd-name">{m.identity.name}님</p>
                    <p className="wb-dd-role">{m.roleLabel}</p>
                  </div>
                </div>
                {m.isManager && <ModeSwitch target={m.target} onClick={m.switchMode} />}
              </section>

              <section className="wb-dd-card">
                <a href={m.mypageHref} className="wb-dd-item" role="menuitem">
                  <span aria-hidden="true"><UserIcon /></span>
                  <span>마이페이지</span>
                </a>
                <a href={ROUTES.elderProfile} className="wb-dd-subitem" role="menuitem">어르신 프로필 관리</a>
                <a href={ROUTES.profileEdit} className="wb-dd-subitem" role="menuitem">내 정보 수정</a>
                {m.isAdmin && (
                  <a href={ROUTES.admin} className="wb-dd-item" role="menuitem">
                    <span aria-hidden="true"><ShieldIcon /></span>
                    <span>어드민 콘솔</span>
                  </a>
                )}
                <p className="wb-dd-section-label">고객 지원</p>
                <a href={SITE.kakaoChannelUrl} target="_blank" rel="noopener noreferrer" className="wb-dd-item is-slim" role="menuitem">
                  <span aria-hidden="true"><ChatIcon /></span>
                  <span>1:1 문의하기</span>
                </a>
                <a href={ROUTES.faq} className="wb-dd-item is-slim" role="menuitem">
                  <span aria-hidden="true"><QuestionIcon /></span>
                  <span>자주 묻는 질문(FAQ)</span>
                </a>
              </section>

              <section className="wb-dd-card">
                <button
                  type="button"
                  className="wb-dd-item is-danger"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    m.onLogout();
                  }}
                >
                  <span aria-hidden="true"><LogoutIcon /></span>
                  <span>로그아웃</span>
                </button>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 모바일 드로어: 펼친 목록 */
export function DrawerAuthMenu() {
  const { ready } = useAuth();
  const m = useMenuModel();
  const rowLink: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px', fontSize: 13, color: '#6B7280', fontWeight: 600 };

  return (
    <div
      className={'auth-buttons wb-drawer-auth-buttons' + (ready ? '' : ' wb-auth-pending')}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14.5, fontWeight: 500, color: '#6B7280' }}
    >
      {!m.user ? (
        <LoggedOutLinks variant="drawer" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 8px', textAlign: 'left' }}>
            <div style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', border: '1px solid #F1F1F1', background: '#F3F4F6' }}>
              <Avatar src={m.identity.avatarUrl} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#374151', wordBreak: 'keep-all' }}>{m.identity.name}님</p>
              <p className="wb-dd-role" style={{ margin: '2px 0 0', fontSize: 11.5, color: '#9CA3AF' }}>{m.roleLabel}</p>
            </div>
          </div>
          {m.isManager && <ModeSwitch target={m.target} onClick={m.switchMode} />}
          <a href={m.mypageHref} className="wb-dd-item wb-drawer-link" style={rowLink}>
            <span aria-hidden="true"><UserIcon /></span>
            <span>마이페이지</span>
          </a>
          <a href={ROUTES.elderProfile} className="wb-dd-subitem wb-drawer-link" style={{ padding: '7px 2px 7px 20px' }}>어르신 프로필 관리</a>
          <a href={ROUTES.profileEdit} className="wb-dd-subitem wb-drawer-link" style={{ padding: '7px 2px 7px 20px' }}>내 정보 수정</a>
          {m.isAdmin && (
            <a href={ROUTES.admin} className="wb-dd-item wb-drawer-link" style={rowLink}>
              <span aria-hidden="true"><ShieldIcon /></span>
              <span>어드민 콘솔</span>
            </a>
          )}
          <p className="wb-dd-section-label">고객 지원</p>
          <a href={SITE.kakaoChannelUrl} target="_blank" rel="noopener noreferrer" className="wb-dd-item is-slim wb-drawer-link" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px' }}>
            <span aria-hidden="true"><ChatIcon /></span>
            <span>1:1 문의하기</span>
          </a>
          <a href={ROUTES.faq} className="wb-dd-item is-slim wb-drawer-link" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px' }}>
            <span aria-hidden="true"><QuestionIcon /></span>
            <span>자주 묻는 질문(FAQ)</span>
          </a>
          <button type="button" className="wb-dd-item is-danger wb-drawer-link" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px', fontSize: 13 }} onClick={m.onLogout}>
            <span aria-hidden="true"><LogoutIcon /></span>
            <span>로그아웃</span>
          </button>
        </div>
      )}
    </div>
  );
}
