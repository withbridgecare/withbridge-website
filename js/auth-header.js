/* =========================================================
   위드브릿지 공통 인증 헤더 (index.html / login.html 공용)
   - Supabase 클라이언트를 페이지당 1개만 생성해 window.WBAuth.client 로 공유
   - getSession() + onAuthStateChange() 로 로그인 상태를 감지
   - 로그인: '로그인 | 회원가입' → 프로필 아바타 버튼 + 드롭다운(모드 전환 · 마이페이지 · 로그아웃)
     · managers 에 등록된 매니저만(사용자 이름 바로 아래, '마이페이지' 위):'케어 매니저 모드로 전환' ↔ '보호자 모드로 전환' (선택은 localStorage 'active_role')
     · 매니저가 아닌 회원에게는 전환 항목을 보여 주지 않음
   - 로그아웃: signOut() 후 '로그인 | 회원가입' 복원
   사용 조건: Supabase SDK <script> 뒤에 로드, 헤더의 우측 영역에 class="auth-buttons"
========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://layvjisfeivkzowopkco.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_M7wpIAR7-aXvG78Xv-WBoQ_q1wj_FcR';

  var DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44">' +
    '<rect width="44" height="44" fill="#E5E7EB"/>' +
    '<circle cx="22" cy="17" r="8" fill="#9CA3AF"/>' +
    '<path d="M6 44c0-9 7-15 16-15s16 6 16 15z" fill="#9CA3AF"/>' +
    '</svg>'
  );

  var sdk = window.supabase;
  if (!sdk || !sdk.createClient) {
    console.error('[WBAuth] Supabase SDK 가 로드되지 않았습니다. SDK <script> 가 auth-header.js 보다 먼저 있어야 합니다.');
    window.WBAuth = { client: null };
    return;
  }

  // 클라이언트는 스크립트 실행 즉시 생성 (OAuth 리다이렉트의 #access_token 을 SDK 가 바로 세션으로 처리)
  var client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- 스타일 (드롭다운 항목 + 로그인 헤더 깜빡임 방지) ----------
  var style = document.createElement('style');
  style.textContent =
    '.wb-profile-item{display:block;width:100%;box-sizing:border-box;padding:10px 14px;border:none;border-radius:8px;' +
    'background:transparent;font-family:"Noto Sans KR",sans-serif;font-size:15px;font-weight:500;color:#1A1D21;' +
    'text-align:left;text-decoration:none;cursor:pointer}' +
    '.wb-profile-item:hover{background-color:#F1F5F0}' +
    // 모드 전환 항목: 박스/테두리 없이 일반 메뉴 항목과 같은 톤(hover 색만 살짝 다르게)으로 자연스럽게 어우러지도록
    '.wb-mode-sec{padding:0 0 6px;margin-bottom:6px;border-bottom:1px solid #F3F4F6}' +
    '.wb-mode-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:10px 14px;' +
    'border:none;border-radius:8px;background:transparent;font-family:"Noto Sans KR",sans-serif;' +
    'text-align:left;text-decoration:none;cursor:pointer;transition:background .15s}' +
    '.wb-mode-item:hover{background:#F8FAFC}' +
    '.wb-mode-item:focus-visible,.wb-profile-item:focus-visible{outline:3px solid rgba(85,107,47,.45);outline-offset:1px}' +
    // 전환 아이콘: 칩/원형 배경 없이 옅은 그레이 선(line) 아이콘만 (w-4 h-4 상당)
    '.wb-mode-item .wb-mode-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:#6B7280}' +
    '.wb-mode-item .wb-mode-icon svg{display:block;width:16px;height:16px}' +
    '.wb-mode-item .wb-mode-label{flex:1 1 auto;min-width:0;font-size:14px;font-weight:600;color:#1F2937;' +
    'line-height:1.3;word-break:keep-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    // 우측 미니 뱃지: 지금 어느 모드인지 (보호자=블루, 매니저=브랜드 그린)
    '.wb-mode-item .wb-mode-badge{flex:none;font-size:11px;font-weight:500;padding:2px 8px;border-radius:9999px;white-space:nowrap}' +
    '.wb-mode-item .wb-mode-badge.is-guardian{color:#2563EB;background:#EFF6FF}' +
    '.wb-mode-item .wb-mode-badge.is-manager{color:#556B2F;background:#F1F5F0}' +
    'html.wb-auth-pending .auth-buttons{visibility:hidden}';
  document.head.appendChild(style);

  // 세션이 있을 가능성이 높을 때(리다이렉트 해시 / 저장된 토큰)만, 상태 확정 전까지 헤더 링크를 숨김
  function maybeLoggedIn() {
    try {
      if (/access_token=/.test(location.hash)) return true;
      for (var i = 0; i < localStorage.length; i++) {
        if (/^sb-.*-auth-token$/.test(localStorage.key(i))) return true;
      }
    } catch (e) { /* localStorage 접근 불가 시 무시 */ }
    return false;
  }

  var root = document.documentElement;
  function clearPending() { root.classList.remove('wb-auth-pending'); }
  if (maybeLoggedIn()) {
    root.classList.add('wb-auth-pending');
    setTimeout(clearPending, 2000); // 어떤 이유로든 상태 확인이 지연돼도 헤더가 영구히 숨지 않도록
  }

  // ---------- 화면 모드 전환 (보호자 ↔ 케어 매니저) ----------
  var GUARDIAN_PAGE = 'mypage.html';
  var MANAGER_PAGE = 'mypage-manager.html';
  // 이 사용자가 managers 에 등록돼 있는지: 서버 조회가 끝나면 그 결과로 메뉴를 그립니다.
  // 조회가 오래 걸려도 끝나는 즉시 항목이 나타나고, 조회 자체가 실패하면(네트워크/일시 오류) '아님'으로 굳히지 않고 몇 번 다시 시도합니다.
  var knownIsManager = null; // null = 아직 모름(확인 중/실패), true = 매니저, false = 매니저 아님
  var MANAGER_CHECK_RETRIES = 3;
  function startManagerCheck(userId, key, attempt) {
    lookupManager(userId).then(function (state) {
      if (renderedKey !== key) return; // 그 사이 로그아웃했거나 다른 사용자로 바뀜
      if (state === 'error') {
        if (attempt < MANAGER_CHECK_RETRIES) {
          setTimeout(function () { startManagerCheck(userId, key, attempt + 1); }, 1500 * (attempt + 1));
        }
        return; // knownIsManager 는 null 그대로 → 항목을 그리지 않음 (fail closed)
      }
      knownIsManager = state === 'yes';
      fillModeSection();
    });
  }

  // 모드 전환 항목의 아이콘: 서로 맞물린 두 화살표(repeat) 선 아이콘. 색은 부모의 color(브랜드 그린)를 따라갑니다.
  var SWITCH_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/>' +
    '<path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>' +
    '</svg>';

  // 화면 이동 (테스트에서 바꿔 끼울 수 있도록 한 곳으로 모음)
  function navigate(url) { window.location.href = url; }

  // 지금 보고 있는 '화면'(역할): 마이페이지 두 곳은 주소로 판단하고, 그 밖의 페이지(메인 등)는 저장된 선택을 따릅니다.
  function currentRole() {
    var path = location.pathname;
    if (/\/mypage-manager(\.html)?$/.test(path)) return 'manager';
    if (/\/mypage(\.html)?$/.test(path)) return 'guardian';
    return getUserMode();
  }

  function switchMode(role) {
    setUserMode(role); // localStorage 'active_role' ('guardian' | 'manager')
    closeMenu();
    // 매니저 화면은 이동한 뒤 자체적으로 서버에서 자격을 다시 확인합니다 (통과하지 못하면 보호자 화면으로 되돌림)
    window.WBAuth.navigate(role === 'manager' ? MANAGER_PAGE : GUARDIAN_PAGE);
  }

  // 드롭다운의 '모드 전환' 영역을 채움 (확인이 끝난 뒤, 그리고 다른 탭에서 역할이 바뀔 때 다시 호출)
  // managers 에 등록된 사용자에게는 localStorage 값과 상관없이 항상 보이고(certification_verified 여부와도 무관),
  // 그 외(일반 회원 · 확인 중 · 확인 실패)에는 영역 전체를 숨깁니다.
  function fillModeSection() {
    var sec = document.getElementById('wbModeSection');
    if (!sec || knownIsManager === null) return;
    sec.textContent = '';
    var mp = document.getElementById('wbMyPageLink');

    if (!knownIsManager) {
      sec.hidden = true;
      if (mp) mp.href = GUARDIAN_PAGE;
      return;
    }

    var here = currentRole();
    var target = here === 'manager' ? 'guardian' : 'manager';

    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'wb-mode-item';
    el.setAttribute('role', 'menuitem');
    el.addEventListener('click', function () { switchMode(target); });

    var iconEl = document.createElement('span');
    iconEl.className = 'wb-mode-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = SWITCH_ICON_SVG; // 고정된 정적 SVG 문자열 (사용자 입력이 들어가지 않음)
    var labelEl = document.createElement('span');
    labelEl.className = 'wb-mode-label';
    labelEl.textContent = target === 'manager' ? '케어 매니저 모드로 전환' : '보호자 모드로 전환';
    var badgeEl = document.createElement('span');
    badgeEl.className = 'wb-mode-badge ' + (here === 'manager' ? 'is-manager' : 'is-guardian');
    badgeEl.textContent = here === 'manager' ? '현재 매니저 모드' : '현재 보호자 모드';
    el.appendChild(iconEl);
    el.appendChild(labelEl);
    el.appendChild(badgeEl);
    sec.appendChild(el);
    sec.hidden = false;

    // '마이페이지' 링크도 지금 역할의 화면으로
    if (mp) mp.href = here === 'manager' ? MANAGER_PAGE : GUARDIAN_PAGE;
  }

  // ---------- 헤더 렌더링 ----------
  var loggedOutMarkup = null;
  var renderedKey = null;

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function getContainer() { return document.querySelector('.auth-buttons'); }

  function closeMenu() {
    var menu = document.getElementById('profileMenu');
    var btn = document.getElementById('profileBtn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    var menu = document.getElementById('profileMenu');
    var btn = document.getElementById('profileBtn');
    if (!menu || !btn) return;
    var open = menu.style.display === 'none';
    menu.style.display = open ? 'block' : 'none';
    btn.setAttribute('aria-expanded', String(open));
  }

  function renderLoggedIn(user) {
    var container = getContainer();
    if (!container) return;

    var meta = user.user_metadata || {};
    var avatarUrl = meta.avatar_url || meta.picture || meta.profile_image || '';
    // 카카오는 http:// 이미지 URL 을 주는 경우가 있어 https 로 보정 (mixed content 방지)
    avatarUrl = avatarUrl ? avatarUrl.replace(/^http:\/\//i, 'https://') : DEFAULT_AVATAR;

    var name = meta.name || meta.full_name || meta.nickname || meta.preferred_username ||
               (user.email ? user.email.split('@')[0] : '회원');

    // 같은 사용자/이미지라면 다시 그리지 않음 (토큰 갱신 때 열려 있는 드롭다운이 닫히지 않도록)
    var key = user.id + '|' + avatarUrl + '|' + name;
    if (renderedKey === key && document.getElementById('profileBtn')) return;
    renderedKey = key;

    container.textContent = '';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';

    var btn = document.createElement('button');
    btn.id = 'profileBtn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', '내 메뉴 열기');
    btn.style.cssText = 'width:44px;height:44px;padding:0;border-radius:50%;border:1px solid #e5e7eb;background:#f3f4f6;overflow:hidden;cursor:pointer;display:block;';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });

    var img = document.createElement('img');
    img.alt = '프로필 이미지';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.onerror = function () { img.onerror = null; img.src = DEFAULT_AVATAR; }; // 로드 실패 시 기본 아바타
    img.src = avatarUrl;
    btn.appendChild(img);

    var menu = document.createElement('div');
    menu.id = 'profileMenu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'display:none;position:absolute;top:calc(100% + 12px);right:0;min-width:232px;max-width:calc(100vw - 32px);padding:6px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.12);z-index:100;';
    menu.addEventListener('click', function (e) { e.stopPropagation(); });

    // 드롭다운 상단: 로그인한 사용자 이름
    var who = document.createElement('div');
    who.style.cssText = 'padding:10px 14px 12px;margin-bottom:4px;border-bottom:1px solid #f1f1f1;font-size:14px;font-weight:700;color:#1A1D21;word-break:keep-all;';
    who.textContent = name + '님';
    menu.appendChild(who);

    var myPage = document.createElement('a');
    myPage.id = 'wbMyPageLink';
    myPage.href = GUARDIAN_PAGE;
    myPage.className = 'wb-profile-item';
    myPage.setAttribute('role', 'menuitem');
    myPage.textContent = '마이페이지';

    var logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'wb-profile-item';
    logoutBtn.setAttribute('role', 'menuitem');
    logoutBtn.textContent = '로그아웃';
    logoutBtn.addEventListener('click', logout);

    // 모드 전환 영역(사용자 이름 바로 아래, '마이페이지' 위): managers 조회가 끝나기 전에는 숨겨 두었다가, 매니저로 확인되면 채웁니다
    var modeSec = document.createElement('div');
    modeSec.id = 'wbModeSection';
    modeSec.className = 'wb-mode-sec';
    modeSec.hidden = true;

    menu.appendChild(modeSec);
    menu.appendChild(myPage);
    menu.appendChild(logoutBtn);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    container.appendChild(wrap);

    // managers 등록 여부 확인(서버) → 등록된 매니저면 '케어 매니저 모드로 전환' / '보호자 모드로 전환' 표시
    knownIsManager = null;
    startManagerCheck(user.id, key, 0);
  }

  function renderLoggedOut() {
    var container = getContainer();
    if (!container) return;
    if (document.getElementById('profileBtn') && loggedOutMarkup !== null) {
      container.innerHTML = loggedOutMarkup;
    }
    renderedKey = null;
    knownIsManager = null;        // 다음에 로그인하는 사람은 새로 확인
  }

  // 세션 유무에 맞춰 헤더 갱신 (DOM 준비 전에 호출돼도 준비 후 반영)
  function applySession(session) {
    whenReady(function () {
      if (session && session.user) renderLoggedIn(session.user);
      else renderLoggedOut();
      clearPending();
    });
    // 로그인 세션이 확인되면(카카오 로그인 직후 포함) 비로그인으로 냈던 신청을 내 계정에 연결
    if (session && session.user) claimPendingApplications();
  }

  async function logout() {
    closeMenu();
    // 이 로그아웃이 '사용자가 직접 누른 것'임을 알려, 페이지별 SIGNED_OUT 리다이렉트(예: 마이페이지 → login.html)와 구분
    window.WBAuth.loggingOut = true;
    var res = await client.auth.signOut();
    if (res && res.error) {
      window.WBAuth.loggingOut = false;
      alert('로그아웃 중 오류가 발생했습니다: ' + res.error.message);
      return;
    }
    clearUserMode();
    applySession(null);
    // <body data-logout-redirect="index.html"> 처럼 지정된 페이지는 로그아웃 후 해당 주소로 이동
    var redirect = document.body && document.body.getAttribute('data-logout-redirect');
    if (redirect) {
      window.location.href = redirect;
      return;
    }
    window.WBAuth.loggingOut = false;
    alert('로그아웃 되었습니다.');
  }

  // ---------- 초기화 ----------
  // 로그아웃 상태의 원본 마크업을 먼저 보관 (whenReady 콜백은 등록 순서대로 실행되므로 applySession 보다 앞선다)
  whenReady(function () {
    var container = getContainer();
    if (container && loggedOutMarkup === null) loggedOutMarkup = container.innerHTML;
  });

  // 드롭다운 바깥 클릭 / ESC 로 닫기
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  // 1) 현재 세션 확인 (저장된 세션 또는 OAuth 리다이렉트의 #access_token)
  client.auth.getSession().then(function (res) {
    applySession(res && res.data ? res.data.session : null);
  }).catch(function (err) {
    console.error('[WBAuth] getSession 실패:', err);
    clearPending();
  });

  // 2) 이후 로그인/로그아웃/토큰 갱신 및 다른 탭의 변경 감지
  client.auth.onAuthStateChange(function (event, session) {
    // 로그아웃(다른 탭 포함)하면 화면 모드 설정도 지움 → 같은 브라우저에서 다른 계정이 매니저 모드로 시작하지 않게
    if (event === 'SIGNED_OUT') clearUserMode();
    applySession(session);
  });

  // ---------- 매니저 자격 확인 (mypage.html / mypage-manager.html 공용) ----------
  // 기준은 '서버(DB)'입니다: managers 테이블에 내 행(id = 로그인 UUID)이 있는가. (자격 인증 여부와는 무관)
  // (RLS 가 '내 행'만 돌려주므로 브라우저에서 조작할 수 없습니다. 행은 운영자만 추가할 수 있습니다)
  //  * user_metadata / localStorage 는 사용자가 브라우저에서 직접 고칠 수 있으므로 권한 판단에 쓰지 않습니다.
  //  * 두 마이페이지와 드롭다운이 서로 다른 기준을 쓰면 사용자가 두 페이지를 끝없이 오가게 됩니다.
  //    반드시 이 함수(또는 lookupManager) 하나만 사용하세요.
  //  * 이 함수는 화면을 보여줄지/막을지 결정하는 용도이고, 실제 데이터 보호는 DB 규칙(RLS·is_manager())이 담당합니다.
  //  * 확인에 실패하면(네트워크 오류 등) '매니저 아님'으로 처리합니다 (fail closed).
  // lookupManager: 'yes'(managers 에 내 행이 있음) | 'no'(행이 없음) | 'error'(조회 자체가 실패 — 아직 모름)
  // 'no' 와 'error' 를 구분하는 이유: 일시적인 네트워크 오류를 '매니저 아님'으로 굳혀 버리면 메뉴가 계속 안 보이기 때문입니다.
  async function lookupManager(userId) {
    try {
      var query = client.from('managers').select('id, certification_verified');
      if (userId) query = query.eq('id', userId);
      var res = await query.maybeSingle();
      if (res.error) {
        console.warn('[WBAuth] managers 조회 실패(권한/RLS 또는 네트워크):', res.error.code, res.error.message);
        return 'error';
      }
      if (!res.data) {
        console.info('[WBAuth] managers 에 이 계정(' + userId + ')의 행이 없습니다 → 매니저 아님. ' +
                     '매니저로 쓰려면 managers 에 id = 이 UUID 인 행을 추가하세요.');
        return 'no';
      }
      if (res.data.certification_verified !== true) {
        // 행이 있으면 매니저로 취급(전환 메뉴 표시). 인증 전이면 매니저 화면에 '자격 확인 중'으로 표시되고,
        // 배정 데이터는 DB 규칙(is_manager())상 인증 완료 후에 보입니다.
        console.info('[WBAuth] managers 에 행이 있으나 certification_verified 가 아직 true 가 아닙니다. 인증을 마치려면: ' +
                     "update public.managers set certification_verified = true where id = '" + userId + "';");
      }
      return 'yes';
    } catch (e) {
      console.warn('[WBAuth] managers 조회 중 예외:', e);
      return 'error';
    }
  }
  async function checkIsManager(userId) {
    return (await lookupManager(userId)) === 'yes'; // 실패('error')는 매니저 아님으로 처리 (fail closed)
  }

  // ---------- 화면 모드 (보호자 ↔ 매니저) ----------
  // localStorage 'active_role' ('guardian' | 'manager') 에 저장되는 '어느 화면을 볼지'에 대한 개인 설정일 뿐, 권한이 아닙니다.
  // 값이 없거나 이상하면 'guardian'. 'manager' 는 checkIsManager() 를 통과한 사람에게만 실제로 적용됩니다.
  // (이전 버전이 쓰던 'active_mode' / 'user_mode' 에 'manager' 가 저장돼 있으면 한 번 그대로 이어받습니다)
  var MODE_KEY = 'active_role';
  var LEGACY_MODE_KEYS = ['active_mode', 'user_mode'];
  function getUserMode() {
    try {
      var v = localStorage.getItem(MODE_KEY);
      for (var i = 0; v === null && i < LEGACY_MODE_KEYS.length; i++) v = localStorage.getItem(LEGACY_MODE_KEYS[i]);
      return v === 'manager' ? 'manager' : 'guardian';
    } catch (e) { return 'guardian'; }
  }
  function removeLegacyModes() { LEGACY_MODE_KEYS.forEach(function (k) { localStorage.removeItem(k); }); }
  function setUserMode(mode) {
    try {
      localStorage.setItem(MODE_KEY, mode === 'manager' ? 'manager' : 'guardian');
      removeLegacyModes();
    } catch (e) { /* 저장소 사용 불가(사생활 보호 모드 등) 시 무시 */ }
  }
  function clearUserMode() {
    try { localStorage.removeItem(MODE_KEY); removeLegacyModes(); } catch (e) { /* 무시 */ }
  }

  // ---------- 비로그인으로 낸 신청서 → 로그인 후 내 계정에 연결 ----------
  // apply.html 은 계정에 연결되지 않은 채 접수된 신청서의 id 를 이 브라우저(localStorage 'wb_pending_applications')에 14일간 기억해 둡니다.
  // 카카오 로그인/회원가입 뒤 어느 페이지에서든 로그인 세션이 확인되면, 그 id 들로 DB 함수 claim_service_applications() 를 호출해
  // user_id 를 내 계정으로 채웁니다 (supabase-claim-applications.sql). 처리한 id 는 기억에서 지우고, 화면이 새로 불러오도록 이벤트를 보냅니다.
  var PENDING_APPS_KEY = 'wb_pending_applications';
  var claimingApps = false;
  function readPendingApplications() {
    try {
      var now = Date.now();
      var list = JSON.parse(localStorage.getItem(PENDING_APPS_KEY) || '[]');
      return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x.id === 'string' && now - x.at < 14 * 864e5; });
    } catch (e) { return []; }
  }
  function writePendingApplications(list) {
    try {
      if (list.length) localStorage.setItem(PENDING_APPS_KEY, JSON.stringify(list));
      else localStorage.removeItem(PENDING_APPS_KEY);
    } catch (e) { /* 저장소를 쓸 수 없으면 무시 */ }
  }
  async function claimPendingApplications() {
    if (claimingApps) return;
    var list = readPendingApplications();
    if (!list.length) return;
    claimingApps = true;
    try {
      // 로그인 세션이 있을 때만 진행 (없는 상태에서 호출하면 아무것도 연결되지 않는데 기억만 지워 버릴 수 있으므로)
      var s = await client.auth.getSession();
      if (!(s && s.data && s.data.session)) return;

      var ids = list.map(function (x) { return x.id; });
      var res = await client.rpc('claim_service_applications', { p_ids: ids });
      if (res.error) {
        // 함수가 아직 없거나(PGRST202) 권한 문제: 기억은 지우지 않고 다음 페이지에서 다시 시도
        console.warn('[신청 연결] claim_service_applications() 호출 실패 → 나중에 다시 시도합니다:', res.error.code, res.error.message,
                     '→ supabase-claim-applications.sql 을 실행했는지 확인하세요.');
        return;
      }
      var claimed = res.data || [];
      console.log('[신청 연결] 로그인 계정에 연결된 신청:', claimed, '(이 브라우저가 기억하던 ' + ids.length + '건 처리)');
      // 연결된 것은 물론, 이미 다른 계정에 연결됐거나 기간이 지난 것도 다시 시도해 봐야 소용없으므로 기억에서 모두 지움
      writePendingApplications(readPendingApplications().filter(function (x) { return ids.indexOf(x.id) < 0; }));
      if (claimed.length) window.dispatchEvent(new CustomEvent('wb-applications-claimed', { detail: { ids: claimed } }));
    } catch (e) {
      console.warn('[신청 연결] 처리 중 오류 → 나중에 다시 시도합니다:', e);
    } finally {
      claimingApps = false;
    }
  }

  // 다른 탭에서 역할이 바뀌면 이 탭의 드롭다운 문구('…모드로 전환')도 맞춰 갱신
  window.addEventListener('storage', function (e) {
    if (e.key === MODE_KEY || LEGACY_MODE_KEYS.indexOf(e.key) !== -1 || e.key === null) fillModeSection();
  });

  window.WBAuth = {
    client: client, logout: logout, checkIsManager: checkIsManager,
    getUserMode: getUserMode, setUserMode: setUserMode, navigate: navigate, claimPendingApplications: claimPendingApplications, loggingOut: false
  };
})();
