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
    refreshBtn: $('adminRefreshBtn'),
    toast: $('adminToast'),
    summaryTodayCount: $('summaryTodayCount'),
    summaryPaymentPendingCount: $('summaryPaymentPendingCount'),
    summaryMatchingPendingCount: $('summaryMatchingPendingCount'),
    summaryInProgressCount: $('summaryInProgressCount'),
    summaryCancelledCount: $('summaryCancelledCount'),
    summaryCancelledCard: $('summaryCancelledCard'),
    searchInput: $('adminSearchInput'),
    statusFilterGroup: $('adminStatusFilter'),
    pendingManagersList: $('pendingManagersList'),
    pendingManagersCount: $('pendingManagersCount'),
    applicationsList: $('applicationsList'),
    applicationsCount: $('applicationsCount'),
    applicationsTitle: $('applicationsTitle'),
    applicationsDesc: $('applicationsDesc'),
    showOverdueAppsToggle: $('showOverdueAppsToggle'),
    activeManagersList: $('activeManagersList'),
    activeManagersCount: $('activeManagersCount'),
    managerSearchInput: $('managerSearchInput'),
    managerDutyFilter: $('managerDutyFilter'),
    settlementMonthInput: $('settlementMonthInput'),
    settlementCount: $('settlementCount'),
    settlementTableBody: $('settlementTableBody'),
    settlementTableFoot: $('settlementTableFoot'),
    settlementTotalCount: $('settlementTotalCount'),
    settlementTotalPayout: $('settlementTotalPayout'),
    settlementTotalTax: $('settlementTotalTax'),
    settlementTotalNet: $('settlementTotalNet'),
    settlementDetailModal: $('settlementDetailModal'),
    settlementDetailModalTitle: $('settlementDetailModalTitle'),
    settlementDetailModalSub: $('settlementDetailModalSub'),
    settlementDetailTableBody: $('settlementDetailTableBody'),
    settlementDetailTableFoot: $('settlementDetailTableFoot'),
    settlementDetailTotalPayment: $('settlementDetailTotalPayment'),
    settlementDetailTotalPayout: $('settlementDetailTotalPayout'),
    settlementDetailCloseBtn: $('settlementDetailCloseBtn'),
    settlementDetailCloseBtn2: $('settlementDetailCloseBtn2'),
    inProgressCareList: $('inProgressCareList'),
    inProgressCareCount: $('inProgressCareCount'),
    inProgressCareTitle: $('inProgressCareTitle'),
    inProgressCareDesc: $('inProgressCareDesc'),
    inProgressCareShowMoreBtn: $('inProgressCareShowMoreBtn'),
    reassignModal: $('reassignManagerModal'),
    reassignSub: $('reassignManagerSub'),
    reassignSelect: $('reassignManagerSelect'),
    reassignError: $('reassignManagerError'),
    reassignCloseBtn: $('reassignManagerCloseBtn'),
    reassignCancelBtn: $('reassignManagerCancelBtn'),
    reassignConfirmBtn: $('reassignManagerConfirmBtn'),
    extraChargeModal: $('extraChargeModal'),
    extraChargeSub: $('extraChargeSub'),
    extraChargeAmountInput: $('extraChargeAmountInput'),
    extraChargeMemoInput: $('extraChargeMemoInput'),
    extraChargeError: $('extraChargeError'),
    extraChargeCloseBtn: $('extraChargeCloseBtn'),
    extraChargeCancelBtn: $('extraChargeCancelBtn'),
    extraChargeConfirmBtn: $('extraChargeConfirmBtn'),
    careInterruptModal: $('careInterruptModal'),
    careInterruptSub: $('careInterruptSub'),
    careInterruptRefundSection: $('careInterruptRefundSection'),
    careInterruptPaymentInfo: $('careInterruptPaymentInfo'),
    careInterruptFeeInput: $('careInterruptFeeInput'),
    careInterruptRefundInfo: $('careInterruptRefundInfo'),
    careInterruptPackageSection: $('careInterruptPackageSection'),
    careInterruptRestoreFullBtn: $('careInterruptRestoreFullBtn'),
    careInterruptRestoreHalfBtn: $('careInterruptRestoreHalfBtn'),
    careInterruptMemoInput: $('careInterruptMemoInput'),
    careInterruptError: $('careInterruptError'),
    careInterruptCloseBtn: $('careInterruptCloseBtn'),
    careInterruptCancelBtn: $('careInterruptCancelBtn'),
    careInterruptConfirmBtn: $('careInterruptConfirmBtn'),
    careIssueList: $('careIssueList'),
    careIssueCount: $('careIssueCount'),
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
    careVerifyTreatmentBody: $('careVerifyTreatmentBody'),
    careVerifyReturnDepartureBody: $('careVerifyReturnDepartureBody'),
    careVerifyReturnCompleteBody: $('careVerifyReturnCompleteBody'),
    careVerifyCloseBtn: $('careVerifyCloseBtn'),
    careVerifyCloseBtn2: $('careVerifyCloseBtn2'),
    careVerifyLightbox: $('careVerifyLightbox'),
    careVerifyLightboxImg: $('careVerifyLightboxImg'),
    careVerifyLightboxCaption: $('careVerifyLightboxCaption'),
    careVerifyLightboxCloseBtn: $('careVerifyLightboxCloseBtn'),
    userPackagesCount: $('userPackagesCount'),
    userPackagesSearchInput: $('userPackagesSearchInput'),
    userPackagesTableBody: $('userPackagesTableBody'),
    userPackagesShowMoreWrap: $('userPackagesShowMoreWrap'),
    packageGroupDetailModal: $('packageGroupDetailModal'),
    packageGroupDetailModalTitle: $('packageGroupDetailModalTitle'),
    packageGroupDetailModalSub: $('packageGroupDetailModalSub'),
    packageGroupDetailTableBody: $('packageGroupDetailTableBody'),
    packageGroupDetailCloseBtn: $('packageGroupDetailCloseBtn'),
    packageGroupDetailCloseBtn2: $('packageGroupDetailCloseBtn2'),
    packageAdjustModal: $('packageAdjustModal'),
    packageAdjustModalSub: $('packageAdjustModalSub'),
    packageAdjustDeltaInput: $('packageAdjustDeltaInput'),
    packageAdjustMemoInput: $('packageAdjustMemoInput'),
    packageAdjustError: $('packageAdjustError'),
    packageAdjustCloseBtn: $('packageAdjustCloseBtn'),
    packageAdjustCancelBtn: $('packageAdjustCancelBtn'),
    packageAdjustConfirmBtn: $('packageAdjustConfirmBtn'),

    adminRefundModal: $('adminRefundModal'),
    adminRefundSub: $('adminRefundSub'),
    adminRefundBalanceInfo: $('adminRefundBalanceInfo'),
    adminRefundTypeFull: $('adminRefundTypeFull'),
    adminRefundTypePartial: $('adminRefundTypePartial'),
    adminRefundPartialSection: $('adminRefundPartialSection'),
    adminRefundAmountInput: $('adminRefundAmountInput'),
    adminRefundReasonInput: $('adminRefundReasonInput'),
    adminRefundError: $('adminRefundError'),
    adminRefundCloseBtn: $('adminRefundCloseBtn'),
    adminRefundCancelBtn: $('adminRefundCancelBtn'),
    adminRefundConfirmBtn: $('adminRefundConfirmBtn')
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

  function won(n) {
    return Number(n || 0).toLocaleString('ko-KR') + '원';
  }

  function formatDateTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // 구매일/만료일처럼 연도까지 구분해야 하는 날짜 전용 포맷(formatDateTime 은 연도를 생략합니다).
  function formatDateOnly(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  // user_packages.remaining_count/total_count 는 0.5회 단위 조정을 지원하려고 numeric(5,1) 입니다
  // (sql/care_interruption_refund_system.sql) — 정수면 소수점 없이, 0.5 단위면 그대로 보여줍니다.
  function formatPkgCount(n) {
    var v = Number(n || 0);
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }

  // 어르신 표시 라벨 — "홍길동 어르신 (만 75세, 지팡이 사용)" 형식으로 통일합니다(mypage-manager.html
  // 의 seniorLabel() 과 동일한 규칙). senior_name 에는 과거 데이터에 따라 '홍길동'(새 입력)·'홍길동
  // 어르신'(예전 관례)·'어르신 (자녀 신청)'/'어르신'(어르신 프로필 연동 전 자리표시자)가 섞여 있을 수
  // 있습니다 — 자리표시자는 실제 이름이 아니므로 SENIOR_PLACEHOLDER_RE 로 걸러 bare '어르신'으로
  // 되돌리고, 그 외(진짜 이름)에는 '어르신' 접미사가 없을 때만 붙입니다. 반환값은 escapeHtml 을 거치지
  // 않은 순수 텍스트이므로, innerHTML 에 넣을 때는 호출부에서 escapeHtml(seniorLabel(row)) 로 감싸야 합니다.
  var SENIOR_PLACEHOLDER_RE = /^어르신(\s*\(.*\))?$/;
  function seniorLabel(row) {
    var raw = row && row.senior_name ? String(row.senior_name).trim() : '';
    var hasRealName = raw && !SENIOR_PLACEHOLDER_RE.test(raw);
    var name = hasRealName ? (raw.indexOf('어르신') !== -1 ? raw : raw + ' 어르신') : '어르신';
    var extras = [];
    if (row && row.senior_age != null) extras.push('만 ' + row.senior_age + '세');
    if (row && row.senior_note) extras.push(row.senior_note);
    return extras.length ? name + ' (' + extras.join(', ') + ')' : name;
  }

  // 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, sql/user_coupons_checkout.sql
  // 의 expected_addon_total() 과 반드시 같은 코드 문자열을 써야 합니다(mypage-manager.html 에도 같은
  // 맵이 있습니다 — 양쪽을 같이 고쳐 주세요).
  var ADDON_LABELS = { URGENT_MATCHING: '긴급 매칭 서비스' };
  function addonLabels(row) {
    var codes = row && Array.isArray(row.addon_codes) ? row.addon_codes : [];
    return codes.map(function (code) { return ADDON_LABELS[code] || code; });
  }

  // '배정 완료(진행 중) 케어 현황' 카드의 경과일 태그 — created_at(신청 시각)을 "오늘 자정" 기준 날짜 차이로
  // 계산합니다(시:분 단위 ms 차이가 아니라 날짜 단위라서, 어제 23시에 신청했어도 "어제 신청"으로 보입니다).
  // level 은 배지 색상 분기용: 7일 이상 danger(빨강), 3일 이상 warn(주황), 그 미만은 normal.
  function formatDaysSinceCreated(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return null;

    var startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    var startOfCreated = new Date(d);
    startOfCreated.setHours(0, 0, 0, 0);

    var days = Math.round((startOfToday.getTime() - startOfCreated.getTime()) / 86400000);
    var label = days <= 0 ? '오늘 신청' : days === 1 ? '어제 신청' : days + '일 전 신청';
    var level = days >= 7 ? 'danger' : days >= 3 ? 'warn' : 'normal';
    return { days: days, label: label, level: level };
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

  // ============================================================
  // 00-1. 검색어 · 상태 필터 (상단 요약 카드 바로 아래 필터 바)
  //     오늘의 케어 신청 카드와 배정 완료(진행 중) 케어 현황 카드 둘 다 이 전역 상태를 같이 참조해서
  //     다시 그립니다 — 서버 재조회 없이, 이미 받아 둔 행(lastApplicationsRows/lastInProgressRows)을
  //     그대로 클라이언트에서 거르기만 합니다(완료 필터만 예외 — 02-2 참고).
  // ============================================================
  var currentSearchText = '';
  var currentStatusFilter = 'all'; // all | payment_pending | matching_pending | in_progress | completed

  // '활동 중인 케어 매니저' 카드 전용 검색/필터 — 위 검색 바와는 별개 상태입니다. 매니저 목록은
  // fetchActiveManagersWithNames() 로 한 번만 받아 activeManagersCache 에 캐시해 두고, 검색/필터가
  // 바뀔 때마다 서버 재조회 없이 그 캐시를 다시 걸러서 그립니다.
  var activeManagersCache = [];
  var currentManagerSearchText = '';
  var currentManagerDutyFilter = 'all'; // all | online | break

  function normalizeSearchText(value) {
    return String(value == null ? '' : value).toLowerCase();
  }

  function matchesSearch(fields) {
    if (!currentSearchText) return true;
    var needle = currentSearchText;
    for (var i = 0; i < fields.length; i++) {
      if (normalizeSearchText(fields[i]).indexOf(needle) !== -1) return true;
    }
    return false;
  }

  if (els.searchInput) {
    els.searchInput.addEventListener('input', function () {
      currentSearchText = normalizeSearchText(els.searchInput.value).trim();
      renderApplicationsList();
      renderCancelledApplicationsList(); // currentStatusFilter !== 'cancelled' 이면 내부에서 바로 return
      renderInProgressCareList();
    });
  }

  if (els.showOverdueAppsToggle) {
    els.showOverdueAppsToggle.addEventListener('change', function () {
      // '취소' 탭을 보고 있을 때 이 체크박스를 누르면: loadApplications() 는 '오늘의 케어 신청' 큐
      // (#applicationsList)에 '불러오는 중…' 을 써 놓고 PAYMENT_PENDING/MATCHING_PENDING 만 조회해 오지만,
      // renderApplicationsList() 는 currentStatusFilter === 'cancelled' 일 때 바로 return 해버려서
      // 그 '불러오는 중…' 문구를 아무도 지우지 않고 그대로 멈춰 있는 버그가 있었습니다. 지금은 지금
      // 보고 있는 탭에 맞는 로더를 직접 불러 항상 로딩이 끝까지 처리되도록 합니다.
      if (currentStatusFilter === 'cancelled') loadCancelledApplications();
      else loadApplications();
    });
  }

  // '완료' 필터를 누르면 이 카드가 '배정 완료(진행 중) 케어 현황' → '케어 완료 내역'으로 바뀌어
  // 보여준다는 걸 알 수 있도록 제목/설명도 같이 바꿉니다 — 예전에는 리스트 내용만 바뀌고 카드
  // 제목·설명은 그대로 "완료된 건은 제외"라고 남아 있어서, 완료 건이 있어도 이 카드에서 보고 있다는
  // 걸 알기 어려웠습니다(사용자 보고: "케어 완료 내역을 모아보는 섹션/필터가 없다").
  var INPROGRESS_CARE_COPY = {
    default: {
      title: '배정 완료(진행 중) 케어 현황',
      desc: '이미 매니저가 배정되어 진행 중인 건만 모아서 보여줍니다(완료된 건은 제외). 위 \'오늘의 케어 신청 · 수동 배정\'과는 반대로, 여기 나오는 건들은 전부 담당 매니저가 이미 정해져 있는 상태입니다.'
    },
    completed: {
      title: '케어 완료 내역',
      desc: '강제 완료되었거나 정상적으로 케어 완료 처리된 건만 모아서 보여줍니다. 기본 요금을 초과한 건은 각 행의 [추가 요금 청구] 버튼으로 청구할 수 있습니다.'
    },
    all: {
      title: '배정 완료 케어 현황 (전체)',
      desc: '매니저가 배정된 케어를 진행 중/완료 구분 없이 모두 모아서 보여줍니다. 완료 건에는 [추가 요금 청구] 버튼이 같이 나타납니다.'
    }
  };
  function updateInProgressCareSectionCopy() {
    if (!els.inProgressCareTitle || !els.inProgressCareDesc) return;
    var copy = INPROGRESS_CARE_COPY[currentStatusFilter] || INPROGRESS_CARE_COPY.default;
    els.inProgressCareTitle.textContent = copy.title;
    els.inProgressCareDesc.textContent = copy.desc;
  }

  // '취소' 필터를 누르면 이 카드가 '오늘의 케어 신청 · 수동 배정' → '취소된 신청 내역'으로 바뀌어
  // 보여준다는 걸 제목/설명으로도 알립니다 — INPROGRESS_CARE_COPY 와 같은 패턴.
  var APPLICATIONS_CARD_COPY = {
    default: {
      title: '오늘의 케어 신청 · 수동 배정',
      desc: '아직 담당 매니저가 지정되지 않은 건만, 매니저 마이페이지의 \'배정 신청 대기\'와 정확히 같은 기준(접수 48시간 이내)으로 표시됩니다. 매니저가 수락하거나 여기서 배정하는 즉시 이 목록에서 빠집니다. (이미 배정되어 진행 중인 건은 아래 \'배정 완료(진행 중) 케어 현황\' 카드에서 확인하세요.)'
    },
    cancelled: {
      title: '취소된 신청 내역',
      desc: '보호자가 마이페이지에서 직접 취소했거나 관리자가 취소 처리한 신청을 모두 모아서 보여줍니다(결제 전/후 구분 없이 최신순, 20건씩 \'더보기\'로 더 볼 수 있습니다). 환불은 PG사 결제 내역을 확인한 뒤 관리자가 직접(수동으로) 처리해 주세요 — 이 화면에서 자동으로 환불되지 않습니다.'
    }
  };
  function updateApplicationsSectionCopy() {
    if (!els.applicationsTitle || !els.applicationsDesc) return;
    var copy = APPLICATIONS_CARD_COPY[currentStatusFilter] || APPLICATIONS_CARD_COPY.default;
    els.applicationsTitle.textContent = copy.title;
    els.applicationsDesc.textContent = copy.desc;
  }

  if (els.statusFilterGroup) {
    els.statusFilterGroup.addEventListener('click', function (e) {
      var btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      var status = btn.getAttribute('data-status');
      if (status === currentStatusFilter) return;
      currentStatusFilter = status;

      Array.prototype.forEach.call(els.statusFilterGroup.querySelectorAll('.admin-filter-chip'), function (chip) {
        chip.classList.toggle('is-active', chip === btn);
      });

      updateInProgressCareSectionCopy();
      updateApplicationsSectionCopy();
      if (currentStatusFilter === 'cancelled') {
        loadCancelledApplications();
      } else {
        renderApplicationsList();
      }
      if (currentStatusFilter === 'completed') {
        loadCompletedCare();
      } else if (currentStatusFilter === 'all') {
        loadAllCare();
      } else if (careViewMode !== 'in_progress') {
        loadInProgressCare(); // 완료/전체 필터에서 다른 필터로 돌아갈 때만 진행 중 건을 다시 불러옵니다
      } else {
        renderInProgressCareList();
      }
    });
  }

  if (els.managerSearchInput) {
    els.managerSearchInput.addEventListener('input', function () {
      currentManagerSearchText = normalizeSearchText(els.managerSearchInput.value).trim();
      renderActiveManagersList();
    });
  }

  if (els.managerDutyFilter) {
    els.managerDutyFilter.addEventListener('click', function (e) {
      var btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      var duty = btn.getAttribute('data-duty');
      if (duty === currentManagerDutyFilter) return;
      currentManagerDutyFilter = duty;
      Array.prototype.forEach.call(els.managerDutyFilter.querySelectorAll('.admin-filter-chip'), function (chip) {
        chip.classList.toggle('is-active', chip === btn);
      });
      renderActiveManagersList();
    });
  }

  // ============================================================
  // 00-2. 핵심 현황 요약 카드 (오늘 신청 / 입금 대기 / 매칭 대기 / 진행 중 케어 / 취소 건수)
  //     목록 카드들과 별개로, 조건 없이 전체 건수를 직접 count 쿼리로 받습니다 — 목록 카드들은
  //     각자의 화면 목적에 맞춰 조회 범위를 좁혀 놨기 때문에(예: 48시간 cutoff) 그 결과만으로는
  //     "오늘 전체 신청 수" 같은 요약 숫자를 정확히 낼 수 없습니다.
  //     취소 건수는 fetchCancelledApplicationsPage() 가 쓰는 것과 똑같은 상태값 묶음
  //     ('CANCELLED' 보호자/관리자 수동 취소 + 'EXPIRED_CANCELLED' 48시간 자동 취소)을 세어,
  //     이 카드 숫자와 [취소] 필터로 들어가서 보이는 목록 건수가 항상 일치하도록 맞춥니다.
  // ============================================================
  async function loadSummaryStats() {
    var todayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    var results = await Promise.all([
      supabaseClient.from('service_applications').select('id', { count: 'exact', head: true }).gte('created_at', todayStartIso),
      supabaseClient.from('service_applications').select('id', { count: 'exact', head: true }).eq('status', 'PAYMENT_PENDING'),
      supabaseClient.from('service_applications').select('id', { count: 'exact', head: true }).eq('status', 'MATCHING_PENDING'),
      supabaseClient.from('care_schedules').select('id', { count: 'exact', head: true }).not('manager_id', 'is', null).neq('status', 'completed').neq('status', 'cancelled'),
      supabaseClient.from('service_applications').select('id', { count: 'exact', head: true }).in('status', ['CANCELLED', 'EXPIRED_CANCELLED'])
    ]);

    var labels = [els.summaryTodayCount, els.summaryPaymentPendingCount, els.summaryMatchingPendingCount, els.summaryInProgressCount, els.summaryCancelledCount];
    results.forEach(function (res, i) {
      var el = labels[i];
      if (!el) return;
      if (res.error) {
        console.warn('[Admin] 요약 카드 집계 실패:', res.error.code, res.error.message);
        el.textContent = '-';
        return;
      }
      el.textContent = (res.count || 0) + '건';
    });
  }

  // [취소 건수] 요약 카드 클릭 → 아래 상태 필터의 [취소] 칩을 그대로 눌러 줍니다. 필터 전환/목록 로드
  // 로직을 여기 다시 옮겨 적지 않고 기존 칩의 클릭 핸들러(위 els.statusFilterGroup 리스너)를 그대로
  // 재사용해, 두 진입점(카드 클릭 / 칩 클릭)의 동작이 항상 같게 유지됩니다.
  if (els.summaryCancelledCard) {
    els.summaryCancelledCard.addEventListener('click', function () {
      var chip = els.statusFilterGroup && els.statusFilterGroup.querySelector('.admin-filter-chip[data-status="cancelled"]');
      if (chip) chip.click();
      var target = els.applicationsTitle && els.applicationsTitle.closest('.admin-card');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
    var reason = window.prompt('반려 사유를 입력해 주세요 (선택 사항).');
    if (reason === null) return false; // 사용자가 '취소'를 누름 — 반려 처리를 하지 않고 중단
    reason = reason.trim() || null; // 입력칸을 비워둔 채 확인을 누른 경우는 '사유 없음'으로 처리

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
  //     mypage-manager.html 의 매니저용 신청 대기 목록은 PAYMENT_PENDING(결제 전) 건은 보여주지 않는다는
  //     점만 다르고, "매칭 대기로 쳐 줄 상태값이 뭔지"는 양쪢이 반드시 같은 규칙(isPendingApplicationStatus(),
  //     SQL의 is_pending_application_status()와 동일)을 공유합니다 — 한쪽만 더 엄격한 문자열(예: 'MATCHING_PENDING'
  //     완전 일치)로 걸던 시기엔, 아직 표준화 안 된 과거 상태값의 신청서가 한쪽 화면에만 안 보이는 불일치가
  //     있었습니다(2026-11 수정). 이 두 함수는 항상 같이 고치세요.
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
  // service_applications.status 가 "매니저 배정을 기다리는(=매니저가 봐야 하는) 상태"인지 판정 —
  // sql/supabase_schema_latest.sql(원본 sql/service_application_status_standardization.sql)의
  // is_pending_application_status() 와 반드시 같은 규칙을 유지합니다. 그 SQL 함수가 매니저 쪽 RLS
  // (service_applications_select_managers)와 accept_service_application() 의 수락 가능 조건을
  // 결정하는 "진짜" 기준이라, 여기(관리자 화면)가 이보다 더 엄격한 문자열만 인정하면 — 아직
  // 표준화되지 않은 과거 상태값('', 'pending', 'waiting_matching' 등, RLS는 이미 통과시키는 값들)의
  // 신청서가 매니저 화면에는 보이는데 관리자 화면에는 안 보이는(또는 그 반대) 불일치가 생깁니다.
  // mypage-manager.html 의 isPendingApplicationStatus() 와 같은 로직입니다 — 함께 고쳐 주세요.
  function isPendingApplicationStatus(raw) {
    var original = raw == null ? '' : String(raw);
    var s = original.trim().toLowerCase();
    if (s === 'cancelled' || s === 'canceled' || s === 'cancel' || original.indexOf('취소') !== -1) return false;
    var SYNONYMS = ['matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching'];
    if (SYNONYMS.indexOf(s) !== -1) return true;
    return /접수|대기|신청/.test(original);
  }
  function isAwaitingAssignmentStatus(raw) {
    return isAwaitingPaymentStatus(raw) || isPendingApplicationStatus(raw);
  }

  // '경과' 뱃지 판정 — 희망 일시는 apply.html 에서 request_details 안에 연도 없는 자유 텍스트로만 저장돼
  // 안정적으로 파싱할 수 없으므로(예: "10월 15일 (목) 오후 4시 26분"), 신청 시각(created_at) 하나만으로
  // 판정합니다. ADMIN_ACCEPT_WINDOW_HOURS 와 같은 48시간 기준을 그대로 재사용합니다.
  function isCreatedAtOverdue(createdAtIso) {
    if (!createdAtIso) return false;
    var createdMs = new Date(createdAtIso).getTime();
    if (isNaN(createdMs)) return false;
    return (Date.now() - createdMs) >= ADMIN_ACCEPT_WINDOW_HOURS * 3600e3;
  }

  // '더보기' 버튼 — 오늘의 케어 신청/취소된 신청 내역 두 목록이 공용으로 씁니다. 로딩 중에는 즉시
  // disabled 처리해 응답이 오기 전에 더블 클릭으로 같은 페이지를 두 번 요청하는 것을 막습니다.
  var ADMIN_LIST_PAGE_SIZE = 20;
  function createLoadMoreButton(loading, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-showmore-btn is-pagination';
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="admin-spinner" aria-hidden="true"></span><span>불러오는 중…</span>';
    } else {
      btn.textContent = '더보기 (+' + ADMIN_LIST_PAGE_SIZE + '건)';
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        onClick();
      });
    }
    return btn;
  }

  // 서버에서 받은 원본 행 — 검색/상태 필터가 바뀔 때마다 재조회하지 않고 이 캐시를 다시 그립니다.
  // '더보기'를 누르면 다음 페이지가 이 배열 뒤에 그대로 추가됩니다(전체 재조회는 loadApplications() 만 수행).
  var lastApplicationsRows = [];
  var applicationsOffset = 0;       // 다음 .range() 요청 시작 위치(서버 원본 행 기준 — 엄격 필터 통과 여부와 무관)
  var applicationsHasMore = false;
  var applicationsLoadingMore = false;

  async function loadApplications() {
    var list = els.applicationsList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.applicationsCount) els.applicationsCount.hidden = true;

    lastApplicationsRows = [];
    applicationsOffset = 0;
    applicationsHasMore = false;
    applicationsLoadingMore = false;
    var ok = await fetchApplicationsPage(true);
    if (ok) renderApplicationsList();
  }

  async function loadMoreApplications() {
    if (applicationsLoadingMore || !applicationsHasMore) return;
    applicationsLoadingMore = true;
    renderApplicationsList(); // 버튼을 '불러오는 중…' 상태로 즉시 다시 그림
    await fetchApplicationsPage(false);
    applicationsLoadingMore = false;
    renderApplicationsList();
  }

  // isFirstPage=true: loadApplications() 의 첫 페이지 — 실패 시 목록 전체를 에러 화면으로 교체합니다.
  // isFirstPage=false: '더보기' — 실패해도 이미 그려진 목록은 그대로 두고 토스트만 띄웁니다.
  async function fetchApplicationsPage(isFirstPage) {
    var list = els.applicationsList;
    if (!list) return false;

    // '48시간 지난 신청도 보기' 체크박스가 켜져 있으면 접수 기한 cutoff 를 걸지 않습니다 — 테스트/오류로
    // 등록돼 기한이 지난 뒤 이 목록에서 영영 숨어 있던 건까지 불러와 [취소] 버튼으로 정리할 수 있게
    // 하려는 용도입니다. 기본값(꺼짐)은 매니저 마이페이지와 정확히 같은 건수를 유지합니다(위 2026-10 참고).
    // 48시간이 지나면 보호자가 재신청해야 하는 구조라, 체크박스가 꺼져 있는 기본 화면에서는 유효한
    // 신청만 최신순(내림차순)으로 보여줍니다 — 체크박스를 켰을 때만 cutoff 가 풀려 '경과' 뱃지가 붙은
    // 지난 건도 함께(최신 건들과 뒤섞여) 나타납니다.
    var showOverdue = !!(els.showOverdueAppsToggle && els.showOverdueAppsToggle.checked);
    var acceptCutoffIso = new Date(Date.now() - ADMIN_ACCEPT_WINDOW_HOURS * 3600e3).toISOString();
    var query = supabaseClient
      .from('service_applications')
      .select('id, created_at, service_type, user_relation, senior_name, senior_age, senior_note, user_contact, address, request_details, status, manager_id, addon_codes, is_package_used, package_remaining_after')
      .is('manager_id', null);
    if (!showOverdue) query = query.gt('created_at', acceptCutoffIso);
    // ADMIN_LIST_PAGE_SIZE+1건을 받아, 실제로 다음 페이지가 더 남아 있는지(applicationsHasMore)를
    // 별도 count 쿼리 없이 판단합니다.
    query = query.order('created_at', { ascending: false }).range(applicationsOffset, applicationsOffset + ADMIN_LIST_PAGE_SIZE);
    var res = await query;

    if (res.error) {
      console.error('[Admin] 신청서 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_service_applications_select.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      if (isFirstPage) renderErrorState(list, res.error.message, loadApplications);
      else showToast('목록을 더 불러오지 못했습니다: ' + res.error.message);
      return false;
    }

    // 쿼리가 실제로 어떤 행을 받았는지 항상 콘솔에 남깁니다 — "manager_id 가 있는 건이 계속 보인다"는
    // 보고가 반복됐을 때, 서버가 실제로 무엇을 돌려줬는지(.is('manager_id', null) 가 제대로 걸렸는지)와
    // 클라이언트 필터가 뭘 걸러냈는지를 바로 구분할 수 있어야 진단이 끝납니다.
    var rawRows = res.data || [];
    console.log('[Admin] service_applications 쿼리 결과(.is(manager_id,null) 적용됨):',
      rawRows.map(function (a) { return { id: a.id, status: a.status, manager_id: a.manager_id }; }));

    applicationsHasMore = rawRows.length > ADMIN_LIST_PAGE_SIZE;
    var pageRawRows = rawRows.slice(0, ADMIN_LIST_PAGE_SIZE);
    applicationsOffset += pageRawRows.length;

    // 서버 쿼리(.is('manager_id', null))에만 맡기지 않고, 여기서 다시 한 번 엄격하게 거릅니다:
    //   - manager_id 가 조금이라도 값을 가지고 있으면(빈 문자열 '' 포함) 무조건 제외
    //   - status 는 isAwaitingAssignmentStatus() 로 판정(PAYMENT_PENDING 이거나 is_pending_application_status()
    //     계열(MATCHING_PENDING 및 그 과거 동의어)만 통과, MATCHED/CANCELLED 등 그 외 전부는 false)
    // 두 조건을 모두 만족해야만 화면에 남습니다. 서버 필터가 혹시라도(캐시된 응답, 쿼리 누락 등) 제대로
    // 안 걸렸더라도 여기서 반드시 다시 걸러지도록 이중 방어합니다.
    var pageRows = pageRawRows.filter(function (a) {
      var hasManager = !!(a.manager_id && String(a.manager_id).trim());
      var isPending = isAwaitingAssignmentStatus(a.status);
      if (hasManager) {
        console.error('[Admin] 서버가 manager_id 가 있는 행을 돌려줬습니다(이 행은 화면에서 제외합니다) — ' +
          'RLS/쿼리 캐시를 확인하세요:', { id: a.id, status: a.status, manager_id: a.manager_id });
      }
      return !hasManager && isPending;
    });
    console.log('[Admin] 엄격 필터(manager_id 없음 AND isAwaitingAssignmentStatus) 통과한 이번 페이지 ' + pageRows.length + '건:',
      pageRows.map(function (a) { return { id: a.id, status: a.status, manager_id: a.manager_id }; }));

    lastApplicationsRows = lastApplicationsRows.concat(pageRows);
    return true;
  }

  // 검색어 + 상태 필터(입금대기/매칭대기)를 lastApplicationsRows 에 적용해 다시 그립니다.
  // '진행중'/'완료' 필터는 이 카드 범위 밖의 상태라 항상 0건으로 비워 둡니다(배정 완료 카드 쪽에서 보여줍니다).
  // '취소' 필터는 renderCancelledApplicationsList() 가 이 카드(#applicationsList)를 직접 그리므로
  // 여기서는 아무것도 하지 않고 빠집니다(덮어쓰면 서로 그린 내용을 지워 버리는 경쟁이 생김).
  function renderApplicationsList() {
    if (currentStatusFilter === 'cancelled') return;
    var list = els.applicationsList;
    if (!list) return;

    var showOverdueToggleOn = !!(els.showOverdueAppsToggle && els.showOverdueAppsToggle.checked);

    var rows = lastApplicationsRows.filter(function (a) {
      var paymentPending = isAwaitingPaymentStatus(a.status);
      if (currentStatusFilter === 'payment_pending' && !paymentPending) return false;
      if (currentStatusFilter === 'matching_pending' && paymentPending) return false;
      if (currentStatusFilter === 'in_progress' || currentStatusFilter === 'completed') return false;
      return matchesSearch([a.user_contact, a.service_type, a.address]);
    });

    if (els.applicationsCount) {
      els.applicationsCount.textContent = rows.length + '건';
      els.applicationsCount.hidden = false;
    }

    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">' +
        (lastApplicationsRows.length ? '조건에 맞는 신청이 없습니다.' : '대기 중인 신청이 없습니다.') + '</p>';
    } else {
      list.innerHTML = '';
      rows.forEach(function (a) { list.appendChild(renderApplicationRow(a, showOverdueToggleOn)); });
    }

    // '진행중'/'완료' 필터에서는 이 카드가 애초에 항상 0건이라(위에서 걸러짐) '더보기'도 의미가 없으므로 숨깁니다.
    if (applicationsHasMore && currentStatusFilter !== 'in_progress' && currentStatusFilter !== 'completed') {
      list.appendChild(createLoadMoreButton(applicationsLoadingMore, loadMoreApplications));
    }
  }

  function renderApplicationRow(a, showOverdueToggleOn) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    var paymentPending = isAwaitingPaymentStatus(a.status);
    // '48시간 지난 신청도 보기'가 꺼져 있으면 cutoff 때문에 이 행은 애초에 48시간을 넘길 수 없지만,
    // 혹시 몰라 토글 상태로도 한 번 더 가드합니다(지침: 체크박스를 켰을 때만 '경과' 뱃지가 보여야 함).
    var overdue = showOverdueToggleOn && isCreatedAtOverdue(a.created_at);

    var addons = addonLabels(a);

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(a.service_type || '케어 신청') + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(a.user_contact || '') + '</div></div>' +
      '<div class="admin-badge-group">' +
        (overdue ? '<span class="admin-badge is-overdue">경과</span>' : '') +
        '<span class="admin-badge is-pending">배정 대기</span>' +
        (a.is_package_used
          ? '<span class="admin-badge is-package">패키지 차감' +
              (a.package_remaining_after != null ? ' · 신청 당시 잔여 ' + formatPkgCount(a.package_remaining_after) + '회' : '') +
            '</span>'
          : (paymentPending
              ? '<span class="admin-badge is-payment-pending">입금 대기</span>'
              : '<span class="admin-badge is-payment-done">결제 완료</span>')) +
        addons.map(function (label) { return '<span class="admin-badge is-addon">' + escapeHtml(label) + '</span>'; }).join('') +
      '</div>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>어르신</dt><dd>' + escapeHtml(seniorLabel(a) + (a.user_relation ? ' · ' + a.user_relation + ' 신청' : '')) + '</dd>' +
      '<dt>신청 시각</dt><dd>' + formatDateTime(a.created_at) + '</dd>' +
      '<dt>주소</dt><dd>' + escapeHtml(a.address || '-') + '</dd>' +
      '<dt>선택 옵션</dt><dd>' + escapeHtml(addons.length ? addons.join(', ') : '없음') + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(a.request_details || '-') + '</dd>';

    var actions = document.createElement('div');
    actions.className = 'admin-row-actions';

    if (paymentPending) {
      var confirmPaymentBtn = document.createElement('button');
      confirmPaymentBtn.type = 'button';
      confirmPaymentBtn.className = 'admin-btn is-ghost';
      confirmPaymentBtn.textContent = '수동 입금 확인';
      confirmPaymentBtn.addEventListener('click', function () { confirmManualPayment(a, confirmPaymentBtn); });
      actions.appendChild(confirmPaymentBtn);
    }

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'admin-btn is-danger';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', function () { cancelApplication(a, cancelBtn); });
    actions.appendChild(cancelBtn);

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

  // ============================================================
  // 03-1. 취소된 신청 (service_applications.status = 'CANCELLED')
  //     사용자가 마이페이지에서 직접 취소(cancel_my_application RPC)했거나, 관리자가 위 [취소]
  //     버튼으로 취소 처리한 건을 모아서 보여줍니다. is_admin() 이면 RLS 는 이미 전체 상태를 다
  //     읽을 수 있게 열려 있으므로(sql/admin_service_applications_select.sql), 여기서는 조회
  //     조건만 '전체 기간 + manager_id 무관 + status = CANCELLED' 로 바꿔서 조회합니다 — 취소된
  //     건은 영원히 manager_id 가 비어 있으므로 사실 manager_id 조건은 항상 참이지만, 다른 원인으로
  //     생긴 CANCELLED 행(예: 미입금 만료 자동 취소)까지 전부 포함하기 위해 조건에서 아예 뺍니다.
  //     환불 등 추가 처리는 수동이라(요구사항: 상태값 수동 처리 방식), 이 목록은 조회 전용이고
  //     [취소]/[수동 배정] 같은 액션 버튼을 두지 않습니다.
  // ============================================================
  var lastCancelledApplicationsRows = [];
  // 이 함수를 호출할 때마다 하나씩 올라가는 번호입니다. 탭을 빠르게 전환하거나 '48시간 지난 신청도
  // 보기' 체크박스를 연달아 누르면 먼저 보낸 요청의 응답이 나중 요청보다 늦게 돌아올 수 있는데,
  // 응답을 받았을 때 이 번호가 더 이상 최신이 아니면(그 사이 같은 함수가 다시 호출됨) 화면을
  // 건드리지 않고 조용히 버립니다 — 오래된 응답이 방금 그린 최신 목록을 덮어쓰는 경쟁을 막습니다.
  var cancelledApplicationsRequestSeq = 0;
  var cancelledOffset = 0;      // 다음 .range() 요청 시작 위치
  var cancelledHasMore = false;
  var cancelledLoadingMore = false;

  async function loadCancelledApplications() {
    var list = els.applicationsList;
    if (!list) return;

    var requestSeq = ++cancelledApplicationsRequestSeq;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.applicationsCount) els.applicationsCount.hidden = true;
    lastCancelledApplicationsRows = [];
    cancelledOffset = 0;
    cancelledHasMore = false;
    cancelledLoadingMore = false;

    await fetchCancelledApplicationsPage(requestSeq, true);
  }

  async function loadMoreCancelledApplications() {
    if (cancelledLoadingMore || !cancelledHasMore) return;
    var requestSeq = cancelledApplicationsRequestSeq;
    cancelledLoadingMore = true;
    renderCancelledApplicationsList(); // 버튼을 '불러오는 중…' 상태로 즉시 다시 그림
    await fetchCancelledApplicationsPage(requestSeq, false);
    cancelledLoadingMore = false;
    renderCancelledApplicationsList();
  }

  // isFirstPage=true: loadCancelledApplications() 의 첫 페이지. isFirstPage=false: '더보기'.
  async function fetchCancelledApplicationsPage(requestSeq, isFirstPage) {
    var list = els.applicationsList;
    if (!list) return;

    try {
      // ADMIN_LIST_PAGE_SIZE+1건을 받아, 실제로 다음 페이지가 더 남아 있는지(cancelledHasMore)를
      // 별도 count 쿼리 없이 판단합니다(오늘의 케어 신청 카드의 fetchApplicationsPage() 와 같은 패턴).
      var res = await supabaseClient
        .from('service_applications')
        .select('id, created_at, service_type, user_relation, senior_name, senior_age, senior_note, user_contact, address, request_details, status, payment_status, final_amount, refund_amount')
        .in('status', ['CANCELLED', 'EXPIRED_CANCELLED'])
        .order('created_at', { ascending: false })
        .range(cancelledOffset, cancelledOffset + ADMIN_LIST_PAGE_SIZE);

      if (requestSeq !== cancelledApplicationsRequestSeq) return; // 그 사이 더 최근 호출이 시작됨 — 이 결과는 버림

      if (res.error) {
        console.error('[Admin] 취소된 신청 조회 실패:', res.error.code, res.error.message,
          '→ sql/admin_service_applications_select.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
        if (isFirstPage) renderErrorState(list, res.error.message, loadCancelledApplications);
        else showToast('목록을 더 불러오지 못했습니다: ' + res.error.message);
        return;
      }

      var rawRows = res.data || [];
      cancelledHasMore = rawRows.length > ADMIN_LIST_PAGE_SIZE;
      var pageRows = rawRows.slice(0, ADMIN_LIST_PAGE_SIZE);
      cancelledOffset += pageRows.length;

      lastCancelledApplicationsRows = lastCancelledApplicationsRows.concat(pageRows);
      renderCancelledApplicationsList();
    } catch (err) {
      if (requestSeq !== cancelledApplicationsRequestSeq) return;
      console.error('[Admin] 취소된 신청 조회 중 예외가 발생했습니다:', err);
      if (isFirstPage) renderErrorState(list, (err && err.message) || String(err), loadCancelledApplications);
      else showToast('목록을 더 불러오지 못했습니다: ' + ((err && err.message) || String(err)));
    } finally {
      // 위 try/catch 의 모든 경로(정상 렌더 · 빈 목록 · 에러 렌더)가 이미 '불러오는 중…' 문구를
      // 지우지만, 예상 못한 경로로 함수가 끝나 로딩 문구가 화면에 그대로 남는 사고까지 막는 마지막
      // 안전망입니다 — 이 호출이 여전히 최신 요청일 때만 적용합니다(오래된 요청이 최신 화면을 건드리면 안 됨).
      if (requestSeq === cancelledApplicationsRequestSeq && list.querySelector('.admin-loading')) {
        list.innerHTML = '<p class="admin-empty">취소된 신청 내역이 없습니다.</p>';
        if (els.applicationsCount) { els.applicationsCount.textContent = '0건'; els.applicationsCount.hidden = false; }
      }
    }
  }

  function renderCancelledApplicationsList() {
    if (currentStatusFilter !== 'cancelled') return;
    var list = els.applicationsList;
    if (!list) return;

    var rows = lastCancelledApplicationsRows.filter(function (a) {
      return matchesSearch([a.user_contact, a.service_type, a.address]);
    });

    if (els.applicationsCount) {
      els.applicationsCount.textContent = rows.length + '건';
      els.applicationsCount.hidden = false;
    }

    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">' +
        (lastCancelledApplicationsRows.length ? '조건에 맞는 취소 건이 없습니다.' : '취소된 신청 내역이 없습니다.') + '</p>';
    } else {
      list.innerHTML = '';
      rows.forEach(function (a) { list.appendChild(renderCancelledApplicationRow(a)); });
    }

    if (cancelledHasMore) {
      list.appendChild(createLoadMoreButton(cancelledLoadingMore, loadMoreCancelledApplications));
    }
  }

  function renderCancelledApplicationRow(a) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    // 취소 내역은 cutoff 없이 전체 기간을 보여주므로(체크박스와 무관), 48시간이 지난 건은 항상 '경과' 뱃지를
    // 붙이지만, 아래 '48시간 자동취소' 뱃지가 이미 같은 의미를 더 구체적으로 보여주는 건(isAutoExpired)에는
    // 중복이라 그 경우에는 빼고 보여줍니다.
    var overdue = isCreatedAtOverdue(a.created_at);

    // 취소 상세 상태 분기 (sql/matching_expiry_auto_refund.sql, sql/admin_application_refund_system.sql
    // 참고) — 운영자가 "이미 환불까지 끝났는지 / 부분 환불만 됐는지 / 아직 환불이 전혀 안 됐는지"를
    // 목록만 보고 바로 구별할 수 있도록 나눕니다:
    //   1) 48시간 자동취소 — status='EXPIRED_CANCELLED'(표준) 이거나, 수기로 남긴 cancellation_reason에
    //      '48시간'이 포함된 경우(이 컬럼이 아직 없는 환경에서는 항상 빈 문자열이라 조용히 무시됩니다).
    //      cancel-expired-applications Edge Function이 PortOne 환불까지 성공한 뒤에만 이 상태로 바꾸므로
    //      항상 payment_status='REFUNDED'도 같이 true 입니다 — 두 뱃지가 함께 뜨는 게 정상입니다.
    //   2) 환불 완료 — payment_status='REFUNDED'. [환불 처리]로 전액(또는 잔액까지 누적) 환불했거나,
    //      수동 확인([환불 완료 처리])으로 맞춘 경우 모두 이 뱃지로 잡힙니다.
    //   3) 부분 환불 완료 — payment_status='PARTIALLY_REFUNDED'. refund_amount 만큼 이미 돌아갔고,
    //      final_amount - refund_amount 만큼 추가로 환불할 잔액이 남아 있어 [환불 처리] 버튼을 계속 보여줍니다.
    //   4) 환불 미처리 — 결제까지 끝난 뒤(payment_status='PAID') CANCELLED 로 바뀌었지만 아직 한 번도
    //      환불을 처리하지 않은 건. payment_status 가 비어 있으면(결제 전에 취소된 건) 환불할 돈 자체가
    //      없으므로 어떤 뱃지도 붙이지 않습니다.
    var cancellationReason = String(a.cancellation_reason || '');
    var isAutoExpired = a.status === 'EXPIRED_CANCELLED' || cancellationReason.indexOf('48시간') !== -1;
    var isRefunded = a.payment_status === 'REFUNDED';
    var isPartiallyRefunded = a.payment_status === 'PARTIALLY_REFUNDED';
    var isManualUnrefunded = !isAutoExpired && !isRefunded && !isPartiallyRefunded && a.payment_status === 'PAID';
    // 잔액이 남아 있는 한(부분 환불 1회차든, 아직 한 번도 환불하지 않은 건이든) [환불 처리] 버튼을 보여줍니다.
    var canRefund = isManualUnrefunded || isPartiallyRefunded;
    // 기존 [환불 완료 처리](admin_mark_refund_completed)로 전액 환불 처리된 과거 건은 refund_amount를
    // 채우지 않으므로, 전액 환불 표기에서는 final_amount(결제 총액)로 대신 보여줍니다.
    var refundedSoFar = a.refund_amount || (isRefunded ? (a.final_amount || 0) : 0);

    var badges = '';
    if (overdue && !isAutoExpired) badges += '<span class="admin-badge is-overdue">경과</span>';
    if (isAutoExpired) badges += '<span class="admin-badge is-auto-expired">48시간 자동취소</span>';
    if (isRefunded) badges += '<span class="admin-badge is-refunded">환불 완료</span>';
    if (isPartiallyRefunded) badges += '<span class="admin-badge is-partially-refunded">부분 환불 완료</span>';
    if (isManualUnrefunded) badges += '<span class="admin-badge is-manual-unrefunded">수동 취소 (PG 환불 필요)</span>';
    if (!isAutoExpired && !isRefunded && !isPartiallyRefunded && !isManualUnrefunded) badges += '<span class="admin-badge is-cancelled">취소됨</span>';

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(a.service_type || '케어 신청') + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(a.user_contact || '') + '</div></div>' +
      '<div class="admin-badge-group">' + badges + '</div>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>어르신</dt><dd>' + escapeHtml(seniorLabel(a) + (a.user_relation ? ' · ' + a.user_relation + ' 신청' : '')) + '</dd>' +
      '<dt>신청 시각</dt><dd>' + formatDateTime(a.created_at) + '</dd>' +
      '<dt>주소</dt><dd>' + escapeHtml(a.address || '-') + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(a.request_details || '-') + '</dd>' +
      (isRefunded ? '<dt>환불 내역</dt><dd>전액 취소 완료 (' + refundedSoFar.toLocaleString('ko-KR') + '원)</dd>' : '') +
      (isPartiallyRefunded ? '<dt>환불 내역</dt><dd>부분 환불 완료 (' + refundedSoFar.toLocaleString('ko-KR') + '원)</dd>' : '');

    row.appendChild(head);
    row.appendChild(meta);

    // 환불 가능 잔액이 남아 있는 건에 [환불 처리] 버튼을 보여줍니다 — 전액/부분 환불 모달을 열어
    // PortOne 환불 API를 바로 호출합니다(openAdminRefundModal, supabase/functions/admin-refund-application).
    // '수동 취소' 건에는 PortOne에 결제 기록이 없는 예외적인 경우(무통장 입금을 수동 확인 처리한 건 등)를
    // 대비해 기존 수동 확인([환불 완료 처리])도 보조 버튼으로 함께 둡니다.
    if (canRefund) {
      var actions = document.createElement('div');
      actions.className = 'admin-row-actions';
      var refundBtn = document.createElement('button');
      refundBtn.type = 'button';
      refundBtn.className = 'admin-btn is-primary';
      refundBtn.textContent = '환불 처리';
      refundBtn.addEventListener('click', function () { openAdminRefundModal(a); });
      actions.appendChild(refundBtn);

      if (isManualUnrefunded) {
        var manualBtn = document.createElement('button');
        manualBtn.type = 'button';
        manualBtn.className = 'admin-btn is-ghost';
        manualBtn.textContent = 'PG 콘솔에서 이미 환불함 (수동 확인)';
        manualBtn.addEventListener('click', function () { markRefundCompleted(a, manualBtn); });
        actions.appendChild(manualBtn);
      }

      row.appendChild(actions);
    }

    return row;
  }

  // [환불 완료 처리]: PG사 콘솔에서 환불을 이미 마쳤다는 걸 관리자가 직접 확인한 뒤 누르는 버튼 —
  // 이 함수는 환불을 실행하지 않고(자동 PG 환불 연동 없음, 요구사항에 따른 수동 처리 방식) DB의
  // payment_status 만 'REFUNDED' 로 반영합니다. admin_mark_refund_completed() 가 is_admin() +
  // "결제완료 + 취소됨 + 아직 미환불"인 행만 걸러 바꾸므로, 중복 클릭해도 안전합니다(멱등).
  async function markRefundCompleted(a, btn) {
    var ok = window.confirm('PG사 콘솔에서 이 건의 환불을 이미 처리하셨나요? 확인을 누르면 환불 완료로 표시됩니다.');
    if (!ok) return;

    btn.disabled = true;
    var res = await supabaseClient.rpc('admin_mark_refund_completed', { p_application_id: a.id });
    if (res.error) {
      console.error('[Admin] 환불 완료 처리 실패:', res.error.code, res.error.message,
        '→ sql/matching_expiry_auto_refund.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      showToast('환불 완료 처리에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('환불 완료로 표시했습니다.');
    loadCancelledApplications();
  }

  // ================================================================
  // [환불 처리] 모달 — '취소된 신청 내역' 카드에서 PortOne 전액/부분 환불을 직접 호출합니다
  // (supabase/functions/admin-refund-application, sql/admin_application_refund_system.sql).
  // 전액 환불 선택 시에는 사유만 입력받고, 부분 환불 선택 시에는 금액 + 사유를 입력받아 결제 총액 ·
  // 잔여 환불 가능 금액을 넘지 않는지 서버와 똑같은 기준으로 먼저 클라이언트에서 검증합니다.
  // ================================================================
  var adminRefundState = null; // { application, total, already, remaining }

  function adminRefundIsPartial() {
    return !!(els.adminRefundTypePartial && els.adminRefundTypePartial.checked);
  }

  function updateAdminRefundTypeVisibility() {
    if (!els.adminRefundPartialSection) return;
    els.adminRefundPartialSection.hidden = !adminRefundIsPartial();
  }

  function openAdminRefundModal(a) {
    var total = a.final_amount || 0;
    var already = a.refund_amount || 0;
    var remaining = Math.max(total - already, 0);
    adminRefundState = { application: a, total: total, already: already, remaining: remaining };

    els.adminRefundSub.textContent = (a.senior_name || '어르신') + ' · ' + (a.service_type || '케어 신청');
    els.adminRefundBalanceInfo.textContent =
      total.toLocaleString('ko-KR') + '원 / ' + remaining.toLocaleString('ko-KR') + '원' +
      (already > 0 ? ' (기존 환불 누적 ' + already.toLocaleString('ko-KR') + '원)' : '');
    els.adminRefundTypeFull.checked = true;
    els.adminRefundAmountInput.value = '';
    els.adminRefundAmountInput.max = String(remaining);
    els.adminRefundReasonInput.value = '';
    els.adminRefundError.hidden = true;
    updateAdminRefundTypeVisibility();
    els.adminRefundConfirmBtn.disabled = false;
    els.adminRefundConfirmBtn.textContent = '환불 처리하기';
    els.adminRefundModal.hidden = false;
  }

  function closeAdminRefundModal() {
    els.adminRefundModal.hidden = true;
    adminRefundState = null;
  }

  els.adminRefundTypeFull.addEventListener('change', updateAdminRefundTypeVisibility);
  els.adminRefundTypePartial.addEventListener('change', updateAdminRefundTypeVisibility);
  els.adminRefundCloseBtn.addEventListener('click', closeAdminRefundModal);
  els.adminRefundCancelBtn.addEventListener('click', closeAdminRefundModal);
  els.adminRefundModal.addEventListener('mousedown', function (e) { if (e.target === els.adminRefundModal) closeAdminRefundModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.adminRefundModal.hidden) closeAdminRefundModal(); });

  els.adminRefundConfirmBtn.addEventListener('click', async function () {
    if (!adminRefundState) return;
    var isPartial = adminRefundIsPartial();
    var reason = els.adminRefundReasonInput.value.trim();
    var remaining = adminRefundState.remaining;

    if (!reason) {
      els.adminRefundError.textContent = '환불 사유를 입력해 주세요.';
      els.adminRefundError.hidden = false;
      return;
    }
    if (remaining <= 0) {
      els.adminRefundError.textContent = '이미 전액 환불이 완료되어 더 이상 환불할 금액이 없습니다.';
      els.adminRefundError.hidden = false;
      return;
    }

    var amount = remaining;
    if (isPartial) {
      amount = Number(els.adminRefundAmountInput.value);
      if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        els.adminRefundError.textContent = '환불할 금액을 올바르게 입력해 주세요.';
        els.adminRefundError.hidden = false;
        return;
      }
      if (amount > remaining) {
        els.adminRefundError.textContent = '환불할 금액이 환불 가능 잔액(' + remaining.toLocaleString('ko-KR') + '원)보다 많습니다.';
        els.adminRefundError.hidden = false;
        return;
      }
    }

    var ok = window.confirm((isPartial ? '부분 환불 ' + amount.toLocaleString('ko-KR') + '원을' : '전액 ' + amount.toLocaleString('ko-KR') + '원을') +
      ' PortOne으로 실제 환불 처리합니다. 계속할까요?');
    if (!ok) return;

    els.adminRefundError.hidden = true;
    els.adminRefundConfirmBtn.disabled = true;
    els.adminRefundConfirmBtn.textContent = '처리 중…';
    try {
      var res = await supabaseClient.functions.invoke('admin-refund-application', {
        body: {
          application_id: adminRefundState.application.id,
          refund_type: isPartial ? 'partial' : 'full',
          amount: isPartial ? amount : undefined,
          reason: reason
        }
      });
      if (res.error) throw res.error;
      showToast('환불 처리가 완료되었습니다.');
      closeAdminRefundModal();
      loadCancelledApplications();
    } catch (e) {
      // supabase-js functions.invoke() 에러 분기는 cancel-payment 호출(위 careInterruptConfirmBtn
      // 핸들러)과 같은 패턴입니다 — FunctionsHttpError(함수가 실행은 됐지만 4xx/5xx 응답)와
      // FunctionsFetchError(배포 안 됨/네트워크 문제)를 구분해 메시지를 보여줍니다.
      var detail = (e && e.context && typeof e.context.json === 'function') ? await e.context.json().catch(function () { return null; }) : null;
      var isFetchFailure = e && e.name === 'FunctionsFetchError';
      console.error('[Admin] 환불 처리 실패 — name=' + (e && e.name) + ', message=' + (e && e.message) + ':',
        '\n  함수 응답 본문(detail):', detail,
        '\n  네트워크 단계 원인(context):', e && e.context,
        '\n  원본 에러 객체:', e);
      var userMsg = isFetchFailure
        ? 'Edge Function(admin-refund-application)에 연결할 수 없습니다. 함수가 Supabase에 배포되어 있는지(supabase functions deploy admin-refund-application), 네트워크 상태를 확인해 주세요.'
        : ((detail && detail.message) || e.message || String(e));
      els.adminRefundError.textContent = '환불 처리에 실패했습니다: ' + userMsg;
      els.adminRefundError.hidden = false;
    } finally {
      els.adminRefundConfirmBtn.disabled = false;
      els.adminRefundConfirmBtn.textContent = '환불 처리하기';
    }
  });

  // PAYMENT_PENDING 건을 관리자가 수동으로 입금 확인 처리 — admin_confirm_manual_payment() RPC
  // (sql/admin_manual_payment_telegram_notify.sql — 이 함수의 유일한 정의)가 is_admin() 검증과 함께
  // status 를 'MATCHING_PENDING' 으로 바꾸고, 연결된 가상계좌가 있으면 virtual_accounts.is_paid 도
  // 같이 true 로 맞추고, 매니저 운영 채널로 텔레그램 알림까지 보냅니다.
  async function confirmManualPayment(a, btn) {
    btn.disabled = true;
    var res = await supabaseClient.rpc('admin_confirm_manual_payment', { p_application_id: a.id });
    if (res.error) {
      console.error('[Admin] 수동 입금 확인 실패:', res.error.code, res.error.message,
        '→ sql/admin_manual_payment_telegram_notify.sql 을 Supabase SQL Editor 에서 실행했는지, ' +
        '이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      showToast('입금 확인에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('입금을 확인 처리했습니다.');
    loadApplications();
    loadSummaryStats();
  }

  // 아직 매니저가 배정되지 않은 신청(입금 대기/매칭 대기)을 관리자가 직접 취소 — 별도 RPC 없이
  // sql/admin_rls_policies.sql 이 이미 열어 둔 service_applications_update_admin 정책(+ grant update
  // (manager_id, status))을 그대로 씁니다. cancel_unpaid_application()/cancel_expired_virtual_accounts()
  // 와 똑같이 status 만 'CANCELLED' 로 바꿉니다 — manager_id 가 비어 있는 상태라 sync_application_status
  // 트리거가 건드릴 조건(new.manager_id is not null)에 걸리지 않아 그대로 적용됩니다.
  async function cancelApplication(a, btn) {
    var ok = window.confirm('이 신청을 취소 처리할까요? 되돌릴 수 없습니다.');
    if (!ok) return;

    btn.disabled = true;
    var res = await supabaseClient
      .from('service_applications')
      .update({ status: 'CANCELLED' })
      .eq('id', a.id);

    if (res.error) {
      console.error('[Admin] 신청 취소 실패:', res.error.code, res.error.message,
        '→ sql/admin_rls_policies.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      showToast('취소 처리에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('신청을 취소 처리했습니다.');
    loadApplications();
    loadSummaryStats();
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

    // manager_id 만 직접 UPDATE 하던 예전 방식 대신 admin_assign_manager() RPC(sql/admin_manual_assignment.sql)를
    // 씁니다 — manager_id 설정은 물론, status 를 'MATCHED' 로 명시적으로 확정하고(PAYMENT_PENDING 건이어도
    // 트리거의 동의어 판정에 기대지 않음), 미입금(PAYMENT_PENDING) 건이었다면 입금도 함께 확인 처리하고,
    // care_schedules 행까지 만들어서 '배정 완료(진행 중) 케어 현황' 카드에 바로 나타나게 합니다.
    var res = await supabaseClient.rpc('admin_assign_manager', {
      p_application_id: assignApplicationId,
      p_manager_id: managerId
    });

    if (res.error) {
      console.error('[Admin] 수동 배정 실패:', res.error.code, res.error.message,
        '→ sql/admin_manual_assignment.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      els.assignError.textContent = '배정에 실패했습니다: ' + res.error.message;
      els.assignError.hidden = false;
      els.assignConfirmBtn.disabled = false;
      return;
    }
    showToast('매니저를 배정했습니다.');
    closeAssignModal();
    loadApplications();
    loadSummaryStats();
    if (currentStatusFilter !== 'completed') reloadCareView(); // 새로 생긴 care_schedules 행을 realtime 을 기다리지 않고 바로 반영
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
        // '취소' 탭을 보고 있을 때 여기서 항상 loadApplications() 만 부르면 refreshAll() 과 똑같은 버그가
        // 생깁니다(아래 refreshAll() 주석 참고) — 지금 보고 있는 탭에 맞는 로더를 불러야 합니다.
        if (currentStatusFilter === 'cancelled') loadCancelledApplications();
        else loadApplications();
        loadSummaryStats();
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
  var CARE_STATUS_LABEL = {
    assigned: '배정됨', departed: '출발 (이동 중)', arrived: '병원 도착',
    treatment_done: '진료/대행 완료', returning: '귀가 이동', completed: '완료'
  };

  var INPROGRESS_CARE_VISIBLE_LIMIT = 3;
  var inProgressExtraRowsWrap = null; // '더보기' 로 펼쳐지는 중인 래퍼(.admin-extra-rows) — 매 로드마다 새로 만듦

  // 서버에서 받은 원본 행(현재 로드된 게 진행 중 건인지/완료 건인지/둘 다인지는 careViewMode 로 구분) —
  // 검색어가 바뀔 때마다 재조회하지 않고 이 캐시를 다시 그립니다.
  var lastInProgressRows = [];
  var lastInProgressManagerById = {};
  var careViewMode = 'in_progress'; // in_progress | completed | all — 지금 lastInProgressRows 에 뭐가 들어있는지

  // care_schedules 조회 컬럼 — loadInProgressCare/loadCompletedCare/loadAllCare 가 공유합니다.
  // 완료 건에만 의미가 있는 completed_at/추가 요금 컬럼은 완료 쪽 조회에만 덧붙입니다.
  // service_applications 와는 FK 가 두 방향으로 있어서(care_schedules.application_id 와
  // service_applications.schedule_id, sql/supabase_schema_latest.sql) embed 가 어느 쪽인지 모호하다는
  // 오류("more than one relationship was found")가 났습니다 — care_schedules.application_id 쪽 FK를
  // 쓰도록 'service_applications!application_id(...)' 로 명시합니다.
  var CARE_SCHED_BASE_COLS = 'id, created_at, scheduled_at, manager_id, guardian_name, guardian_phone, senior_name, senior_age, senior_note, origin, destination, notes, status, payout_amount, payment_amount, application_id, service_applications!application_id(is_package_used, package_remaining_after)';
  var CARE_SCHED_COMPLETED_COLS = CARE_SCHED_BASE_COLS + ', completed_at, extra_charge_amount, extra_charge_memo, extra_charge_status, extra_charge_requested_at, extra_charge_paid_at';

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

    var results = await Promise.all([
      supabaseClient
        .from('care_schedules')
        .select(CARE_SCHED_BASE_COLS)
        .not('manager_id', 'is', null)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
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

    lastInProgressManagerById = {};
    (managersResult.rows || []).forEach(function (m) { lastInProgressManagerById[m.id] = m; });
    lastInProgressRows = scheduleRes.data || [];
    careViewMode = 'in_progress';

    await renderInProgressCareList();
  }

  // 관리자 전용 '완료' 필터 — 평소 이 카드가 제외하는 completed 건만 최근 20건 따로 불러옵니다
  // (카드 제목대로 기본 목록은 계속 진행 중 건만 보여주고, 완료 필터를 눌렀을 때만 이 조회로 바꿔 끼웁니다).
  async function loadCompletedCare() {
    var list = els.inProgressCareList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';

    var results = await Promise.all([
      supabaseClient
        .from('care_schedules')
        .select(CARE_SCHED_COMPLETED_COLS)
        .not('manager_id', 'is', null)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20),
      fetchActiveManagersWithNames()
    ]);
    var scheduleRes = results[0];
    var managersResult = results[1];

    if (scheduleRes.error) {
      console.error('[Admin] 완료된 케어 조회 실패:', scheduleRes.error.code, scheduleRes.error.message);
      renderErrorState(list, scheduleRes.error.message, loadCompletedCare);
      return;
    }

    lastInProgressManagerById = {};
    (managersResult.rows || []).forEach(function (m) { lastInProgressManagerById[m.id] = m; });
    lastInProgressRows = scheduleRes.data || [];
    careViewMode = 'completed';

    await renderInProgressCareList();
  }

  // '전체' 필터 — 진행 중 건 + 완료 건(최근 20건)을 한 목록에 합쳐서 보여줍니다. 각 행의 액션 버튼은
  // renderInProgressCareRow 가 s.status 기준으로 알아서 고르므로(완료 건이면 추가 요금 청구, 아니면
  // 매니저 교체/강제 완료) 이 함수는 두 조회를 합치기만 하면 됩니다.
  async function loadAllCare() {
    var list = els.inProgressCareList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';

    var results = await Promise.all([
      supabaseClient
        .from('care_schedules')
        .select(CARE_SCHED_BASE_COLS)
        .not('manager_id', 'is', null)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true }),
      supabaseClient
        .from('care_schedules')
        .select(CARE_SCHED_COMPLETED_COLS)
        .not('manager_id', 'is', null)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20),
      fetchActiveManagersWithNames()
    ]);
    var inProgressRes = results[0];
    var completedRes = results[1];
    var managersResult = results[2];

    var err = inProgressRes.error || completedRes.error;
    if (err) {
      console.error('[Admin] 전체 케어 조회 실패:', err.code, err.message,
        '→ sql/admin_care_schedules_select.sql / sql/extra_charge_billing.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      renderErrorState(list, err.message, loadAllCare);
      return;
    }

    lastInProgressManagerById = {};
    (managersResult.rows || []).forEach(function (m) { lastInProgressManagerById[m.id] = m; });
    lastInProgressRows = (inProgressRes.data || []).concat(completedRes.data || []);
    careViewMode = 'all';

    await renderInProgressCareList();
  }

  // 지금 활성화된 상단 필터(currentStatusFilter) 기준으로 이 카드를 다시 불러옵니다 — 액션(배정/교체/
  // 강제완료/추가요금 청구 등) 성공 후 목록을 새로고침할 때 공통으로 씁니다.
  function reloadCareView() {
    if (currentStatusFilter === 'completed') loadCompletedCare();
    else if (currentStatusFilter === 'all') loadAllCare();
    else loadInProgressCare();
  }

  // '더보기' 라벨에 쓸 접두어 — 전체 보기에서는 진행 중/완료가 섞여 있어 어느 한쪽으로 부르면 어색하므로 generic 하게 둡니다.
  function careRowsLabelPrefix() {
    if (careViewMode === 'completed') return '완료된 케어 ';
    if (careViewMode === 'all') return '케어 ';
    return '진행 중인 케어 ';
  }

  // 검색어 + 상태 필터를 lastInProgressRows 에 적용해 다시 그립니다. '입금대기'/'매칭대기' 필터는 이
  // 카드 범위 밖의 상태라 항상 0건으로 비워 둡니다(오늘의 케어 신청 카드 쪽에서 보여줍니다).
  async function renderInProgressCareList() {
    var list = els.inProgressCareList;
    if (!list) return;
    inProgressExtraRowsWrap = null;
    if (els.inProgressCareShowMoreBtn) els.inProgressCareShowMoreBtn.hidden = true;

    // cancelled 신청은 manager_id 가 끝까지 비어 있어 care_schedules 행 자체가 생기지 않으므로
    // (admin_assign_manager()/accept_service_application() 모두 manager_id 를 먼저 채운 뒤에만
    // insert 함) 이 카드에는 보여줄 게 아예 없습니다 — payment_pending/matching_pending 과 같은 이유로 비워 둡니다.
    if (currentStatusFilter === 'payment_pending' || currentStatusFilter === 'matching_pending' || currentStatusFilter === 'cancelled') {
      if (els.inProgressCareCount) { els.inProgressCareCount.textContent = '0건'; els.inProgressCareCount.hidden = false; }
      list.innerHTML = '<p class="admin-empty">조건에 맞는 케어가 없습니다.</p>';
      return;
    }

    var rows = lastInProgressRows.filter(function (s) {
      var managerText = lastInProgressManagerById[s.manager_id]
        ? lastInProgressManagerById[s.manager_id].name + ' ' + lastInProgressManagerById[s.manager_id].phone
        : '';
      return matchesSearch([s.guardian_name, s.guardian_phone, s.senior_name, managerText]);
    });

    if (els.inProgressCareCount) {
      els.inProgressCareCount.textContent = rows.length + '건';
      els.inProgressCareCount.hidden = false;
    }

    if (!rows.length) {
      var emptyText = careViewMode === 'completed' ? '완료된 케어가 없습니다.'
        : careViewMode === 'all' ? '배정된 케어가 없습니다.'
        : '현재 배정되어 진행 중인 케어가 없습니다.';
      list.innerHTML = '<p class="admin-empty">' + emptyText + '</p>';
      return;
    }

    // [현장 인증 상세보기] 모달에 쓸 출발/도착 체크포인트를 한 번에 조회해 schedule_id 로 묶어 둡니다.
    var checkpointsByScheduleId = await loadCareCheckpointsFor(rows.map(function (s) { return s.id; }));

    list.innerHTML = '';
    var visibleRows = rows.slice(0, INPROGRESS_CARE_VISIBLE_LIMIT);
    var extraRows = rows.slice(INPROGRESS_CARE_VISIBLE_LIMIT);
    visibleRows.forEach(function (s) { list.appendChild(renderInProgressCareRow(s, lastInProgressManagerById[s.manager_id], checkpointsByScheduleId[s.id])); });

    if (extraRows.length && els.inProgressCareShowMoreBtn) {
      var extraWrap = document.createElement('div');
      extraWrap.className = 'admin-extra-rows';
      extraRows.forEach(function (s) { extraWrap.appendChild(renderInProgressCareRow(s, lastInProgressManagerById[s.manager_id], checkpointsByScheduleId[s.id])); });
      list.appendChild(extraWrap);

      inProgressExtraRowsWrap = extraWrap;
      els.inProgressCareShowMoreBtn.hidden = false;
      els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', 'false');
      setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, careRowsLabelPrefix() + extraRows.length + '건 더보기');
    }
  }

  // ============================================================
  // 03-2. 현장 인증 상세보기 (care_checkpoints.step = 5단계 전부: departure/hospital_arrival/
  //     treatment_complete/return_departure/return_complete)
  //     mypage.html / mypage-manager.html 의 동행 타임라인과 같은 테이블을 읽습니다. 같은 schedule_id +
  //     step 이 여러 번 쌓일 수 있어(재인증 시 새 행 추가, 수정/삭제 없음) checkpoint_at 오름차순으로 받은 뒤
  //     뒤에 오는(=더 최근) 값으로 덮어써서 각 schedule_id 당 단계별 "가장 최근" 한 건만 남깁니다.
  // ============================================================
  var CARE_CHECKPOINT_STEPS = ['departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'];
  async function loadCareCheckpointsFor(scheduleIds) {
    var byScheduleId = {};
    if (!scheduleIds || !scheduleIds.length) return byScheduleId;

    var res = await supabaseClient
      .from('care_checkpoints')
      .select('schedule_id, step, lat, lng, accuracy, photo_url, checkpoint_at, created_at')
      .in('schedule_id', scheduleIds)
      .in('step', CARE_CHECKPOINT_STEPS)
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
        : careRowsLabelPrefix() + inProgressExtraRowsWrap.children.length + '건 더보기');
    });
  }

  // '현장 이슈 접수' 카드의 [해당 케어 보기] 버튼에서 호출 — 위 '배정 완료(진행 중) 케어 현황' 목록에서
  // 같은 schedule_id 를 가진 행을 찾아 스크롤 이동 + 잠깐 테두리 강조합니다. '더보기'로 접혀 있는
  // 영역(inProgressExtraRowsWrap)에 있으면 먼저 펼칩니다. 그 케어가 상태 필터·검색어 때문에 지금
  // 화면에 아예 그려지지 않은 상태라면(renderInProgressCareList 가 매번 새로 그리므로) 못 찾을 수
  // 있어, 그 경우엔 토스트로 안내만 합니다.
  function scrollToInProgressCareRow(scheduleId) {
    var row = els.inProgressCareList && els.inProgressCareList.querySelector('[data-schedule-id="' + scheduleId + '"]');
    if (!row) {
      showToast('해당 케어가 지금 목록에 보이지 않습니다 — 상태 필터나 검색어를 확인해 주세요.');
      return;
    }
    var needsExpand = inProgressExtraRowsWrap && inProgressExtraRowsWrap.contains(row) && !inProgressExtraRowsWrap.classList.contains('is-expanded');
    if (needsExpand) {
      inProgressExtraRowsWrap.classList.add('is-expanded');
      if (els.inProgressCareShowMoreBtn) {
        els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', 'true');
        setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, '접기');
      }
    }
    var highlightAndScroll = function () {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('is-highlighted');
      setTimeout(function () { row.classList.remove('is-highlighted'); }, 2600);
    };
    // '더보기' max-height 전환(.admin-extra-rows, .35s)이 끝난 뒤에 스크롤해야 목표 위치가 안 어긋납니다.
    if (needsExpand) setTimeout(highlightAndScroll, 380);
    else highlightAndScroll();
  }

  function renderInProgressCareRow(s, manager, checkpoints) {
    var row = document.createElement('div');
    row.className = 'admin-row';
    row.dataset.scheduleId = s.id; // '현장 이슈 접수' 카드의 [해당 케어 보기] → scrollToInProgressCareRow() 가 찾는 기준

    var statusKey = CARE_STATUS_LABEL.hasOwnProperty(s.status) ? s.status : 'assigned';
    var statusLabel = CARE_STATUS_LABEL[statusKey] || s.status;

    var daysSince = formatDaysSinceCreated(s.created_at);
    var daysBadge = daysSince
      ? '<span class="admin-badge is-dayago-' + daysSince.level + '">' + escapeHtml(daysSince.label) + '</span>'
      : '';

    // care_schedules.application_id 로 embed 된 service_applications — 패키지 차감으로 접수된 건이면
    // [패키지 차감] 뱃지와 '신청 당시' 잔여 회차를 결제 수단 위치(상태 뱃지 옆)에 함께 보여줍니다.
    var linkedApp = s.service_applications || null;
    var packageBadge = (linkedApp && linkedApp.is_package_used)
      ? '<span class="admin-badge is-package">패키지 차감' +
          (linkedApp.package_remaining_after != null ? ' · 신청 당시 잔여 ' + formatPkgCount(linkedApp.package_remaining_after) + '회' : '') +
        '</span>'
      : '';

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(seniorLabel(s)) + '</div>' +
      '<div class="admin-row-sub">보호자 ' + escapeHtml(s.guardian_name || '미등록') + ' · ' + escapeHtml(s.guardian_phone || '연락처 미등록') + '</div></div>' +
      '<div class="admin-badge-group">' +
        daysBadge +
        '<span class="admin-badge is-' + statusKey + '">' + escapeHtml(statusLabel) + '</span>' +
        packageBadge +
      '</div>';

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

    // 현장 인증(5단계) 상세보기 — 하나라도 작성되어 있으면 버튼 옆에 '인증 완료' 뱃지를 보여줍니다.
    var hasAnyCheckpoint = !!(checkpoints && CARE_CHECKPOINT_STEPS.some(function (step) { return checkpoints[step]; }));
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

    // 완료된 건은 더 이상 손댈 액션이 없으므로(매니저 교체/강제 완료 모두 의미 없음) 아래 두 버튼은
    // 진행 중(배정됨/출발/도착) 상태에서만 보여줍니다.
    if (s.status !== 'completed') {
      var reassignBtn = document.createElement('button');
      reassignBtn.type = 'button';
      reassignBtn.className = 'admin-btn is-ghost';
      reassignBtn.textContent = '매니저 교체';
      reassignBtn.addEventListener('click', function () { openReassignModal(s); });
      actions.appendChild(reassignBtn);

      var forceCompleteBtn = document.createElement('button');
      forceCompleteBtn.type = 'button';
      forceCompleteBtn.className = 'admin-btn is-danger';
      forceCompleteBtn.textContent = '강제 완료';
      forceCompleteBtn.addEventListener('click', function () { forceCompleteCare(s, forceCompleteBtn); });
      actions.appendChild(forceCompleteBtn);

      // 서류 미비·진료 거부·보호자 사정 등으로 현장에서 케어가 중단됐을 때 — 출장비만 남기고 부분
      // 환불하거나(일반 결제) 패키지 회차를 되돌립니다(sql/care_interruption_refund_system.sql).
      var interruptBtn = document.createElement('button');
      interruptBtn.type = 'button';
      interruptBtn.className = 'admin-btn is-ghost';
      interruptBtn.textContent = '케어 중단 처리';
      interruptBtn.addEventListener('click', function () { openCareInterruptModal(s); });
      actions.appendChild(interruptBtn);
    } else {
      // 완료된 건만 추가 요금(기본 요금 선결제 + 초과 시 추가 요금 정산)을 청구할 수 있습니다 — 아직
      // 진행 중인데 초과 여부를 미리 확정해 청구하면 서비스 종료 전에 금액이 바뀔 수 있어서입니다.
      appendExtraChargeActions(s, actions);
    }

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(actions);
    return row;
  }

  // ============================================================
  // 03-2b. 매니저 교체 모달 — admin_reassign_care_manager() RPC (sql/admin_care_actions.sql)를 호출합니다.
  //     드롭다운 목록은 03-1 번 수동 배정 모달과 똑같이 fetchActiveManagersWithNames() 를 재사용합니다.
  // ============================================================
  var reassignScheduleId = null;

  async function openReassignModal(schedule) {
    if (!els.reassignModal) return;
    reassignScheduleId = schedule.id;
    els.reassignSub.textContent = (schedule.senior_name || '어르신') + ' · 현재 담당: ' +
      (lastInProgressManagerById[schedule.manager_id] ? lastInProgressManagerById[schedule.manager_id].name : '알 수 없음');
    els.reassignError.hidden = true;
    els.reassignSelect.innerHTML = '<option value="">불러오는 중…</option>';
    els.reassignSelect.disabled = true;
    els.reassignConfirmBtn.disabled = true;
    els.reassignModal.hidden = false;

    var result = await fetchActiveManagersWithNames();
    if (reassignScheduleId !== schedule.id) return; // 그 사이 모달을 닫거나 다른 일정으로 다시 열었으면 중단

    if (result.error) {
      console.error('[Admin] 매니저 목록 조회 실패(교체 모달):', result.error.code, result.error.message);
      els.reassignSelect.innerHTML = '<option value="">매니저 목록을 불러오지 못했습니다</option>';
      els.reassignError.textContent = '매니저 목록 조회에 실패했습니다: ' + result.error.message;
      els.reassignError.hidden = false;
      return;
    }

    var candidates = result.rows.filter(function (m) { return m.id !== schedule.manager_id; });
    if (!candidates.length) {
      els.reassignSelect.innerHTML = '<option value="">교체할 수 있는 다른 매니저가 없습니다</option>';
      return;
    }

    els.reassignSelect.innerHTML = '<option value="">매니저를 선택해 주세요</option>' +
      candidates.map(function (m) {
        var statusLabel = m.activity_status === 'online' ? '온라인' : '휴식';
        return '<option value="' + m.id + '">' + escapeHtml(m.name) + ' (' + escapeHtml(m.phone) + ') · ' + statusLabel + '</option>';
      }).join('');
    els.reassignSelect.disabled = false;
    els.reassignConfirmBtn.disabled = false;
  }

  function closeReassignModal() {
    els.reassignModal.hidden = true;
    reassignScheduleId = null;
  }

  if (els.reassignModal) {
    els.reassignCloseBtn.addEventListener('click', closeReassignModal);
    els.reassignCancelBtn.addEventListener('click', closeReassignModal);
    els.reassignModal.addEventListener('mousedown', function (e) { if (e.target === els.reassignModal) closeReassignModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.reassignModal.hidden) closeReassignModal(); });

    els.reassignConfirmBtn.addEventListener('click', async function () {
      if (!reassignScheduleId) return;
      var newManagerId = els.reassignSelect.value;
      if (!newManagerId) {
        els.reassignError.textContent = '교체할 매니저를 선택해 주세요.';
        els.reassignError.hidden = false;
        return;
      }
      els.reassignError.hidden = true;
      els.reassignConfirmBtn.disabled = true;

      var res = await supabaseClient.rpc('admin_reassign_care_manager', {
        p_schedule_id: reassignScheduleId,
        p_new_manager_id: newManagerId
      });

      if (res.error) {
        console.error('[Admin] 매니저 교체 실패:', res.error.code, res.error.message,
          '→ sql/admin_care_actions.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
        els.reassignError.textContent = '매니저 교체에 실패했습니다: ' + res.error.message;
        els.reassignError.hidden = false;
        els.reassignConfirmBtn.disabled = false;
        return;
      }
      showToast('담당 매니저를 교체했습니다.');
      closeReassignModal();
      reloadCareView();
    });
  }

  // 배정됨/출발/도착 중 어느 단계든 남은 단계를 한 번에 건너뛰어 '완료'로 처리 — admin_force_complete_care()
  // RPC (sql/admin_care_actions.sql)가 enforce_care_status_flow 트리거가 허용하는 한 단계씩 순서대로 밀어줍니다.
  async function forceCompleteCare(s, btn) {
    var ok = window.confirm((s.senior_name || '이 어르신') + '의 케어를 지금 강제로 완료 처리할까요?');
    if (!ok) return;

    btn.disabled = true;
    var res = await supabaseClient.rpc('admin_force_complete_care', { p_schedule_id: s.id });
    if (res.error) {
      console.error('[Admin] 강제 완료 처리 실패:', res.error.code, res.error.message,
        '→ sql/admin_care_actions.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      showToast('강제 완료 처리에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('케어를 완료 처리했습니다.');
    reloadCareView();
    loadSummaryStats();
  }

  // ============================================================
  // 03-2c. 추가 요금 청구 (기본 요금 선결제 + 초과 시 추가 요금 정산, sql/extra_charge_billing.sql)
  //     완료된 케어에만 붙는 액션입니다 — 청구 금액은 관리자가 직접 입력하고(자동 계산 아님),
  //     보호자는 mypage.html 에서 그 금액만 PortOne 으로 따로 결제합니다.
  // ============================================================
  function appendExtraChargeActions(s, actions) {
    var chargeStatus = s.extra_charge_status || 'NONE';
    var amountText = (s.extra_charge_amount != null) ? Number(s.extra_charge_amount).toLocaleString('ko-KR') + '원' : '';

    if (chargeStatus === 'PAID') {
      var paidBadge = document.createElement('span');
      paidBadge.className = 'admin-badge is-payment-done';
      paidBadge.textContent = '추가 요금 결제완료 · ' + amountText;
      actions.appendChild(paidBadge);
      return;
    }

    if (chargeStatus === 'REQUESTED') {
      var reqBadge = document.createElement('span');
      reqBadge.className = 'admin-badge is-payment-pending';
      reqBadge.textContent = '추가 요금 청구됨 · ' + amountText;
      actions.appendChild(reqBadge);

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-btn is-ghost';
      editBtn.textContent = '청구 금액 수정';
      editBtn.addEventListener('click', function () { openExtraChargeModal(s); });
      actions.appendChild(editBtn);

      var cancelChargeBtn = document.createElement('button');
      cancelChargeBtn.type = 'button';
      cancelChargeBtn.className = 'admin-btn is-ghost';
      cancelChargeBtn.textContent = '청구 취소';
      cancelChargeBtn.addEventListener('click', function () { cancelExtraCharge(s, cancelChargeBtn); });
      actions.appendChild(cancelChargeBtn);
      return;
    }

    var requestBtn = document.createElement('button');
    requestBtn.type = 'button';
    requestBtn.className = 'admin-btn is-ghost';
    requestBtn.textContent = '추가 요금 청구';
    requestBtn.addEventListener('click', function () { openExtraChargeModal(s); });
    actions.appendChild(requestBtn);
  }

  var extraChargeScheduleId = null;

  function openExtraChargeModal(s) {
    if (!els.extraChargeModal) return;
    extraChargeScheduleId = s.id;
    els.extraChargeSub.textContent = seniorLabel(s) + ' · ' + formatDateTime(s.scheduled_at);
    els.extraChargeAmountInput.value = s.extra_charge_amount != null ? s.extra_charge_amount : '';
    els.extraChargeMemoInput.value = s.extra_charge_memo || '';
    els.extraChargeError.hidden = true;
    els.extraChargeConfirmBtn.disabled = false;
    els.extraChargeModal.hidden = false;
    els.extraChargeAmountInput.focus();
  }

  function closeExtraChargeModal() {
    els.extraChargeModal.hidden = true;
    extraChargeScheduleId = null;
  }

  if (els.extraChargeModal) {
    els.extraChargeCloseBtn.addEventListener('click', closeExtraChargeModal);
    els.extraChargeCancelBtn.addEventListener('click', closeExtraChargeModal);
    els.extraChargeModal.addEventListener('mousedown', function (e) { if (e.target === els.extraChargeModal) closeExtraChargeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.extraChargeModal.hidden) closeExtraChargeModal(); });

    els.extraChargeConfirmBtn.addEventListener('click', async function () {
      if (!extraChargeScheduleId) return;
      var amount = parseInt(els.extraChargeAmountInput.value, 10);
      if (!amount || amount <= 0) {
        els.extraChargeError.textContent = '0원보다 큰 금액을 입력해 주세요.';
        els.extraChargeError.hidden = false;
        return;
      }
      els.extraChargeError.hidden = true;
      els.extraChargeConfirmBtn.disabled = true;

      var res = await supabaseClient.rpc('admin_request_extra_charge', {
        p_schedule_id: extraChargeScheduleId,
        p_amount: amount,
        p_memo: els.extraChargeMemoInput.value.trim() || null
      });

      if (res.error) {
        console.error('[Admin] 추가 요금 청구 실패:', res.error.code, res.error.message,
          '→ sql/extra_charge_billing.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
        els.extraChargeError.textContent = '추가 요금 청구에 실패했습니다: ' + res.error.message;
        els.extraChargeError.hidden = false;
        els.extraChargeConfirmBtn.disabled = false;
        return;
      }
      showToast('추가 요금을 청구했습니다. 보호자가 마이페이지에서 결제할 수 있어요.');
      closeExtraChargeModal();
      reloadCareView();
    });
  }

  async function cancelExtraCharge(s, btn) {
    var ok = window.confirm((s.senior_name || '이 어르신') + '의 추가 요금 청구를 취소할까요? (보호자가 아직 결제하지 않은 경우에만 가능)');
    if (!ok) return;

    btn.disabled = true;
    var res = await supabaseClient.rpc('admin_cancel_extra_charge', { p_schedule_id: s.id });
    if (res.error) {
      console.error('[Admin] 추가 요금 청구 취소 실패:', res.error.code, res.error.message);
      showToast('추가 요금 청구 취소에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('추가 요금 청구를 취소했습니다.');
    reloadCareView();
  }

  // ============================================================
  // 03-2d. 케어 중단 처리 모달 — 서류 미비·진료 거부·보호자 사정 등으로 현장에서 케어가 중단됐을 때
  //   - 일반 결제 건: 출장비(위약금)만 남기고 PortOne으로 부분 취소(cancel-payment Edge Function)
  //   - 패키지 결제 건: PortOne 결제가 없으므로 회차를 원복(+1회)하거나 0.5회만 부분 차감 처리
  //   (sql/care_interruption_refund_system.sql 의 admin_apply_partial_refund/admin_adjust_package_session)
  // ============================================================
  var careInterruptState = null; // { schedule, isPackage, applicationId }

  function updateCareInterruptRefundPreview() {
    if (!careInterruptState || careInterruptState.isPackage) return;
    var payment = careInterruptState.schedule.payment_amount || 0;
    var fee = Number(els.careInterruptFeeInput.value || 0);
    if (!Number.isFinite(fee) || fee < 0) fee = 0;
    var refund = Math.max(payment - fee, 0);
    els.careInterruptRefundInfo.textContent = refund.toLocaleString('ko-KR') + '원';
  }
  els.careInterruptFeeInput.addEventListener('input', updateCareInterruptRefundPreview);

  async function openCareInterruptModal(s) {
    careInterruptState = { schedule: s, isPackage: false, applicationId: s.application_id };
    els.careInterruptSub.textContent = (s.senior_name || '어르신') + ' · 현재 결제액 ' +
      (s.payment_amount || 0).toLocaleString('ko-KR') + '원';
    els.careInterruptFeeInput.value = '';
    els.careInterruptMemoInput.value = '';
    els.careInterruptError.hidden = true;
    els.careInterruptPaymentInfo.textContent = (s.payment_amount || 0).toLocaleString('ko-KR') + '원';
    els.careInterruptRefundInfo.textContent = (s.payment_amount || 0).toLocaleString('ko-KR') + '원';

    if (!s.application_id) {
      // 신청서와 연결되지 않은(구글폼 경유 등) 레거시 건 — 패키지 여부를 확인할 길이 없어 일반 환불
      // 흐름으로만 처리합니다.
      els.careInterruptRefundSection.hidden = false;
      els.careInterruptPackageSection.hidden = true;
      els.careInterruptConfirmBtn.hidden = false;
      els.careInterruptModal.hidden = false;
      return;
    }

    var res = await supabaseClient.from('service_applications').select('is_package_used').eq('id', s.application_id).maybeSingle();
    if (res.error) {
      console.error('[Admin] 패키지 여부 확인 실패 → sql/user_packages_system.sql 을 실행했는지 확인하세요:', res.error.code, res.error.message);
    }
    careInterruptState.isPackage = !!(res.data && res.data.is_package_used);

    els.careInterruptRefundSection.hidden = careInterruptState.isPackage;
    els.careInterruptPackageSection.hidden = !careInterruptState.isPackage;
    els.careInterruptConfirmBtn.hidden = careInterruptState.isPackage; // 패키지는 아래 두 버튼이 곧바로 실행됨
    els.careInterruptModal.hidden = false;
  }

  function closeCareInterruptModal() {
    els.careInterruptModal.hidden = true;
    careInterruptState = null;
  }

  els.careInterruptCloseBtn.addEventListener('click', closeCareInterruptModal);
  els.careInterruptCancelBtn.addEventListener('click', closeCareInterruptModal);
  els.careInterruptModal.addEventListener('mousedown', function (e) { if (e.target === els.careInterruptModal) closeCareInterruptModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.careInterruptModal.hidden) closeCareInterruptModal(); });

  // [부분 취소 처리하기] — 일반 결제 건. PortOne 부분 취소가 실제로 성공한 뒤에만 DB를 바꾸므로
  // Edge Function 호출 하나로 끝냅니다(admin_apply_partial_refund 는 그 함수가 내부에서 호출).
  els.careInterruptConfirmBtn.addEventListener('click', async function () {
    if (!careInterruptState) return;
    var s = careInterruptState.schedule;
    var fee = Number(els.careInterruptFeeInput.value);
    var memo = els.careInterruptMemoInput.value.trim();
    var payment = s.payment_amount || 0;

    if (!Number.isFinite(fee) || fee < 0) {
      els.careInterruptError.textContent = '차감할 출장비를 올바르게 입력해 주세요.';
      els.careInterruptError.hidden = false;
      return;
    }
    if (fee > payment) {
      els.careInterruptError.textContent = '출장비가 현재 결제액(' + payment.toLocaleString('ko-KR') + '원)보다 많을 수 없습니다.';
      els.careInterruptError.hidden = false;
      return;
    }
    if (!memo) {
      els.careInterruptError.textContent = '처리 사유 메모를 입력해 주세요.';
      els.careInterruptError.hidden = false;
      return;
    }
    var refund = payment - fee;
    if (refund <= 0) {
      els.careInterruptError.textContent = '환불 금액이 0원입니다. 환불할 금액이 없으면 [강제 완료]를 사용해 주세요.';
      els.careInterruptError.hidden = false;
      return;
    }

    var ok = window.confirm('출장비 ' + fee.toLocaleString('ko-KR') + '원을 제외하고 ' + refund.toLocaleString('ko-KR') +
      '원을 PortOne으로 실제 부분 취소합니다. 계속할까요?');
    if (!ok) return;

    els.careInterruptError.hidden = true;
    els.careInterruptConfirmBtn.disabled = true;
    els.careInterruptConfirmBtn.textContent = '처리 중…';
    try {
      var res = await supabaseClient.functions.invoke('cancel-payment', {
        body: { schedule_id: s.id, refund_amount: refund, reason: memo }
      });
      if (res.error) throw res.error;
      showToast('부분 취소/환불 처리가 완료되었습니다.');
      closeCareInterruptModal();
      reloadCareView();
    } catch (e) {
      // supabase-js functions.invoke() 가 던지는 에러는 크게 두 종류입니다:
      //   1) FunctionsHttpError — 함수가 실제로 실행은 됐는데 비정상 status(4xx/5xx)를 응답한 경우.
      //      e.context 가 Response 객체라 .json() 으로 함수가 보낸 에러 본문(error/message)을 읽을 수
      //      있습니다(cancel-payment 의 json() 응답 형식, index.ts 참고).
      //   2) FunctionsFetchError — fetch 자체가 실패한 경우(Edge Function이 아예 배포돼 있지 않거나,
      //      네트워크/CORS 문제). 메시지가 항상 "Failed to send a request to the Edge Function" 로
      //      고정돼 있어 그것만 보면 원인을 알 수 없으므로, e.context(기반 네트워크 에러)까지 같이
      //      콘솔에 남깁니다 — 실제로 이 케이스는 거의 항상 "cancel-payment 가 아직 Supabase 에
      //      배포되지 않음"이었습니다(supabase functions deploy cancel-payment 로 배포).
      var detail = (e && e.context && typeof e.context.json === 'function') ? await e.context.json().catch(function () { return null; }) : null;
      var isFetchFailure = e && e.name === 'FunctionsFetchError';
      console.error('[Admin] 부분 취소 처리 실패 — name=' + (e && e.name) + ', message=' + (e && e.message) + ':',
        '\n  함수 응답 본문(detail):', detail,
        '\n  네트워크 단계 원인(context, FunctionsFetchError일 때 특히 중요):', e && e.context,
        '\n  원본 에러 객체:', e);
      var userMsg = isFetchFailure
        ? 'Edge Function(cancel-payment)에 연결할 수 없습니다. 함수가 Supabase에 배포되어 있는지(supabase functions deploy cancel-payment), 네트워크 상태를 확인해 주세요.'
        : ((detail && detail.message) || e.message || String(e));
      els.careInterruptError.textContent = '부분 취소 처리에 실패했습니다: ' + userMsg;
      els.careInterruptError.hidden = false;
    } finally {
      els.careInterruptConfirmBtn.disabled = false;
      els.careInterruptConfirmBtn.textContent = '부분 취소 처리하기';
    }
  });

  // [패키지 횟수 원복 (+1회)] / [0.5회 부분 차감 처리] — 패키지 결제 건. PortOne 결제가 없어 RPC 호출로 끝납니다.
  async function submitPackageAdjust(restoreAmount, btn) {
    if (!careInterruptState) return;
    var memo = els.careInterruptMemoInput.value.trim();
    if (!memo) {
      els.careInterruptError.textContent = '처리 사유 메모를 입력해 주세요.';
      els.careInterruptError.hidden = false;
      return;
    }
    var label = restoreAmount === 1 ? '패키지 1회 전체 원복' : '패키지 0.5회 부분 차감 처리';
    var ok = window.confirm(label + '을 진행할까요? (패키지 회차가 즉시 조정됩니다)');
    if (!ok) return;

    els.careInterruptError.hidden = true;
    els.careInterruptRestoreFullBtn.disabled = true;
    els.careInterruptRestoreHalfBtn.disabled = true;
    btn.textContent = '처리 중…';
    var res = await supabaseClient.rpc('admin_adjust_package_session', {
      p_application_id: careInterruptState.applicationId,
      p_restore_amount: restoreAmount,
      p_memo: memo
    });
    els.careInterruptRestoreFullBtn.disabled = false;
    els.careInterruptRestoreHalfBtn.disabled = false;
    els.careInterruptRestoreFullBtn.textContent = '패키지 횟수 원복 (+1회)';
    els.careInterruptRestoreHalfBtn.textContent = '0.5회 부분 차감 처리';
    if (res.error) {
      console.error('[Admin] 패키지 회차 조정 실패:', res.error.code, res.error.message,
        '→ sql/care_interruption_refund_system.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      els.careInterruptError.textContent = '패키지 회차 조정에 실패했습니다: ' + res.error.message;
      els.careInterruptError.hidden = false;
      return;
    }
    showToast(label + ' 완료 — 잔여 ' + res.data.remaining_count + '회');
    closeCareInterruptModal();
    reloadCareView();
  }
  els.careInterruptRestoreFullBtn.addEventListener('click', function () { submitPackageAdjust(1, els.careInterruptRestoreFullBtn); });
  els.careInterruptRestoreHalfBtn.addEventListener('click', function () { submitPackageAdjust(0.5, els.careInterruptRestoreHalfBtn); });

  // ============================================================
  // 03-2e. 현장 이슈 접수 — mypage.html '현장 이슈 발생 / 긴급 문의' 버튼으로 보호자가 접수한 건
  //   (sql/care_interruption_refund_system.sql 의 care_issue_reports). 실시간 알림톡 연동은 없고
  //   (카카오 비즈니스 발신프로필 필요, 외부 계정 미확보로 이번 작업에서는 제외), 관리자가 이 목록을
  //   확인하고 전화로 먼저 연락한 뒤 필요하면 위 [케어 중단 처리]로 이어갑니다.
  // ============================================================
  var CARE_ISSUE_TYPE_LABEL = { documents_missing: '서류 미비', health_refusal: '어르신 건강/진료 거부', other: '기타 현장 문제' };

  async function loadCareIssues() {
    var list = els.careIssueList;
    if (!list) return;

    // care_schedules 도 함께 embed합니다 — 매니저가 접수한 건(sql/care_issue_reports_manager_reporting.sql)은
    // application_id 없이 schedule_id만 있을 수 있어, service_applications 조인만으로는 어르신/보호자
    // 정보가 비어 보일 수 있습니다. care_schedules 는 그 정보를 자체 컬럼으로도 들고 있어 더 안정적입니다.
    var res = await supabaseClient
      .from('care_issue_reports')
      .select('id, application_id, schedule_id, reporter_role, issue_type, detail, status, created_at, ' +
        'service_applications(senior_name, user_contact, service_type), ' +
        'care_schedules(senior_name, guardian_name, guardian_phone, scheduled_at)')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (res.error) {
      console.warn('[Admin] care_issue_reports 조회 실패 → sql/care_interruption_refund_system.sql 을 실행했는지 확인하세요:', res.error.code, res.error.message);
      list.innerHTML = '<p class="admin-empty">현장 이슈 접수 내역을 불러오지 못했습니다.</p>';
      if (els.careIssueCount) els.careIssueCount.hidden = true;
      return;
    }

    var rows = res.data || [];
    if (els.careIssueCount) {
      els.careIssueCount.hidden = rows.length === 0;
      els.careIssueCount.textContent = rows.length + '건';
    }
    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">접수된 현장 이슈가 없습니다.</p>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(function (r) { list.appendChild(renderCareIssueRow(r)); });
  }

  function renderCareIssueRow(r) {
    var app = r.service_applications || {};
    var sched = r.care_schedules || {};
    var seniorName = app.senior_name || sched.senior_name || '어르신';
    var guardianName = sched.guardian_name || '보호자';
    var guardianPhone = app.user_contact || sched.guardian_phone || '연락처 미등록';
    var serviceType = app.service_type || '동행 서비스';
    var isManagerReport = r.reporter_role === 'manager';
    var row = document.createElement('div');
    row.className = 'admin-row';

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(seniorName) + '</div>' +
      '<div class="admin-row-sub">보호자 ' + escapeHtml(guardianName) + ' · ' + escapeHtml(guardianPhone) + '</div></div>' +
      '<div class="admin-badge-group">' +
      '<span class="admin-badge' + (isManagerReport ? ' is-assigned' : ' is-neutral') + '">' + (isManagerReport ? '매니저 접수' : '보호자 접수') + '</span>' +
      '<span class="admin-badge is-warn">' + escapeHtml(CARE_ISSUE_TYPE_LABEL[r.issue_type] || r.issue_type) + '</span></div>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>서비스</dt><dd>' + escapeHtml(serviceType) + '</dd>' +
      '<dt>예정 일시</dt><dd>' + (sched.scheduled_at ? formatDateTime(sched.scheduled_at) : '-') + '</dd>' +
      '<dt>접수 시각</dt><dd>' + formatDateTime(r.created_at) + '</dd>' +
      '<dt>상세 내용</dt><dd>' + escapeHtml(r.detail || '-') + '</dd>';

    var actions = document.createElement('div');
    actions.className = 'admin-row-actions';

    // [해당 케어 보기] — 위 '배정 완료(진행 중) 케어 현황' 목록에서 같은 schedule_id 를 가진 카드로
    // 스크롤 이동 + 잠깐 테두리 강조(scrollToInProgressCareRow). 그 케어가 이미 완료/취소돼 그 목록에
    // 더는 없거나, 검색/필터에 걸려 화면에 없으면(목록은 lastInProgressRows 전체가 아니라 현재 필터링
    // 결과만 그리므로) 토스트로 안내합니다.
    if (r.schedule_id) {
      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'admin-btn is-ghost';
      viewBtn.textContent = '해당 케어 보기';
      viewBtn.addEventListener('click', function () { scrollToInProgressCareRow(r.schedule_id); });
      actions.appendChild(viewBtn);
    }

    var resolveBtn = document.createElement('button');
    resolveBtn.type = 'button';
    resolveBtn.className = 'admin-btn is-ghost';
    resolveBtn.textContent = '확인 완료 처리';
    resolveBtn.addEventListener('click', async function () {
      resolveBtn.disabled = true;
      var res = await supabaseClient.rpc('admin_resolve_care_issue', { p_issue_id: r.id });
      if (res.error) {
        console.error('[Admin] 현장 이슈 처리 완료 표시 실패:', res.error.code, res.error.message);
        showToast('처리 완료 표시에 실패했습니다: ' + res.error.message);
        resolveBtn.disabled = false;
        return;
      }
      showToast('확인 완료로 표시했습니다.');
      loadCareIssues();
    });
    actions.appendChild(resolveBtn);

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(actions);
    return row;
  }

  // ============================================================
  // 03-3. 현장 인증 상세보기 모달 (5단계 전부: mypage.html REPORT_TIMELINE_LABELS 와 같은 용어로 통일)
  //     checkpoints = { departure: {at, lat, lng, accuracy, photo}, hospital_arrival: {...}, ... } (loadCareCheckpointsFor 참고)
  // ============================================================
  var CARE_VERIFY_SECTION_LABEL = {
    departure: '출발 (이동 중)', hospital_arrival: '병원 도착',
    treatment_complete: '진료/대행 완료', return_departure: '귀가 이동', return_complete: '케어 완료'
  };
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
    renderCareVerifySection(els.careVerifyTreatmentBody, 'treatment_complete', checkpoints.treatment_complete, openToken);
    renderCareVerifySection(els.careVerifyReturnDepartureBody, 'return_departure', checkpoints.return_departure, openToken);
    renderCareVerifySection(els.careVerifyReturnCompleteBody, 'return_complete', checkpoints.return_complete, openToken);
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
        reloadCareView();
        loadSummaryStats();
      })
      .subscribe(function (status) { console.log('[Admin][Realtime] care_schedules 구독 상태:', status); });
  }

  // ---------- 실시간 연결 복구 + 폴링 안전망 ----------
  // bfcache(뒤로/앞으로 가기로 복원된 페이지)에 들어가면 브라우저가 Realtime 웹소켓을 강제로 끊습니다(콘솔에
  // "Page entered Back-Forward Cache" 로 표시) — 이후 postgres_changes 구독은 상태 문자열은 'SUBSCRIBED'로
  // 남아 있어도 실제로는 죽어 있어, 화면이 더는 실시간으로 안 바뀝니다. 그래서 (1) 탭이 다시 보이거나 bfcache
  // 에서 복원되면 채널을 통째로 버리고 새로 구독하고, (2) 그래도 놓치는 경우를 위해 탭이 보이는 동안만 30초
  // 마다 가볍게 다시 조회하는 폴링을 안전망으로 둡니다.
  function resubscribeRealtime() {
    if (serviceApplicationsChannel) { supabaseClient.removeChannel(serviceApplicationsChannel); serviceApplicationsChannel = null; }
    if (careSchedulesChannel) { supabaseClient.removeChannel(careSchedulesChannel); careSchedulesChannel = null; }
    subscribeServiceApplicationChanges();
    subscribeCareScheduleChanges();
  }

  // 지금 화면에 걸려 있는 필터/탭 기준으로 모든 목록·요약 카드를 다시 불러옵니다 — '새로고침' 버튼과
  // 재연결 시점(visibilitychange/pageshow)·30초 폴링이 공유합니다.
  // ⚠ 예전엔 탭 상태를 가리지 않고 항상 loadApplications() 만 불렀는데, '취소' 탭을 보고 있을 때 이게
  // 호출되면 #applicationsList 를 '불러오는 중…' 으로 덮어쓴 뒤 PAYMENT_PENDING/MATCHING_PENDING 만
  // 조회해 오고, renderApplicationsList() 는 currentStatusFilter === 'cancelled' 일 때 바로 return 해버려서
  // 그 '불러오는 중…' 문구를 아무도 지우지 않는 채 영원히 멈춰 있는 버그가 있었습니다(체크박스 자체 change
  // 핸들러와 상태 필터 칩 클릭 핸들러는 이미 이 분기를 쓰고 있었는데, 여기만 빠져 있었습니다). 탭을 바꾸지
  // 않고 그대로 두면 '48시간 지난 신청도 보기' 체크박스 선택 상태도 그대로 유지된 채 올바른 로더가 다시
  // 호출됩니다(각 로더가 호출 시점의 체크박스 값을 그대로 읽어서 쓰기 때문에 따로 저장/복원할 값이 없습니다).
  function refreshAll() {
    loadSummaryStats();
    if (currentStatusFilter === 'cancelled') loadCancelledApplications();
    else loadApplications();
    reloadCareView();
    loadCareIssues();
  }

  var POLL_INTERVAL_MS = 30000;
  var pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(refreshAll, POLL_INTERVAL_MS);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      console.log('[Admin] 탭이 다시 보입니다 — Realtime 재구독 + 최신 상태 다시 불러오기');
      resubscribeRealtime();
      refreshAll();
      startPolling();
    } else {
      stopPolling(); // 안 보이는 탭에서 계속 조회하지 않도록 멈춤 — 다시 보이면 위에서 즉시 재시작
    }
  });

  // bfcache 로 복원된 페이지는 'visible' 이어도 pageshow(persisted=true) 가 따로 옵니다 — visibilitychange 와
  // 겹쳐 호출돼도 두 함수 모두 멱등(채널 재생성/재조회일 뿐)이라 안전합니다.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      console.log('[Admin] bfcache 에서 페이지가 복원됐습니다 — Realtime 재구독 + 최신 상태 다시 불러오기');
      resubscribeRealtime();
      refreshAll();
    }
  });

  if (els.refreshBtn) {
    els.refreshBtn.addEventListener('click', function () {
      els.refreshBtn.disabled = true;
      refreshAll();
      showToast('최신 상태를 다시 불러왔습니다.');
      setTimeout(function () { els.refreshBtn.disabled = false; }, 600);
    });
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
  // 반환: { error, rows: [{ id, name, phone, certification, activity_status, last_active_at, approved_at }] }
  async function fetchActiveManagersWithNames() {
    var managersRes = await supabaseClient
      .from('managers')
      .select('id, certification, activity_status, last_active_at, approved_at, profiles(name, phone)')
      .eq('certification_verified', true)
      .order('approved_at', { ascending: false });

    // last_active_at 컬럼이 아직 없는 DB(sql/manager_duty_status.sql 미적용)에서도 목록 자체는 계속
    // 보이도록, 그 컬럼만 빼고 한 번 더 조회합니다(42703 = undefined_column).
    if (managersRes.error && managersRes.error.code === '42703') {
      console.warn('[Admin] managers.last_active_at 컬럼이 없습니다(42703) → sql/manager_duty_status.sql 을 실행해 주세요. 최근 활동일 없이 계속 표시합니다.');
      managersRes = await supabaseClient
        .from('managers')
        .select('id, certification, activity_status, approved_at, profiles(name, phone)')
        .eq('certification_verified', true)
        .order('approved_at', { ascending: false });
    }

    if (managersRes.error) return { error: managersRes.error, rows: [] };

    var rawRows = managersRes.data || [];
    if (!rawRows.length) return { error: null, rows: [] };

    // 디버깅용 원본 로그 — managers.profiles embed 가 null/빈 객체/배열 중 무엇으로 왔는지 그대로
    // 찍습니다. Array.isArray(m.profiles) 가 true 면 PostgREST 가 이 관계를 "to-one"이 아니라
    // "to-many"로 추론했다는 뜻이라(스키마 캐시가 managers.id → profiles.id FK를 못 찾았을 때
    // 흔히 생김), 아래에서 profile.name 으로 바로 접근하면 항상 undefined 가 됩니다.
    console.log('[Admin][디버그] managers 원본 조회 결과(' + rawRows.length + '건):',
      rawRows.map(function (m) {
        return {
          manager_id: m.id,
          profiles_embed_type: Array.isArray(m.profiles) ? 'array(비정상 — to-many로 추론됨)' : (m.profiles === null ? 'null(해당 id의 profiles 행을 못 읽음 — RLS 또는 행 없음)' : typeof m.profiles),
          profiles_embed_raw: m.profiles
        };
      }));

    // profiles.name/phone 이 비어 있는 경우를 위한 보조 조회 (승인된 신청서의 이름/연락처)
    var ids = rawRows.map(function (m) { return m.id; });

    // id 매핑 자체가 깨졌는지 먼저 직접 확인합니다 — embed 없이 profiles 를 id 로만 바로 조회해서
    // managers.id 와 정확히 같은 id의 profiles 행이 실제로 존재하는지 비교합니다(embed 쪽만 이상할
    // 수도 있고, id 자체가 어긋나 있을 수도 있어 둘을 구분하기 위함).
    var directProfilesRes = await supabaseClient.from('profiles').select('id, name, phone').in('id', ids);
    if (directProfilesRes.error) {
      console.warn('[Admin][디버그] profiles 직접 조회 실패:', directProfilesRes.error.code, directProfilesRes.error.message);
    } else {
      var directProfileIds = (directProfilesRes.data || []).map(function (p) { return p.id; });
      var missingProfileIds = ids.filter(function (id) { return directProfileIds.indexOf(id) === -1; });
      console.log('[Admin][디버그] profiles 직접 조회(embed 없이) — 요청한 managers.id ' + ids.length + '개 중 ' +
        directProfileIds.length + '개에서 profiles 행을 찾음. ' + directProfilesRes.data.length + '건 상세:', directProfilesRes.data);
      if (missingProfileIds.length) {
        console.warn('[Admin][디버그] ⚠ 아래 managers.id 는 profiles 테이블에 같은 id의 행이 전혀 없습니다 ' +
          '(RLS 문제가 아니라 — RLS는 "있는 행을 못 보는" 것이고 이건 "행 자체가 없음" — managers.id 가 profiles.id 와 ' +
          '어긋났거나, 그 유저의 profiles 행이 삭제/누락된 경우입니다. Supabase 테이블 편집기에서 직접 확인해 보세요):',
          missingProfileIds);
      }
    }

    var appsRes = await supabaseClient
      .from('manager_applications')
      .select('user_id, name, phone, status, reviewed_at')
      .in('user_id', ids)
      .order('reviewed_at', { ascending: false });

    if (appsRes.error) {
      console.warn('[Admin] 이름/연락처 보조 조회 실패(manager_applications):', appsRes.error.code, appsRes.error.message);
    } else {
      console.log('[Admin][디버그] manager_applications 전체 조회(상태 무관, ' + (appsRes.data || []).length + '건):', appsRes.data);
      var appUserIds = (appsRes.data || []).map(function (a) { return a.user_id; });
      var noApplicationAtAll = ids.filter(function (id) { return appUserIds.indexOf(id) === -1; });
      if (noApplicationAtAll.length) {
        console.warn('[Admin][디버그] ⚠ 아래 managers.id 는 manager_applications 에 행이 아예 없습니다 — ' +
          '승인 절차(manager-apply.html → 관리자 승인)를 거치지 않고 직접 만들어진 매니저(수기 삽입/구버전 데이터)일 ' +
          '가능성이 큽니다. 이름/연락처를 가져올 보조 소스 자체가 없다는 뜻이라, profiles.name/phone 을 직접 채우는 ' +
          '수밖에 없습니다:', noApplicationAtAll);
      }
    }

    // status='approved' 가 아닌 행(예: 'pending'/'rejected'로 남아 있거나 상태값 표기가 다른 경우)까지
    // 전부 받아 온 뒤 여기서 approved만 걸러 fallback으로 씁니다 — 위 로그에서 "신청서는 있는데 status가
    // approved가 아니라서 fallback에 안 잡히는" 경우까지 구분해 보여주기 위함입니다.
    var infoById = {};
    (appsRes.data || []).forEach(function (a) {
      if (a.status !== 'approved') return;
      if (!infoById[a.user_id]) infoById[a.user_id] = { name: a.name, phone: a.phone }; // 최신순 정렬이라 먼저 나온 값을 채택
    });

    var rows = rawRows.map(function (m) {
      var profile = Array.isArray(m.profiles) ? (m.profiles[0] || {}) : (m.profiles || {});
      var fallback = infoById[m.id] || {};
      var resolvedName = profile.name || fallback.name || '이름 미등록';
      var resolvedPhone = profile.phone || fallback.phone || '연락처 미등록';
      if (resolvedName === '이름 미등록' || resolvedPhone === '연락처 미등록') {
        console.warn('[Admin][디버그] ⚠ 최종적으로 이름/연락처를 못 채운 매니저 — manager_id=' + m.id +
          ', profiles embed=', m.profiles, ', manager_applications fallback=', infoById[m.id] || '(없음)',
          '→ 위 로그에서 이 id가 "profiles 행 없음" 또는 "manager_applications 행 없음" 목록에 있는지 확인하세요.');
      }
      return {
        id: m.id,
        name: resolvedName,
        phone: resolvedPhone,
        certification: m.certification,
        activity_status: m.activity_status,
        last_active_at: m.last_active_at || null,
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
    activeManagersCache = rows;

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

    renderActiveManagersList();
  }

  // activeManagersCache 를 검색어(이름/연락처) + 근무 상태 필터로 걸러서 다시 그립니다 — 서버 재조회
  // 없이 클라이언트에서만 거릅니다(위 00-1 번 검색/상태 필터와 같은 패턴).
  function renderActiveManagersList() {
    var list = els.activeManagersList;
    if (!list) return;

    var filtered = activeManagersCache.filter(function (m) {
      if (currentManagerDutyFilter !== 'all' && m.activity_status !== currentManagerDutyFilter) return false;
      if (!currentManagerSearchText) return true;
      return normalizeSearchText(m.name).indexOf(currentManagerSearchText) !== -1 ||
             normalizeSearchText(m.phone).indexOf(currentManagerSearchText) !== -1;
    });

    if (els.activeManagersCount) {
      els.activeManagersCount.textContent = filtered.length + '건';
      els.activeManagersCount.hidden = false;
    }

    if (!filtered.length) {
      list.innerHTML = '<p class="admin-empty">' +
        (activeManagersCache.length ? '조건에 맞는 매니저가 없습니다.' : '활동 중인 매니저가 없습니다.') + '</p>';
      return;
    }

    list.innerHTML = '';
    filtered.forEach(function (m) { list.appendChild(renderActiveManagerRow(m)); });
  }

  function renderActiveManagerRow(m) {
    var row = document.createElement('div');
    row.className = 'admin-row';

    var isOnline = m.activity_status === 'online';
    var dutyBadgeClass = isOnline ? 'is-verified' : 'is-neutral';
    var dutyBadgeText = isOnline ? '근무 중' : '휴식 중';

    var head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div><div class="admin-row-name">' + escapeHtml(m.name) + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(m.phone) + '</div></div>' +
      '<span class="admin-badge ' + dutyBadgeClass + '">' + dutyBadgeText + '</span>';

    var meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>자격증</dt><dd>' + escapeHtml(m.certification || '미등록') + '</dd>' +
      '<dt>근무 상태</dt><dd>' + dutyBadgeText + '</dd>' +
      '<dt>최근 활동</dt><dd>' + (m.last_active_at ? formatDateTime(m.last_active_at) : '활동 이력 없음') + '</dd>' +
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

  // ============================================================
  // 05. 매니저 정산 (월별) — 매니저 시급 × 수행 시간으로 매니저 정산금을 자동 계산(sql/
  //     manager_hourly_rate_settlement.sql)한 뒤, 선택한 달에 완료(completed)된 건만 모아 매니저별로
  //     [완료 건수 / 정산대상액 / 3.3% 원천세 / 실지급액]을 집계해서 보여줍니다.
  //     admin_manager_monthly_settlements() RPC 하나만 호출합니다 — is_admin() 체크가 그 함수
  //     안에 있어(fail closed), 이 화면은 결과를 그대로 표에 그리기만 합니다.
  // ============================================================
  // admin_manager_monthly_settlements() RPC 가 completed_at 을 'Asia/Seoul' 기준으로 월을 나누므로,
  // 월 선택기의 기본값("이번 달")도 관리자 브라우저의 로컬 시간대가 아니라 KST 로 계산해야 합니다 —
  // 로컬 getter(new Date().getFullYear()/getMonth())를 쓰면 月 경계(매월 1일 전후) 근처에 KST 가 아닌
  // 시간대의 관리자가 접속했을 때 기본으로 뜨는 달이 하루 어긋나(예: 실제로는 이미 10월 1일인데 9월로
  // 표시) 매니저 화면(mypage-manager.html, 같은 이유로 toKst() 를 쓰도록 고쳐짐)과 다른 달을 보게 됩니다.
  function currentYearMonthValue() {
    var kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.getUTCFullYear() + '-' + String(kst.getUTCMonth() + 1).padStart(2, '0');
  }

  // 월을 빠르게 연달아 바꾸면(또는 초기 로드 중 바로 다른 달을 고르면) 먼저 보낸 요청이 나중 요청보다
  // 늦게 응답할 수 있습니다 — 그 응답이 나중에 도착해 표를 덮어쓰면, 방금 고른 달과 다른(이전) 달의
  // 데이터가 화면에 "고정된 것처럼" 남는 원인이 됩니다. admin.js 의 다른 목록(fetchCancelledApplicationsPage
  // 의 requestSeq)과 같은 패턴으로, 가장 최근에 시작한 요청의 응답만 반영합니다.
  var settlementRequestSeq = 0;

  async function loadManagerSettlements() {
    var body = els.settlementTableBody;
    if (!body) return;

    // <input type="month"> 의 .value 는 표준상 항상 'YYYY-MM' 형식이지만, 그 형식이 아닌 값이 들어오면
    // (예: type="month" 를 지원하지 않는 구버전 브라우저가 일반 텍스트로 취급) '-01' 을 그냥 붙여서는
    // 안 되므로 정규식으로 한 번 검증합니다 — 형식이 다르면 '이번 달'(KST 기준)로 안전하게 되돌립니다.
    var rawMonthValue = (els.settlementMonthInput && els.settlementMonthInput.value) || '';
    var monthValue = /^\d{4}-\d{2}$/.test(rawMonthValue) ? rawMonthValue : currentYearMonthValue();
    var pMonth = monthValue + '-01';

    var requestSeq = ++settlementRequestSeq;
    var requestPayload = { p_month: pMonth };
    // 이 한 줄이 devtools 콘솔에 안 보인다면(F12 → Console), 브라우저가 이 파일의 새 버전을 아직
    // 못 받은 것입니다(캐시) — admin.html 의 <script src="/admin.js?v=..."> 쿼리 버전을 올렸는지,
    // 그리고 실제로 새로고침(하드 리프레시: Ctrl/Cmd+Shift+R 또는 devtools Network 탭의 'Disable
    // cache' 체크) 했는지 확인하세요. 이 로그 자체가 "지금 실행 중인 admin.js가 최신 버전인지"의
    // 증거입니다.
    console.log('[Admin] 매니저 정산 RPC 호출 — 함수명=admin_manager_monthly_settlements, 요청 바디=', requestPayload,
      '(요청 순번 ' + requestSeq + ', select 요소 현재값=' + rawMonthValue + ')');

    body.innerHTML = '<tr><td colspan="6" class="admin-loading">불러오는 중…</td></tr>';
    if (els.settlementCount) els.settlementCount.hidden = true;
    if (els.settlementTableFoot) els.settlementTableFoot.hidden = true;

    var res = await supabaseClient.rpc('admin_manager_monthly_settlements', requestPayload);
    console.log('[Admin] 매니저 정산 RPC 원본 응답(res) — p_month=' + pMonth + ':', res);

    if (requestSeq !== settlementRequestSeq) {
      console.log('[Admin] 매니저 정산 응답 도착했지만 그 사이 더 최근 요청이 시작되어 버림 — p_month=' + pMonth +
        ' (이 응답의 순번 ' + requestSeq + ' ≠ 현재 최신 순번 ' + settlementRequestSeq + ')');
      return; // 그 사이 다른 달을 선택해 더 최근 요청이 시작됨 — 이 응답은 화면에 반영하지 않음
    }

    if (res.error) {
      console.error('[Admin] 매니저 정산 집계 실패 — p_month=' + pMonth + ':', res.error.code, res.error.message,
        '→ sql/manager_hourly_rate_settlement.sql / admin_settlement_fixes_v3.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      body.innerHTML = '<tr><td colspan="6" class="admin-empty">정산 내역을 불러오지 못했습니다: ' +
        escapeHtml(res.error.message) + '</td></tr>';
      return;
    }

    var rows = res.data || [];
    console.log('[Admin] 매니저 정산 집계 결과 — p_month=' + pMonth + ', ' + rows.length + '명:');
    rows.forEach(function (r, i) {
      console.log('  [' + i + '] manager_id=' + r.manager_id + ', name=' + r.manager_name +
        ', completed_count=' + r.completed_count + ', payout_subtotal=' + r.payout_subtotal +
        ', net_payout=' + r.net_payout);
    });

    if (els.settlementCount) {
      els.settlementCount.textContent = rows.length + '명';
      els.settlementCount.hidden = false;
    }

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="admin-empty">선택한 달에 완료된 케어 건이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = '';
    var totalCount = 0, totalPayout = 0, totalTax = 0, totalNet = 0;

    rows.forEach(function (r) {
      totalCount += Number(r.completed_count || 0);
      totalPayout += Number(r.payout_subtotal || 0);
      totalTax += Number(r.withholding_tax || 0);
      totalNet += Number(r.net_payout || 0);

      var tr = document.createElement('tr');
      tr.className = 'is-clickable';
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', escapeHtml(r.manager_name) + ' ' + pMonth.slice(0, 7) + ' 정산 상세보기');
      tr.innerHTML =
        '<td><span class="settle-manager-name">' + escapeHtml(r.manager_name) + '</span>' +
        '<span class="settle-manager-phone">' + escapeHtml(r.manager_phone) + '</span></td>' +
        '<td>' + Number(r.completed_count || 0) + '건</td>' +
        '<td>' + won(r.payout_subtotal) + '</td>' +
        '<td>' + won(r.withholding_tax) + '</td>' +
        '<td class="settle-net">' + won(r.net_payout) + '</td>' +
        '<td><button type="button" class="admin-btn is-ghost settle-detail-btn">상세보기</button></td>';
      tr.addEventListener('click', function (e) {
        // 버튼을 눌렀을 때도 행 클릭 리스너가 한 번 더 겹쳐 중복 호출되지 않게, 버튼 클릭은 버블링을
        // 그대로 타게 두고(stopPropagation 불필요 — 같은 동작이라 중복 실행돼도 결과가 같음) 행 전체를
        // 클릭 가능하게 만듭니다(매니저 행 클릭 또는 [상세보기] 버튼 둘 다 같은 모달을 엶).
        openSettlementDetailModal(r, pMonth);
      });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSettlementDetailModal(r, pMonth); }
      });
      body.appendChild(tr);
    });

    if (els.settlementTableFoot) {
      els.settlementTotalCount.textContent = totalCount + '건';
      els.settlementTotalPayout.textContent = won(totalPayout);
      els.settlementTotalTax.textContent = won(totalTax);
      els.settlementTotalNet.textContent = won(totalNet);
      els.settlementTableFoot.hidden = false;
    }
  }

  // ---------- 매니저 정산 상세 내역 모달 (행 클릭 또는 [상세보기] 버튼) ----------
  // admin_manager_monthly_settlement_details() RPC(sql/admin_settlement_detail_rpc.sql)는
  // admin_manager_monthly_settlements() 의 completed_rows 와 완전히 같은 WHERE 조건에
  // manager_id 필터만 추가한 것이라, 여기서 보여줄 건별 목록의 합계는 항상 요약 표의
  // payout_subtotal 과 정확히 같습니다 — "이 금액이 왜 나왔는지" 건별로 검증하는 용도입니다.
  var settlementDetailRequestSeq = 0;

  function closeSettlementDetailModal() {
    if (els.settlementDetailModal) els.settlementDetailModal.hidden = true;
  }
  if (els.settlementDetailModal) {
    els.settlementDetailModal.addEventListener('mousedown', function (e) {
      if (e.target === els.settlementDetailModal) closeSettlementDetailModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.settlementDetailModal.hidden) closeSettlementDetailModal();
    });
  }
  if (els.settlementDetailCloseBtn) els.settlementDetailCloseBtn.addEventListener('click', closeSettlementDetailModal);
  if (els.settlementDetailCloseBtn2) els.settlementDetailCloseBtn2.addEventListener('click', closeSettlementDetailModal);

  async function openSettlementDetailModal(managerRow, pMonth) {
    if (!els.settlementDetailModal) return;
    var monthLabel = pMonth.slice(0, 7).replace('-', '년 ') + '월';
    if (els.settlementDetailModalTitle) els.settlementDetailModalTitle.textContent = managerRow.manager_name + ' 매니저 정산 상세';
    if (els.settlementDetailModalSub) {
      els.settlementDetailModalSub.textContent = monthLabel + ' · 완료 ' + Number(managerRow.completed_count || 0) + '건 · 정산대상액 ' + won(managerRow.payout_subtotal);
    }
    if (els.settlementDetailTableFoot) els.settlementDetailTableFoot.hidden = true;
    if (els.settlementDetailTableBody) els.settlementDetailTableBody.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';
    els.settlementDetailModal.hidden = false;

    var requestSeq = ++settlementDetailRequestSeq;
    var res = await supabaseClient.rpc('admin_manager_monthly_settlement_details', {
      p_month: pMonth, p_manager_id: managerRow.manager_id
    });
    if (requestSeq !== settlementDetailRequestSeq) return; // 그 사이 다른 매니저/달의 상세보기를 또 열었음 — 이 응답은 버림

    if (res.error) {
      console.error('[Admin] 매니저 정산 상세 내역 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_settlement_detail_rpc.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      if (els.settlementDetailTableBody) {
        els.settlementDetailTableBody.innerHTML = '<tr><td colspan="5" class="admin-empty">상세 내역을 불러오지 못했습니다: ' +
          escapeHtml(res.error.message) + '</td></tr>';
      }
      return;
    }

    var items = res.data || [];
    if (!els.settlementDetailTableBody) return;
    if (!items.length) {
      els.settlementDetailTableBody.innerHTML = '<tr><td colspan="5" class="admin-empty">상세 내역이 없습니다.</td></tr>';
      return;
    }

    els.settlementDetailTableBody.innerHTML = '';
    var totalPayment = 0, totalPayout = 0;
    items.forEach(function (it) {
      totalPayment += Number(it.payment_amount || 0);
      totalPayout += Number(it.manager_payout || 0);

      // 이용 일시는 예정 일시(scheduled_at) 기준으로 보여줍니다 — 단, 이 정산 집계 자체는 completed_at
      // 월을 기준으로 하므로, 예정일과 완료 처리월이 서로 다른 건(예: 월말 예정 → 다음 달 완료 처리)은
      // "왜 이 달에 잡혔는지" 바로 알 수 있도록 완료 처리 일시를 작게 덧붙입니다.
      var schedIso = it.scheduled_at, doneIso = it.completed_at;
      var schedDate = schedIso ? new Date(schedIso) : null;
      var doneDate = doneIso ? new Date(doneIso) : null;
      var dateCell = escapeHtml(formatDateTime(schedIso));
      if (schedDate && doneDate && (schedDate.getUTCFullYear() !== doneDate.getUTCFullYear() || schedDate.getUTCMonth() !== doneDate.getUTCMonth())) {
        dateCell += '<span class="detail-datetime-sub">완료 처리: ' + escapeHtml(formatDateTime(doneIso)) + '</span>';
      }

      // 고객 평가: care_reviews 에 보호자가 남긴 별점/리뷰(sql/care_reviews.sql) — 아직 평가하지 않은
      // 건은 rating 이 null 로 돌아옵니다.
      var reviewCell = '<span class="admin-badge">평가 없음</span>';
      if (it.rating != null) {
        reviewCell = '<span class="detail-stars">' + '★'.repeat(it.rating) + '☆'.repeat(5 - it.rating) + '</span>';
        if (it.review_text) reviewCell += '<span class="detail-review-text">' + escapeHtml(it.review_text) + '</span>';
      }

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="detail-cat">' + escapeHtml(it.service_type || '기타') + '</td>' +
        '<td>' + dateCell + '</td>' +
        '<td>' + won(it.payment_amount) + '</td>' +
        '<td class="detail-payout">' + won(it.manager_payout) + '</td>' +
        '<td class="detail-review">' + reviewCell + '</td>';
      els.settlementDetailTableBody.appendChild(tr);
    });

    if (els.settlementDetailTableFoot) {
      els.settlementDetailTotalPayment.textContent = won(totalPayment);
      els.settlementDetailTotalPayout.textContent = won(totalPayout);
      els.settlementDetailTableFoot.hidden = false;
    }

    // 요약 행의 정산대상액과 이 상세 목록 합계가 항상 같아야 합니다 — 다르면 두 RPC의 WHERE 조건이
    // 어긋났다는 뜻이니 콘솔에 바로 표시해 둡니다(화면에는 영향 없음, 디버깅용).
    if (Number(managerRow.payout_subtotal || 0) !== totalPayout) {
      console.warn('[Admin] 정산 상세 합계(' + totalPayout + ')가 요약 표의 정산대상액(' + managerRow.payout_subtotal +
        ')과 다릅니다 — admin_manager_monthly_settlements() 와 admin_manager_monthly_settlement_details() 의 WHERE 조건이 어긋났을 수 있습니다.');
    }
  }

  if (els.settlementMonthInput) {
    els.settlementMonthInput.value = currentYearMonthValue();
    console.log('[Admin] settlementMonthInput 요소를 찾았습니다. 초기값=' + els.settlementMonthInput.value +
      ', tagName=' + els.settlementMonthInput.tagName + ', type=' + els.settlementMonthInput.type);
    els.settlementMonthInput.addEventListener('change', function (e) {
      console.log('[Admin] settlementMonthInput change 이벤트 발생 — 새로 선택한 값(e.target.value)=' + e.target.value);
      loadManagerSettlements();
    });
  } else {
    // id="settlementMonthInput" 요소를 못 찾은 경우 — admin.html 의 id 오타, 또는 이 스크립트가 그 input이
    // 그려지기 전에 실행된 경우(둘 다 이 로그로 바로 알 수 있습니다). 이 경우 월 선택이 전혀 반응하지
    // 않고 항상 currentYearMonthValue()(이번 달)로만 조회됩니다.
    console.warn('[Admin] #settlementMonthInput 요소를 찾지 못했습니다 — admin.html 의 id 를 확인하세요. ' +
      '월 선택 없이 항상 "이번 달" 기준으로만 정산이 조회됩니다.');
  }

  // ============================================================
  // 패키지 구매 회원 관리 — user_packages 전체를 고객 프로필과 함께 조회해 구매일/만료일/잔여 회차를
  // 보여줍니다(sql/admin_package_management.sql 의 user_packages_select_admin 정책이 있어야 다른
  // 보호자의 행까지 보입니다 — 없으면 본인 행만 보이는 user_packages_select_own 만 적용돼 빈 목록처럼
  // 보일 수 있습니다). profiles.name/phone 이 비어 있는 보호자는 fillMissingGuardianContact() 가
  // service_applications.user_contact(신청 시 직접 입력한 "이름 / 연락처")로 보조 채움합니다.
  // [회차 조정]은 같은 파일의 admin_adjust_user_package() RPC 를 호출합니다.
  // ============================================================
  var USER_PACKAGE_TYPE_LABEL = { '5_sessions': '5회권', '10_sessions': '10회권', '10_hours': '10시간권', '20_hours': '20시간권' };
  var USER_PACKAGE_STATUS_LABEL = { active: '사용 중', exhausted: '소진', expired: '만료' };
  var USER_PACKAGE_STATUS_BADGE = { active: 'is-payment-done', exhausted: 'is-neutral', expired: 'is-overdue' };

  var lastUserPackagesRows = [];
  var userPackagesOffset = 0;
  var userPackagesHasMore = false;
  var userPackagesLoadingMore = false;
  var currentUserPackagesSearchText = '';
  var packageAdjustTarget = null; // [회차 조정] 모달이 지금 다루고 있는 user_packages 행
  var packageGroupDetailCurrentKey = null; // [상세보기] 모달이 지금 열어 둔 그룹의 key(groupUserPackagesByContact 참고) — 회차 조정 뒤 그 모달을 같은 그룹으로 다시 그리기 위해 기억

  // profiles.name/phone 은 카카오 로그인만으로 가입한 보호자는 비어 있을 수 있습니다(카카오 OAuth
  // 메타데이터에 휴대폰 번호가 애초에 없고, 이름도 닉네임 제공을 거부하면 비어 있을 수 있음 —
  // fetchActiveManagersWithNames() 가 manager_applications 를 보조로 쓰는 것과 같은 이유). 보호자는
  // apply.html 신청 시 '신청자 성함/연락처'를 매번 직접 입력해 service_applications.user_contact 에
  // "이름 / 연락처" 형식으로 남기므로(apply.html 의 user_contact: applicant_name + ' / ' + applicant_phone),
  // profiles 쪽이 비어 있을 때 이 값을 보조로 채웁니다.
  function parseUserContact(raw) {
    var s = (raw || '').trim();
    if (!s) return { name: '', phone: '' };
    var sepIdx = s.indexOf(' / ');
    if (sepIdx === -1) return { name: s, phone: '' };
    return { name: s.slice(0, sepIdx).trim(), phone: s.slice(sepIdx + 3).trim() };
  }

  async function fillMissingGuardianContact(pageRows) {
    var missingIds = [];
    pageRows.forEach(function (p) {
      var profile = p.profiles || {};
      if ((!profile.name || !profile.phone) && p.user_id && missingIds.indexOf(p.user_id) === -1) {
        missingIds.push(p.user_id);
      }
    });
    if (!missingIds.length) return;

    var appsRes = await supabaseClient
      .from('service_applications')
      .select('user_id, user_contact, created_at')
      .in('user_id', missingIds)
      .order('created_at', { ascending: false });

    if (appsRes.error) {
      console.warn('[Admin] 보호자 이름/연락처 보조 조회 실패(service_applications):', appsRes.error.code, appsRes.error.message);
      return;
    }

    var infoById = {};
    (appsRes.data || []).forEach(function (a) {
      if (!infoById[a.user_id]) infoById[a.user_id] = parseUserContact(a.user_contact); // 최신순 정렬 → 먼저 나온 값 채택
    });

    pageRows.forEach(function (p) {
      var fallback = infoById[p.user_id];
      if (!fallback) return;
      if (!p.profiles) p.profiles = {};
      if (!p.profiles.name) p.profiles.name = fallback.name;
      if (!p.profiles.phone) p.profiles.phone = fallback.phone;
    });
  }

  async function fetchUserPackagesPage(isFirstPage) {
    var body = els.userPackagesTableBody;
    if (!body) return false;

    var res = await supabaseClient
      .from('user_packages')
      .select('id, user_id, package_type, total_count, remaining_count, status, created_at, expires_at, profiles(name, phone)')
      .order('created_at', { ascending: false })
      .range(userPackagesOffset, userPackagesOffset + ADMIN_LIST_PAGE_SIZE);

    if (res.error) {
      console.error('[Admin] 패키지 구매 회원 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_package_management.sql 을 Supabase SQL Editor 에서 실행했는지(user_packages_select_admin 정책), 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      if (isFirstPage) {
        body.innerHTML = '<tr><td colspan="5" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</td></tr>';
      } else {
        showToast('목록을 더 불러오지 못했습니다: ' + res.error.message);
      }
      return false;
    }

    var rawRows = res.data || [];
    userPackagesHasMore = rawRows.length > ADMIN_LIST_PAGE_SIZE;
    var pageRows = rawRows.slice(0, ADMIN_LIST_PAGE_SIZE);
    await fillMissingGuardianContact(pageRows);
    userPackagesOffset += pageRows.length;
    lastUserPackagesRows = lastUserPackagesRows.concat(pageRows);
    return true;
  }

  // 같은 보호자가 여러 번 패키지를 구매하면 user_packages 에 행이 여러 개 쌓입니다 — 메인 표에서는
  // 이걸 한 사람당 한 행으로 모아 보여주고(총 잔여 회차 합산 · 대표 상태), 개별 구매 내역은
  // [상세보기] 모달에서만 펼쳐 봅니다. 그룹 키는 연락처(전화번호) 우선이고, 연락처가 비어 있는 행은
  // (카카오 로그인만으로 가입한 보호자 등) user_id로, 그마저도 없으면 행 자신의 id로 묶어 — 서로
  // 다른 사람의 '연락처 미등록' 행들이 전부 한 그룹으로 잘못 합쳐지지 않게 합니다.
  function groupUserPackagesByContact(rows) {
    var groups = [];
    var byKey = {};
    rows.forEach(function (p) {
      var profile = p.profiles || {};
      var phone = normalizeSearchText(profile.phone || '').trim();
      var key = phone ? ('phone:' + phone) : (p.user_id ? ('uid:' + p.user_id) : ('row:' + p.id));
      var g = byKey[key];
      if (!g) {
        g = { key: key, name: '', phone: '', packages: [] };
        byKey[key] = g;
        groups.push(g);
      }
      if (!g.name && profile.name) g.name = profile.name;
      if (!g.phone && profile.phone) g.phone = profile.phone;
      g.packages.push(p);
    });
    groups.forEach(function (g) {
      g.totalRemaining = g.packages.reduce(function (sum, p) { return sum + (Number(p.remaining_count) || 0); }, 0);
      g.totalCount = g.packages.reduce(function (sum, p) { return sum + (Number(p.total_count) || 0); }, 0);
      // 대표 상태: 하나라도 '사용 중'이면 사용 중, 아니면 하나라도 '소진'이면 소진, 전부 만료일 때만 만료
      g.statusKey = g.packages.some(function (p) { return p.status === 'active'; }) ? 'active' :
        g.packages.some(function (p) { return p.status === 'exhausted'; }) ? 'exhausted' : 'expired';
    });
    return groups;
  }

  function renderUserPackageGroupRow(g) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="settle-manager-name">' + escapeHtml(g.name || '이름 미등록') + '</span>' +
        '<span class="settle-manager-phone">' + escapeHtml(g.phone || '연락처 미등록') + '</span></td>' +
      '<td>' + g.packages.length + '건</td>' +
      '<td>' + formatPkgCount(g.totalRemaining) + ' / ' + formatPkgCount(g.totalCount) + '회</td>' +
      '<td><span class="admin-badge ' + (USER_PACKAGE_STATUS_BADGE[g.statusKey] || 'is-neutral') + '">' + escapeHtml(USER_PACKAGE_STATUS_LABEL[g.statusKey]) + '</span></td>' +
      '<td><button type="button" class="admin-btn is-ghost pkg-detail-btn">상세보기</button></td>';
    tr.querySelector('.pkg-detail-btn').addEventListener('click', function () { openPackageGroupDetailModal(g); });
    return tr;
  }

  function renderUserPackagesList() {
    var body = els.userPackagesTableBody;
    if (!body) return;

    var rows = lastUserPackagesRows.filter(function (p) {
      if (!currentUserPackagesSearchText) return true;
      var profile = p.profiles || {};
      return normalizeSearchText(profile.name).indexOf(currentUserPackagesSearchText) !== -1 ||
             normalizeSearchText(profile.phone).indexOf(currentUserPackagesSearchText) !== -1;
    });
    var groups = groupUserPackagesByContact(rows);

    if (els.userPackagesCount) {
      els.userPackagesCount.textContent = groups.length + '명 (' + rows.length + '건)';
      els.userPackagesCount.hidden = false;
    }

    if (!groups.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">' +
        (lastUserPackagesRows.length ? '조건에 맞는 회원이 없습니다.' : '등록된 패키지가 없습니다.') + '</td></tr>';
    } else {
      body.innerHTML = '';
      groups.forEach(function (g) { body.appendChild(renderUserPackageGroupRow(g)); });
    }

    if (els.userPackagesShowMoreWrap) {
      els.userPackagesShowMoreWrap.innerHTML = '';
      if (userPackagesHasMore) {
        els.userPackagesShowMoreWrap.appendChild(createLoadMoreButton(userPackagesLoadingMore, loadMoreUserPackages));
      }
    }

    // [상세보기] 모달이 지금 열려 있는 그룹을 보고 있었다면(예: 다른 창에서 회차 조정 후 돌아옴), 그
    // 그룹의 최신 데이터로 모달 내용도 같이 갱신합니다 — 모달을 닫지 않았는데 뒤의 표만 바뀌어 숫자가
    // 서로 달라 보이는 걸 막습니다.
    if (packageGroupDetailCurrentKey && els.packageGroupDetailModal && !els.packageGroupDetailModal.hidden) {
      var reopened = groups.filter(function (g) { return g.key === packageGroupDetailCurrentKey; })[0];
      if (reopened) renderPackageGroupDetailModal(reopened);
      else closePackageGroupDetailModal(); // 검색어 등으로 그 그룹이 더 이상 목록에 없으면 모달도 닫음
    }
  }

  async function loadMoreUserPackages() {
    if (userPackagesLoadingMore || !userPackagesHasMore) return;
    userPackagesLoadingMore = true;
    renderUserPackagesList();
    await fetchUserPackagesPage(false);
    userPackagesLoadingMore = false;
    renderUserPackagesList();
  }

  async function loadUserPackages() {
    var body = els.userPackagesTableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';
    lastUserPackagesRows = [];
    userPackagesOffset = 0;
    userPackagesHasMore = false;
    await fetchUserPackagesPage(true);
    renderUserPackagesList();
  }

  if (els.userPackagesSearchInput) {
    els.userPackagesSearchInput.addEventListener('input', function () {
      currentUserPackagesSearchText = normalizeSearchText(els.userPackagesSearchInput.value).trim();
      renderUserPackagesList();
    });
  }

  // ---------- 패키지 상세보기 모달 (같은 보호자의 개별 패키지 목록 + 각 행의 [회차 조정]) ----------
  function renderPackageGroupDetailModal(g) {
    if (els.packageGroupDetailModalTitle) els.packageGroupDetailModalTitle.textContent = (g.name || '이름 미등록') + ' 패키지 상세';
    if (els.packageGroupDetailModalSub) {
      els.packageGroupDetailModalSub.textContent = (g.phone || '연락처 미등록') + ' · 보유 패키지 ' + g.packages.length +
        '건 · 총 잔여 ' + formatPkgCount(g.totalRemaining) + ' / ' + formatPkgCount(g.totalCount) + '회';
    }
    var body = els.packageGroupDetailTableBody;
    if (!body) return;
    body.innerHTML = '';
    // 최신 구매 건을 위로 — fetchUserPackagesPage() 가 이미 created_at desc 로 받아 오므로 그 순서를 그대로 둡니다.
    g.packages.forEach(function (p) {
      var statusKey = USER_PACKAGE_STATUS_LABEL.hasOwnProperty(p.status) ? p.status : 'active';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(USER_PACKAGE_TYPE_LABEL[p.package_type] || p.package_type || '-') + '</td>' +
        '<td>' + escapeHtml(formatDateOnly(p.created_at)) + '</td>' +
        '<td>' + escapeHtml(formatDateOnly(p.expires_at)) + '</td>' +
        '<td>' + formatPkgCount(p.remaining_count) + ' / ' + formatPkgCount(p.total_count) + '회</td>' +
        '<td><span class="admin-badge ' + (USER_PACKAGE_STATUS_BADGE[statusKey] || 'is-neutral') + '">' + escapeHtml(USER_PACKAGE_STATUS_LABEL[statusKey]) + '</span></td>' +
        '<td><button type="button" class="admin-btn is-ghost pkg-detail-adjust-btn">회차 조정</button></td>';
      tr.querySelector('.pkg-detail-adjust-btn').addEventListener('click', function () { openPackageAdjustModal(p); });
      body.appendChild(tr);
    });
  }

  function openPackageGroupDetailModal(g) {
    if (!els.packageGroupDetailModal) return;
    packageGroupDetailCurrentKey = g.key;
    renderPackageGroupDetailModal(g);
    els.packageGroupDetailModal.hidden = false;
  }

  function closePackageGroupDetailModal() {
    if (els.packageGroupDetailModal) els.packageGroupDetailModal.hidden = true;
    packageGroupDetailCurrentKey = null;
  }

  if (els.packageGroupDetailModal) {
    els.packageGroupDetailModal.addEventListener('mousedown', function (e) {
      if (e.target === els.packageGroupDetailModal) closePackageGroupDetailModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.packageGroupDetailModal.hidden) closePackageGroupDetailModal();
    });
  }
  if (els.packageGroupDetailCloseBtn) els.packageGroupDetailCloseBtn.addEventListener('click', closePackageGroupDetailModal);
  if (els.packageGroupDetailCloseBtn2) els.packageGroupDetailCloseBtn2.addEventListener('click', closePackageGroupDetailModal);

  // ---------- 패키지 회차 조정 모달 ----------
  function openPackageAdjustModal(p) {
    packageAdjustTarget = p;
    var profile = p.profiles || {};
    if (els.packageAdjustModalSub) {
      els.packageAdjustModalSub.textContent = (profile.name || '이름 미등록') + ' · ' +
        (USER_PACKAGE_TYPE_LABEL[p.package_type] || p.package_type) +
        ' · 현재 잔여 ' + formatPkgCount(p.remaining_count) + ' / ' + formatPkgCount(p.total_count) + '회';
    }
    if (els.packageAdjustDeltaInput) els.packageAdjustDeltaInput.value = '';
    if (els.packageAdjustMemoInput) els.packageAdjustMemoInput.value = '';
    if (els.packageAdjustError) els.packageAdjustError.hidden = true;
    if (els.packageAdjustModal) els.packageAdjustModal.hidden = false;
  }

  function closePackageAdjustModal() {
    if (els.packageAdjustModal) els.packageAdjustModal.hidden = true;
    packageAdjustTarget = null;
  }

  if (els.packageAdjustCloseBtn) els.packageAdjustCloseBtn.addEventListener('click', closePackageAdjustModal);
  if (els.packageAdjustCancelBtn) els.packageAdjustCancelBtn.addEventListener('click', closePackageAdjustModal);
  if (els.packageAdjustModal) {
    els.packageAdjustModal.addEventListener('mousedown', function (e) { if (e.target === els.packageAdjustModal) closePackageAdjustModal(); });
  }

  if (els.packageAdjustConfirmBtn) {
    els.packageAdjustConfirmBtn.addEventListener('click', async function () {
      if (!packageAdjustTarget) return;

      function showAdjustError(msg) {
        if (els.packageAdjustError) { els.packageAdjustError.textContent = msg; els.packageAdjustError.hidden = false; }
      }

      var deltaRaw = (els.packageAdjustDeltaInput && els.packageAdjustDeltaInput.value || '').trim();
      var delta = Number(deltaRaw);
      var memo = (els.packageAdjustMemoInput && els.packageAdjustMemoInput.value || '').trim();
      if (!deltaRaw || isNaN(delta) || delta === 0) { showAdjustError('조정할 회차를 0이 아닌 숫자로 입력하세요 (예: 1 또는 -0.5).'); return; }
      if (!memo) { showAdjustError('사유 메모를 입력하세요.'); return; }
      if (els.packageAdjustError) els.packageAdjustError.hidden = true;

      var btn = els.packageAdjustConfirmBtn;
      var prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = '처리 중…';

      var res = await supabaseClient.rpc('admin_adjust_user_package', {
        p_package_id: packageAdjustTarget.id, p_delta: delta, p_memo: memo
      });

      btn.disabled = false;
      btn.textContent = prevLabel;

      if (res.error) {
        console.error('[Admin] 패키지 회차 수동 조정 실패:', res.error.code, res.error.message,
          '→ sql/admin_package_management.sql 의 admin_adjust_user_package() 가 적용돼 있는지 확인하세요.');
        showAdjustError('조정하지 못했습니다: ' + res.error.message);
        return;
      }

      closePackageAdjustModal();
      showToast('회차를 조정했습니다.');
      loadUserPackages();
    });
  }

  // ---------- 진입 ----------
  (async function init() {
    var access = await verifyAdminAccess();
    if (!access) return;

    renderAdminHeader(access.user, access.profile);
    bindLogout();
    loadSummaryStats();
    loadPendingManagers();
    loadApplications();
    reloadCareView(); // currentStatusFilter 기본값이 'all'("전체" 칩이 기본 선택)이라 완료 건도 함께 불러옵니다
    loadActiveManagers();
    loadManagerSettlements();
    loadUserPackages();
    loadCareIssues();
    subscribeServiceApplicationChanges();
    subscribeCareScheduleChanges();
    if (document.visibilityState === 'visible') startPolling(); // 처음 열렸을 때 탭이 보이는 상태면 폴링 안전망도 바로 시작

    supabaseClient.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();
})();
