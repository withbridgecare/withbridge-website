/* =========================================================
   위드브릿지 어드민 콘솔 (admin.html 전용)
   - Supabase 세션 + profiles.role = 'admin' 확인을 통과해야 화면이 열림 (fail closed)
   - 통과 후: 헤더에 관리자 이름 표시, 가입 승인 대기 매니저 / 오늘의 케어 신청(수동 배정 대기) 목록 로드
   - admin.html 의 안내 배너와 마찬가지로, 아래 조회들은 아직 관리자 전용 RLS/RPC 가 없는 상태를 전제로 한
     기본 구조입니다. 관리자 전용 정책이 추가되면 실제 전체 목록이 보이기 시작합니다.
========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://layvjisfeivkzowopkco.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_M7wpIAR7-aXvG78Xv-WBoQ_q1wj_FcR';

  var sdk = window.supabase;
  if (!sdk || !sdk.createClient) {
    alert('Supabase 연결에 실패했습니다. 새로고침해 주세요.');
    throw new Error('[Admin] Supabase SDK 가 로드되지 않았습니다. SDK <script> 가 admin.js 보다 먼저 있어야 합니다.');
  }
  var supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var els = {
    account: $('adminAccount'),
    name: $('adminName'),
    logoutBtn: $('logoutBtn'),
    toast: $('adminToast'),
    pendingManagersList: $('pendingManagersList'),
    pendingManagersCount: $('pendingManagersCount'),
    applicationsList: $('applicationsList'),
    applicationsCount: $('applicationsCount'),
    activeManagersList: $('activeManagersList'),
    activeManagersCount: $('activeManagersCount'),
    inProgressCareList: $('inProgressCareList'),
    inProgressCareCount: $('inProgressCareCount'),
    inProgressCareShowMoreBtn: $('inProgressCareShowMoreBtn'),
    idCardModal: $('idCardModal'),
    idCardModalSub: $('idCardModalSub'),
    idCardViewer: $('idCardViewer'),
    idCardStatus: $('idCardStatus'),
    idCardImg: $('idCardImg'),
    idCardCloseBtn: $('idCardModalCloseBtn'),
    idCardZoomInBtn: $('idCardZoomInBtn'),
    idCardZoomOutBtn: $('idCardZoomOutBtn'),
    idCardZoomResetBtn: $('idCardZoomResetBtn'),
    idCardApproveBtn: $('idCardApproveBtn'),
    idCardRejectBtn: $('idCardRejectBtn'),
    assignModal: $('assignManagerModal'),
    assignSub: $('assignManagerSub'),
    assignSelect: $('assignManagerSelect'),
    assignError: $('assignManagerError'),
    assignCloseBtn: $('assignManagerCloseBtn'),
    assignCancelBtn: $('assignManagerCancelBtn'),
    assignConfirmBtn: $('assignManagerConfirmBtn'),
    careVerifyModal: $('careVerifyModal'),
    careVerifySub: $('careVerifySub'),
    careVerifyDepartureBody: $('careVerifyDepartureBody'),
    careVerifyArrivalBody: $('careVerifyArrivalBody'),
    careVerifyCloseBtn: $('careVerifyCloseBtn'),
    careVerifyCloseBtn2: $('careVerifyCloseBtn2'),
    careVerifyLightbox: $('careVerifyLightbox'),
    careVerifyLightboxImg: $('careVerifyLightboxImg'),
    careVerifyLightboxCaption: $('careVerifyLightboxCaption'),
    careVerifyLightboxCloseBtn: $('careVerifyLightboxCloseBtn')
  };

  var toastTimer = null;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDateTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- 카카오 로컬(지오코딩) API: 좌표 → 주소 (mypage.html / mypage-manager.html 의 reverseGeocode() 와 동일 키·엔드포인트) ----------
  // 현장 인증 상세보기 모달에서 출발/도착 GPS 좌표를 사람이 읽는 주소로 바꿀 때 씁니다.
  // 키가 비어 있거나 호출이 실패해도 에러로 막지 않고 좌표 표기로 자연스럽게 대체됩니다.
  var KAKAO_REST_API_KEY = '4e94e702177afc63f2f05c3abfffdf3c';
  async function kakaoLocalGet(url) {
    var res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_API_KEY } });
    if (!res.ok) throw new Error('kakao local api ' + res.status);
    return res.json();
  }
  async function reverseGeocode(lat, lng) {
    if (!KAKAO_REST_API_KEY) return null;
    try {
      var data = await kakaoLocalGet('https://dapi.kakao.com/v2/local/geo/coord2address.json?x=' + lng + '&y=' + lat);
      var doc = data.documents && data.documents[0];
      if (!doc) return null;
      return (doc.road_address && doc.road_address.address_name) || (doc.address && doc.address.address_name) || null;
    } catch (e) { console.warn('[Admin][카카오 지오코딩] 좌표→지명 변환 실패:', e.message); return null; }
  }
  var reverseGeocodeCache = {};
  async function reverseGeocodeCached(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    var key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (key in reverseGeocodeCache) return reverseGeocodeCache[key];
    var result = await reverseGeocode(lat, lng);
    reverseGeocodeCache[key] = result;
    return result;
  }

  function renderErrorState(list, message, retry) {
    list.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'admin-error';
    box.textContent = '목록을 불러오지 못했습니다: ' + message;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '다시 시도';
    btn.addEventListener('click', retry);
    box.appendChild(document.createElement('br'));
    box.appendChild(btn);
    list.appendChild(box);
  }

  // ============================================================
  // 01. 관리자 접근 권한 검증
  //     (1) 로그인 세션이 없으면 로그인 유도 후 index.html 로 돌려보냄
  //     (2) 로그인은 했지만 profiles.role 이 'admin' 이 아니면 접근 차단
  //     * profiles_select_own RLS 정책상 내 프로필(id = auth.uid())은 항상 조회할 수 있으므로,
  //       이 확인 자체에는 별도의 관리자 전용 RLS 가 필요 없습니다.
  // ============================================================
  async function verifyAdminAccess() {
    var sessionRes = await supabaseClient.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      alert('로그인이 필요합니다.');
      window.location.replace('index.html');
      return null;
    }

    var profileRes = await supabaseClient
      .from('profiles')
      .select('id, role, name')
      .eq('id', session.user.id)
      .maybeSingle();

    // "DB 는 role='admin' 인데 화면은 관리자가 아니라고 한다" 라는 보고가 반복될 때, 코드가 실제로
    // 어떤 값을 받았는지 콘솔에서 바로 확인할 수 있어야 진단이 끝납니다.
    console.log('[Admin] profiles 조회 결과 (userId=' + session.user.id + '):', profileRes.error || profileRes.data);

    if (profileRes.error) {
      console.error('[Admin] profiles 조회 실패:', profileRes.error.code, profileRes.error.message,
        '→ RLS 정책(profiles_select_own) 또는 네트워크 문제일 수 있습니다. profiles_select_own 은 본인 행은' +
        ' 항상 읽을 수 있게 하는 기본 정책이라, 이게 실패하면 보통 세션 만료나 네트워크 쪽입니다.');
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }

    var profile = profileRes.data;
    // Supabase 대시보드 Table Editor 에서 손으로 값을 고치면 ' admin'/'Admin' 처럼 공백·대소문자가
    // 섞여 들어가기 쉽습니다 — trim + 소문자로 비교해서 그런 경우까지 'admin'으로 인정합니다.
    var normalizedRole = String((profile && profile.role) || '').trim().toLowerCase();
    if (!profile || normalizedRole !== 'admin') {
      console.error('[Admin] profiles.role 이 "admin" 이 아닙니다 → 접근 차단. 실제 조회된 행:', profile,
        '→ sql/_recover_admin_account.sql 또는 Supabase 대시보드에서 이 계정의 profiles.role 을 "admin"으로 다시 설정하세요.');
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }

    return { user: session.user, profile: profile };
  }

  function renderAdminHeader(user, profile) {
    if (els.name) els.name.textContent = (profile.name || user.email || '관리자') + '님';
    if (els.account) els.account.hidden = false;
  }

  function bindLogout() {
    if (!els.logoutBtn) return;
    els.logoutBtn.addEventListener('click', async function () {
      els.logoutBtn.disabled = true;
      var res = await supabaseClient.auth.signOut();
      if (res.error) {
        alert('로그아웃 중 오류가 발생했습니다: ' + res.error.message);
        els.logoutBtn.disabled = false;
        return;
      }
      window.location.replace('index.html');
    });
  }

  // ============================================================
  // 02. 가입 승인 대기 매니저 목록 (manager_applications.status = 'pending')
  //     manager-apply.html 에서 접수된 지원서를 승인/반려합니다. 승인은 approve_manager_application()
  //     RPC 가 managers 행 생성 + profiles.role='manager' 갱신까지 한 번에 처리합니다
  //     (sql/manager_applications.sql 참고).
  // ============================================================
  async function loadPendingManagers() {
    var list = els.pendingManagersList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.pendingManagersCount) els.pendingManagersCount.hidden = true;

    var res = await supabaseClient
      .from('manager_applications')
      .select('id, name, phone, birth_date, address, id_image_path, activity_areas, activity_schedule, certifications, career_experience, bank_name, account_number, account_holder, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (res.error) {
      console.error('[Admin] 매니저 지원서 조회 실패:', res.error.code, res.error.message,
        '→ sql/manager_applications.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      renderErrorState(list, res.error.message, loadPendingManagers);
      return;
    }

    var rows = res.data || [];
    if (els.pendingManagersCount) {
      els.pendingManagersCount.textContent = rows.length + '건';
      els.pendingManagersCount.hidden = false;
    }

    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">승인 대기 중인 지원서가 없습니다.</p>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(function (a) { list.appendChild(renderManagerRow(a)); });
  }

  function renderManagerRow(a) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(a.name || '이름 미등록') + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(a.phone || '') + '</div></div>' +
      '<span class="admin-badge is-pending">지원 대기</span>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>생년월일</dt><dd>' + escapeHtml(a.birth_date || '미등록') + '</dd>' +
      '<dt>거주지 주소</dt><dd>' + escapeHtml(a.address || '미등록') + '</dd>' +
      '<dt>활동 가능 지역</dt><dd>' + escapeHtml((a.activity_areas || []).join(', ') || '미등록') + '</dd>' +
      '<dt>활동 가능 요일/시간대</dt><dd>' + escapeHtml((a.activity_schedule || []).join(', ') || '미등록') + '</dd>' +
      '<dt>보유 자격증</dt><dd>' + escapeHtml((a.certifications || []).join(', ') || '해당 없음') + '</dd>' +
      '<dt>관련 경력</dt><dd>' + escapeHtml(a.career_experience || '-') + '</dd>' +
      '<dt>정산 계좌</dt><dd>' + escapeHtml((a.bank_name || '-') + ' ' + (a.account_number || '-') + ' (예금주: ' + (a.account_holder || '-') + ')') + '</dd>' +
      '<dt>지원 일시</dt><dd>' + formatDateTime(a.created_at) + '</dd>';

    var actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    if (a.id_image_path) {
      var idBtn = document.createElement('button');
      idBtn.type = 'button';
      idBtn.className = 'admin-btn is-ghost';
      idBtn.textContent = '신분증 보기';
      idBtn.addEventListener('click', function () { openIdCardModal(a); });
      actions.appendChild(idBtn);
    }
    var approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = 'admin-btn is-primary';
    approveBtn.textContent = '승인';
    approveBtn.addEventListener('click', function () { approveManager(a.id, approveBtn); });
    var rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'admin-btn is-ghost';
    rejectBtn.textContent = '반려';
    rejectBtn.addEventListener('click', function () { rejectManager(a.id, rejectBtn); });
    actions.appendChild(rejectBtn);
    actions.appendChild(approveBtn);

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(actions);
    return row;
  }

  // 승인/반려는 행 버튼과 신분증 모달(idCardApproveBtn/idCardRejectBtn) 둘 다에서 호출합니다.
  // 모달 쪽은 처리가 끝나면 모달을 닫아야 하므로, 성공 여부를 boolean 으로 돌려줍니다.
  async function approveManager(applicationId, btn) {
    btn.disabled = true;
    var res = await supabaseClient.rpc('approve_manager_application', { p_application_id: applicationId });

    if (res.error) {
      console.error('[Admin] 매니저 승인 실패:', res.error.code, res.error.message,
        '→ sql/manager_applications.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      showToast('승인 처리에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return false;
    }
    showToast('매니저를 승인했습니다.');
    loadPendingManagers();
    return true;
  }

  async function rejectManager(applicationId, btn) {
    var reason = window.prompt('반려 사유를 입력해 주세요 (선택 사항).') || null;
    btn.disabled = true;
    var res = await supabaseClient.rpc('reject_manager_application', { p_application_id: applicationId, p_reason: reason });

    if (res.error) {
      console.error('[Admin] 매니저 반려 실패:', res.error.code, res.error.message);
      showToast('반려 처리에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return false;
    }
    showToast('지원서를 반려했습니다.');
    loadPendingManagers();
    return true;
  }

  // ============================================================
  // 02-1. 신분증 사본 확인 모달 (비공개 버킷 manager-id-cards → 서명 URL로 열람)
  //     sql/manager_applications_v2.sql 의 manager_id_cards_select_own_or_admin 정책 참고.
  //     모달 안에서 바로 [승인]/[반려] 처리까지 할 수 있도록 approveManager/rejectManager 를 그대로 재사용합니다.
  // ============================================================
  var ID_CARD_ZOOM_MIN = 100;
  var ID_CARD_ZOOM_MAX = 300;
  var ID_CARD_ZOOM_STEP = 25;
  var idCardApplicationId = null;
  var idCardZoomPct = ID_CARD_ZOOM_MIN;

  function updateIdCardZoomUi() {
    els.idCardZoomResetBtn.textContent = idCardZoomPct + '%';
    els.idCardZoomOutBtn.disabled = idCardZoomPct <= ID_CARD_ZOOM_MIN;
    els.idCardZoomInBtn.disabled = idCardZoomPct >= ID_CARD_ZOOM_MAX;
  }

  function applyIdCardZoom() {
    if (idCardZoomPct <= ID_CARD_ZOOM_MIN) {
      els.idCardImg.style.width = '';
      els.idCardImg.classList.remove('is-zoomed');
    } else {
      var naturalWidth = els.idCardImg.naturalWidth || els.idCardImg.clientWidth;
      els.idCardImg.style.width = (naturalWidth * idCardZoomPct / 100) + 'px';
      els.idCardImg.classList.add('is-zoomed');
    }
    updateIdCardZoomUi();
  }

  function setIdCardZoom(pct) {
    idCardZoomPct = Math.max(ID_CARD_ZOOM_MIN, Math.min(ID_CARD_ZOOM_MAX, pct));
    applyIdCardZoom();
  }

  async function loadIdCardImage(path) {
    var res = await supabaseClient.storage.from('manager-id-cards').createSignedUrl(path, 180);
    if (res.error || !res.data) {
      console.error('[Admin] 신분증 서명 URL 발급 실패:', res.error && res.error.message);
      els.idCardStatus.className = 'admin-error';
      els.idCardStatus.textContent = '이미지를 불러오지 못했습니다: ' + (res.error ? res.error.message : '알 수 없는 오류');
      els.idCardStatus.hidden = false;
      return;
    }
    els.idCardImg.onload = function () {
      els.idCardStatus.hidden = true;
      els.idCardImg.hidden = false;
    };
    els.idCardImg.onerror = function () {
      els.idCardStatus.className = 'admin-error';
      els.idCardStatus.textContent = '이미지를 표시할 수 없습니다. 파일 형식을 확인해 주세요.';
      els.idCardStatus.hidden = false;
    };
    els.idCardImg.src = res.data.signedUrl;
  }

  function openIdCardModal(a) {
    idCardApplicationId = a.id;
    els.idCardModalSub.textContent = (a.name || '이름 미등록') + ' · ' + (a.phone || '연락처 미등록');

    els.idCardImg.hidden = true;
    els.idCardImg.removeAttribute('src');
    els.idCardImg.classList.remove('is-zoomed');
    els.idCardImg.style.width = '';
    els.idCardStatus.hidden = false;
    els.idCardStatus.className = 'admin-loading';
    els.idCardStatus.textContent = '불러오는 중…';
    idCardZoomPct = ID_CARD_ZOOM_MIN;
    updateIdCardZoomUi();

    els.idCardApproveBtn.disabled = false;
    els.idCardRejectBtn.disabled = false;

    els.idCardModal.hidden = false;
    loadIdCardImage(a.id_image_path);
  }

  function closeIdCardModal() {
    els.idCardModal.hidden = true;
    idCardApplicationId = null;
    els.idCardImg.removeAttribute('src');
  }

  els.idCardCloseBtn.addEventListener('click', closeIdCardModal);
  els.idCardModal.addEventListener('mousedown', function (e) { if (e.target === els.idCardModal) closeIdCardModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.idCardModal.hidden) closeIdCardModal(); });

  els.idCardZoomInBtn.addEventListener('click', function () { setIdCardZoom(idCardZoomPct + ID_CARD_ZOOM_STEP); });
  els.idCardZoomOutBtn.addEventListener('click', function () { setIdCardZoom(idCardZoomPct - ID_CARD_ZOOM_STEP); });
  els.idCardImg.addEventListener('click', function () { setIdCardZoom(idCardZoomPct > ID_CARD_ZOOM_MIN ? ID_CARD_ZOOM_MIN : 200); });

  els.idCardApproveBtn.addEventListener('click', async function () {
    if (!idCardApplicationId) return;
    var ok = await approveManager(idCardApplicationId, els.idCardApproveBtn);
    if (ok) closeIdCardModal();
  });
  els.idCardRejectBtn.addEventListener('click', async function () {
    if (!idCardApplicationId) return;
    var ok = await rejectManager(idCardApplicationId, els.idCardRejectBtn);
    if (ok) closeIdCardModal();
  });

  // ============================================================
  // 03. 오늘의 케어 신청 · 수동 배정 대기 목록
  //     service_applications.status 는 표준 4종입니다(sql/service_application_status_standardization.sql):
  //       PAYMENT_PENDING(결제/입금 대기) · MATCHING_PENDING(배정 신청 대기) · MATCHED(배정 완료) · CANCELLED(취소)
  //     이 목록은 아직 매니저가 배정되지 않은 PAYMENT_PENDING·MATCHING_PENDING 두 상태를 모두 보여주되(결제가
  //     끝나기 전부터 관리자는 신청 내용을 확인할 수 있어야 하므로), 결제 여부는 태그로 구분하고 PAYMENT_PENDING
  //     건에는 [수동 입금 완료] 버튼을 달아 관리자가 직접 입금 확인 처리를 할 수 있게 합니다.
  //     mypage-manager.html 의 매니저용 신청 대기 목록은 이와 달리 MATCHING_PENDING 건만 정확히 일치하는
  //     조건으로 조회합니다(결제 전 건은 매니저에게 노출되면 안 되므로) — 두 화면이 서로 다른 조건을 쓰는 것이
  //     의도된 설계입니다.
  //
  //     manager_id IS NULL(= 아직 아무도 수락/배정되지 않음, 트리거 sync_application_status() 가 manager_id
  //     설정과 status='MATCHED' 전환을 항상 같이 처리하므로 이거 하나만으로 '배정 여부'를 정확히 판단할 수 있음)
  //     로 서버에서 거르고, 상태는 이 아래 isAwaitingAssignmentStatus()/isAwaitingPaymentStatus() 로 클라이언트에서
  //     한 번 더 판정합니다.
  //
  //     ⚠ 2026-10 에 어드민(6건)과 매니저 마이페이지(2건) 가 서로 다른 건수를 보여준 적이 있었는데,
  //     원인은 상태/manager_id 판정이 아니라 "48시간 수락 기한 cutoff" 가 매니저 쪼게만 걸려 있던 것이었습니다.
  //     mypage-manager.html 의 loadRequests() 는 접수(created_at) 후 ACCEPT_WINDOW_HOURS(48시간)가 지난
  //     건을 조회 단계에서부터 제외합니다(매니저가 자가수락할 수 있는 기한이 끝났다고 보기 때문). 관리자
  //     목록엔 원래 이 cutoff 가 없어서, '48시간 지났지만 여전히 미배정' 인 건들이 어드민에만 추가로 보였고
  //     그만큼 매니저 화면보다 건수가 더 많았습니다 — manager_id 가 있거나 status 가 이상해서 샌 게 아니라
  //     "얼마나 오래된 신청까지 보여줄지" 기준 자체가 달랐던 것입니다. 이제 아래 cutoff 를 똑같이 맞춰서
  //     두 화면이 정확히 같은 건수를 보여줍니다(단, 어드민은 PAYMENT_PENDING 건도 함께 보이므로 매니저 화면보다
  //     건수가 더 많을 수 있습니다 — 그건 정상입니다).
  // ============================================================
  var ADMIN_ACCEPT_WINDOW_HOURS = 48; // mypage-manager.html 의 ACCEPT_WINDOW_HOURS 와 반드시 같은 값으로 유지
  function isAwaitingPaymentStatus(raw) {
    return String(raw == null ? '' : raw).trim().toUpperCase() === 'PAYMENT_PENDING';
  }
  function isAwaitingAssignmentStatus(raw) {
    var s = String(raw == null ? '' : raw).trim().toUpperCase();
    return s === 'PAYMENT_PENDING' || s === 'MATCHING_PENDING';
  }

  async function loadApplications() {
    var list = els.applicationsList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.applicationsCount) els.applicationsCount.hidden = true;

    var acceptCutoffIso = new Date(Date.now() - ADMIN_ACCEPT_WINDOW_HOURS * 3600e3).toISOString();
    var res = await supabaseClient
      .from('service_applications')
      .select('id, created_at, service_type, user_relation, user_contact, address, request_details, status, manager_id')
      .is('manager_id', null)
      .gt('created_at', acceptCutoffIso)
      .order('created_at', { ascending: true });

    if (res.error) {
      console.error('[Admin] 신청서 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_service_applications_select.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      renderErrorState(list, res.error.message, loadApplications);
      return;
    }

    // 쿼리가 실제로 어떤 행을 받았는지 항상 콘솔에 남깁니다 — "manager_id 가 있는 건이 계속 보인다"는
    // 보고가 반복됐을 때, 서버가 실제로 무엇을 돌려줬는지(.is('manager_id', null) 가 제대로 걸렸는지)와
    // 클라이언트 필터가 뭘 걸러냈는지를 바로 구분할 수 있어야 진단이 끝납니다.
    var rawRows = res.data || [];
    console.log('[Admin] service_applications 쿼리 결과(.is(manager_id,null) 적용됨):',
      rawRows.map(function (a) { return { id: a.id, status: a.status, manager_id: a.manager_id }; }));

    // 서버 쿼리(.is('manager_id', null))에만 맡기지 않고, 여기서 다시 한 번 엄격하게 거릅니다:
    //   - manager_id 가 조금이라도 값을 가지고 있으면(빈 문자열 '' 포함) 무조건 제외
    //   - status 는 isAwaitingAssignmentStatus() 로 판정(PAYMENT_PENDING/MATCHING_PENDING 만 통과,
    //     MATCHED/CANCELLED 등 그 외 전부는 false)
    // 두 조건을 모두 만족해야만 화면에 남습니다. 서버 필터가 혹시라도(캐시된 응답, 쿼리 누락 등) 제대로
    // 안 걸렸더라도 여기서 반드시 다시 걸러지도록 이중 방어합니다.
    var rows = rawRows.filter(function (a) {
      var hasManager = !!(a.manager_id && String(a.manager_id).trim());
      var isPending = isAwaitingAssignmentStatus(a.status);
      if (hasManager) {
        console.error('[Admin] 서버가 manager_id 가 있는 행을 돌려줬습니다(이 행은 화면에서 제외합니다) — ' +
          'RLS/쿼리 캐시를 확인하세요:', { id: a.id, status: a.status, manager_id: a.manager_id });
      }
      return !hasManager && isPending;
    });
    console.log('[Admin] 엄격 필터(manager_id 없음 AND isAwaitingAssignmentStatus) 통과한 최종 ' + rows.length + '건:',
      rows.map(function (a) { return { id: a.id, status: a.status, manager_id: a.manager_id }; }));
    if (els.applicationsCount) {
      els.applicationsCount.textContent = rows.length + '건';
      els.applicationsCount.hidden = false;
    }

    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">대기 중인 신청이 없습니다.</p>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(function (a) { list.appendChild(renderApplicationRow(a)); });
  }

  function renderApplicationRow(a) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    var paymentPending = isAwaitingPaymentStatus(a.status);

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(a.service_type || '케어 신청') + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(a.user_contact || '') + '</div></div>' +
      '<div class="admin-badge-group">' +
        '<span class="admin-badge is-pending">배정 대기</span>' +
        (paymentPending
          ? '<span class="admin-badge is-payment-pending">입금 대기</span>'
          : '<span class="admin-badge is-payment-done">결제 완료</span>') +
      '</div>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>신청 시각</dt><dd>' + formatDateTime(a.created_at) + '</dd>' +
      '<dt>주소</dt><dd>' + escapeHtml(a.address || '-') + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(a.request_details || '-') + '</dd>';

    var actions = document.createElement('div');
    actions.className = 'admin-row-actions';

    if (paymentPending) {
      var confirmPaymentBtn = document.createElement('button');
      confirmPaymentBtn.type = 'button';
      confirmPaymentBtn.className = 'admin-btn is-ghost';
      confirmPaymentBtn.textContent = '수동 입금 완료';
      confirmPaymentBtn.addEventListener('click', function () { confirmManualPayment(a, confirmPaymentBtn); });
      actions.appendChild(confirmPaymentBtn);
    }

    var assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.className = 'admin-btn is-primary';
    assignBtn.textContent = '수동 배정';
    assignBtn.addEventListener('click', function () { openAssignModal(a); });
    actions.appendChild(assignBtn);

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(actions);
    return row;
  }

  // PAYMENT_PENDING 건을 관리자가 수동으로 입금 확인 처리 — admin_confirm_manual_payment() RPC
  // (sql/service_application_status_standardization.sql)가 is_admin() 검증과 함께 status 를
  // 'MATCHING_PENDING' 으로 바꾸고, 연결된 가상계좌가 있으면 virtual_accounts.is_paid 도 같이 true 로 맞춥니다.
  async function confirmManualPayment(a, btn) {
    btn.disabled = true;
    var res = await supabaseClient.rpc('admin_confirm_manual_payment', { p_application_id: a.id });
    if (res.error) {
      console.error('[Admin] 수동 입금 확인 실패:', res.error.code, res.error.message,
        '→ sql/service_application_status_standardization.sql 을 Supabase SQL Editor 에서 실행했는지, ' +
        '이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      showToast('입금 확인에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('입금을 확인 처리했습니다.');
    loadApplications();
  }

  // ============================================================
  // 03-1. 매니저 수동 배정 모달 — UUID 직접 입력 대신, 등록된 매니저를 이름/연락처로 보고 고릅니다.
  //     fetchActiveManagersWithNames() 는 04번 섹션의 활동 매니저 목록과 같은 조회(+이름/연락처 보강)를
  //     공유합니다. accepted_at / status('matched') 는 DB 트리거(sync_application_status)가
  //     manager_id 변경 시 자동으로 채우므로 여기서는 manager_id 만 보냅니다 (sql/admin_rls_policies.sql 참고).
  // ============================================================
  var assignApplicationId = null;

  async function openAssignModal(application) {
    assignApplicationId = application.id;
    els.assignSub.textContent = (application.service_type || '케어 신청') + ' · ' + (application.user_contact || '연락처 미등록');
    els.assignError.hidden = true;
    els.assignSelect.innerHTML = '<option value="">불러오는 중…</option>';
    els.assignSelect.disabled = true;
    els.assignConfirmBtn.disabled = true;
    els.assignModal.hidden = false;

    var result = await fetchActiveManagersWithNames();

    if (assignApplicationId !== application.id) return; // 그 사이 모달을 닫거나 다른 신청으로 다시 열었으면 중단

    if (result.error) {
      console.error('[Admin] 매니저 목록 조회 실패(배정 모달):', result.error.code, result.error.message);
      els.assignSelect.innerHTML = '<option value="">매니저 목록을 불러오지 못했습니다</option>';
      els.assignError.textContent = '매니저 목록 조회에 실패했습니다: ' + result.error.message;
      els.assignError.hidden = false;
      return;
    }
    if (!result.rows.length) {
      els.assignSelect.innerHTML = '<option value="">활동 중인 매니저가 없습니다</option>';
      return;
    }

    els.assignSelect.innerHTML = '<option value="">매니저를 선택해 주세요</option>' +
      result.rows.map(function (m) {
        var statusLabel = m.activity_status === 'online' ? '온라인' : '휴식';
        return '<option value="' + m.id + '">' + escapeHtml(m.name) + ' (' + escapeHtml(m.phone) + ') · ' + statusLabel + '</option>';
      }).join('');
    els.assignSelect.disabled = false;
    els.assignConfirmBtn.disabled = false;
  }

  function closeAssignModal() {
    els.assignModal.hidden = true;
    assignApplicationId = null;
  }

  els.assignCloseBtn.addEventListener('click', closeAssignModal);
  els.assignCancelBtn.addEventListener('click', closeAssignModal);
  els.assignModal.addEventListener('mousedown', function (e) { if (e.target === els.assignModal) closeAssignModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.assignModal.hidden) closeAssignModal(); });

  els.assignConfirmBtn.addEventListener('click', async function () {
    if (!assignApplicationId) return;
    var managerId = els.assignSelect.value;
    if (!managerId) {
      els.assignError.textContent = '배정할 매니저를 선택해 주세요.';
      els.assignError.hidden = false;
      return;
    }
    els.assignError.hidden = true;
    els.assignConfirmBtn.disabled = true;

    var res = await supabaseClient
      .from('service_applications')
      .update({ manager_id: managerId })
      .eq('id', assignApplicationId);

    if (res.error) {
      console.error('[Admin] 수동 배정 실패:', res.error.code, res.error.message,
        '→ sql/admin_rls_policies.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      els.assignError.textContent = '배정에 실패했습니다: ' + res.error.message;
      els.assignError.hidden = false;
      els.assignConfirmBtn.disabled = false;
      return;
    }
    showToast('매니저를 배정했습니다.');
    closeAssignModal();
    loadApplications();
  });

  // ---------- 실시간 반영 (Supabase Realtime · Postgres Changes 구독) ----------
  // 매니저가 mypage-manager.html 에서 '수락하기'를 누르면(manager_id/status update) 이 화면도 새로고침
  // 없이 바로 목록에서 빠져야 합니다 — mypage.html 이 care_schedules 변경을 구독하는 것과 같은 패턴입니다.
  // ⚠ 이 구독이 이벤트를 받으려면 service_applications 에 관리자용 SELECT 정책과 Realtime publication 등록이
  // 모두 있어야 합니다 — sql/admin_service_applications_select.sql 참고. 둘 중 하나라도 빠지면 에러 없이
  // 그냥 이벤트가 오지 않습니다(조용히 실패).
  var serviceApplicationsChannel = null;
  function subscribeServiceApplicationChanges() {
    if (!supabaseClient || serviceApplicationsChannel) return;
    serviceApplicationsChannel = supabaseClient
      .channel('admin-service-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_applications' }, function (payload) {
        console.log('[Admin][Realtime] service_applications 변경 감지 → 목록 다시 불러오기:', payload);
        loadApplications();
      })
      .subscribe(function (status) { console.log('[Admin][Realtime] service_applications 구독 상태:', status); });
  }

  // ============================================================
  // 03-1. 배정 완료(진행 중) 케어 현황판
  //     care_schedules 중 manager_id 가 채워진(배정 완료) 건만, status != 'completed' 로 걸러서 보여줍니다.
  //     care_schedules_pending_unassigned_check 제약(status='pending' ⇔ manager_id is null, sql/
  //     supabase_schema_latest.sql 참고)이 DB 에서 항상 보장되므로, "manager_id is not null" 은
  //     "status != 'pending'" 과 정확히 같은 뜻입니다 — 그래서 이 조건과 status != 'completed' 를 같이
  //     걸면 배정됨/출발/도착(배정 완료 후 진행 중) 단계만 정확히 남습니다.
  //     매니저 이름/연락처/활동상태는 fetchActiveManagersWithNames() (04번 섹션, 활동 매니저 카드와 공유)
  //     결과를 id 로 매핑해서 붙입니다 — 보호자/어르신 정보는 care_schedules 에 이미 비정규화돼 있어
  //     따로 조인하지 않습니다.
  // ============================================================
  var CARE_STATUS_LABEL = { assigned: '배정됨', departed: '출발', arrived: '병원 도착' };

  var INPROGRESS_CARE_VISIBLE_LIMIT = 3;
  var inProgressExtraRowsWrap = null; // '더보기' 로 펼쳐지는 중인 래퍼(.admin-extra-rows) — 매 로드마다 새로 만듦

  // 텍스트 + 쉐브론 아이콘으로 구성된 '더보기' 버튼 라벨을 그립니다(.admin-showmore-btn 공통 사용).
  function setShowMoreBtnLabel(btn, text) {
    btn.innerHTML = '<span class="admin-showmore-label"></span>' +
      '<svg class="admin-showmore-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
      '<path d="M3 5L7 9L11 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.querySelector('.admin-showmore-label').textContent = text;
  }

  async function loadInProgressCare() {
    var list = els.inProgressCareList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.inProgressCareCount) els.inProgressCareCount.hidden = true;
    inProgressExtraRowsWrap = null;
    if (els.inProgressCareShowMoreBtn) els.inProgressCareShowMoreBtn.hidden = true;

    var results = await Promise.all([
      supabaseClient
        .from('care_schedules')
        .select('id, created_at, scheduled_at, manager_id, guardian_name, guardian_phone, senior_name, origin, destination, notes, status, payout_amount')
        .not('manager_id', 'is', null)
        .neq('status', 'completed')
        .order('scheduled_at', { ascending: true }),
      fetchActiveManagersWithNames()
    ]);
    var scheduleRes = results[0];
    var managersResult = results[1];

    if (scheduleRes.error) {
      console.error('[Admin] 진행 중인 케어 조회 실패:', scheduleRes.error.code, scheduleRes.error.message,
        '→ sql/admin_care_schedules_select.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      renderErrorState(list, scheduleRes.error.message, loadInProgressCare);
      return;
    }
    if (managersResult.error) {
      console.warn('[Admin] 매니저 이름/연락처 보조 조회 실패(진행 중인 케어 현황):', managersResult.error.code, managersResult.error.message);
    }

    var managerById = {};
    (managersResult.rows || []).forEach(function (m) { managerById[m.id] = m; });

    var rows = scheduleRes.data || [];
    if (els.inProgressCareCount) {
      els.inProgressCareCount.textContent = rows.length + '건';
      els.inProgressCareCount.hidden = false;
    }

    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">현재 배정되어 진행 중인 케어가 없습니다.</p>';
      return;
    }

    // [현장 인증 상세보기] 모달에 쓸 출발/도착 체크포인트를 한 번에 조회해 schedule_id 로 묶어 둡니다.
    var checkpointsByScheduleId = await loadCareCheckpointsFor(rows.map(function (s) { return s.id; }));

    list.innerHTML = '';
    var visibleRows = rows.slice(0, INPROGRESS_CARE_VISIBLE_LIMIT);
    var extraRows = rows.slice(INPROGRESS_CARE_VISIBLE_LIMIT);
    visibleRows.forEach(function (s) { list.appendChild(renderInProgressCareRow(s, managerById[s.manager_id], checkpointsByScheduleId[s.id])); });

    if (extraRows.length && els.inProgressCareShowMoreBtn) {
      var extraWrap = document.createElement('div');
      extraWrap.className = 'admin-extra-rows';
      extraRows.forEach(function (s) { extraWrap.appendChild(renderInProgressCareRow(s, managerById[s.manager_id], checkpointsByScheduleId[s.id])); });
      list.appendChild(extraWrap);

      inProgressExtraRowsWrap = extraWrap;
      els.inProgressCareShowMoreBtn.hidden = false;
      els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', 'false');
      setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, '진행 중인 케어 ' + extraRows.length + '건 더보기');
    }
  }

  // ============================================================
  // 03-2. 현장 인증 상세보기 (care_checkpoints.step = 'departure' / 'hospital_arrival')
  //     mypage.html / mypage-manager.html 의 동행 타임라인과 같은 테이블을 읽습니다. 같은 schedule_id +
  //     step 이 여러 번 쌓일 수 있어(재인증 시 새 행 추가, 수정/삭제 없음) checkpoint_at 오름차순으로 받은 뒤
  //     뒤에 오는(=더 최근) 값으로 덮어써서 각 schedule_id 당 단계별 "가장 최근" 한 건만 남깁니다.
  // ============================================================
  async function loadCareCheckpointsFor(scheduleIds) {
    var byScheduleId = {};
    if (!scheduleIds || !scheduleIds.length) return byScheduleId;

    var res = await supabaseClient
      .from('care_checkpoints')
      .select('schedule_id, step, lat, lng, accuracy, photo_url, checkpoint_at, created_at')
      .in('schedule_id', scheduleIds)
      .in('step', ['departure', 'hospital_arrival'])
      .order('checkpoint_at', { ascending: true });

    if (res.error) {
      console.warn('[Admin] 현장 인증(care_checkpoints) 조회 실패 — 버튼은 보이지만 상세 내용은 비어 있을 수 있습니다:',
        res.error.code, res.error.message);
      return byScheduleId;
    }

    (res.data || []).forEach(function (r) {
      if (!byScheduleId[r.schedule_id]) byScheduleId[r.schedule_id] = {};
      byScheduleId[r.schedule_id][r.step] = {
        at: r.checkpoint_at || r.created_at,
        lat: r.lat, lng: r.lng, accuracy: r.accuracy,
        photo: r.photo_url || null
      };
    });
    return byScheduleId;
  }

  // 목록을 다시 불러올 때마다(실시간 갱신 포함) 새 래퍼로 교체되므로, 리스너는 한 번만 등록하고
  // 클릭 시점에 inProgressExtraRowsWrap 이 가리키는 "현재" 래퍼를 토글합니다.
  if (els.inProgressCareShowMoreBtn) {
    els.inProgressCareShowMoreBtn.addEventListener('click', function () {
      if (!inProgressExtraRowsWrap) return;
      var expanded = inProgressExtraRowsWrap.classList.toggle('is-expanded');
      els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', String(expanded));
      setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, expanded
        ? '접기'
        : '진행 중인 케어 ' + inProgressExtraRowsWrap.children.length + '건 더보기');
    });
  }

  function renderInProgressCareRow(s, manager, checkpoints) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    var statusKey = (s.status === 'departed' || s.status === 'arrived') ? s.status : 'assigned';
    var statusLabel = CARE_STATUS_LABEL[statusKey] || s.status;

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(s.senior_name || '어르신') + '</div>' +
      '<div class="admin-row-sub">보호자 ' + escapeHtml(s.guardian_name || '미등록') + ' · ' + escapeHtml(s.guardian_phone || '연락처 미등록') + '</div></div>' +
      '<span class="admin-badge is-' + statusKey + '">' + escapeHtml(statusLabel) + '</span>';

    var managerText = manager
      ? manager.name + ' · ' + manager.phone + ' (' + (manager.activity_status === 'online' ? '온라인' : '휴식') + ')'
      : '매니저 정보를 찾을 수 없음 (id: ' + s.manager_id + ')';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>담당 매니저</dt><dd>' + escapeHtml(managerText) + '</dd>' +
      '<dt>예정 일시</dt><dd>' + formatDateTime(s.scheduled_at) + '</dd>' +
      '<dt>이동 경로</dt><dd>' + escapeHtml((s.origin || '출발지 확인 필요') + ' → ' + (s.destination || '목적지 확인 필요')) + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(s.notes || '-') + '</dd>';

    // 현장 인증(출발/도착) 상세보기 — 하나라도 작성되어 있으면 버튼 옆에 '인증 완료' 뱃지를 보여줍니다.
    var hasAnyCheckpoint = !!(checkpoints && (checkpoints.departure || checkpoints.hospital_arrival));
    var actions = document.createElement('div');
    actions.className = 'admin-row-actions is-verify';
    var verifyBtn = document.createElement('button');
    verifyBtn.type = 'button';
    verifyBtn.className = 'admin-btn is-ghost';
    verifyBtn.textContent = '현장 인증 상세보기';
    verifyBtn.addEventListener('click', function () { openCareVerifyModal(s, checkpoints || {}); });
    actions.appendChild(verifyBtn);
    if (hasAnyCheckpoint) {
      var doneBadge = document.createElement('span');
      doneBadge.className = 'admin-badge is-done';
      doneBadge.textContent = '인증 완료';
      actions.appendChild(doneBadge);
    }

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(actions);
    return row;
  }

  // ============================================================
  // 03-3. 현장 인증 상세보기 모달
  //     checkpoints = { departure: {at, lat, lng, accuracy, photo}, hospital_arrival: {...} } (loadCareCheckpointsFor 참고)
  // ============================================================
  var CARE_VERIFY_SECTION_LABEL = { departure: '출발', hospital_arrival: '도착' };
  // 모달을 열 때마다 1씩 늘려서, 주소 비동기 조회가 끝나기 전에 다른 일정으로 모달을 다시 열어도
  // (careVerifyAddr-* 의 id 는 매번 같으므로) 이전 일정의 주소가 새 일정 자리에 잘못 덮어써지지 않게 합니다.
  var careVerifyOpenToken = 0;

  function formatGpsCoords(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return '위도 ' + lat.toFixed(5) + ', 경도 ' + lng.toFixed(5);
  }

  // 한 단계(출발/도착)의 본문을 그려 넣습니다 — 인증 기록이 없으면 '미인증' 안내 박스만 보여주고,
  // 있으면 시각/GPS 주소(좌표)/사진 썸네일(클릭 시 라이트박스로 확대)을 보여줍니다.
  function renderCareVerifySection(container, step, cp, openToken) {
    container.innerHTML = '';
    if (!cp || !cp.at) {
      var empty = document.createElement('p');
      empty.className = 'verify-empty';
      empty.textContent = '아직 ' + CARE_VERIFY_SECTION_LABEL[step] + ' 인증이 기록되지 않았습니다 (미인증).';
      container.appendChild(empty);
      return;
    }

    var hasLoc = typeof cp.lat === 'number' && typeof cp.lng === 'number';
    var kv = document.createElement('dl');
    kv.className = 'verify-kv';
    kv.innerHTML =
      '<dt>인증 시각</dt><dd>' + formatDateTime(cp.at) + '</dd>' +
      '<dt>GPS 위치</dt><dd id="careVerifyAddr-' + step + '">' + escapeHtml(hasLoc ? (formatGpsCoords(cp.lat, cp.lng) + ' (주소 확인 중…)') : '위치 정보 없음') + '</dd>';
    container.appendChild(kv);

    if (hasLoc) {
      reverseGeocodeCached(cp.lat, cp.lng).then(function (address) {
        if (openToken !== careVerifyOpenToken) return; // 그 사이 모달을 닫았거나 다른 일정으로 다시 열었으면 반영하지 않음
        var dd = document.getElementById('careVerifyAddr-' + step);
        if (!dd) return;
        var coords = formatGpsCoords(cp.lat, cp.lng);
        dd.textContent = address ? (address + ' 인근 (' + coords + ')') : coords;
      });
    }

    if (cp.photo) {
      var photoBtn = document.createElement('button');
      photoBtn.type = 'button';
      photoBtn.className = 'verify-photo-btn';
      var img = document.createElement('img');
      img.src = cp.photo;
      img.alt = CARE_VERIFY_SECTION_LABEL[step] + ' 인증 사진';
      img.loading = 'lazy';
      var caption = CARE_VERIFY_SECTION_LABEL[step] + ' 인증 사진 원본 보기';
      photoBtn.appendChild(img);
      var label = document.createElement('span');
      label.textContent = caption;
      photoBtn.appendChild(label);
      photoBtn.addEventListener('click', function () { openCareVerifyLightbox(cp.photo, caption); });
      container.appendChild(photoBtn);
    } else {
      var noPhoto = document.createElement('p');
      noPhoto.className = 'verify-empty';
      noPhoto.textContent = '사진이 첨부되지 않았습니다.';
      container.appendChild(noPhoto);
    }
  }

  function openCareVerifyModal(schedule, checkpoints) {
    careVerifyOpenToken++;
    var openToken = careVerifyOpenToken;
    if (els.careVerifySub) {
      els.careVerifySub.textContent = (schedule.senior_name || '어르신') + ' · ' +
        (schedule.origin || '출발지 확인 필요') + ' → ' + (schedule.destination || '목적지 확인 필요');
    }
    renderCareVerifySection(els.careVerifyDepartureBody, 'departure', checkpoints.departure, openToken);
    renderCareVerifySection(els.careVerifyArrivalBody, 'hospital_arrival', checkpoints.hospital_arrival, openToken);
    els.careVerifyModal.hidden = false;
  }

  function closeCareVerifyModal() { els.careVerifyModal.hidden = true; careVerifyOpenToken++; }

  if (els.careVerifyModal) {
    els.careVerifyCloseBtn.addEventListener('click', closeCareVerifyModal);
    els.careVerifyCloseBtn2.addEventListener('click', closeCareVerifyModal);
    els.careVerifyModal.addEventListener('mousedown', function (e) { if (e.target === els.careVerifyModal) closeCareVerifyModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.careVerifyModal.hidden) closeCareVerifyModal(); });
  }

  // ---------- 인증 사진 원본 확대 라이트박스 ----------
  function openCareVerifyLightbox(photoUrl, caption) {
    els.careVerifyLightboxImg.src = photoUrl;
    els.careVerifyLightboxImg.alt = caption || '';
    els.careVerifyLightboxCaption.textContent = caption || '';
    els.careVerifyLightbox.hidden = false;
  }
  function closeCareVerifyLightbox() {
    els.careVerifyLightbox.hidden = true;
    els.careVerifyLightboxImg.removeAttribute('src');
  }
  if (els.careVerifyLightbox) {
    els.careVerifyLightboxCloseBtn.addEventListener('click', closeCareVerifyLightbox);
    els.careVerifyLightbox.addEventListener('mousedown', function (e) { if (e.target === els.careVerifyLightbox) closeCareVerifyLightbox(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.careVerifyLightbox.hidden) closeCareVerifyLightbox(); });
  }

  // 매니저가 출발/도착 인증을 남기거나(care_schedules.status update), admin이 수동 배정해서 새 일정이
  // 생기면(insert) 이 현황판도 새로고침 없이 바로 갱신됩니다.
  var careSchedulesChannel = null;
  function subscribeCareScheduleChanges() {
    if (!supabaseClient || careSchedulesChannel) return;
    careSchedulesChannel = supabaseClient
      .channel('admin-care-schedules')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_schedules' }, function (payload) {
        console.log('[Admin][Realtime] care_schedules 변경 감지 → 진행 중인 케어 현황판 다시 불러오기:', payload);
        loadInProgressCare();
      })
      .subscribe(function (status) { console.log('[Admin][Realtime] care_schedules 구독 상태:', status); });
  }

  // ============================================================
  // 04. 활동 중인 케어 매니저 관리 (managers.certification_verified = true)
  //     [매니저 권한 해제] 는 revoke_manager() RPC 로 certification_verified=false +
  //     profiles.role='guardian' 을 한 번에 처리합니다 (sql/manager_applications.sql 참고).
  //
  //     이름/연락처는 managers.id(= profiles.id) 로 profiles(name, phone) 를 직접 embed 조인해
  //     가져옵니다 — sql/admin_profiles_select.sql 로 관리자에게 profiles/managers 전체 SELECT 를
  //     열어야 다른 유저 행이 null 로 돌아오지 않습니다(이름 '미등록', 연락처 자리에 UUID 로
  //     대체되던 원인). profiles.name/phone 은 카카오 가입 트리거(handle_new_user)를 거치지 않은
  //     계정(관리자·테스트 계정 등 SQL 로 직접 만든 행)에서는 비어 있을 수 있으므로,
  //     manager_applications(승인된 신청서)에 적힌 이름/연락처를 보조 값으로 함께 조회해
  //     profiles 쪽이 비어 있을 때만 대신 채웁니다. 둘 다 없으면(신청 이력 자체가 없는 진짜
  //     테스트 행) '미등록'으로 남는 것이 맞습니다 — DB 에 아예 없는 값을 지어낼 수는 없습니다.
  // ============================================================
  // 매니저 목록(이름/연락처 보강 포함)을 공통으로 조회합니다 — 이 카드의 목록 렌더링과
  // 03-1 번 매니저 수동 배정 모달의 선택 목록이 이 함수 하나를 함께 씁니다.
  // 반환: { error, rows: [{ id, name, phone, certification, activity_status, approved_at }] }
  async function fetchActiveManagersWithNames() {
    var managersRes = await supabaseClient
      .from('managers')
      .select('id, certification, activity_status, approved_at, profiles(name, phone)')
      .eq('certification_verified', true)
      .order('approved_at', { ascending: false });

    if (managersRes.error) return { error: managersRes.error, rows: [] };

    var rawRows = managersRes.data || [];
    if (!rawRows.length) return { error: null, rows: [] };

    // profiles.name/phone 이 비어 있는 경우를 위한 보조 조회 (승인된 신청서의 이름/연락처)
    var ids = rawRows.map(function (m) { return m.id; });
    var appsRes = await supabaseClient
      .from('manager_applications')
      .select('user_id, name, phone, reviewed_at')
      .eq('status', 'approved')
      .in('user_id', ids)
      .order('reviewed_at', { ascending: false });

    if (appsRes.error) {
      console.warn('[Admin] 이름/연락처 보조 조회 실패(manager_applications):', appsRes.error.code, appsRes.error.message);
    }

    var infoById = {};
    (appsRes.data || []).forEach(function (a) {
      if (!infoById[a.user_id]) infoById[a.user_id] = { name: a.name, phone: a.phone }; // 최신순 정렬이라 먼저 나온 값을 채택
    });

    var rows = rawRows.map(function (m) {
      var profile = m.profiles || {};
      var fallback = infoById[m.id] || {};
      return {
        id: m.id,
        name: profile.name || fallback.name || '이름 미등록',
        phone: profile.phone || fallback.phone || '연락처 미등록',
        certification: m.certification,
        activity_status: m.activity_status,
        approved_at: m.approved_at
      };
    });

    return { error: null, rows: rows };
  }

  async function loadActiveManagers() {
    var list = els.activeManagersList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.activeManagersCount) els.activeManagersCount.hidden = true;

    var result = await fetchActiveManagersWithNames();

    if (result.error) {
      console.error('[Admin] 활동 매니저 조회 실패:', result.error.code, result.error.message,
        '→ sql/admin_profiles_select.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      renderErrorState(list, result.error.message, loadActiveManagers);
      return;
    }

    var rows = result.rows;
    if (els.activeManagersCount) {
      els.activeManagersCount.textContent = rows.length + '건';
      els.activeManagersCount.hidden = false;
    }

    if (!rows.length) {
      // managers 조회는 0건이지만, 승인된 지원 내역(manager_applications.status='approved')이 있다면
      // 실제로는 매니저가 있는데 RLS 가 다른 사람 행을 가려서 안 보이는 상황일 가능성이 높습니다.
      // (approve_manager_application() 의 managers insert 는 SECURITY DEFINER 라 RLS 를 안 타고 항상
      //  성공하지만, 그 뒤 이 화면이 하는 SELECT 는 RLS 를 그대로 받습니다 — managers_select_admin /
      //  profiles_select_admin 이 없으면(sql/admin_profiles_select.sql 미실행) 자기 행만 보여서 0건이 됩니다.
      //  manager_applications_select 는 sql/manager_applications.sql 에서 이미 is_admin() 전체 조회를
      //  허용하므로, 이 진단 쿼리 자체는 admin_profiles_select.sql 유무와 무관하게 항상 정확합니다.)
      var approvedCountRes = await supabaseClient
        .from('manager_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      if (!approvedCountRes.error && (approvedCountRes.count || 0) > 0) {
        console.warn('[Admin] 승인된 지원 내역은 ' + approvedCountRes.count + '건 있는데 활동 매니저 조회는 0건입니다 ' +
          '→ sql/admin_profiles_select.sql 이 아직 Supabase 에 실행되지 않아, RLS 가 다른 사용자의 managers/profiles 행을 가리고 있을 가능성이 높습니다.');
        list.innerHTML = '';
        var hint = document.createElement('div');
        hint.className = 'admin-error';
        hint.textContent = '승인된 지원 내역은 ' + approvedCountRes.count + '건 있지만 매니저 목록이 보이지 않습니다. ' +
          '관리자 RLS 정책(sql/admin_profiles_select.sql)이 Supabase 에 아직 적용되지 않았을 수 있습니다 — SQL Editor 에서 그 파일을 실행한 뒤 다시 시도해 주세요.';
        var retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.textContent = '다시 시도';
        retryBtn.addEventListener('click', loadActiveManagers);
        hint.appendChild(document.createElement('br'));
        hint.appendChild(retryBtn);
        list.appendChild(hint);
        return;
      }

      list.innerHTML = '<p class="admin-empty">활동 중인 매니저가 없습니다.</p>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(function (m) { list.appendChild(renderActiveManagerRow(m)); });
  }

  function renderActiveManagerRow(m) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(m.name) + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(m.phone) + '</div></div>' +
      '<span class="admin-badge is-verified">활동 중</span>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>자격증</dt><dd>' + escapeHtml(m.certification || '미등록') + '</dd>' +
      '<dt>활동 상태</dt><dd>' + (m.activity_status === 'online' ? '온라인' : '휴식') + '</dd>' +
      '<dt>승인일</dt><dd>' + (m.approved_at ? formatDateTime(m.approved_at) : '정보 없음') + '</dd>';

    var actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    var revokeBtn = document.createElement('button');
    revokeBtn.type = 'button';
    revokeBtn.className = 'admin-btn is-danger';
    revokeBtn.textContent = '매니저 권한 해제';
    revokeBtn.addEventListener('click', function () { revokeManager(m.id, m.name, revokeBtn, row); });
    actions.appendChild(revokeBtn);

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(actions);
    return row;
  }

  // 권한 해제는 managers 행을 지우지 않습니다(DELETE 아님) — certification_verified 를 false 로
  // 내리는 UPDATE 를 revoke_manager() RPC(SECURITY DEFINER, sql/manager_applications.sql) 안에서
  // 수행하고, profiles.role 도 'guardian' 으로 되돌립니다. 자격증/이력을 남겨 두면 나중에 다시
  // 승인할 때 정보를 재입력하지 않아도 되기 때문입니다. RPC 가 SECURITY DEFINER 라 RLS 를
  // 우회해서 실행되므로 managers 에 별도 DELETE 정책은 필요 없습니다(애초에 DELETE 를 하지 않음).
  // managerId 는 managers.id — managers 테이블에는 'user_id' 컬럼이 따로 없고, id 자체가
  // profiles.id(= auth.uid())를 가리키는 PK/FK 입니다(renderActiveManagerRow 가 넘기는 m.id 참고).
  async function revokeManager(managerId, name, btn, rowEl) {
    if (!managerId) {
      console.error('Revoke error: managerId 가 비어 있습니다. renderActiveManagerRow 에서 m.id 를 제대로 넘겼는지 확인하세요.', managerId);
      showToast('권한 해제에 실패했습니다: 매니저 ID 를 확인할 수 없습니다.');
      return;
    }

    var ok = window.confirm((name || '이 매니저') + '의 매니저 권한을 해제하고 일반 회원으로 전환할까요?');
    if (!ok) return;

    btn.disabled = true;
    console.log('[Admin] revoke_manager 호출:', { p_manager_id: managerId });

    try {
      var res = await supabaseClient.rpc('revoke_manager', { p_manager_id: managerId });
      console.log('[Admin] revoke_manager 응답:', res);

      if (res.error) {
        console.error('Revoke error:', res.error);
        console.error('[Admin] 매니저 권한 해제 실패:', res.error.code, res.error.message,
          res.error.code === 'PGRST202'
            ? '→ revoke_manager() 함수가 없습니다. sql/manager_applications.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.'
            : '→ 이 계정의 profiles.role 이 \'admin\' 인지, sql/admin_rls_policies.sql 이 실행됐는지 확인하세요.');
        showToast('권한 해제에 실패했습니다: ' + res.error.message);
        btn.disabled = false;
        return;
      }

      // RPC 는 성공을 알렸지만 실제로 DB 값이 바뀌었는지 한 번 더 직접 확인 (트리거가 조용히 되돌리는 등의
      // 상황까지 눈으로 확인할 수 있도록). 이 확인 자체가 실패해도(예: SELECT 권한 문제) 권한 해제 흐름은
      // 이미 끝난 것이므로 막지 않고 경고만 남깁니다.
      var verify = await supabaseClient.from('managers').select('id, certification_verified').eq('id', managerId).maybeSingle();
      console.log('[Admin] 해제 후 실제 DB 상태:', verify.data, verify.error);
      if (verify.data && verify.data.certification_verified === true) {
        console.error('Revoke error: RPC 는 성공을 반환했지만 certification_verified 가 여전히 true 입니다.', verify.data);
        showToast('권한 해제 요청은 성공했지만 상태가 반영되지 않았습니다. 콘솔 로그를 확인해 주세요.');
        btn.disabled = false;
        return;
      }

      showToast('매니저 권한을 해제했습니다.');

      // 목록 전체를 다시 불러오기 전에, 이 행을 화면에서 즉시 지워 재조회 타이밍과 무관하게 바로 보이게 함
      if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);

      await loadActiveManagers();
    } catch (e) {
      // 네트워크 오류 등 res.error 가 아니라 예외로 떨어지는 경우까지 잡아서, 버튼이 비활성인 채
      // 아무 반응도 없어 보이는 상태(사용자 입장에서 '눌러도 안 지워짐')로 남지 않게 합니다.
      console.error('Revoke error:', e);
      showToast('권한 해제 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e));
      btn.disabled = false;
    }
  }

  // ---------- 진입 ----------
  (async function init() {
    var access = await verifyAdminAccess();
    if (!access) return;

    renderAdminHeader(access.user, access.profile);
    bindLogout();
    loadPendingManagers();
    loadApplications();
    loadInProgressCare();
    loadActiveManagers();
    subscribeServiceApplicationChanges();
    subscribeCareScheduleChanges();

    supabaseClient.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();
})();
