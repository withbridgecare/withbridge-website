'use client';

/**
 * 로그인 상태를 사이트 전체에 공유하는 React Context (예전 js/auth-header.js 의 상태 관리 부분).
 *
 * - getSession() + onAuthStateChange() 로 로그인/로그아웃/다른 탭 변경을 감지
 * - 로그인되면: 매니저/관리자 여부 확인(실패 시 몇 번 재시도, 끝내 실패하면 메뉴를 숨김 = fail closed),
 *   비로그인 신청서 연결, 로그인 전에 가려던 페이지로 이동
 * - 로그인 필요 안내 모달 / 전화 상담 모달도 여기서 띄웁니다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { claimServiceApplications, lookupAdmin, lookupManager, type LookupState } from '@/lib/api/auth';
import {
  clearLocalCareData,
  clearUserMode,
  consumePostLoginRedirect,
  maybeLoggedIn,
  readPendingApplications,
  rememberPostLoginRedirect,
  writePendingApplications,
} from '@/lib/browser/storage';
import { ROUTES, SITE } from '@/lib/config';
import { attachPhotoResolver, scrubLegacyCheckpoints } from '@/lib/browser/privacy';
import { markLoggingOut } from '@/lib/browser/storage';

type AuthContextValue = {
  /** 세션 확인이 끝났는지 (끝나기 전엔 헤더 로그인 영역을 숨겨 깜빡임 방지) */
  ready: boolean;
  user: User | null;
  /** null = 아직 모름(확인 중/실패) */
  isManager: boolean | null;
  isAdmin: boolean | null;
  logout: (opts?: { redirectTo?: string }) => Promise<void>;
  /** 로그인 상태면 target 으로 이동, 아니면 로그인 안내 모달 */
  goIfLoggedIn: (event: React.MouseEvent | null, target: string) => Promise<void>;
  showLoginModal: (target?: string, opts?: { required?: boolean }) => void;
  handlePhoneClick: (event: React.MouseEvent) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() 는 <AuthProvider> 안에서만 쓸 수 있습니다.');
  return ctx;
}

const CHECK_RETRIES = 3;

function useRoleCheck(userId: string | null, lookup: (id: string) => Promise<LookupState>) {
  // 결과를 '어느 사용자에 대한 것인지'와 함께 저장 → 사용자가 바뀌면 이전 결과는 자동으로 무시(null)
  const [result, setResult] = useState<{ userId: string; value: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = (attempt: number) => {
      lookup(userId).then((res) => {
        if (cancelled) return;
        if (res === 'error') {
          if (attempt < CHECK_RETRIES) timer = setTimeout(() => run(attempt + 1), 1500 * (attempt + 1));
          return; // 결과 없음 → 메뉴를 그리지 않음 (fail closed)
        }
        setResult({ userId, value: res === 'yes' });
      });
    };
    run(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, lookup]);
  return result && userId && result.userId === userId ? result.value : null;
}

const noopSubscribe = () => () => {};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  // 저장된 로그인 토큰이 아예 없으면 확인을 기다릴 필요 없이 바로 '로그아웃 상태'로 그림
  // (서버에서 그릴 때는 false → 화면이 뜬 뒤 브라우저 값으로 바뀜)
  const noStoredSession = useSyncExternalStore(noopSubscribe, () => !maybeLoggedIn(), () => false);
  const ready = sessionChecked || noStoredSession;
  const [user, setUser] = useState<User | null>(null);
  const [loginModal, setLoginModal] = useState<{ target: string | null; required: boolean } | null>(null);
  const [callModal, setCallModal] = useState(false);
  const claiming = useRef(false);

  const client = useMemo(() => getSupabase(), []);
  const managerLookup = useCallback((id: string) => lookupManager(client, id), [client]);
  const adminLookup = useCallback((id: string) => lookupAdmin(client, id), [client]);
  const isManager = useRoleCheck(user?.id ?? null, managerLookup);
  const isAdmin = useRoleCheck(user?.id ?? null, adminLookup);

  const claimPendingApplications = useCallback(async () => {
    if (claiming.current) return;
    const list = readPendingApplications();
    if (!list.length) return;
    claiming.current = true;
    try {
      const ids = list.map((x) => x.id);
      const claimed = await claimServiceApplications(client, ids);
      if (claimed === null) return; // 실패 → 기억은 남겨 두고 다음에 재시도
      writePendingApplications(readPendingApplications().filter((x) => !ids.includes(x.id)));
      if (claimed.length) window.dispatchEvent(new CustomEvent('wb-applications-claimed', { detail: { ids: claimed } }));
    } finally {
      claiming.current = false;
    }
  }, [client]);

  // 개인정보 보호: 비공개 사진 서명 URL 자동 교체 + 예전 로컬 체크포인트 정리 (예전 privacy-guard.js)
  useEffect(() => {
    attachPhotoResolver(client);
    scrubLegacyCheckpoints();
  }, [client]);

  useEffect(() => {
    const fallback = setTimeout(() => setSessionChecked(true), 2000); // 어떤 이유로든 확인이 늦어도 영구히 숨지 않도록

    const apply = (session: Session | null) => {
      setUser(session?.user ?? null);
      setSessionChecked(true);
      if (session?.user) {
        claimPendingApplications();
        const target = consumePostLoginRedirect();
        if (target) window.location.href = '/' + target.replace(/^\//, '');
      }
    };

    client.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch((err) => {
        console.error('[auth] getSession 실패:', err);
        setSessionChecked(true);
      });

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearUserMode();
      apply(session);
    });
    return () => {
      clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, [client, claimPendingApplications]);

  const logout = useCallback(
    async (opts?: { redirectTo?: string }) => {
      markLoggingOut(true); // 사용자가 직접 누른 로그아웃 — 마이페이지의 '로그인 만료' 이동과 구분
      const { error } = await client.auth.signOut();
      if (error) {
        markLoggingOut(false);
        alert('로그아웃 중 오류가 발생했습니다: ' + error.message);
        return;
      }
      clearUserMode();
      clearLocalCareData();
      setUser(null);
      if (opts?.redirectTo) {
        window.location.href = opts.redirectTo;
        return;
      }
      markLoggingOut(false);
      alert('로그아웃 되었습니다.');
    },
    [client],
  );

  const showLoginModal = useCallback((target?: string, opts?: { required?: boolean }) => {
    setLoginModal({ target: target ?? null, required: !!opts?.required });
  }, []);

  const goIfLoggedIn = useCallback(
    async (event: React.MouseEvent | null, target: string) => {
      event?.preventDefault();
      try {
        const { data } = await client.auth.getSession();
        if (data.session?.user) {
          window.location.href = target;
          return;
        }
      } catch {
        /* 확인 실패 → 비로그인으로 간주 */
      }
      showLoginModal(target);
    },
    [client, showLoginModal],
  );

  const handlePhoneClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) window.location.href = 'tel:' + SITE.phone.replace(/[^0-9+]/g, '');
    else setCallModal(true);
  }, []);

  // ESC 로 모달 닫기 (필수 로그인 모달은 제외)
  useEffect(() => {
    if (!callModal && !(loginModal && !loginModal.required)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setCallModal(false);
      setLoginModal((m) => (m && !m.required ? null : m));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [callModal, loginModal]);

  const confirmLogin = () => {
    const target = loginModal?.target;
    setLoginModal(null);
    if (target) {
      const local = target.replace(/^\//, '');
      rememberPostLoginRedirect(local);
      window.location.href = ROUTES.login + '?redirect=' + encodeURIComponent(local);
    } else {
      window.location.href = ROUTES.login;
    }
  };

  const value: AuthContextValue = { ready, user, isManager, isAdmin, logout, goIfLoggedIn, showLoginModal, handlePhoneClick };

  return (
    <AuthContext.Provider value={value}>
      {children}

      {loginModal && (
        <div
          className="wb-login-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loginModal.required) setLoginModal(null);
          }}
        >
          <div className="wb-login-modal-card">
            <p className="wb-login-modal-title">{loginModal.required ? '로그인해 주세요' : '로그인이 필요해요'}</p>
            <p className="wb-login-modal-body">
              {loginModal.required
                ? '예약하기는 로그인 후 이용하실 수 있어요.\n확인을 누르면 로그인 페이지로 이동합니다.'
                : '로그인 페이지로 이동할까요?'}
            </p>
            <div className={'wb-login-modal-actions' + (loginModal.required ? ' is-single' : '')}>
              {!loginModal.required && (
                <button type="button" className="wb-login-modal-btn wb-login-modal-cancel" onClick={() => setLoginModal(null)}>
                  취소
                </button>
              )}
              <button type="button" className="wb-login-modal-btn wb-login-modal-confirm" onClick={confirmLogin} autoFocus>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {callModal && (
        <div
          className="wb-login-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCallModal(false);
          }}
        >
          <div className="wb-login-modal-card">
            <p className="wb-login-modal-title">전화 상담 안내</p>
            <p className="wb-login-modal-phone">{SITE.phone}</p>
            <p className="wb-login-modal-hours">{SITE.phoneHours}</p>
            <div className="wb-login-modal-actions is-single">
              <button type="button" className="wb-login-modal-btn wb-login-modal-confirm" onClick={() => setCallModal(false)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
