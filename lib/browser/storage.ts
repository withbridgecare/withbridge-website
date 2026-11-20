/**
 * 브라우저 저장소(localStorage / sessionStorage)를 쓰는 웹 전용 도우미 (예전 js/auth-header.js · js/privacy-guard.js).
 *
 * 원칙 7: 브라우저 전용 API 는 lib/api/ 가 아니라 여기에 둡니다. 앱(Expo)으로 옮길 때는 이 파일만 바꿉니다.
 * 여기 저장되는 값은 모두 "화면 설정"일 뿐 권한이 아닙니다 (권한 판단에 쓰지 마세요).
 * 키 이름은 레거시 HTML 페이지와 똑같아야 서로 값을 공유합니다.
 */

// ---------- 화면 모드 (보호자 ↔ 매니저) ----------
const MODE_KEY = 'active_role';
const LEGACY_MODE_KEYS = ['active_mode', 'user_mode'];
export type UserMode = 'guardian' | 'manager';

export function getUserMode(): UserMode {
  try {
    let v = localStorage.getItem(MODE_KEY);
    for (let i = 0; v === null && i < LEGACY_MODE_KEYS.length; i++) v = localStorage.getItem(LEGACY_MODE_KEYS[i]);
    return v === 'manager' ? 'manager' : 'guardian';
  } catch {
    return 'guardian';
  }
}
export function setUserMode(mode: UserMode) {
  try {
    localStorage.setItem(MODE_KEY, mode === 'manager' ? 'manager' : 'guardian');
    LEGACY_MODE_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 저장소 사용 불가(사생활 보호 모드 등) */
  }
}
export function clearUserMode() {
  try {
    localStorage.removeItem(MODE_KEY);
    LEGACY_MODE_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 무시 */
  }
}
export function isUserModeKey(key: string | null) {
  return key === null || key === MODE_KEY || LEGACY_MODE_KEYS.includes(key);
}

// ---------- 비로그인으로 낸 신청서 (apply 가 14일간 기억) ----------
const PENDING_APPS_KEY = 'wb_pending_applications';
type PendingApp = { id: string; at: number };

export function readPendingApplications(): PendingApp[] {
  try {
    const now = Date.now();
    const list = JSON.parse(localStorage.getItem(PENDING_APPS_KEY) || '[]');
    return (Array.isArray(list) ? list : []).filter(
      (x: PendingApp) => x && typeof x.id === 'string' && now - x.at < 14 * 864e5,
    );
  } catch {
    return [];
  }
}
export function writePendingApplications(list: PendingApp[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_APPS_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_APPS_KEY);
  } catch {
    /* 무시 */
  }
}

// ---------- 로그인 후 돌아갈 곳 ----------
const POST_LOGIN_REDIRECT_KEY = 'wb_post_login_redirect';
/** 사이트 안의 '파일명' 또는 '파일명.html'(+쿼리)만 허용 — 외부 주소로 보내는 open redirect 방지 */
export function isSafeLocalRedirect(target: unknown): target is string {
  return typeof target === 'string' && /^[A-Za-z0-9_-]+(?:\.html)?(?:\?[^\s'"<>]*)?$/.test(target);
}
export function rememberPostLoginRedirect(target: string) {
  if (!isSafeLocalRedirect(target)) return;
  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, target);
  } catch {
    /* 무시 */
  }
}
export function consumePostLoginRedirect(): string | null {
  try {
    const target = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if (target) sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return isSafeLocalRedirect(target) ? target : null;
  } catch {
    return null;
  }
}

// ---------- 로그아웃 시 지울 케어 관련 로컬 데이터 (공용 PC 대비) ----------
const LOCAL_CARE_KEYS = ['wb_care_checkpoints', 'wb_schedule_proposals', 'wb_manager_dismissed_requests'];
export function clearLocalCareData() {
  LOCAL_CARE_KEYS.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* 무시 */
    }
  });
}

/** 저장된 로그인 토큰이 있을 가능성이 있는지 (확정 전 헤더 깜빡임 방지용) */
export function maybeLoggedIn(): boolean {
  try {
    if (/access_token=/.test(location.hash)) return true;
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.*-auth-token$/.test(localStorage.key(i) || '')) return true;
    }
  } catch {
    /* 무시 */
  }
  return false;
}

// ---------- 이용약관 동의 기록 (이 브라우저에 '어느 버전에 동의했는지'만 — 서버 기록 아님) ----------
const TERMS_KEY = 'wb_terms_agreed';
export function recordTermsAgreement(version: string) {
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify({ version, at: new Date().toISOString() }));
  } catch {
    /* 무시 */
  }
}

// ---------- 사용자가 직접 로그아웃 중인지 (페이지별 'SIGNED_OUT → 로그인 화면' 이동과 구분) ----------
let loggingOut = false;
export function markLoggingOut(v: boolean) {
  loggingOut = v;
}

/** 로그아웃 직후 다른 페이지로 이동하는 경우(예: 마이페이지 → 메인) 도착한 페이지에서 '로그아웃되었습니다'
 *  안내 모달을 한 번 띄우기 위한 표시. 이 탭에서만 유효합니다(sessionStorage). */
const LOGOUT_NOTICE_KEY = 'wb_logout_notice';
export function rememberLogoutNotice() {
  try {
    sessionStorage.setItem(LOGOUT_NOTICE_KEY, '1');
  } catch {
    /* 저장소를 쓸 수 없으면 안내만 생략 */
  }
}
export function consumeLogoutNotice(): boolean {
  try {
    const v = sessionStorage.getItem(LOGOUT_NOTICE_KEY);
    if (v) sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
    return v === '1';
  } catch {
    return false;
  }
}
export function isLoggingOut() {
  return loggingOut;
}
