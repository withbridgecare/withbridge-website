/* =========================================================
   위드브릿지 공통 인증 헤더 (index.html / login.html 공용)
   - Supabase 클라이언트를 페이지당 1개만 생성해 window.WBAuth.client 로 공유
   - getSession() + onAuthStateChange() 로 로그인 상태를 감지
   - 로그인: '로그인 | 회원가입' → 프로필 아바타 버튼 + 드롭다운(모드 전환 · 마이페이지[+어르신 프로필 관리·
     내 정보 수정 서브 바로가기] · 어드민 콘솔 · CS 메뉴[1:1 문의하기·FAQ] · 로그아웃)
     · managers 에 등록된 매니저만(사용자 이름 바로 아래, '마이페이지' 위):'케어 매니저 모드로 전환' ↔ '보호자 모드로 전환' (선택은 localStorage 'active_role')
     · 매니저가 아닌 회원에게는 전환 항목을 보여 주지 않음
     · '내 정보 수정'은 모달이 아니라 전용 페이지(profile-edit.html)로 이동합니다
   - 로그아웃: signOut() 후 '로그인 | 회원가입' 복원
   사용 조건: Supabase SDK <script> 뒤에 로드, 헤더의 우측 영역에 class="auth-buttons"
========================================================= */
(function () {
  'use strict';

  // Dev/Prod Supabase 프로젝트 전환 — withbridge-dev 로 테스트할 때 코드를 고치지 않고 "어느
  // 도메인에서 열렸는지"만으로 맞는 프로젝트를 자동으로 바라보게 합니다. 같은 값이 저장소 루트의
  // .env.development/.env.production 에 사람이 읽을 문서로도 남아 있습니다 — 이 사이트는 빌드
  // 과정이 없는 정적 HTML/JS라 그 파일을 직접 읽을 수 없어, 여기 두 세트 값으로 직접 분기합니다.
  // PROD_HOSTNAMES 가 아니면 전부 dev 로 간주합니다("모르면 dev"가 안전한 기본값 — localhost·
  // Vercel 프리뷰 배포가 실수로 프로덕션 DB를 건드리지 않게). 단, DEV 값을 아직 안 채웠으면(여전히
  // placeholder) 깨지는 대신 조용히 프로덕션으로 폴백합니다 — DEV 값을 채우기 전까지는 지금까지와
  // 동작이 완전히 같습니다.
  //
  // ⚠ DEV 값이 비어 있는 지금은, apply.html/mypage.html 을 포함한 "이 파일을 로드하는 모든 페이지"가
  // 예외 없이 똑같은 PROD 로 폴백합니다(아래 if 조건이 isProdHost 값과 무관하게 항상 true가 됨 —
  // `!devConfigured` 가 이미 true 라서). 즉 지금 이 코드 상태에서는 apply.html 과 mypage.html 이
  // "서로 다른 Supabase 프로젝트를 본다"는 일이 구조적으로 아예 일어날 수 없습니다 — 두 페이지 다
  // window.WBAuth.client 하나(이 즉시실행함수가 끝에서 한 번만 만드는 클라이언트)를 그대로 가져다
  // 쓰므로, "어르신 프로필이 마이페이지에 안 보이는" 문제의 원인은 이 DEV/PROD 분기가 아닙니다 —
  // 실제 원인 후보는 mypage.html loadSeniors() 에 이미 추가된 세션/user_id 교차 확인 로그 쪽을
  // 먼저 보세요. 이 경고 자체는 "아직 DEV 프로젝트를 안 만들었다"는 안내일 뿐, 두 페이지 사이의
  // 불일치를 뜻하지 않습니다.
  var ENV_CONFIG = (function () {
    var PROD = { url: 'https://layvjisfeivkzowopkco.supabase.co', anonKey: 'sb_publishable_M7wpIAR7-aXvG78Xv-WBoQ_q1wj_FcR' };
    // withbridge-dev 프로젝트를 실제로 만들어 쓸 계획이라면, Supabase 대시보드 → 그 프로젝트 →
    // Project Settings → API 에 있는 "Project URL"과 "anon public" 키를 복사해 아래 두 줄에 그대로
    // 채우세요(placeholder 를 지우고 실제 값으로 바꾸는 것 — 이 리포지토리 안에는 그 값이 어디에도
    // 없어, Claude 가 대신 채워 넣을 수 없습니다. 추측값을 넣으면 로그인 자체가 깨집니다).
    var DEV = { url: 'https://<YOUR-DEV-PROJECT-REF>.supabase.co', anonKey: '<YOUR-DEV-PROJECT-ANON-KEY>' };
    // 커스텀 도메인을 연결하면 그 도메인도 여기 추가하세요(예: 'www.withbridge.co.kr').
    var PROD_HOSTNAMES = ['withbridgewebsite.vercel.app'];
    var isProdHost = PROD_HOSTNAMES.indexOf(location.hostname) !== -1;
    var devConfigured = DEV.url.indexOf('<YOUR-') === -1;
    if (isProdHost || !devConfigured) {
      if (!isProdHost) console.warn('[WBAuth] DEV Supabase 값이 아직 설정되지 않아 프로덕션 프로젝트로 폴백합니다(이 페이지뿐 아니라 ' +
        'auth-header.js 를 로드하는 모든 페이지가 동일하게 폴백하므로, 페이지 간 프로젝트 불일치는 아닙니다). ' +
        'DEV 를 실제로 쓰려면 js/auth-header.js 상단 ENV_CONFIG.DEV 를 withbridge-dev 프로젝트의 실제 URL/anon key 로 채우세요.');
      return PROD;
    }
    return DEV;
  })();
  var SUPABASE_URL = ENV_CONFIG.url;
  var SUPABASE_ANON_KEY = ENV_CONFIG.anonKey;
  // 지금 이 페이지가 실제로 어느 프로젝트를 바라보는지 항상 남깁니다 — apply.html 콘솔과 mypage.html
  // 콘솔에서 이 한 줄을 각각 확인하면, 둘이 같은 URL 인지 바로(추측 없이) 눈으로 비교할 수 있습니다.
  console.log('[WBAuth] 이 페이지가 사용 중인 Supabase 프로젝트 URL=' + SUPABASE_URL);

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

  // ---------- 스타일 (카드형 드롭다운 + 로그인 헤더 깜빡임 방지) ----------
  // 레퍼런스 디자인(둥근 카드 안에 카드가 겹친 구조 · backdrop-blur · 모드 전환 뱃지 · 레드 로그아웃)을
  // React/shadcn 없이 순수 CSS 클래스로 재현합니다. 색상은 이 사이트의 메인 브랜드 그린(#2D6A4F 계열)을 그대로 씁니다.
  var style = document.createElement('style');
  style.textContent =
    // 바깥 패널: 더 넓고 여백이 넉넉한 rounded-3xl 카드 + backdrop-blur
    '.wb-dd-panel{position:absolute;top:calc(100% + 12px);right:0;width:326px;max-width:calc(100vw - 32px);' +
    'padding:10px;background:rgba(250,250,251,.96);border:1px solid #F0F1F3;border-radius:22px;' +
    'box-shadow:0 28px 56px rgba(15,23,42,.18),0 4px 10px rgba(15,23,42,.05);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);z-index:100}' +
    // 안쪽 섹션 카드(프로필 / 메뉴 / 로그아웃) — 패딩을 넉넉히 줘 한층 여유 있는 인상을 줍니다
    '.wb-dd-card{background:#fff;border:1px solid #F1F1F1;border-radius:18px;box-shadow:0 1px 2px rgba(15,23,42,.03);padding:14px}' +
    '.wb-dd-card + .wb-dd-card{margin-top:8px}' +
    // 프로필 카드 상단: 아바타 + 이름/역할
    '.wb-dd-profile-top{display:flex;align-items:center;gap:12px;padding:4px 4px 12px;min-width:0}' +
    '.wb-dd-avatar{flex:none;width:46px;height:46px;border-radius:50%;overflow:hidden;border:2px solid #fff;' +
    'box-shadow:0 0 0 1px #E8EDE5;background:#F3F4F6}' +
    '.wb-dd-avatar img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.wb-dd-name{margin:0;font-size:15px;font-weight:800;letter-spacing:-.01em;color:#111827;word-break:keep-all}' +
    // 역할 표시를 작은 브랜드 톤 뱃지로 — 프로필 식별 영역임을 한눈에 구분시킵니다
    '.wb-dd-role{display:inline-flex;margin:5px 0 0;padding:2px 10px;border-radius:999px;background:#F1F5F0;' +
    'font-size:11px;font-weight:700;color:#4F6B3A;word-break:keep-all}' +
    // 모드 전환 버튼: 뱃지를 없앤 대신 영역 전체 폭을 쓰고, 안쪽 여백/아이콘-텍스트 간격을 넉넉히 둡니다
    // (현재 역할은 바로 위 프로필의 .wb-dd-role 에 이미 표시되므로 여기서는 전환 동작만 보여줍니다)
    '.wb-mode-item{display:flex;align-items:center;width:100%;box-sizing:border-box;' +
    'padding:13px 14px;border:1px solid #E4EBDF;border-radius:14px;background:#F1F5F0;cursor:pointer;transition:background-color .15s}' +
    '.wb-mode-item:hover{background:#E5EBDD}' +
    '.wb-mode-item:focus-visible,.wb-dd-item:focus-visible{outline:3px solid rgba(85,107,47,.45);outline-offset:1px}' +
    '.wb-mode-left{display:flex;align-items:center;gap:12px;min-width:0;font-size:13.5px;font-weight:700;color:#374151}' +
    '.wb-mode-left span:last-child{word-break:keep-all}' +
    '.wb-mode-icon{flex:none;display:inline-flex;color:#6B7280}' +
    '.wb-mode-icon svg{display:block;width:18px;height:18px}' +
    // 1차 메뉴 항목(마이페이지 · 어드민 콘솔 · 로그아웃): 굵은 글자 + hover 시 아이콘이 브랜드 그린으로 — 가장 눈에 띄는 위계
    '.wb-dd-item{display:flex;align-items:center;gap:11px;width:100%;box-sizing:border-box;padding:11px 12px;border:none;' +
    'border-radius:13px;background:transparent;font-family:"Noto Sans KR",sans-serif;font-size:13.5px;font-weight:700;' +
    'color:#374151;text-align:left;text-decoration:none;cursor:pointer;transition:background-color .15s}' +
    '.wb-dd-item:hover{background:#F3F4F6}' +
    '.wb-dd-item svg{flex:none;display:block;width:17px;height:17px;color:#8B95A1;transition:color .15s}' +
    '.wb-dd-item:hover svg{color:#556B2F}' +
    '.wb-dd-item.is-danger{color:#DC2626}' +
    '.wb-dd-item.is-danger svg{color:#EF4444}' +
    '.wb-dd-item.is-danger:hover{background:#FEF2F2}' +
    '.wb-dd-item.is-danger:hover svg{color:#DC2626}' +
    // 2차 서브 바로가기('어르신 프로필 관리' · '내 정보 수정'): 작은 점 마커 + 들여쓰기로 '마이페이지' 아래
    // 한 단계 낮은 위계임을 드러냅니다(아이콘 없이 텍스트만 — 1차 항목과는 글자 크기/굵기로 구분하되,
    // 색은 너무 희미하지 않게 #4B5563 로 — 가독성이 위계 표현보다 우선합니다).
    '.wb-dd-subitem{position:relative;display:block;width:100%;box-sizing:border-box;padding:8px 10px 8px 38px;border:none;' +
    'border-radius:11px;background:transparent;font-family:"Noto Sans KR",sans-serif;font-size:.875rem;' +
    'font-weight:600;color:#4B5563;text-align:left;text-decoration:none;cursor:pointer;transition:background-color .15s,color .15s}' +
    '.wb-dd-subitem::before{content:"";position:absolute;left:24px;top:50%;width:4px;height:4px;border-radius:50%;' +
    'background:#CBD2D9;transform:translateY(-50%);transition:background-color .15s}' +
    '.wb-dd-subitem:hover{background:#F9FAFB;color:#1F2937}' +
    '.wb-dd-subitem:hover::before{background:#8FA482}' +
    '.wb-dd-subitem:focus-visible{outline:3px solid rgba(85,107,47,.45);outline-offset:1px}' +
    // 3차 CS(고객 지원) 영역: 구분선 + 작은 캡션 라벨로 앞의 메뉴와 섹션 자체를 명확히 나눕니다 —
    // 라벨 자체는 소형·간결하게 유지하되, 위/아래 간격은 다른 항목들과 같은 리듬(12·10·6px)으로 정돈합니다.
    '.wb-dd-section-label{margin:12px 10px 6px;padding-top:10px;border-top:1px solid #F1F1F1;' +
    'font-size:10.5px;font-weight:800;letter-spacing:.05em;color:#B0B6BE;text-transform:uppercase}' +
    // CS 링크 텍스트도 서브 바로가기와 같은 색/크기로 통일(#4B5563, .875rem) — 아이콘도 같은 톤의
    // 진한 회색(#6B7280)으로 맞춰, 옅은 회색(#AEB4BC)이던 이전보다 또렷하게 보이게 합니다.
    '.wb-dd-item.is-slim{padding:8px 10px;font-size:.875rem;font-weight:600;color:#4B5563}' +
    '.wb-dd-item.is-slim svg{width:14px;height:14px;color:#6B7280}' +
    '.wb-dd-item.is-slim:hover{background:#F9FAFB;color:#1F2937}' +
    '.wb-dd-item.is-slim:hover svg{color:#4B5563}' +
    // '어드민 콘솔' 같은 권한부 항목을 감출 때 전용 클래스. HTML hidden 속성은 author stylesheet 의
    // .wb-dd-item{display:flex}(위) 나 드로어 버전의 인라인 style="display:flex" 보다 캐스케이드 우선순위가
    // 낮아 쉽게 뚫립니다(실제로 일반 계정에 어드민 링크가 보인 원인) — !important 로 두 경우를 모두 이깁니다.
    '.wb-hidden{display:none!important}' +
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
  // CS(고객 지원) 슬림 메뉴 링크 — index.html/mypage.html 하단 '자주 묻는 질문 & 1:1 고객센터 문의'
  // 배너와 같은 주소를 그대로 씁니다(사이트 전역에서 이미 쓰고 있는 표준 링크).
  var FAQ_PAGE = 'index.html#faq';
  var KAKAO_CHANNEL_URL = 'http://pf.kakao.com/_PKxemX';
  // 어르신 프로필 관리는 보호자 전용 기능이라(매니저 모드와 무관) mypage.html 의 '어르신 프로필 관리'
  // 탭으로 고정 이동합니다 — '마이페이지' 링크(.wb-mypage-link)처럼 모드에 따라 바뀌지 않습니다.
  var ELDER_PROFILE_PAGE = 'mypage.html?tab=elder';
  // '내 정보 수정' — 모달 대신 전용 페이지로 이동합니다(profile-edit.html, 이름/연락처 저장은
  // sql/profile_self_update.sql 의 update_user_profile() RPC).
  var PROFILE_EDIT_PAGE = 'profile-edit.html';
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

  // 어드민 콘솔 링크: profiles.role = 'admin' 인 계정에만 노출 (매니저 확인과 같은 재시도 패턴)
  var ADMIN_PAGE = '/admin.html';
  var knownIsAdmin = null; // null = 아직 모름(확인 중/실패), true = 관리자, false = 관리자 아님
  var ADMIN_CHECK_RETRIES = 3;
  function startAdminCheck(userId, key, attempt) {
    lookupAdmin(userId).then(function (state) {
      if (renderedKey !== key) return; // 그 사이 로그아웃했거나 다른 사용자로 바뀜
      if (state === 'error') {
        if (attempt < ADMIN_CHECK_RETRIES) {
          setTimeout(function () { startAdminCheck(userId, key, attempt + 1); }, 1500 * (attempt + 1));
        }
        return; // knownIsAdmin 은 null 그대로 → 항목을 그리지 않음 (fail closed)
      }
      knownIsAdmin = state === 'yes';
      fillAdminLink();
    });
  }

  // lookupAdmin: 'yes'(profiles.role === 'admin') | 'no' | 'error'(조회 자체가 실패 — 아직 모름)
  // DB 값과 비교하기 전에 trim + 소문자로 바꿔서 비교합니다 — Supabase 대시보드 Table Editor 에서
  // 손으로 값을 고치다 보면 ' admin'/'Admin' 처럼 공백·대소문자가 섞여 들어가기 쉽고, 그러면 코드의
  // 완전 일치(===) 비교만으로는 DB 에 'admin' 이 들어 있어도 'no' 로 오판하기 때문입니다.
  async function lookupAdmin(userId) {
    try {
      var res = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
      // profiles.role 조회 결과를 항상 콘솔에 남깁니다 — "DB 는 admin인데 화면은 아니다" 라는 보고가
      // 반복됐을 때, 코드가 실제로 어떤 값을 받았는지 바로 확인할 수 있어야 진단이 끝납니다.
      console.log('[WBAuth] profiles.role 조회 결과 (userId=' + userId + '):', res.error ? res.error : res.data);
      if (res.error) {
        console.error('[WBAuth] profiles.role 조회 실패(RLS 정책 또는 네트워크) → 관리자 아님으로 처리(fail closed):',
          res.error.code, res.error.message,
          '→ sql/supabase_schema_latest.sql 의 profiles_select_own 정책이 있는지, 세션이 유효한지 확인하세요.');
        return 'error';
      }
      // 'super_admin'(sql/super_admin_management.sql)도 admin.html 을 그대로 쓸 수 있으므로
      // 어드민 콘솔 링크를 함께 보여줍니다 — super_admin 전용 권한 관리 화면(super-admin.html)
      // 링크는 admin.html 안에서만(is_super_admin() 확인 후) 따로 노출됩니다.
      var role = String((res.data && res.data.role) || '').trim().toLowerCase();
      if (role !== 'admin' && role !== 'super_admin' && res.data) {
        console.warn('[WBAuth] profiles.role 이 "admin"/"super_admin" 이 아닙니다 (실제 값: ' + JSON.stringify(res.data.role) + ') → 어드민 콘솔 링크를 숨깁니다.');
      }
      return (role === 'admin' || role === 'super_admin') ? 'yes' : 'no';
    } catch (e) {
      console.error('[WBAuth] profiles.role 조회 중 예외:', e);
      return 'error';
    }
  }

  // 드롭다운의 '어드민 콘솔' 항목을 보이거나 숨김 (확인이 끝난 뒤 호출)
  // 데스크톱 드롭다운과 모바일 드로어 양쪽에 있을 수 있으므로(.wb-admin-link), 찾은 모든 인스턴스를 갱신합니다.
  function fillAdminLink() {
    if (knownIsAdmin === null) return; // 확인 전(또는 실패)에는 손대지 않음 → 기본 .wb-hidden 이 그대로 유지됨
    Array.prototype.forEach.call(document.querySelectorAll('.wb-admin-link'), function (link) {
      link.classList.toggle('wb-hidden', !knownIsAdmin);
    });
  }

  // 모드 전환 항목의 아이콘: 서로 맞물린 두 화살표(repeat) 선 아이콘. 색은 부모의 color(브랜드 그린)를 따라갑니다.
  var SWITCH_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/>' +
    '<path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>' +
    '</svg>';

  // 드롭다운 메뉴 항목 아이콘 (마이페이지 / 어드민 콘솔 / 로그아웃) — 고정된 정적 SVG 문자열, 사용자 입력 없음
  var USER_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>' +
    '</svg>';
  var SHIELD_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/>' +
    '</svg>';
  var LOGOUT_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' +
    '</svg>';
  // CS(고객 지원) 슬림 메뉴 아이콘 — '1:1 문의하기'(말풍선) / '자주 묻는 질문(FAQ)'(물음표)
  var CHAT_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
    '</svg>';
  var QUESTION_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12" y2="17.01"/>' +
    '</svg>';

  // 드롭다운 메뉴 한 줄(아이콘 + 라벨)을 만드는 공통 헬퍼 — a 태그(링크)와 button(액션) 둘 다 지원
  function buildDdItem(tag, opts) {
    var el = document.createElement(tag);
    if (tag === 'a') el.href = opts.href || '#';
    else el.type = 'button';
    if (opts.id) el.id = opts.id;
    el.className = 'wb-dd-item' + (opts.danger ? ' is-danger' : '');
    el.setAttribute('role', 'menuitem');
    // hidden 속성 대신 .wb-hidden(!important) 클래스를 씀 — 위 스타일 주석 참고
    if (opts.hidden) el.classList.add('wb-hidden');
    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = opts.icon;
    var label = document.createElement('span');
    label.textContent = opts.label;
    el.appendChild(icon);
    el.appendChild(label);
    if (opts.onClick) el.addEventListener('click', opts.onClick);
    return el;
  }

  // '마이페이지' 아래 들여쓴 소형 서브 바로가기 한 줄(아이콘 없이 텍스트만) — a 태그/button 둘 다 지원
  function buildDdSubItem(tag, opts) {
    var el = document.createElement(tag);
    if (tag === 'a') el.href = opts.href || '#';
    else el.type = 'button';
    el.className = 'wb-dd-subitem';
    el.setAttribute('role', 'menuitem');
    el.textContent = opts.label;
    if (opts.onClick) el.addEventListener('click', opts.onClick);
    return el;
  }

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
  // 데스크톱 드롭다운과 모바일 드로어 양쪽에 같은 역할의 요소(.wb-mode-section 등)가 있을 수 있으므로,
  // 찾은 모든 인스턴스를 같은 내용으로 채웁니다.
  function fillModeSection() {
    var secs = document.querySelectorAll('.wb-mode-section');
    if (!secs.length || knownIsManager === null) return;

    var here = currentRole();
    var target = here === 'manager' ? 'guardian' : 'manager';

    Array.prototype.forEach.call(document.querySelectorAll('.wb-dd-role'), function (roleEl) {
      roleEl.textContent = !knownIsManager ? '보호자 계정' : (here === 'manager' ? '케어 매니저' : '보호자 모드');
    });
    // '마이페이지' 링크도 지금 역할의 화면으로
    Array.prototype.forEach.call(document.querySelectorAll('.wb-mypage-link'), function (mp) {
      mp.href = !knownIsManager ? GUARDIAN_PAGE : (here === 'manager' ? MANAGER_PAGE : GUARDIAN_PAGE);
    });

    Array.prototype.forEach.call(secs, function (sec) {
      sec.textContent = '';
      if (!knownIsManager) { sec.hidden = true; return; }

      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'wb-mode-item';
      el.setAttribute('role', 'menuitem');
      el.addEventListener('click', function () { switchMode(target); });

      var left = document.createElement('span');
      left.className = 'wb-mode-left';
      var iconEl = document.createElement('span');
      iconEl.className = 'wb-mode-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.innerHTML = SWITCH_ICON_SVG; // 고정된 정적 SVG 문자열 (사용자 입력이 들어가지 않음)
      var labelEl = document.createElement('span');
      labelEl.textContent = target === 'manager' ? '케어 매니저 모드로 전환' : '보호자 모드로 전환';
      left.appendChild(iconEl);
      left.appendChild(labelEl);

      // '현재 매니저/보호자 모드' 뱃지는 제거했습니다 — 바로 위 프로필 이름 아래(.wb-dd-role)에
      // 이미 같은 정보가 표시되고 있어 중복이었습니다.
      el.appendChild(left);
      sec.appendChild(el);
      sec.hidden = false;
    });
  }

  // ---------- 헤더 렌더링 ----------
  // .auth-buttons 클래스는 데스크톱 헤더(카드형 드롭다운)와 모바일 드로어(펼쳐진 목록, class 에
  // wb-drawer-auth-buttons 도 함께 붙음) 양쪽에 있을 수 있어, 항상 전체를 찾아 같이 갱신합니다.
  var loggedOutMarkupMap = new WeakMap(); // 컨테이너 엘리먼트 -> 로그아웃 상태의 원본 마크업
  var renderedKey = null;

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function getContainers() { return document.querySelectorAll('.auth-buttons'); }

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
    var containers = getContainers();
    if (!containers.length) return;

    var meta = user.user_metadata || {};
    var avatarUrl = meta.avatar_url || meta.picture || meta.profile_image || '';
    // 카카오는 http:// 이미지 URL 을 주는 경우가 있어 https 로 보정 (mixed content 방지)
    avatarUrl = avatarUrl ? avatarUrl.replace(/^http:\/\//i, 'https://') : DEFAULT_AVATAR;

    var name = meta.name || meta.full_name || meta.nickname || meta.preferred_username ||
               (user.email ? user.email.split('@')[0] : '회원');

    // 같은 사용자/이미지라면 다시 그리지 않음 (토큰 갱신 때 열려 있는 드롭다운이 닫히지 않도록) — 컨테이너별로 확인
    var key = user.id + '|' + avatarUrl + '|' + name;
    renderedKey = key;

    Array.prototype.forEach.call(containers, function (container) {
      if (container.dataset.wbRenderedKey === key) return; // 이미 같은 내용으로 그려져 있음
      container.dataset.wbRenderedKey = key;
      container.textContent = '';
      if (container.classList.contains('wb-drawer-auth-buttons')) {
        buildDrawerAuthUI(container, avatarUrl, name);
      } else {
        buildDropdownAuthUI(container, avatarUrl, name);
      }
    });

    // managers 등록 여부 확인(서버) → 등록된 매니저면 '케어 매니저 모드로 전환' / '보호자 모드로 전환' 표시
    knownIsManager = null;
    startManagerCheck(user.id, key, 0);

    // profiles.role 확인(서버) → 'admin' 이면 '어드민 콘솔' 링크 표시
    knownIsAdmin = null;
    startAdminCheck(user.id, key, 0);
  }

  // 데스크톱 헤더용: 아바타 버튼 + 카드형 드롭다운(모드 전환 · 마이페이지 · 어드민 콘솔 · 로그아웃)
  function buildDropdownAuthUI(container, avatarUrl, name) {
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

    // 드롭다운 패널: 카드 안에 카드가 겹친 구조 — [프로필+모드 전환] / [마이페이지·어드민 콘솔] / [로그아웃] 3장
    var menu = document.createElement('div');
    menu.id = 'profileMenu';
    menu.className = 'wb-dd-panel';
    menu.style.display = 'none';
    menu.setAttribute('role', 'menu');
    menu.addEventListener('click', function (e) { e.stopPropagation(); });

    // ---- 1) 프로필 카드: 아바타 + 이름/역할, 그 아래 모드 전환 버튼 ----
    var profileCard = document.createElement('section');
    profileCard.className = 'wb-dd-card';

    var profileTop = document.createElement('div');
    profileTop.className = 'wb-dd-profile-top';

    var ddAvatar = document.createElement('div');
    ddAvatar.className = 'wb-dd-avatar';
    var ddAvatarImg = document.createElement('img');
    ddAvatarImg.alt = '프로필 이미지';
    ddAvatarImg.referrerPolicy = 'no-referrer';
    ddAvatarImg.onerror = function () { ddAvatarImg.onerror = null; ddAvatarImg.src = DEFAULT_AVATAR; };
    ddAvatarImg.src = avatarUrl;
    ddAvatar.appendChild(ddAvatarImg);

    var nameBlock = document.createElement('div');
    nameBlock.style.minWidth = '0';
    var nameEl = document.createElement('p');
    nameEl.className = 'wb-dd-name';
    nameEl.textContent = name + '님';
    var roleEl = document.createElement('p');
    roleEl.className = 'wb-dd-role';
    roleEl.textContent = '회원';
    nameBlock.appendChild(nameEl);
    nameBlock.appendChild(roleEl);

    profileTop.appendChild(ddAvatar);
    profileTop.appendChild(nameBlock);
    profileCard.appendChild(profileTop);

    // 모드 전환 영역: managers 조회가 끝나기 전에는 숨겨 두었다가, 매니저로 확인되면 fillModeSection() 이 채웁니다
    var modeSec = document.createElement('div');
    modeSec.className = 'wb-mode-section';
    modeSec.hidden = true;
    profileCard.appendChild(modeSec);

    // ---- 2) 메뉴 카드: 마이페이지(+서브 바로가기) / 어드민 콘솔(관리자만) / CS 슬림 메뉴 ----
    var menuCard = document.createElement('section');
    menuCard.className = 'wb-dd-card';
    var myPage = buildDdItem('a', { href: GUARDIAN_PAGE, icon: USER_ICON_SVG, label: '마이페이지' });
    myPage.className += ' wb-mypage-link';
    menuCard.appendChild(myPage);

    // '마이페이지' 바로 아래 들여쓴 서브 바로가기 — 어르신 프로필 관리(탭 직접 이동) / 내 정보 수정(전용 페이지로 이동)
    var elderLink = buildDdSubItem('a', { href: ELDER_PROFILE_PAGE, label: '어르신 프로필 관리' });
    var editInfoLink = buildDdSubItem('a', { href: PROFILE_EDIT_PAGE, label: '내 정보 수정' });
    menuCard.appendChild(elderLink);
    menuCard.appendChild(editInfoLink);

    // 어드민 콘솔: profiles.role 조회가 끝나기 전에는 숨겨 두었다가, 관리자로 확인되면 보입니다
    var adminLink = buildDdItem('a', { href: ADMIN_PAGE, icon: SHIELD_ICON_SVG, label: '어드민 콘솔', hidden: true });
    adminLink.className += ' wb-admin-link';
    menuCard.appendChild(adminLink);

    // CS(고객 지원) 슬림 메뉴 — 구분선 + 캡션 라벨로 위의 메뉴와 섹션을 명확히 나눔
    var csLabel = document.createElement('p');
    csLabel.className = 'wb-dd-section-label';
    csLabel.textContent = '고객 지원';
    menuCard.appendChild(csLabel);
    var inquiryLink = buildDdItem('a', { href: KAKAO_CHANNEL_URL, icon: CHAT_ICON_SVG, label: '1:1 문의하기' });
    inquiryLink.target = '_blank';
    inquiryLink.rel = 'noopener noreferrer';
    inquiryLink.className += ' is-slim';
    var faqLink = buildDdItem('a', { href: FAQ_PAGE, icon: QUESTION_ICON_SVG, label: '자주 묻는 질문(FAQ)' });
    faqLink.className += ' is-slim';
    menuCard.appendChild(inquiryLink);
    menuCard.appendChild(faqLink);

    // ---- 3) 로그아웃 카드: 위험 상태를 레드 포인트로 구분 ----
    var logoutCard = document.createElement('section');
    logoutCard.className = 'wb-dd-card';
    var logoutBtn = buildDdItem('button', { icon: LOGOUT_ICON_SVG, label: '로그아웃', danger: true, onClick: logout });
    logoutCard.appendChild(logoutBtn);

    menu.appendChild(profileCard);
    menu.appendChild(menuCard);
    menu.appendChild(logoutCard);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    container.appendChild(wrap);
  }

  // 모바일 드로어용: 토글 없이 항상 펼쳐진 목록으로 같은 정보(아바타·이름 · 모드 전환 · 마이페이지 ·
  // 어드민 콘솔 · 로그아웃)를 보여줍니다. 데스크톱 드롭다운과 데이터 소스(managers/profiles 조회 결과)는
  // 완전히 같고, fillModeSection()/fillAdminLink() 가 .wb-mode-section / .wb-admin-link 클래스로
  // 이 안의 요소도 함께 갱신합니다.
  function buildDrawerAuthUI(container, avatarUrl, name) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;';

    var profileRow = document.createElement('div');
    profileRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 2px 8px;text-align:left;';
    var avatar = document.createElement('div');
    avatar.style.cssText = 'flex:none;width:30px;height:30px;border-radius:50%;overflow:hidden;border:1px solid #F1F1F1;background:#F3F4F6;';
    var avatarImg = document.createElement('img');
    avatarImg.alt = '프로필 이미지';
    avatarImg.referrerPolicy = 'no-referrer';
    avatarImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    avatarImg.onerror = function () { avatarImg.onerror = null; avatarImg.src = DEFAULT_AVATAR; };
    avatarImg.src = avatarUrl;
    avatar.appendChild(avatarImg);

    var nameBlock = document.createElement('div');
    nameBlock.style.minWidth = '0';
    var nameEl = document.createElement('p');
    nameEl.style.cssText = 'margin:0;font-size:13.5px;font-weight:700;color:#374151;word-break:keep-all;';
    nameEl.textContent = name + '님';
    var roleEl = document.createElement('p');
    roleEl.className = 'wb-dd-role';
    roleEl.style.cssText = 'margin:2px 0 0;font-size:11.5px;color:#9CA3AF;';
    roleEl.textContent = '회원';
    nameBlock.appendChild(nameEl);
    nameBlock.appendChild(roleEl);
    profileRow.appendChild(avatar);
    profileRow.appendChild(nameBlock);
    wrap.appendChild(profileRow);

    // 모드 전환 영역: managers 조회가 끝나기 전에는 숨겨 두었다가, 매니저로 확인되면 fillModeSection() 이 채웁니다
    var modeSec = document.createElement('div');
    modeSec.className = 'wb-mode-section';
    modeSec.hidden = true;
    wrap.appendChild(modeSec);

    var myPage = buildDdItem('a', { href: GUARDIAN_PAGE, icon: USER_ICON_SVG, label: '마이페이지' });
    myPage.className += ' wb-mypage-link wb-drawer-link';
    myPage.style.cssText += 'display:flex;align-items:center;gap:8px;padding:9px 2px;font-size:13px;color:#6B7280;font-weight:600;';
    wrap.appendChild(myPage);

    // '마이페이지' 바로 아래 들여쓴 서브 바로가기(데스크톱 드롭다운의 .wb-dd-subitem 과 같은 역할)
    var elderLink = buildDdSubItem('a', { href: ELDER_PROFILE_PAGE, label: '어르신 프로필 관리' });
    elderLink.classList.add('wb-drawer-link');
    elderLink.style.cssText += 'padding:7px 2px 7px 20px;';
    var editInfoLink = buildDdSubItem('a', { href: PROFILE_EDIT_PAGE, label: '내 정보 수정' });
    editInfoLink.classList.add('wb-drawer-link');
    editInfoLink.style.cssText += 'padding:7px 2px 7px 20px;';
    wrap.appendChild(elderLink);
    wrap.appendChild(editInfoLink);

    // 어드민 콘솔: profiles.role 조회가 끝나기 전에는 숨겨 두었다가, 관리자로 확인되면 보입니다
    var adminLink = buildDdItem('a', { href: ADMIN_PAGE, icon: SHIELD_ICON_SVG, label: '어드민 콘솔', hidden: true });
    adminLink.className += ' wb-admin-link wb-drawer-link';
    adminLink.style.cssText += 'display:flex;align-items:center;gap:8px;padding:9px 2px;font-size:13px;color:#6B7280;font-weight:600;';
    wrap.appendChild(adminLink);

    // CS(고객 지원) 슬림 메뉴 — 구분선 + 캡션 라벨로 위의 메뉴와 섹션을 명확히 나눔
    var csLabel = document.createElement('p');
    csLabel.className = 'wb-dd-section-label';
    csLabel.textContent = '고객 지원';
    wrap.appendChild(csLabel);
    var inquiryLink = buildDdItem('a', { href: KAKAO_CHANNEL_URL, icon: CHAT_ICON_SVG, label: '1:1 문의하기' });
    inquiryLink.target = '_blank';
    inquiryLink.rel = 'noopener noreferrer';
    inquiryLink.className += ' is-slim wb-drawer-link';
    inquiryLink.style.cssText += 'display:flex;align-items:center;gap:8px;padding:7px 2px;';
    var faqLink = buildDdItem('a', { href: FAQ_PAGE, icon: QUESTION_ICON_SVG, label: '자주 묻는 질문(FAQ)' });
    faqLink.className += ' is-slim wb-drawer-link';
    faqLink.style.cssText += 'display:flex;align-items:center;gap:8px;padding:7px 2px;';
    wrap.appendChild(inquiryLink);
    wrap.appendChild(faqLink);

    var logoutBtn = buildDdItem('button', { icon: LOGOUT_ICON_SVG, label: '로그아웃', danger: true, onClick: logout });
    logoutBtn.className += ' wb-drawer-link';
    logoutBtn.style.cssText += 'display:flex;align-items:center;gap:8px;padding:9px 2px;font-size:13px;';
    wrap.appendChild(logoutBtn);

    container.appendChild(wrap);
  }

  // 데스크톱/모바일 모든 .auth-buttons 컨테이너를 각자 원래의(로그아웃 상태) 마크업으로 되돌립니다.
  function renderLoggedOut() {
    Array.prototype.forEach.call(getContainers(), function (container) {
      var original = loggedOutMarkupMap.get(container);
      if (container.dataset.wbRenderedKey && original !== undefined) {
        container.innerHTML = original;
      }
      delete container.dataset.wbRenderedKey;
    });
    renderedKey = null;
    knownIsManager = null;        // 다음에 로그인하는 사람은 새로 확인
    knownIsAdmin = null;
  }

  // 세션 유무에 맞춰 헤더 갱신 (DOM 준비 전에 호출돼도 준비 후 반영)
  function applySession(session) {
    whenReady(function () {
      if (session && session.user) renderLoggedIn(session.user);
      else renderLoggedOut();
      clearPending();
    });
    if (session && session.user) {
      // 로그인 세션이 확인되면(카카오 로그인 직후 포함) 비로그인으로 냈던 신청을 내 계정에 연결
      claimPendingApplications();
      // 로그인이 필요해서 login.html 로 보냈던 원래 목적지(예: apply.html)로 돌아감
      consumePostLoginRedirect();
    }
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
  // 로그아웃 상태의 원본 마크업을 컨테이너별로 먼저 보관 (whenReady 콜백은 등록 순서대로 실행되므로 applySession 보다 앞선다)
  whenReady(function () {
    Array.prototype.forEach.call(getContainers(), function (container) {
      if (!loggedOutMarkupMap.has(container)) loggedOutMarkupMap.set(container, container.innerHTML);
    });
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

  // ---------- 매니저 자격 확인 (mypage.html / mypage-manager.html / manager-apply.html 공용) ----------
  // 기준은 '서버(DB)'입니다: managers 테이블에 내 행이 있고(id = 로그인 UUID) certification_verified 가
  // true 인가 — SQL 쪽 is_manager() 와 정확히 같은 기준입니다.
  // (RLS 가 '내 행'만 돌려주므로 브라우저에서 조작할 수 없습니다. 행은 approve_manager_application() 를
  //  통해서만 만들어지고, revoke_manager() 는 행을 지우지 않고 certification_verified 만 false 로 내립니다
  //  — sql/manager_applications.sql 참고. 그래서 '행이 있는가'만으로 판단하면 권한을 해제한 뒤에도
  //  여전히 매니저로 취급되는 버그가 생깁니다. certification_verified 까지 같이 봐야 정확합니다.)
  //  * user_metadata / localStorage 는 사용자가 브라우저에서 직접 고칠 수 있으므로 권한 판단에 쓰지 않습니다.
  //  * 두 마이페이지와 드롭다운, manager-apply.html 이 서로 다른 기준을 쓰면 화면마다 판정이 어긋납니다.
  //    반드시 이 함수(또는 lookupManager) 하나만 사용하세요.
  //  * 이 함수는 화면을 보여줄지/막을지 결정하는 용도이고, 실제 데이터 보호는 DB 규칙(RLS·is_manager())이 담당합니다.
  //  * 확인에 실패하면(네트워크 오류 등) '매니저 아님'으로 처리합니다 (fail closed).
  // lookupManager: 'yes'(managers 에 내 행이 있고 certification_verified = true) | 'no'(행이 없거나 인증 전/해제됨) | 'error'(조회 자체가 실패 — 아직 모름)
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
                     '매니저 승인은 admin.html 의 [승인] 버튼(approve_manager_application) 으로만 이뤄집니다.');
        return 'no';
      }
      if (res.data.certification_verified !== true) {
        console.info('[WBAuth] managers 에 행이 있으나 certification_verified 가 true 가 아닙니다(인증 전이거나 ' +
                     '관리자가 권한을 해제한 상태) → 매니저 아님으로 처리합니다: ' + userId);
        return 'no';
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
  async function checkIsAdmin(userId) {
    return (await lookupAdmin(userId)) === 'yes'; // 실패('error')는 관리자 아님으로 처리 (fail closed)
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

  // ---------- 로그인이 필요한 버튼('예약하기' 등) 공용 처리 + 로그인 후 원래 목적지로 복귀 ----------
  // 카카오 OAuth 는 redirectTo 가 index.html 로 고정돼 있어(login.html 의 Supabase 리다이렉트 URL 설정과 맞춰 둔 값)
  // 로그인이 끝나면 늘 index.html 로 돌아옵니다. 그래서 원래 가려던 목적지(예: apply.html)는 이 브라우저 탭에만
  // 남는 sessionStorage 에 잠깐 기억해 두고, index.html 에서 세션이 확인되는 순간(위 applySession) 그 쪽으로 한 번 더 이동시킵니다.
  var POST_LOGIN_REDIRECT_KEY = 'wb_post_login_redirect';
  // 사이트 안의 '파일명.html' 형태만 허용 — 외부 주소나 javascript: 등을 넣으면 로그인 후 다른 곳으로 보내는
  // 열린 리다이렉트(open redirect)가 될 수 있어 막습니다
  function isSafeLocalRedirect(target) {
    return typeof target === 'string' && /^[A-Za-z0-9_-]+\.html(?:\?[^\s'"<>]*)?$/.test(target);
  }
  function rememberPostLoginRedirect(target) {
    if (!isSafeLocalRedirect(target)) return;
    try { sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, target); } catch (e) { /* 저장소를 쓸 수 없으면 무시 */ }
  }
  function consumePostLoginRedirect() {
    var target = null;
    try {
      target = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      if (target) sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    } catch (e) { return; }
    if (target && isSafeLocalRedirect(target)) navigate(target);
  }

  // ---------- 로그인 필요 안내 모달(alert() 대체) ----------
  // alert() 은 '확인'만 누를 수 있어 곧바로 login.html 로 보내 버렸지만, 이 모달은 '취소'를 선택하면
  // 아무 일도 일어나지 않게(페이지에 그대로 머물게) 해 실수로 로그인 페이지로 넘어가지 않도록 합니다.
  var loginModalStyle = document.createElement('style');
  loginModalStyle.textContent =
    // 오버레이: bg-black/50 backdrop-blur-sm
    '.wb-login-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);' +
    '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;' +
    'justify-content:center;padding:20px;z-index:2000}' +
    '.wb-login-modal-overlay[hidden]{display:none}' +
    // 카드: max-w-[360px] w-full, rounded-2xl, p-7, bg-white shadow-2xl
    '.wb-login-modal-card{width:100%;max-width:360px;box-sizing:border-box;background:#fff;' +
    'border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);padding:28px;text-align:center;' +
    'font-family:"Noto Sans KR",sans-serif}' +
    // 제목: text-lg font-bold text-gray-900 mb-2
    '.wb-login-modal-title{margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;line-height:1.4}' +
    // 서브 문구: text-sm text-gray-500 mb-6
    '.wb-login-modal-body{margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.5}' +
    // 버튼 영역: grid grid-cols-2 gap-3 w-full
    '.wb-login-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}' +
    '.wb-login-modal-btn{border:none;border-radius:12px;padding:12px 0;font-size:14px;' +
    'font-weight:500;cursor:pointer;font-family:inherit;transition:background-color .15s}' +
    // 취소: bg-white border border-gray-200 text-gray-600, hover:bg-gray-50
    '.wb-login-modal-cancel{background:#fff;border:1px solid #E5E7EB;color:#4B5563}' +
    '.wb-login-modal-cancel:hover{background:#F9FAFB}' +
    // 확인: 위드브릿지 메인 그린, hover 는 더 어두운 그린
    '.wb-login-modal-confirm{background:#2D6A4F;color:#fff}' +
    '.wb-login-modal-confirm:hover{background:#1B4332}' +
    // 버튼 1개짜리 모달(전화 상담 안내)용 — 2열 그리드 대신 꽉 찬 1열
    '.wb-login-modal-actions.is-single{grid-template-columns:1fr}' +
    // 전화번호: 큰 글씨 + bold
    '.wb-login-modal-phone{margin:0 0 6px;font-size:26px;font-weight:800;color:#1B4332;letter-spacing:-.01em}' +
    // 운영 시간 안내
    '.wb-login-modal-hours{margin:0 0 24px;font-size:13.5px;color:#6B7280;line-height:1.5}';
  document.head.appendChild(loginModalStyle);

  var loginModalEl = null;
  var loginModalTarget = null;

  function hideLoginModal() {
    if (loginModalEl) loginModalEl.hidden = true;
    document.removeEventListener('keydown', onLoginModalKeydown);
  }
  function onLoginModalKeydown(e) {
    if (e.key === 'Escape') hideLoginModal();
  }
  function buildLoginModal() {
    var overlay = document.createElement('div');
    overlay.className = 'wb-login-modal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="wb-login-modal-card">' +
        '<p class="wb-login-modal-title">로그인이 필요해요</p>' +
        '<p class="wb-login-modal-body">로그인 페이지로 이동할까요?</p>' +
        '<div class="wb-login-modal-actions">' +
          '<button type="button" class="wb-login-modal-btn wb-login-modal-cancel">취소</button>' +
          '<button type="button" class="wb-login-modal-btn wb-login-modal-confirm">확인</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    // 배경(딤 처리된 바깥 영역) 클릭 시 닫기 — 카드 내부 클릭은 무시
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hideLoginModal(); });
    overlay.querySelector('.wb-login-modal-cancel').addEventListener('click', hideLoginModal);
    overlay.querySelector('.wb-login-modal-confirm').addEventListener('click', function () {
      var target = loginModalTarget;
      hideLoginModal();
      if (target) {
        rememberPostLoginRedirect(target);
        navigate('login.html?redirect=' + encodeURIComponent(target));
      } else {
        navigate('login.html');
      }
    });
    return overlay;
  }
  // targetUrl 을 넘기면 '확인' 클릭 시 login.html?redirect=targetUrl 로 이동하고, 로그인 후 그 페이지로 되돌아옵니다.
  // 생략하면 그냥 login.html 로만 이동합니다.
  function showLoginModal(targetUrl) {
    if (!loginModalEl) loginModalEl = buildLoginModal();
    loginModalTarget = targetUrl || null;
    loginModalEl.hidden = false;
    document.addEventListener('keydown', onLoginModalKeydown);
  }

  // ---------- 전화 상담 안내 모달 ----------
  // PC 에서 tel: 링크를 누르면 "앱 선택을 여시겠습니까?" 같은 브라우저 기본 시스템 팝업이 뜨는 문제를 피하려고,
  // PC 에서는 tel: 이동 대신 번호/운영시간을 보여주는 안내 모달을 띄웁니다(모바일은 기존처럼 바로 전화 연결).
  var CALL_PHONE_NUMBER = '010-5530-5760';
  var CALL_HOURS_TEXT = '평일 08:00 ~ 18:00 (주말/공휴일 휴무)';
  var callModalEl = null;

  function hideCallModal() {
    if (callModalEl) callModalEl.hidden = true;
    document.removeEventListener('keydown', onCallModalKeydown);
  }
  function onCallModalKeydown(e) {
    if (e.key === 'Escape') hideCallModal();
  }
  function buildCallModal() {
    var overlay = document.createElement('div');
    overlay.className = 'wb-login-modal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="wb-login-modal-card">' +
        '<p class="wb-login-modal-title">전화 상담 안내</p>' +
        '<p class="wb-login-modal-phone">' + CALL_PHONE_NUMBER + '</p>' +
        '<p class="wb-login-modal-hours">' + CALL_HOURS_TEXT + '</p>' +
        '<div class="wb-login-modal-actions is-single">' +
          '<button type="button" class="wb-login-modal-btn wb-login-modal-confirm">확인</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hideCallModal(); });
    overlay.querySelector('.wb-login-modal-confirm').addEventListener('click', hideCallModal);
    return overlay;
  }
  function showCallModal() {
    if (!callModalEl) callModalEl = buildCallModal();
    callModalEl.hidden = false;
    document.addEventListener('keydown', onCallModalKeydown);
  }
  // 모바일(실제 전화 연결이 되는 기기)이면 바로 tel: 로 이동시켜 전화 앱이 즉시 열리게 하고,
  // PC 면 기본 동작을 막고 전화 상담 안내 모달을 띄웁니다. '전화 상담 문의' 버튼의 onclick 에서 씁니다.
  function handlePhoneClick(event) {
    if (event && event.preventDefault) event.preventDefault();
    var isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      location.href = 'tel:' + CALL_PHONE_NUMBER.replace(/[^0-9+]/g, '');
    } else {
      showCallModal();
    }
    return false;
  }

  // '내 정보 수정'은 모달이 아니라 전용 페이지(profile-edit.html)로 이동합니다 — 드롭다운/드로어의
  // .wb-dd-subitem 링크가 바로 그 주소를 가리키므로, 여기서 따로 열고 닫을 것이 없습니다.

  // 추가 요금 미납 예약 제한(Lock) — 결제 대기 중인 추가 요금(care_schedules.extra_charge_status=
  // 'REQUESTED')이 하나라도 있으면 새 예약을 막습니다. 마이페이지 '추가 요금 결제 안내' 섹션
  // (mypage.html loadExtraCharges())이 쓰는 것과 똑같은 조건이라, 그 섹션에 보이는 건수와 이 잠금
  // 여부가 항상 일치합니다 — apply.html 진입 시점과 mypage.html '예약하기'/'+추가 신청' 클릭 시점
  // 양쪽에서 이 함수 하나를 공용으로 씁니다. 조회 자체가 실패하면(네트워크 오류 등) 막지 않고
  // 통과시킵니다 — 일시적 오류로 정상 이용자의 예약을 못 하게 하는 쪽이 더 나쁜 실패이기 때문입니다.
  async function hasUnpaidExtraCharge(userId) {
    if (!userId) return false;
    try {
      var res = await client
        .from('care_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('guardian_id', userId)
        .eq('extra_charge_status', 'REQUESTED');
      if (res.error) {
        console.warn('[추가 요금 미납 확인] 조회 실패 — 막지 않고 통과시킵니다:', res.error.code, res.error.message);
        return false;
      }
      return (res.count || 0) > 0;
    } catch (e) {
      console.warn('[추가 요금 미납 확인] 예외 — 막지 않고 통과시킵니다:', e);
      return false;
    }
  }

  // 로그인 상태면 targetUrl 로 바로 이동하고, 비로그인이면 안내 모달을 띄워 '확인'을 누르면 login.html?redirect=targetUrl 로 보내
  // 로그인을 마치면 targetUrl 로 돌아오게 합니다. '예약하기' 류 버튼의 onclick 에서 공용으로 씁니다.
  async function goIfLoggedIn(event, targetUrl) {
    if (event && event.preventDefault) event.preventDefault();
    try {
      var res = await client.auth.getSession();
      if (res && res.data && res.data.session && res.data.session.user) {
        navigate(targetUrl);
        return;
      }
    } catch (e) { /* 확인 실패 → 비로그인으로 간주해 로그인으로 보냄 */ }
    showLoginModal(targetUrl);
  }

  window.WBAuth = {
    client: client, logout: logout, checkIsManager: checkIsManager, checkIsAdmin: checkIsAdmin,
    getUserMode: getUserMode, setUserMode: setUserMode, navigate: navigate, claimPendingApplications: claimPendingApplications,
    rememberPostLoginRedirect: rememberPostLoginRedirect, goIfLoggedIn: goIfLoggedIn,
    hasUnpaidExtraCharge: hasUnpaidExtraCharge,
    showLoginModal: showLoginModal, showCallModal: showCallModal, handlePhoneClick: handlePhoneClick,
    loggingOut: false
  };
})();
