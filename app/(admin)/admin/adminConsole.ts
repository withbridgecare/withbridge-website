// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 어드민 콘솔 — 예전 public/admin.js 를 로직 그대로 옮긴 것입니다. DB 호출은 lib/api/admin-console.ts 를 거칩니다.
/* eslint-disable */
import { getSupabase } from '@/lib/supabase/client';
import * as api from '@/lib/api/admin-console';
import { createLegacyShims } from '@/lib/browser/legacy-shims';

let started = false;
/** 화면에 동작을 붙입니다 (개발 모드의 이중 실행은 무시). */
export function initAdminConsole(): void {
  if (started) return;
  started = true;
  const { WBEdgeFn, WBPrivacy } = createLegacyShims();
  const $id = (id: string): any => document.getElementById(id);
/* =========================================================
   위드브릿지 어드민 콘솔 (admin.html 전용)
   - Supabase 세션 + profiles.role = 'admin' 확인을 통과해야 화면이 열림 (fail closed)
   - 통과 후: 헤더에 관리자 이름 표시, 가입 승인 대기 매니저 / 오늘의 케어 신청(수동 배정 대기) 목록 로드
   - admin.html 의 안내 배너와 마찬가지로, 아래 조회들은 아직 관리자 전용 RLS/RPC 가 없는 상태를 전제로 한
     기본 구조입니다. 관리자 전용 정책이 추가되면 실제 전체 목록이 보이기 시작합니다.
========================================================= */
  let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let supabaseClient = getSupabase();
  if (WBPrivacy) WBPrivacy.attachPhotoResolver(supabaseClient);
  function $(id) { return $id(id); }
  let els = {
    account: $('adminAccount'),
    email: $('adminEmail'),
    name: $('adminName'),
    superAdminNavLink: $('superAdminNavLink'),
    logoutBtn: $('logoutBtn'),
    refreshBtn: $('adminRefreshBtn'),
    toast: $('adminToast'),
    summaryTodayCount: $('summaryTodayCount'),
    summaryPaymentPendingCount: $('summaryPaymentPendingCount'),
    summaryMatchingPendingCount: $('summaryMatchingPendingCount'),
    summaryInProgressCount: $('summaryInProgressCount'),
    summaryCancelledCount: $('summaryCancelledCount'),
    summaryTodayCard: $('summaryTodayCard'),
    summaryPaymentPendingCard: $('summaryPaymentPendingCard'),
    summaryMatchingPendingCard: $('summaryMatchingPendingCard'),
    summaryInProgressCard: $('summaryInProgressCard'),
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
    runExpiryBatchBtn: $('runExpiryBatchBtn'),
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
    inProgressCareDateFilter: $('inProgressCareDateFilter'),
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
    membersCount: $('membersCount'),
    membersExportBtn: $('membersExportBtn'),
    membersSearchInput: $('membersSearchInput'),
    membersProviderFilter: $('membersProviderFilter'),
    membersVerifiedFilter: $('membersVerifiedFilter'),
    membersTable: $('membersTable'),
    membersTableBody: $('membersTableBody'),
    membersPaginationWrap: $('membersPaginationWrap'),
    memberDetailModal: $('memberDetailModal'),
    memberDetailModalTitle: $('memberDetailModalTitle'),
    memberDetailModalSub: $('memberDetailModalSub'),
    memberDetailInfoGrid: $('memberDetailInfoGrid'),
    memberDetailBookingsBody: $('memberDetailBookingsBody'),
    memberDetailCloseBtn: $('memberDetailCloseBtn'),
    memberDetailCloseBtn2: $('memberDetailCloseBtn2'),
    memberEditForm: $('memberEditForm'),
    memberEditName: $('memberEditName'),
    memberEditPhone: $('memberEditPhone'),
    memberEditAddress: $('memberEditAddress'),
    memberEditAddressDetail: $('memberEditAddressDetail'),
    memberEditSuccess: $('memberEditSuccess'),
    memberEditError: $('memberEditError'),
    memberEditToggleBtn: $('memberEditToggleBtn'),
    memberEditCancelBtn: $('memberEditCancelBtn'),
    memberEditSaveBtn: $('memberEditSaveBtn'),
    memberNotesList: $('memberNotesList'),
    memberNoteInput: $('memberNoteInput'),
    memberNoteSaveBtn: $('memberNoteSaveBtn'),
    memberSeniorsList: $('memberSeniorsList'),
    memberBenefitsList: $('memberBenefitsList'),
    memberGrantCouponToggleBtn: $('memberGrantCouponToggleBtn'),
    memberGrantCouponForm: $('memberGrantCouponForm'),
    memberGrantCouponAmount: $('memberGrantCouponAmount'),
    memberGrantCouponMemo: $('memberGrantCouponMemo'),
    memberGrantCouponError: $('memberGrantCouponError'),
    memberGrantCouponCancelBtn: $('memberGrantCouponCancelBtn'),
    memberGrantCouponConfirmBtn: $('memberGrantCouponConfirmBtn'),
    memberGrantPackageToggleBtn: $('memberGrantPackageToggleBtn'),
    memberGrantPackageForm: $('memberGrantPackageForm'),
    memberGrantPackageType: $('memberGrantPackageType'),
    memberGrantPackageSessionHint: $('memberGrantPackageSessionHint'),
    memberGrantPackageMemo: $('memberGrantPackageMemo'),
    memberGrantPackageError: $('memberGrantPackageError'),
    memberGrantPackageCancelBtn: $('memberGrantPackageCancelBtn'),
    memberGrantPackageConfirmBtn: $('memberGrantPackageConfirmBtn'),
    memberDeductPackageToggleBtn: $('memberDeductPackageToggleBtn'),
    memberDeductPackageForm: $('memberDeductPackageForm'),
    memberDeductPackageSelect: $('memberDeductPackageSelect'),
    memberDeductPackageCount: $('memberDeductPackageCount'),
    memberDeductPackageMemo: $('memberDeductPackageMemo'),
    memberDeductPackageError: $('memberDeductPackageError'),
    memberDeductPackageCancelBtn: $('memberDeductPackageCancelBtn'),
    memberDeductPackageConfirmBtn: $('memberDeductPackageConfirmBtn'),
    memberActionSuccess: $('memberActionSuccess'),
    memberActionError: $('memberActionError'),
    memberResetPasswordBtn: $('memberResetPasswordBtn'),
    memberToggleStatusBtn: $('memberToggleStatusBtn'),
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
    adminRefundConfirmBtn: $('adminRefundConfirmBtn'),
    partnerInquiriesCount: $('partnerInquiriesCount'),
    partnerInquiriesStatusFilter: $('partnerInquiriesStatusFilter'),
    partnerInquiriesTableBody: $('partnerInquiriesTableBody')
  };
  let toastTimer: any = null;
  function isMaskedAccount(value?: any) {
    return typeof value === 'string' && value.indexOf('*') === 0;
  }
  async function revealManagerAccount(applicationId?: any, targetEl?: any, btn?: any) {
    if (!targetEl) return;
    let masked = targetEl.textContent;
    btn.disabled = true;
    let res = await api.adminRevealManagerAccount(supabaseClient, applicationId);
    btn.disabled = false;
    if (res.error || !res.data) {
      showToast('계좌번호를 불러오지 못했습니다' + (res.error ? ': ' + res.error.message : '.'));
      return;
    }
    targetEl.textContent = res.data;
    btn.hidden = true;
    setTimeout(function () { targetEl.textContent = masked; btn.hidden = false; }, 60000);
  }
  function showToast(message?: any) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }
  function escapeHtml(value?: any) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c: any) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  async function copyOrderIdToClipboard(orderId?: any) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(orderId);
      } else {
        let tmp = document.createElement('textarea');
        tmp.value = orderId;
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      }
      showToast('주문번호가 복사되었습니다');
    } catch (e: any) {
      showToast('주문번호 복사에 실패했습니다');
    }
  }
  function buildOrderIdRow(orderId?: any) {
    let wrap = document.createElement('div');
    wrap.className = 'admin-order-id-row';
    if (!orderId) {
      wrap.innerHTML = '<span class="admin-order-id-badge is-muted">주문번호 미발급(결제 전)</span>';
      return wrap;
    }
    let badge = document.createElement('span');
    badge.className = 'admin-order-id-badge';
    badge.innerHTML = '주문번호 <code>' + escapeHtml(orderId) + '</code>';
    wrap.appendChild(badge);
    let copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'admin-order-id-copy-btn';
    copyBtn.title = '주문번호 복사';
    copyBtn.setAttribute('aria-label', '주문번호 복사');
    copyBtn.textContent = '복사';
    copyBtn.addEventListener('click', function () { copyOrderIdToClipboard(orderId); });
    wrap.appendChild(copyBtn);
    let portoneLink = document.createElement('a');
    portoneLink.className = 'admin-order-id-portone-link';
    portoneLink.href = 'https://admin.portone.io';
    portoneLink.target = '_blank';
    portoneLink.rel = 'noopener noreferrer';
    portoneLink.title = '포트원 어드민에서 이 주문번호(paymentId)로 결제/환불 내역을 조회하세요.';
    portoneLink.textContent = '포트원에서 결제 확인 ↗';
    wrap.appendChild(portoneLink);
    return wrap;
  }
  function won(n?: any) {
    return Number(n || 0).toLocaleString('ko-KR') + '원';
  }
  function formatDateTime(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function formatDateOnly(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  function formatPkgCount(n?: any) {
    let v = Number(n || 0);
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }
  let SENIOR_PLACEHOLDER_RE = /^어르신(\s*\(.*\))?$/;
  function seniorLabel(row?: any) {
    let raw = row && row.senior_name ? String(row.senior_name).trim() : '';
    let hasRealName = raw && !SENIOR_PLACEHOLDER_RE.test(raw);
    let name = hasRealName ? (raw.indexOf('어르신') !== -1 ? raw : raw + ' 어르신') : '어르신';
    let extras: any[] = [];
    if (row && row.senior_age != null) extras.push('만 ' + row.senior_age + '세');
    if (row && row.senior_note) extras.push(row.senior_note);
    return extras.length ? name + ' (' + extras.join(', ') + ')' : name;
  }
  let ADDON_LABELS = { URGENT_MATCHING: '긴급 매칭 서비스' };
  function addonLabels(row?: any) {
    let codes = row && Array.isArray(row.addon_codes) ? row.addon_codes : [];
    return codes.map(function (code: any) { return ADDON_LABELS[code] || code; });
  }
  function extractOneHourPurpose(requestDetails?: any) {
    let m = /(?:^|\n)\s*세부 목적\s*:\s*(.*)/.exec(String(requestDetails || ''));
    return m ? m[1].trim() : '';
  }
  function serviceTitle(a?: any) {
    let base = a.service_type || '케어 신청';
    let purpose = extractOneHourPurpose(a.request_details);
    return purpose ? base + ' - ' + purpose : base;
  }
  function formatDaysSinceCreated(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return null;
    let startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let startOfCreated = new Date(d);
    startOfCreated.setHours(0, 0, 0, 0);
    let days = Math.round((startOfToday.getTime() - startOfCreated.getTime()) / 86400000);
    let label = days <= 0 ? '오늘 신청' : days === 1 ? '어제 신청' : days + '일 전 신청';
    let level = days >= 7 ? 'danger' : days >= 3 ? 'warn' : 'normal';
    return { days: days, label: label, level: level };
  }
  function careDateBucket(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return null;
    let startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let startOfScheduled = new Date(d);
    startOfScheduled.setHours(0, 0, 0, 0);
    let days = Math.round((startOfToday.getTime() - startOfScheduled.getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days > 0) return 'past';
    return 'future';
  }
  let KAKAO_REST_API_KEY = '4e94e702177afc63f2f05c3abfffdf3c';
  async function kakaoLocalGet(url?: any) {
    let res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_API_KEY } });
    if (!res.ok) throw new Error('kakao local api ' + res.status);
    return res.json();
  }
  async function reverseGeocode(lat?: any, lng?: any) {
    if (!KAKAO_REST_API_KEY) return null;
    try {
      let data = await kakaoLocalGet('https://dapi.kakao.com/v2/local/geo/coord2address.json?x=' + lng + '&y=' + lat);
      let doc = data.documents && data.documents[0];
      if (!doc) return null;
      return (doc.road_address && doc.road_address.address_name) || (doc.address && doc.address.address_name) || null;
    } catch (e: any) { console.warn('[Admin][카카오 지오코딩] 좌표→지명 변환 실패:', e.message); return null; }
  }
  let reverseGeocodeCache: any = {};
  async function reverseGeocodeCached(lat?: any, lng?: any) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    let key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (key in reverseGeocodeCache) return reverseGeocodeCache[key];
    let result = await reverseGeocode(lat, lng);
    reverseGeocodeCache[key] = result;
    return result;
  }
  let currentSearchText = '';
  let currentStatusFilter = 'all'; // all | payment_pending | matching_pending | in_progress | completed
  let activeManagersCache: any[] = [];
  let currentManagerSearchText = '';
  let currentManagerDutyFilter = 'all'; // all | online | break
  function normalizeSearchText(value?: any) {
    return String(value == null ? '' : value).toLowerCase();
  }
  function matchesSearch(fields?: any) {
    if (!currentSearchText) return true;
    let needle = currentSearchText;
    for (let i = 0; i < fields.length; i++) {
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
      if (currentStatusFilter === 'cancelled') loadCancelledApplications();
      else loadApplications();
      loadSummaryStats();
    });
  }
  if (els.runExpiryBatchBtn) {
    els.runExpiryBatchBtn.addEventListener('click', function () { runExpiryBatchNow(els.runExpiryBatchBtn); });
  }
  let INPROGRESS_CARE_COPY = {
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
    let copy = INPROGRESS_CARE_COPY[currentStatusFilter] || INPROGRESS_CARE_COPY.default;
    els.inProgressCareTitle.textContent = copy.title;
    els.inProgressCareDesc.textContent = copy.desc;
  }
  let APPLICATIONS_CARD_COPY = {
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
    let copy = APPLICATIONS_CARD_COPY[currentStatusFilter] || APPLICATIONS_CARD_COPY.default;
    els.applicationsTitle.textContent = copy.title;
    els.applicationsDesc.textContent = copy.desc;
  }
  if (els.statusFilterGroup) {
    els.statusFilterGroup.addEventListener('click', function (e: any) {
      let btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      let status = btn.getAttribute('data-status');
      if (status === currentStatusFilter) return;
      currentStatusFilter = status;
      Array.prototype.forEach.call(els.statusFilterGroup.querySelectorAll<any>('.admin-filter-chip'), function (chip: any) {
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
  if (els.inProgressCareDateFilter) {
    els.inProgressCareDateFilter.addEventListener('click', function (e: any) {
      let btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      let dateFilter = btn.getAttribute('data-date-filter');
      if (dateFilter === currentCareDateFilter) return;
      currentCareDateFilter = dateFilter;
      Array.prototype.forEach.call(els.inProgressCareDateFilter.querySelectorAll<any>('.admin-filter-chip'), function (chip: any) {
        chip.classList.toggle('is-active', chip === btn);
      });
      renderInProgressCareList();
    });
  }
  if (els.managerSearchInput) {
    els.managerSearchInput.addEventListener('input', function () {
      currentManagerSearchText = normalizeSearchText(els.managerSearchInput.value).trim();
      renderActiveManagersList();
    });
  }
  if (els.managerDutyFilter) {
    els.managerDutyFilter.addEventListener('click', function (e: any) {
      let btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      let duty = btn.getAttribute('data-duty');
      if (duty === currentManagerDutyFilter) return;
      currentManagerDutyFilter = duty;
      Array.prototype.forEach.call(els.managerDutyFilter.querySelectorAll<any>('.admin-filter-chip'), function (chip: any) {
        chip.classList.toggle('is-active', chip === btn);
      });
      renderActiveManagersList();
    });
  }
  async function loadSummaryStats() {
    let todayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    let showOverdue = isShowOverdueAppsOn();
    let acceptCutoffIso = getAcceptCutoffIso();
    let pendingBaseQuery = function () {
      let q = api.countServiceApplications(supabaseClient);
      if (!showOverdue) q = q.gt('created_at', acceptCutoffIso);
      return q;
    };
    let results = await Promise.all([
      api.countServiceApplications2(supabaseClient, todayStartIso),
      pendingBaseQuery().eq('status', 'PAYMENT_PENDING'),
      pendingBaseQuery().neq('status', 'PAYMENT_PENDING').neq('status', 'CANCELLED').neq('status', 'EXPIRED_CANCELLED'),
      api.countCareSchedules(supabaseClient),
      api.countServiceApplications3(supabaseClient)
    ]);
    let labels = [els.summaryTodayCount, els.summaryPaymentPendingCount, els.summaryMatchingPendingCount, els.summaryInProgressCount, els.summaryCancelledCount];
    results.forEach(function (res: any, i: any) {
      let el = labels[i];
      if (!el) return;
      if (res.error) {
        console.warn('[Admin] 요약 카드 집계 실패:', res.error.code, res.error.message);
        el.textContent = '-';
        return;
      }
      el.textContent = (res.count || 0) + '건';
    });
  }
  let SUMMARY_CARD_LINKS = [
    { card: els.summaryTodayCard, status: 'all', scrollTo: els.applicationsTitle },
    { card: els.summaryPaymentPendingCard, status: 'payment_pending', scrollTo: els.applicationsTitle },
    { card: els.summaryMatchingPendingCard, status: 'matching_pending', scrollTo: els.applicationsTitle },
    { card: els.summaryInProgressCard, status: 'in_progress', scrollTo: els.inProgressCareTitle },
    { card: els.summaryCancelledCard, status: 'cancelled', scrollTo: els.applicationsTitle }
  ];
  SUMMARY_CARD_LINKS.forEach(function (link: any) {
    if (!link.card) return;
    link.card.addEventListener('click', function () {
      let chip = els.statusFilterGroup && els.statusFilterGroup.querySelector<any>('.admin-filter-chip[data-status="' + link.status + '"]');
      if (chip) chip.click();
      let target = link.scrollTo && link.scrollTo.closest('.admin-card');
      let viewId = target && target.getAttribute('data-admin-view') && target.getAttribute('data-admin-view').split(/\s+/)[0];
      if (viewId && typeof window.adminSwitchView === 'function') window.adminSwitchView(viewId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  function renderErrorState(list?: any, message?: any, retry?: any) {
    list.innerHTML = '';
    let box = document.createElement('div');
    box.className = 'admin-error';
    box.textContent = '목록을 불러오지 못했습니다: ' + message;
    let btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '다시 시도';
    btn.addEventListener('click', retry);
    box.appendChild(document.createElement('br'));
    box.appendChild(btn);
    list.appendChild(box);
  }
  async function verifyAdminAccess() {
    let sessionRes = await supabaseClient.auth.getSession();
    let session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      alert('로그인이 필요합니다.');
      window.location.replace('index.html');
      return null;
    }
    let profileRes = await api.getProfiles(supabaseClient, session);
    console.log('[Admin] profiles 조회 결과 (userId=' + session.user.id + '):', profileRes.error || profileRes.data);
    if (profileRes.error) {
      console.error('[Admin] profiles 조회 실패:', profileRes.error.code, profileRes.error.message,
        '→ RLS 정책(profiles_select_own) 또는 네트워크 문제일 수 있습니다. profiles_select_own 은 본인 행은' +
        ' 항상 읽을 수 있게 하는 기본 정책이라, 이게 실패하면 보통 세션 만료나 네트워크 쪽입니다.');
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }
    let profile = profileRes.data;
    let normalizedRole = String((profile && profile.role) || '').trim().toLowerCase();
    if (!profile || (normalizedRole !== 'admin' && normalizedRole !== 'super_admin')) {
      console.error('[Admin] profiles.role 이 "admin"/"super_admin" 이 아닙니다 → 접근 차단. 실제 조회된 행:', profile,
        '→ sql/_recover_admin_account.sql 또는 Supabase 대시보드에서 이 계정의 profiles.role 을 "admin"으로 다시 설정하세요.');
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }
    return { user: session.user, profile: profile };
  }
  function renderAdminHeader(user?: any, profile?: any) {
    if (els.email) els.email.textContent = user.email || '';
    let normalizedRole = String((profile && profile.role) || '').trim().toLowerCase();
    let gradeLabel = normalizedRole === 'super_admin' ? '최고 관리자' : '관리자';
    if (els.name) els.name.textContent = (profile.name || user.email || '관리자') + '님 (' + gradeLabel + ')';
    if (els.account) els.account.hidden = false;
    if (els.superAdminNavLink) {
      api.isSuperAdmin(supabaseClient).then(function (res: any) {
        if (!res.error && res.data === true) els.superAdminNavLink.hidden = false;
      });
    }
  }
  function bindLogout() {
    if (!els.logoutBtn) return;
    els.logoutBtn.addEventListener('click', async function () {
      els.logoutBtn.disabled = true;
      let res = await supabaseClient.auth.signOut();
      if (res.error) {
        alert('로그아웃 중 오류가 발생했습니다: ' + res.error.message);
        els.logoutBtn.disabled = false;
        return;
      }
      if (WBPrivacy) WBPrivacy.clearLocalCareData();
      window.location.replace('index.html');
    });
  }
  async function loadPendingManagers() {
    let list = els.pendingManagersList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.pendingManagersCount) els.pendingManagersCount.hidden = true;
    let MANAGER_APP_COLUMNS = 'id, name, phone, birth_date, address, id_image_path, activity_areas, activity_schedule, certifications, career_experience, bank_name, account_number, account_holder, created_at';
    let res = await api.listManagerApplications(supabaseClient, MANAGER_APP_COLUMNS);
    if (res.error && res.error.code === '42703') {
      res = await api.listManagerApplications2(supabaseClient, MANAGER_APP_COLUMNS);
    }
    if (res.error) {
      console.error('[Admin] 매니저 지원서 조회 실패:', res.error.code, res.error.message,
        '→ sql/manager_applications.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      renderErrorState(list, res.error.message, loadPendingManagers);
      return;
    }
    let rows = res.data || [];
    if (els.pendingManagersCount) {
      els.pendingManagersCount.textContent = rows.length + '건';
      els.pendingManagersCount.hidden = false;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">승인 대기 중인 지원서가 없습니다.</p>';
      return;
    }
    list.innerHTML = '';
    rows.forEach(function (a: any) { list.appendChild(renderManagerRow(a)); });
  }
  function renderManagerRow(a?: any) {
    let row = document.createElement('div');
    row.className = 'admin-row';
    let head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div class="admin-row-head-main"><div class="admin-row-name">' + escapeHtml(a.name || '이름 미등록') + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(a.phone || '') + '</div></div>' +
      '<span class="admin-badge is-pending">지원 대기</span>';
    let meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>생년월일</dt><dd>' + escapeHtml(a.birth_date || '미등록') + '</dd>' +
      '<dt>성별</dt><dd>' + escapeHtml(a.gender === '남' ? '남성' : a.gender === '여' ? '여성' : '미등록') + '</dd>' +
      '<dt>거주지 주소</dt><dd>' + escapeHtml(a.address || '미등록') + '</dd>' +
      '<dt>활동 가능 지역</dt><dd>' + escapeHtml((a.activity_areas || []).join(', ') || '미등록') + '</dd>' +
      '<dt>활동 가능 요일/시간대</dt><dd>' + escapeHtml((a.activity_schedule || []).join(', ') || '미등록') + '</dd>' +
      '<dt>보유 자격증</dt><dd>' + escapeHtml((a.certifications || []).join(', ') || '해당 없음') + '</dd>' +
      '<dt>관련 경력</dt><dd>' + escapeHtml(a.career_experience || '-') + '</dd>' +
      '<dt>정산 계좌</dt><dd>' + escapeHtml(a.bank_name || '-') + ' <span data-role="account-number">' + escapeHtml(a.account_number || '-') + '</span>' +
        (isMaskedAccount(a.account_number) ? ' <button type="button" class="admin-btn is-ghost" data-role="reveal-account" style="padding:2px 8px;font-size:12px;">전체 보기</button>' : '') +
        ' (예금주: ' + escapeHtml(a.account_holder || '-') + ')</dd>' +
      '<dt>지원 일시</dt><dd>' + formatDateTime(a.created_at) + '</dd>';
    let revealBtn = meta.querySelector<any>('[data-role="reveal-account"]');
    if (revealBtn) {
      revealBtn.addEventListener('click', function () {
        revealManagerAccount(a.id, meta.querySelector<any>('[data-role="account-number"]'), revealBtn);
      });
    }
    let actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    if (a.id_image_path) {
      let idBtn = document.createElement('button');
      idBtn.type = 'button';
      idBtn.className = 'admin-btn is-ghost';
      idBtn.textContent = '신분증 보기';
      idBtn.addEventListener('click', function () { openIdCardModal(a); });
      actions.appendChild(idBtn);
    }
    let approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = 'admin-btn is-primary';
    approveBtn.textContent = '승인';
    approveBtn.addEventListener('click', function () { approveManager(a.id, approveBtn); });
    let rejectBtn = document.createElement('button');
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
  async function approveManager(applicationId?: any, btn?: any) {
    btn.disabled = true;
    let res = await api.approveManagerApplication(supabaseClient, applicationId);
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
  async function rejectManager(applicationId?: any, btn?: any) {
    let reason = window.prompt('반려 사유를 입력해 주세요 (선택 사항).');
    if (reason === null) return false; // 사용자가 '취소'를 누름 — 반려 처리를 하지 않고 중단
    reason = reason.trim() || null; // 입력칸을 비워둔 채 확인을 누른 경우는 '사유 없음'으로 처리
    btn.disabled = true;
    let res = await api.rejectManagerApplication(supabaseClient, applicationId, reason);
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
  let ID_CARD_ZOOM_MIN = 100;
  let ID_CARD_ZOOM_MAX = 300;
  let ID_CARD_ZOOM_STEP = 25;
  let idCardApplicationId: any = null;
  let idCardZoomPct = ID_CARD_ZOOM_MIN;
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
      let naturalWidth = els.idCardImg.naturalWidth || els.idCardImg.clientWidth;
      els.idCardImg.style.width = (naturalWidth * idCardZoomPct / 100) + 'px';
      els.idCardImg.classList.add('is-zoomed');
    }
    updateIdCardZoomUi();
  }
  function setIdCardZoom(pct?: any) {
    idCardZoomPct = Math.max(ID_CARD_ZOOM_MIN, Math.min(ID_CARD_ZOOM_MAX, pct));
    applyIdCardZoom();
  }
  async function loadIdCardImage(path?: any) {
    let res = await api.createSignedUrlManagerIdCards(supabaseClient, path);
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
  function openIdCardModal(a?: any) {
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
  els.idCardModal.addEventListener('mousedown', function (e: any) { if (e.target === els.idCardModal) closeIdCardModal(); });
  document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.idCardModal.hidden) closeIdCardModal(); });
  els.idCardZoomInBtn.addEventListener('click', function () { setIdCardZoom(idCardZoomPct + ID_CARD_ZOOM_STEP); });
  els.idCardZoomOutBtn.addEventListener('click', function () { setIdCardZoom(idCardZoomPct - ID_CARD_ZOOM_STEP); });
  els.idCardImg.addEventListener('click', function () { setIdCardZoom(idCardZoomPct > ID_CARD_ZOOM_MIN ? ID_CARD_ZOOM_MIN : 200); });
  els.idCardApproveBtn.addEventListener('click', async function () {
    if (!idCardApplicationId) return;
    let ok = await approveManager(idCardApplicationId, els.idCardApproveBtn);
    if (ok) closeIdCardModal();
  });
  els.idCardRejectBtn.addEventListener('click', async function () {
    if (!idCardApplicationId) return;
    let ok = await rejectManager(idCardApplicationId, els.idCardRejectBtn);
    if (ok) closeIdCardModal();
  });
  let ADMIN_ACCEPT_WINDOW_HOURS = 48; // mypage-manager.html 의 ACCEPT_WINDOW_HOURS 와 반드시 같은 값으로 유지
  function isShowOverdueAppsOn() {
    return !!(els.showOverdueAppsToggle && els.showOverdueAppsToggle.checked);
  }
  function getAcceptCutoffIso() {
    return new Date(Date.now() - ADMIN_ACCEPT_WINDOW_HOURS * 3600e3).toISOString();
  }
  function isAwaitingPaymentStatus(raw?: any) {
    return String(raw == null ? '' : raw).trim().toUpperCase() === 'PAYMENT_PENDING';
  }
  function isPendingApplicationStatus(raw?: any) {
    let original = raw == null ? '' : String(raw);
    let s = original.trim().toLowerCase();
    if (s === 'cancelled' || s === 'canceled' || s === 'cancel' || original.indexOf('취소') !== -1) return false;
    let SYNONYMS = ['matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching'];
    if (SYNONYMS.indexOf(s) !== -1) return true;
    return /접수|대기|신청/.test(original);
  }
  function isAwaitingAssignmentStatus(raw?: any) {
    return isAwaitingPaymentStatus(raw) || isPendingApplicationStatus(raw);
  }
  function isCreatedAtOverdue(createdAtIso?: any) {
    if (!createdAtIso) return false;
    let createdMs = new Date(createdAtIso).getTime();
    if (isNaN(createdMs)) return false;
    return (Date.now() - createdMs) >= ADMIN_ACCEPT_WINDOW_HOURS * 3600e3;
  }
  let ADMIN_LIST_PAGE_SIZE = 20;
  function createLoadMoreButton(loading?: any, onClick?: any) {
    let btn = document.createElement('button');
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
  let lastApplicationsRows: any[] = [];
  let applicationsOffset = 0;       // 다음 .range() 요청 시작 위치(서버 원본 행 기준 — 엄격 필터 통과 여부와 무관)
  let applicationsHasMore = false;
  let applicationsLoadingMore = false;
  async function loadApplications() {
    let list = els.applicationsList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.applicationsCount) els.applicationsCount.hidden = true;
    lastApplicationsRows = [];
    applicationsOffset = 0;
    applicationsHasMore = false;
    applicationsLoadingMore = false;
    let ok = await fetchApplicationsPage(true);
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
  async function fetchApplicationsPage(isFirstPage?: any) {
    let list = els.applicationsList;
    if (!list) return false;
    let showOverdue = isShowOverdueAppsOn();
    let acceptCutoffIso = getAcceptCutoffIso();
    let query = api.listServiceApplications(supabaseClient);
    if (!showOverdue) query = query.gt('created_at', acceptCutoffIso);
    query = query.order('created_at', { ascending: false }).range(applicationsOffset, applicationsOffset + ADMIN_LIST_PAGE_SIZE);
    let res = await query;
    if (res.error) {
      console.error('[Admin] 신청서 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_service_applications_select.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      if (isFirstPage) renderErrorState(list, res.error.message, loadApplications);
      else showToast('목록을 더 불러오지 못했습니다: ' + res.error.message);
      return false;
    }
    let rawRows = res.data || [];
    console.log('[Admin] service_applications 쿼리 결과(.is(manager_id,null) 적용됨):',
      rawRows.map(function (a: any) { return { id: a.id, status: a.status, manager_id: a.manager_id }; }));
    applicationsHasMore = rawRows.length > ADMIN_LIST_PAGE_SIZE;
    let pageRawRows = rawRows.slice(0, ADMIN_LIST_PAGE_SIZE);
    applicationsOffset += pageRawRows.length;
    let pageRows = pageRawRows.filter(function (a: any) {
      let hasManager = !!(a.manager_id && String(a.manager_id).trim());
      let isPending = isAwaitingAssignmentStatus(a.status);
      if (hasManager) {
        console.error('[Admin] 서버가 manager_id 가 있는 행을 돌려줬습니다(이 행은 화면에서 제외합니다) — ' +
          'RLS/쿼리 캐시를 확인하세요:', { id: a.id, status: a.status, manager_id: a.manager_id });
      }
      return !hasManager && isPending;
    });
    console.log('[Admin] 엄격 필터(manager_id 없음 AND isAwaitingAssignmentStatus) 통과한 이번 페이지 ' + pageRows.length + '건:',
      pageRows.map(function (a: any) { return { id: a.id, status: a.status, manager_id: a.manager_id }; }));
    lastApplicationsRows = lastApplicationsRows.concat(pageRows);
    return true;
  }
  function renderApplicationsList() {
    if (currentStatusFilter === 'cancelled') return;
    let list = els.applicationsList;
    if (!list) return;
    let showOverdueToggleOn = isShowOverdueAppsOn();
    let rows = lastApplicationsRows.filter(function (a: any) {
      let paymentPending = isAwaitingPaymentStatus(a.status);
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
      rows.forEach(function (a: any) { list.appendChild(renderApplicationRow(a, showOverdueToggleOn)); });
    }
    if (applicationsHasMore && currentStatusFilter !== 'in_progress' && currentStatusFilter !== 'completed') {
      list.appendChild(createLoadMoreButton(applicationsLoadingMore, loadMoreApplications));
    }
  }
  function renderApplicationRow(a?: any, showOverdueToggleOn?: any) {
    let row = document.createElement('div');
    row.className = 'admin-row';
    let paymentPending = isAwaitingPaymentStatus(a.status);
    let overdue = showOverdueToggleOn && isCreatedAtOverdue(a.created_at);
    let addons = addonLabels(a);
    let head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div class="admin-row-head-main"><div class="admin-row-name">' + escapeHtml(serviceTitle(a)) + '</div>' +
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
        addons.map(function (label: any) { return '<span class="admin-badge is-addon">' + escapeHtml(label) + '</span>'; }).join('') +
      '</div>';
    let meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt class="is-contact">신청자(보호자)</dt><dd class="is-contact">' + escapeHtml(formatGuardianContactLabel(a.user_contact)) + '</dd>' +
      '<dt>어르신</dt><dd>' + escapeHtml(seniorLabel(a) + (a.user_relation ? ' · ' + a.user_relation + ' 신청' : '')) + '</dd>' +
      '<dt>신청 시각</dt><dd>' + formatDateTime(a.created_at) + '</dd>' +
      '<dt>주소</dt><dd>' + escapeHtml(a.address || '-') + '</dd>' +
      '<dt>선택 옵션</dt><dd>' + escapeHtml(addons.length ? addons.join(', ') : '없음') + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(a.request_details || '-') + '</dd>';
    let actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    if (paymentPending) {
      let confirmPaymentBtn = document.createElement('button');
      confirmPaymentBtn.type = 'button';
      confirmPaymentBtn.className = 'admin-btn is-ghost';
      confirmPaymentBtn.textContent = '수동 입금 확인';
      confirmPaymentBtn.addEventListener('click', function () { confirmManualPayment(a, confirmPaymentBtn); });
      actions.appendChild(confirmPaymentBtn);
    }
    let cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'admin-btn is-danger';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', function () { cancelApplication(a, cancelBtn); });
    actions.appendChild(cancelBtn);
    let assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.className = 'admin-btn is-primary';
    assignBtn.textContent = '수동 배정';
    assignBtn.addEventListener('click', function () { openAssignModal(a); });
    actions.appendChild(assignBtn);
    if (!paymentPending) {
      let forceExpireBtn = document.createElement('button');
      forceExpireBtn.type = 'button';
      forceExpireBtn.className = 'admin-btn is-ghost';
      forceExpireBtn.textContent = '만료/환불 테스트';
      forceExpireBtn.title = '48시간 경과 여부와 무관하게 이 건 하나만 지금 바로 만료 처리하고 PortOne 환불을 실행합니다.';
      forceExpireBtn.addEventListener('click', function () { forceExpireApplication(a, forceExpireBtn); });
      actions.appendChild(forceExpireBtn);
    }
    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(buildOrderIdRow(a.id));
    row.appendChild(actions);
    return row;
  }
  let lastCancelledApplicationsRows: any[] = [];
  let cancelledApplicationsRequestSeq = 0;
  let cancelledOffset = 0;      // 다음 .range() 요청 시작 위치
  let cancelledHasMore = false;
  let cancelledLoadingMore = false;
  async function loadCancelledApplications() {
    let list = els.applicationsList;
    if (!list) return;
    let requestSeq = ++cancelledApplicationsRequestSeq;
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
    let requestSeq = cancelledApplicationsRequestSeq;
    cancelledLoadingMore = true;
    renderCancelledApplicationsList(); // 버튼을 '불러오는 중…' 상태로 즉시 다시 그림
    await fetchCancelledApplicationsPage(requestSeq, false);
    cancelledLoadingMore = false;
    renderCancelledApplicationsList();
  }
  async function fetchCancelledApplicationsPage(requestSeq?: any, isFirstPage?: any) {
    let list = els.applicationsList;
    if (!list) return;
    try {
      let CANCELLED_APP_BASE_COLS = 'id, created_at, user_id, service_type, user_relation, senior_name, senior_age, senior_note, user_contact, address, request_details, status, payment_status, final_amount, refund_amount';
      let cancelledAppPackageCols = ['is_package_used', 'package_id', 'package_restored', 'package_remaining_before_restore', 'package_remaining_after_restore'];
      let res: any;
      for (;;) {
        let cancelledCols = CANCELLED_APP_BASE_COLS + (cancelledAppPackageCols.length ? ', ' + cancelledAppPackageCols.join(', ') : '');
        res = await api.listServiceApplications2(supabaseClient, cancelledCols, cancelledOffset, ADMIN_LIST_PAGE_SIZE);
        if (!res.error || res.error.code !== '42703' || !cancelledAppPackageCols.length) break;
        let missingMsg = String(res.error.message || '');
        let missingIdx = cancelledAppPackageCols.findIndex(function (c: any) { return missingMsg.includes(c); });
        console.warn('[Admin] 취소된 신청 조회 — 패키지 관련 컬럼이 없습니다(42703): ' + missingMsg +
          ' → sql/package_restore_on_cancellation.sql 을 실행하세요. 그 컬럼 없이 다시 시도합니다.');
        cancelledAppPackageCols.splice(missingIdx >= 0 ? missingIdx : 0, 1);
      }
      if (requestSeq !== cancelledApplicationsRequestSeq) return; // 그 사이 더 최근 호출이 시작됨 — 이 결과는 버림
      if (res.error) {
        console.error('[Admin] 취소된 신청 조회 실패:', res.error.code, res.error.message,
          '→ sql/admin_service_applications_select.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
        if (isFirstPage) renderErrorState(list, res.error.message, loadCancelledApplications);
        else showToast('목록을 더 불러오지 못했습니다: ' + res.error.message);
        return;
      }
      let rawRows = res.data || [];
      cancelledHasMore = rawRows.length > ADMIN_LIST_PAGE_SIZE;
      let pageRows = rawRows.slice(0, ADMIN_LIST_PAGE_SIZE);
      cancelledOffset += pageRows.length;
      let packageUserIds = pageRows
        .filter(function (r: any) { return r.is_package_used && r.user_id; })
        .map(function (r: any) { return r.user_id; })
        .filter(function (id: any, i: any, arr: any) { return arr.indexOf(id) === i; });
      if (packageUserIds.length) {
        let pkgTotalsRes = await api.listUserPackages(supabaseClient, packageUserIds);
        if (pkgTotalsRes.error) {
          console.warn('[Admin] 보호자별 패키지 현재 잔여 합계 조회 실패(이 숫자 없이도 나머지 목록은 계속 표시됩니다):',
            pkgTotalsRes.error.code, pkgTotalsRes.error.message,
            '→ user_packages_select_admin 정책(sql/admin_package_management.sql)이 있는지 확인하세요.');
        } else {
          let pkgTotalsByUserId: any = {};
          (pkgTotalsRes.data || []).forEach(function (p: any) {
            pkgTotalsByUserId[p.user_id] = (pkgTotalsByUserId[p.user_id] || 0) + Number(p.remaining_count || 0);
          });
          pageRows.forEach(function (r: any) {
            if (r.is_package_used && r.user_id) {
              r._packageTotalRemaining = pkgTotalsByUserId.hasOwnProperty(r.user_id) ? pkgTotalsByUserId[r.user_id] : 0;
            }
          });
        }
      }
      lastCancelledApplicationsRows = lastCancelledApplicationsRows.concat(pageRows);
      renderCancelledApplicationsList();
    } catch (err: any) {
      if (requestSeq !== cancelledApplicationsRequestSeq) return;
      console.error('[Admin] 취소된 신청 조회 중 예외가 발생했습니다:', err);
      if (isFirstPage) renderErrorState(list, (err && err.message) || String(err), loadCancelledApplications);
      else showToast('목록을 더 불러오지 못했습니다: ' + ((err && err.message) || String(err)));
    } finally {
      if (requestSeq === cancelledApplicationsRequestSeq && list.querySelector<any>('.admin-loading')) {
        list.innerHTML = '<p class="admin-empty">취소된 신청 내역이 없습니다.</p>';
        if (els.applicationsCount) { els.applicationsCount.textContent = '0건'; els.applicationsCount.hidden = false; }
      }
    }
  }
  function renderCancelledApplicationsList() {
    if (currentStatusFilter !== 'cancelled') return;
    let list = els.applicationsList;
    if (!list) return;
    let rows = lastCancelledApplicationsRows.filter(function (a: any) {
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
      rows.forEach(function (a: any) { list.appendChild(renderCancelledApplicationRow(a)); });
    }
    if (cancelledHasMore) {
      list.appendChild(createLoadMoreButton(cancelledLoadingMore, loadMoreCancelledApplications));
    }
  }
  function renderCancelledApplicationRow(a?: any) {
    let row = document.createElement('div');
    row.className = 'admin-row';
    let overdue = isCreatedAtOverdue(a.created_at);
    let cancellationReason = String(a.cancellation_reason || '');
    let isAutoExpired = a.status === 'EXPIRED_CANCELLED' || cancellationReason.indexOf('48시간') !== -1;
    let isCancelledLike = /cancel/i.test(String(a.status || '')) || String(a.status || '').indexOf('취소') !== -1;
    let finalAmount = Number(a.final_amount) || 0;
    let refundAmountSoFar = Number(a.refund_amount) || 0;
    let paymentStatusNorm = String(a.payment_status || '').trim().toUpperCase();
    let isRefunded = paymentStatusNorm === 'REFUNDED';
    let isPartiallyRefunded = paymentStatusNorm === 'PARTIALLY_REFUNDED';
    let remaining = Math.max(finalAmount - refundAmountSoFar, 0);
    let isManualUnrefunded = isCancelledLike && !isRefunded && !isPartiallyRefunded && remaining > 0;
    if (isManualUnrefunded && paymentStatusNorm !== 'PAID') {
      console.warn('[Admin] 취소 건 id=' + a.id + ' 은 payment_status=' + JSON.stringify(a.payment_status) +
        ' 이지만 final_amount=' + finalAmount + ', refund_amount=' + refundAmountSoFar + ' 로 계산한 잔액(' +
        remaining + '원)이 있어 환불 대상으로 판단했습니다 — payment_status 추적 이전 데이터 또는 수기 입력 ' +
        '테스트 행일 수 있으니, [환불 처리] 전에 실제 결제 여부를 한 번 확인해 주세요.');
    }
    console.log('[Admin][환불버튼 디버그] id=' + a.id + ', user_contact=' + a.user_contact + ' — 원본 행:', a,
      '/ 계산값:', {
        status: a.status,
        payment_status_raw: a.payment_status,
        payment_status_norm: paymentStatusNorm,
        final_amount_raw: a.final_amount,
        final_amount: finalAmount,
        refund_amount_raw: a.refund_amount,
        refund_amount: refundAmountSoFar,
        remaining: remaining,
        isCancelledLike: isCancelledLike,
        isAutoExpired: isAutoExpired,
        isRefunded: isRefunded,
        isPartiallyRefunded: isPartiallyRefunded,
        isManualUnrefunded: isManualUnrefunded
      });
    let refundedSoFar = refundAmountSoFar || (isRefunded ? finalAmount : 0);
    let canRefund = (isManualUnrefunded || isPartiallyRefunded) && remaining > 0;
    if (isPartiallyRefunded && remaining <= 0) { isPartiallyRefunded = false; isRefunded = true; }
    let isPackageUsed = !!a.is_package_used;
    let isPackageRestored = !!a.package_restored;
    let needsPackageRestore = isPackageUsed && isCancelledLike && !isPackageRestored;
    let badges = '';
    if (overdue && !isAutoExpired) badges += '<span class="admin-badge is-overdue">경과</span>';
    if (isAutoExpired) badges += '<span class="admin-badge is-auto-expired">48시간 자동취소</span>';
    if (isRefunded) badges += '<span class="admin-badge is-refunded">환불 완료</span>';
    if (isPartiallyRefunded) badges += '<span class="admin-badge is-partially-refunded">부분 환불 완료</span>';
    if (isManualUnrefunded) {
      let manualBadgeTitle = paymentStatusNorm === 'PAID'
        ? ''
        : ' title="payment_status=' + escapeHtml(JSON.stringify(a.payment_status)) + ' — final_amount(' +
          finalAmount.toLocaleString('ko-KR') + '원) 기준 잔액으로 환불 대상 판단. 실제 결제 여부를 확인하세요."';
      badges += '<span class="admin-badge is-manual-unrefunded"' + manualBadgeTitle + '>수동 취소 (PG 환불 필요)</span>';
    }
    let hasPackageHistory = a.package_remaining_before_restore != null && a.package_remaining_after_restore != null;
    let packageHistoryTooltip = hasPackageHistory
      ? '해당 패키지 건 기준(다른 신청의 차감·복구는 포함 안 됨): ' + formatPkgCount(a.package_remaining_before_restore) +
        '회 → ' + formatPkgCount(a.package_remaining_after_restore) + '회.'
      : '';
    let hasLivePackageTotal = isPackageRestored && a._packageTotalRemaining != null;
    let packageHistoryText = hasLivePackageTotal
      ? '취소 전 잔여 ' + formatPkgCount(Math.max(a._packageTotalRemaining - 1, 0)) + '회 → 복구 후 잔여 ' +
        formatPkgCount(a._packageTotalRemaining) + '회'
      : '';
    if (isPackageUsed) {
      let packageBadgeTitle = packageHistoryTooltip ? ' title="' + escapeHtml(packageHistoryTooltip) + '"' : '';
      badges += isPackageRestored
        ? '<span class="admin-badge is-package-restored"' + packageBadgeTitle + '>패키지 1회 복구 완료</span>'
        : '<span class="admin-badge is-package-restore-needed">패키지 복구 필요</span>';
    }
    if (!isAutoExpired && !isRefunded && !isPartiallyRefunded && !isManualUnrefunded && !isPackageUsed) {
      badges += '<span class="admin-badge is-cancelled">취소됨</span>';
    }
    let head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div class="admin-row-head-main"><div class="admin-row-name">' + escapeHtml(serviceTitle(a)) + '</div>' +
      '<div class="admin-row-sub">' + escapeHtml(a.user_contact || '') + '</div></div>' +
      '<div class="admin-badge-group">' + badges + '</div>';
    let meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt class="is-contact">신청자(보호자)</dt><dd class="is-contact">' + escapeHtml(formatGuardianContactLabel(a.user_contact)) + '</dd>' +
      '<dt>어르신</dt><dd>' + escapeHtml(seniorLabel(a) + (a.user_relation ? ' · ' + a.user_relation + ' 신청' : '')) + '</dd>' +
      '<dt>신청 시각</dt><dd>' + formatDateTime(a.created_at) + '</dd>' +
      '<dt>주소</dt><dd>' + escapeHtml(a.address || '-') + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(a.request_details || '-') + '</dd>' +
      (isRefunded ? '<dt>환불 내역</dt><dd>전액 취소 완료 (' + refundedSoFar.toLocaleString('ko-KR') + '원)</dd>' : '') +
      (isPartiallyRefunded ? '<dt>환불 내역</dt><dd>부분 환불 완료 (' + refundedSoFar.toLocaleString('ko-KR') + '원)</dd>' : '') +
      (isPackageUsed && packageHistoryText ? '<dt>패키지 이력</dt><dd>' + escapeHtml(packageHistoryText) + '</dd>' : '');
    let actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    let hasAnyAction = false;
    if (canRefund) {
      hasAnyAction = true;
      let refundBtn = document.createElement('button');
      refundBtn.type = 'button';
      refundBtn.className = 'admin-btn is-primary';
      refundBtn.textContent = '환불 처리';
      refundBtn.addEventListener('click', function () { openAdminRefundModal(a); });
      actions.appendChild(refundBtn);
      if (isManualUnrefunded) {
        let manualBtn = document.createElement('button');
        manualBtn.type = 'button';
        manualBtn.className = 'admin-btn is-ghost';
        manualBtn.textContent = 'PG 콘솔에서 이미 환불함 (수동 확인)';
        manualBtn.addEventListener('click', function () { markRefundCompleted(a, manualBtn); });
        actions.appendChild(manualBtn);
      }
    }
    if (needsPackageRestore) {
      hasAnyAction = true;
      let packageRestoreBtn = document.createElement('button');
      packageRestoreBtn.type = 'button';
      packageRestoreBtn.className = 'admin-btn is-ghost';
      packageRestoreBtn.textContent = '패키지 횟수 수동 복구 확인';
      packageRestoreBtn.title = '패키지 차감 예약이 취소됐는데 아직 회차가 돌아오지 않은 건입니다. 누르면 보유 패키지의 잔여 횟수를 1회 복구합니다.';
      packageRestoreBtn.addEventListener('click', function () { restorePackageSession(a, packageRestoreBtn); });
      actions.appendChild(packageRestoreBtn);
    }
    row.appendChild(head);
    row.appendChild(meta);
    if (hasAnyAction) row.appendChild(actions);
    return row;
  }
  async function restorePackageSession(a?: any, btn?: any) {
    let ok = window.confirm('이 신청에서 차감됐던 패키지 1회를 지금 복구할까요?');
    if (!ok) return;
    btn.disabled = true;
    let res = await api.adminRestorePackageSession(supabaseClient, a);
    if (res.error) {
      console.error('[Admin] 패키지 횟수 수동 복구 실패:', res.error.code, res.error.message,
        '→ sql/package_restore_on_cancellation.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      showToast('패키지 횟수 복구에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('패키지 1회를 복구했습니다.');
    loadCancelledApplications();
  }
  async function markRefundCompleted(a?: any, btn?: any) {
    let ok = window.confirm('PG사 콘솔에서 이 건의 환불을 이미 처리하셨나요? 확인을 누르면 환불 완료로 표시됩니다.');
    if (!ok) return;
    btn.disabled = true;
    let res = await api.adminMarkRefundCompleted(supabaseClient, a);
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
  let adminRefundState: any = null; // { application, total, already, remaining }
  let adminRefundOpenToken = 0;
  function adminRefundIsPartial() {
    return !!(els.adminRefundTypePartial && els.adminRefundTypePartial.checked);
  }
  function updateAdminRefundTypeVisibility() {
    if (!els.adminRefundPartialSection) return;
    els.adminRefundPartialSection.hidden = !adminRefundIsPartial();
  }
  function setAdminRefundFormLocked(locked?: any) {
    els.adminRefundTypeFull.disabled = locked;
    els.adminRefundTypePartial.disabled = locked;
    els.adminRefundAmountInput.disabled = locked;
    els.adminRefundReasonInput.disabled = locked;
    els.adminRefundConfirmBtn.disabled = locked;
  }
  async function openAdminRefundModal(a?: any) {
    let myToken = ++adminRefundOpenToken;
    adminRefundState = { application: a, total: a.final_amount || 0, already: a.refund_amount || 0, remaining: 0 };
    els.adminRefundSub.textContent = (a.senior_name || '어르신') + ' · ' + (a.service_type || '케어 신청');
    els.adminRefundBalanceInfo.textContent = '환불 가능 잔액을 다시 확인하는 중…';
    els.adminRefundTypeFull.checked = true;
    els.adminRefundAmountInput.value = '';
    els.adminRefundReasonInput.value = '';
    els.adminRefundError.hidden = true;
    updateAdminRefundTypeVisibility();
    setAdminRefundFormLocked(true);
    els.adminRefundConfirmBtn.textContent = '환불 처리하기';
    els.adminRefundModal.hidden = false;
    let fresh = await api.getServiceApplications(supabaseClient, a);
    if (myToken !== adminRefundOpenToken) return; // 그 사이 다른 행의 모달이 열렸으면 이 응답은 버립니다.
    if (fresh.error || !fresh.data) {
      els.adminRefundBalanceInfo.textContent = '-';
      els.adminRefundError.textContent = '환불 가능 잔액을 다시 확인하지 못했습니다: ' +
        (fresh.error ? fresh.error.message : '해당 신청을 찾을 수 없습니다') + ' — 창을 닫고 다시 시도해 주세요.';
      els.adminRefundError.hidden = false;
      return; // setAdminRefundFormLocked(true) 상태 그대로 유지 — 확인 안 된 금액으로는 아예 입력을 못 받습니다.
    }
    let row = fresh.data;
    let total = row.final_amount || 0;
    let already = row.refund_amount || 0;
    let remaining = Math.max(total - already, 0);
    adminRefundState = { application: Object.assign({}, a, row), total: total, already: already, remaining: remaining };
    els.adminRefundBalanceInfo.textContent =
      total.toLocaleString('ko-KR') + '원 / ' + remaining.toLocaleString('ko-KR') + '원' +
      (already > 0 ? ' (기존 환불 누적 ' + already.toLocaleString('ko-KR') + '원)' : '');
    els.adminRefundAmountInput.max = String(remaining);
    let stillCancelled = row.status === 'CANCELLED' || row.status === 'EXPIRED_CANCELLED';
    let stillRefundable = row.payment_status === 'PAID' || row.payment_status === 'PARTIALLY_REFUNDED';
    if (!stillCancelled || !stillRefundable || remaining <= 0) {
      els.adminRefundError.textContent = remaining <= 0
        ? '다시 확인해 보니 이미 전액 환불이 완료되어 더 이상 환불할 금액이 없습니다. 창을 닫고 목록을 새로고침해 주세요.'
        : '다시 확인해 보니 이 신청은 더 이상 환불 처리 대상이 아닙니다(상태가 바뀌었을 수 있어요). 창을 닫고 목록을 새로고침해 주세요.';
      els.adminRefundError.hidden = false;
      return; // 잠긴 상태 유지
    }
    setAdminRefundFormLocked(false);
  }
  function closeAdminRefundModal() {
    els.adminRefundModal.hidden = true;
    adminRefundState = null;
  }
  els.adminRefundTypeFull.addEventListener('change', updateAdminRefundTypeVisibility);
  els.adminRefundTypePartial.addEventListener('change', updateAdminRefundTypeVisibility);
  els.adminRefundCloseBtn.addEventListener('click', closeAdminRefundModal);
  els.adminRefundCancelBtn.addEventListener('click', closeAdminRefundModal);
  els.adminRefundModal.addEventListener('mousedown', function (e: any) { if (e.target === els.adminRefundModal) closeAdminRefundModal(); });
  document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.adminRefundModal.hidden) closeAdminRefundModal(); });
  els.adminRefundConfirmBtn.addEventListener('click', async function () {
    if (!adminRefundState) return;
    let isPartial = adminRefundIsPartial();
    let reason = els.adminRefundReasonInput.value.trim();
    let remaining = adminRefundState.remaining;
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
    let amount = remaining;
    if (isPartial) {
      amount = Number(els.adminRefundAmountInput.value);
      if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        els.adminRefundError.textContent = '환불할 금액을 올바르게 입력해 주세요.';
        els.adminRefundError.hidden = false;
        return;
      }
      if (amount > remaining) {
        let exceedMsg = '환불할 금액(' + amount.toLocaleString('ko-KR') + '원)이 환불 가능 잔액(' +
          remaining.toLocaleString('ko-KR') + '원)보다 많습니다. 환불 가능 잔액 이하로 다시 입력해 주세요.';
        window.alert(exceedMsg);
        els.adminRefundError.textContent = exceedMsg;
        els.adminRefundError.hidden = false;
        return;
      }
    }
    let ok = window.confirm((isPartial ? '부분 환불 ' + amount.toLocaleString('ko-KR') + '원을' : '전액 ' + amount.toLocaleString('ko-KR') + '원을') +
      ' PortOne으로 실제 환불 처리합니다. 계속할까요?');
    if (!ok) return;
    els.adminRefundError.hidden = true;
    els.adminRefundConfirmBtn.disabled = true;
    els.adminRefundConfirmBtn.textContent = '처리 중…';
    try {
      let res = await api.invokeAdminRefundApplication(supabaseClient, adminRefundState, isPartial, amount, reason);
      if (res.error) throw res.error;
      showToast('환불 처리가 완료되었습니다.');
      closeAdminRefundModal();
      loadCancelledApplications();
    } catch (e: any) {
      let detail = (e && e.context && typeof e.context.json === 'function') ? await e.context.json().catch(function () { return null; }) : null;
      let isFetchFailure = e && e.name === 'FunctionsFetchError';
      console.error('[Admin] 환불 처리 실패 — name=' + (e && e.name) + ', message=' + (e && e.message) + ':',
        '\n  함수 응답 본문(detail):', detail,
        '\n  네트워크 단계 원인(context):', e && e.context,
        '\n  원본 에러 객체:', e);
      let userMsg = isFetchFailure
        ? 'Edge Function(admin-refund-application)에 연결할 수 없습니다. 함수가 Supabase에 배포되어 있는지(supabase functions deploy admin-refund-application), 네트워크 상태를 확인해 주세요.'
        : ((detail && detail.message) || e.message || String(e));
      els.adminRefundError.textContent = '환불 처리에 실패했습니다: ' + userMsg;
      els.adminRefundError.hidden = false;
      let blockingCodes = ['REFUND_EXCEEDS_REMAINING', 'ALREADY_FULLY_REFUNDED', 'NOTHING_TO_REFUND', 'NOT_CANCELLED'];
      if (detail && blockingCodes.indexOf(detail.error) !== -1) {
        window.alert('환불 처리가 차단되었습니다: ' + userMsg);
      }
    } finally {
      els.adminRefundConfirmBtn.disabled = false;
      els.adminRefundConfirmBtn.textContent = '환불 처리하기';
    }
  });
  async function runExpiryBatchNow(btn?: any) {
    let ok = window.confirm(
      '48시간 미매칭 자동 취소/환불 배치를 지금 수동으로 실행합니다. 대상 건이 있으면 실제로 PortOne 환불이 ' +
      '발생합니다. 계속할까요?'
    );
    if (!ok) return;
    btn.disabled = true;
    let originalText = btn.textContent;
    btn.textContent = '실행 중…';
    try {
      let res = await api.invokeCancelExpiredApplications(supabaseClient);
      if (res.error) throw res.error;
      let data = res.data || {};
      let okCount = (data.results || []).filter(function (r: any) { return r.ok; }).length;
      let failCount = (data.results || []).length - okCount;
      showToast('만료 배치 실행 완료: 대상 ' + (data.checked || 0) + '건 중 처리 성공 ' + okCount + '건' +
        (failCount ? ', 실패 ' + failCount + '건(콘솔 로그 확인)' : '') + '.');
      if (failCount) console.warn('[Admin] 만료 배치 중 일부 실패:', data.results);
      loadApplications();
      loadCancelledApplications();
      loadSummaryStats();
    } catch (e: any) {
      let detail = (e && e.context && typeof e.context.json === 'function') ? await e.context.json().catch(function () { return null; }) : null;
      let isFetchFailure = e && e.name === 'FunctionsFetchError';
      console.error('[Admin] 만료 배치 수동 실행 실패 — name=' + (e && e.name) + ', message=' + (e && e.message) + ':',
        '\n  함수 응답 본문(detail):', detail, '\n  원본 에러 객체:', e);
      let userMsg = isFetchFailure
        ? 'Edge Function(cancel-expired-applications)에 연결할 수 없습니다. 함수가 배포되어 있는지(supabase functions deploy cancel-expired-applications) 확인하세요.'
        : ((detail && detail.message) || e.message || String(e));
      showToast('만료 배치 실행에 실패했습니다: ' + userMsg);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
  async function forceExpireApplication(a?: any, btn?: any) {
    let ok = window.confirm(
      '이 신청(' + (a.service_type || '케어 신청') + ' · ' + (a.user_contact || '') + ')을 48시간 경과 여부와 ' +
      '무관하게 지금 바로 만료 처리하고, PortOne으로 실제 환불을 실행합니다. 계속할까요?'
    );
    if (!ok) return;
    btn.disabled = true;
    try {
      let res = await api.invokeCancelExpiredApplications2(supabaseClient, a);
      if (res.error) throw res.error;
      let data = res.data || {};
      let result = (data.results || [])[0];
      if (result && result.ok) {
        showToast('만료/환불 처리가 완료되었습니다.');
      } else {
        showToast('만료/환불 처리에 실패했습니다: ' + (result && result.detail ? JSON.stringify(result.detail) : '알 수 없는 오류(콘솔 로그 확인)'));
      }
      loadApplications();
      loadCancelledApplications();
      loadSummaryStats();
    } catch (e: any) {
      let detail = (e && e.context && typeof e.context.json === 'function') ? await e.context.json().catch(function () { return null; }) : null;
      let isFetchFailure = e && e.name === 'FunctionsFetchError';
      console.error('[Admin] 단건 만료/환불 처리 실패 — name=' + (e && e.name) + ', message=' + (e && e.message) + ':',
        '\n  함수 응답 본문(detail):', detail, '\n  원본 에러 객체:', e);
      let userMsg = isFetchFailure
        ? 'Edge Function(cancel-expired-applications)에 연결할 수 없습니다. 함수가 배포되어 있는지 확인하세요.'
        : ((detail && detail.message) || e.message || String(e));
      showToast('만료/환불 처리에 실패했습니다: ' + userMsg);
    } finally {
      btn.disabled = false;
    }
  }
  async function confirmManualPayment(a?: any, btn?: any) {
    btn.disabled = true;
    let res = await api.adminConfirmManualPayment(supabaseClient, a);
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
  async function cancelApplication(a?: any, btn?: any) {
    let ok = window.confirm('이 신청을 취소 처리할까요? 되돌릴 수 없습니다.');
    if (!ok) return;
    btn.disabled = true;
    let res = await api.updateServiceApplications(supabaseClient, a);
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
  let assignApplicationId: any = null;
  async function openAssignModal(application?: any) {
    assignApplicationId = application.id;
    els.assignSub.textContent = (application.service_type || '케어 신청') + ' · ' + (application.user_contact || '연락처 미등록');
    els.assignError.hidden = true;
    els.assignSelect.innerHTML = '<option value="">불러오는 중…</option>';
    els.assignSelect.disabled = true;
    els.assignConfirmBtn.disabled = true;
    els.assignModal.hidden = false;
    let result = await fetchActiveManagersWithNames();
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
      result.rows.map(function (m: any) {
        let statusLabel = m.activity_status === 'online' ? '온라인' : '휴식';
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
  els.assignModal.addEventListener('mousedown', function (e: any) { if (e.target === els.assignModal) closeAssignModal(); });
  document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.assignModal.hidden) closeAssignModal(); });
  els.assignConfirmBtn.addEventListener('click', async function () {
    if (!assignApplicationId) return;
    let managerId = els.assignSelect.value;
    if (!managerId) {
      els.assignError.textContent = '배정할 매니저를 선택해 주세요.';
      els.assignError.hidden = false;
      return;
    }
    els.assignError.hidden = true;
    els.assignConfirmBtn.disabled = true;
    let res = await api.adminAssignManager(supabaseClient, assignApplicationId, managerId);
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
  let serviceApplicationsChannel: any = null;
  function subscribeServiceApplicationChanges() {
    if (!supabaseClient || serviceApplicationsChannel) return;
    serviceApplicationsChannel = supabaseClient
      .channel('admin-service-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_applications' }, function (payload: any) {
        console.log('[Admin][Realtime] service_applications 변경 감지 → 목록 다시 불러오기:', payload);
        if (currentStatusFilter === 'cancelled') loadCancelledApplications();
        else loadApplications();
        loadSummaryStats();
      })
      .subscribe(function (status: any) { console.log('[Admin][Realtime] service_applications 구독 상태:', status); });
  }
  let CARE_STATUS_LABEL = {
    assigned: '배정됨', departed: '출발 (이동 중)', arrived: '병원 도착',
    treatment_done: '진료/대행 완료', returning: '귀가 이동', completed: '완료'
  };
  let INPROGRESS_CARE_VISIBLE_LIMIT = 3;
  let inProgressExtraRowsWrap: any = null; // '더보기' 로 펼쳐지는 중인 래퍼(.admin-extra-rows) — 매 로드마다 새로 만듦
  let lastInProgressRows: any[] = [];
  let lastInProgressManagerById: any = {};
  let careViewMode = 'in_progress'; // in_progress | completed | all — 지금 lastInProgressRows 에 뭐가 들어있는지
  let currentCareDateFilter = 'all'; // all | today | past — [전체]/[오늘 케어]/[지난 케어] 탭, careDateBucket() 기준
  let CARE_SCHED_BASE_COLS = 'id, created_at, scheduled_at, manager_id, guardian_name, guardian_phone, senior_name, senior_age, senior_note, origin, destination, notes, status, payout_amount, payment_amount, application_id, service_applications!application_id(is_package_used, package_remaining_after, payment_status, refund_amount)';
  let CARE_SCHED_COMPLETED_COLS = CARE_SCHED_BASE_COLS + ', completed_at, extra_charge_amount, extra_charge_memo, extra_charge_status, extra_charge_requested_at, extra_charge_paid_at';
  function setShowMoreBtnLabel(btn?: any, text?: any) {
    btn.innerHTML = '<span class="admin-showmore-label"></span>' +
      '<svg class="admin-showmore-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
      '<path d="M3 5L7 9L11 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.querySelector<any>('.admin-showmore-label').textContent = text;
  }
  async function loadInProgressCare() {
    let list = els.inProgressCareList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let results = await Promise.all([
      api.listCareSchedules(supabaseClient, CARE_SCHED_BASE_COLS),
      fetchActiveManagersWithNames()
    ]);
    let scheduleRes = results[0];
    let managersResult = results[1];
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
    (managersResult.rows || []).forEach(function (m: any) { lastInProgressManagerById[m.id] = m; });
    lastInProgressRows = scheduleRes.data || [];
    careViewMode = 'in_progress';
    await renderInProgressCareList();
  }
  async function loadCompletedCare() {
    let list = els.inProgressCareList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let results = await Promise.all([
      api.listCareSchedules2(supabaseClient, CARE_SCHED_COMPLETED_COLS),
      fetchActiveManagersWithNames()
    ]);
    let scheduleRes = results[0];
    let managersResult = results[1];
    if (scheduleRes.error) {
      console.error('[Admin] 완료된 케어 조회 실패:', scheduleRes.error.code, scheduleRes.error.message);
      renderErrorState(list, scheduleRes.error.message, loadCompletedCare);
      return;
    }
    lastInProgressManagerById = {};
    (managersResult.rows || []).forEach(function (m: any) { lastInProgressManagerById[m.id] = m; });
    lastInProgressRows = scheduleRes.data || [];
    careViewMode = 'completed';
    await renderInProgressCareList();
  }
  async function loadAllCare() {
    let list = els.inProgressCareList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let results = await Promise.all([
      api.listCareSchedules3(supabaseClient, CARE_SCHED_BASE_COLS),
      api.listCareSchedules4(supabaseClient, CARE_SCHED_COMPLETED_COLS),
      fetchActiveManagersWithNames()
    ]);
    let inProgressRes = results[0];
    let completedRes = results[1];
    let managersResult = results[2];
    let err = inProgressRes.error || completedRes.error;
    if (err) {
      console.error('[Admin] 전체 케어 조회 실패:', err.code, err.message,
        '→ sql/admin_care_schedules_select.sql / sql/extra_charge_billing.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      renderErrorState(list, err.message, loadAllCare);
      return;
    }
    lastInProgressManagerById = {};
    (managersResult.rows || []).forEach(function (m: any) { lastInProgressManagerById[m.id] = m; });
    lastInProgressRows = (inProgressRes.data || []).concat(completedRes.data || []);
    careViewMode = 'all';
    await renderInProgressCareList();
  }
  function reloadCareView() {
    if (currentStatusFilter === 'completed') loadCompletedCare();
    else if (currentStatusFilter === 'all') loadAllCare();
    else loadInProgressCare();
  }
  function careRowsLabelPrefix() {
    if (careViewMode === 'completed') return '완료된 케어 ';
    if (careViewMode === 'all') return '케어 ';
    return '진행 중인 케어 ';
  }
  function updateInProgressCareDateFilterCounts(searchedRows?: any) {
    let group = els.inProgressCareDateFilter;
    if (!group) return;
    let todayCount = 0;
    let pastCount = 0;
    searchedRows.forEach(function (s: any) {
      let bucket = careDateBucket(s.scheduled_at);
      if (bucket === 'today') todayCount++;
      else if (bucket === 'past') pastCount++;
    });
    let allBtn = group.querySelector<any>('[data-date-filter="all"]');
    let todayBtn = group.querySelector<any>('[data-date-filter="today"]');
    let pastBtn = group.querySelector<any>('[data-date-filter="past"]');
    if (allBtn) allBtn.textContent = '전체 ' + searchedRows.length + '건';
    if (todayBtn) todayBtn.textContent = '오늘 케어 ' + todayCount + '건';
    if (pastBtn) pastBtn.textContent = '지난 케어 ' + pastCount + '건';
  }
  async function renderInProgressCareList() {
    let list = els.inProgressCareList;
    if (!list) return;
    inProgressExtraRowsWrap = null;
    if (els.inProgressCareShowMoreBtn) els.inProgressCareShowMoreBtn.hidden = true;
    if (currentStatusFilter === 'payment_pending' || currentStatusFilter === 'matching_pending' || currentStatusFilter === 'cancelled') {
      if (els.inProgressCareCount) { els.inProgressCareCount.textContent = '0건'; els.inProgressCareCount.hidden = false; }
      updateInProgressCareDateFilterCounts([]);
      list.innerHTML = '<p class="admin-empty">조건에 맞는 케어가 없습니다.</p>';
      return;
    }
    let searchedRows = lastInProgressRows.filter(function (s: any) {
      let managerText = lastInProgressManagerById[s.manager_id]
        ? lastInProgressManagerById[s.manager_id].name + ' ' + lastInProgressManagerById[s.manager_id].phone
        : '';
      return matchesSearch([s.guardian_name, s.guardian_phone, s.senior_name, managerText]);
    });
    updateInProgressCareDateFilterCounts(searchedRows);
    let rows = currentCareDateFilter === 'all' ? searchedRows
      : searchedRows.filter(function (s: any) { return careDateBucket(s.scheduled_at) === currentCareDateFilter; });
    if (els.inProgressCareCount) {
      els.inProgressCareCount.textContent = rows.length + '건';
      els.inProgressCareCount.hidden = false;
    }
    if (!rows.length) {
      let emptyText = currentCareDateFilter === 'today' ? '오늘 예정된 케어가 없습니다.'
        : currentCareDateFilter === 'past' ? '지난 케어가 없습니다.'
        : careViewMode === 'completed' ? '완료된 케어가 없습니다.'
        : careViewMode === 'all' ? '배정된 케어가 없습니다.'
        : '현재 배정되어 진행 중인 케어가 없습니다.';
      list.innerHTML = '<p class="admin-empty">' + emptyText + '</p>';
      return;
    }
    let checkpointsByScheduleId = await loadCareCheckpointsFor(rows.map(function (s: any) { return s.id; }));
    list.innerHTML = '';
    let visibleRows = rows.slice(0, INPROGRESS_CARE_VISIBLE_LIMIT);
    let extraRows = rows.slice(INPROGRESS_CARE_VISIBLE_LIMIT);
    visibleRows.forEach(function (s: any) { list.appendChild(renderInProgressCareRow(s, lastInProgressManagerById[s.manager_id], checkpointsByScheduleId[s.id])); });
    if (extraRows.length && els.inProgressCareShowMoreBtn) {
      let extraWrap = document.createElement('div');
      extraWrap.className = 'admin-extra-rows';
      extraRows.forEach(function (s: any) { extraWrap.appendChild(renderInProgressCareRow(s, lastInProgressManagerById[s.manager_id], checkpointsByScheduleId[s.id])); });
      list.appendChild(extraWrap);
      inProgressExtraRowsWrap = extraWrap;
      els.inProgressCareShowMoreBtn.hidden = false;
      els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', 'false');
      setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, careRowsLabelPrefix() + extraRows.length + '건 더보기');
    }
  }
  let CARE_CHECKPOINT_STEPS = ['departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'];
  async function loadCareCheckpointsFor(scheduleIds?: any) {
    let byScheduleId: any = {};
    if (!scheduleIds || !scheduleIds.length) return byScheduleId;
    let res = await api.listCareCheckpoints(supabaseClient, scheduleIds, CARE_CHECKPOINT_STEPS);
    if (res.error) {
      console.warn('[Admin] 현장 인증(care_checkpoints) 조회 실패 — 버튼은 보이지만 상세 내용은 비어 있을 수 있습니다:',
        res.error.code, res.error.message);
      return byScheduleId;
    }
    (res.data || []).forEach(function (r: any) {
      if (!byScheduleId[r.schedule_id]) byScheduleId[r.schedule_id] = {};
      byScheduleId[r.schedule_id][r.step] = {
        at: r.checkpoint_at || r.created_at,
        lat: r.lat, lng: r.lng, accuracy: r.accuracy,
        photo: r.photo_url || null
      };
    });
    return byScheduleId;
  }
  if (els.inProgressCareShowMoreBtn) {
    els.inProgressCareShowMoreBtn.addEventListener('click', function () {
      if (!inProgressExtraRowsWrap) return;
      let expanded = inProgressExtraRowsWrap.classList.toggle('is-expanded');
      els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', String(expanded));
      setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, expanded
        ? '접기'
        : careRowsLabelPrefix() + inProgressExtraRowsWrap.children.length + '건 더보기');
    });
  }
  function scrollToInProgressCareRow(scheduleId?: any) {
    let row = els.inProgressCareList && els.inProgressCareList.querySelector<any>('[data-schedule-id="' + scheduleId + '"]');
    if (!row) {
      showToast('해당 케어가 지금 목록에 보이지 않습니다 — 상태 필터나 검색어를 확인해 주세요.');
      return;
    }
    let needsExpand = inProgressExtraRowsWrap && inProgressExtraRowsWrap.contains(row) && !inProgressExtraRowsWrap.classList.contains('is-expanded');
    if (needsExpand) {
      inProgressExtraRowsWrap.classList.add('is-expanded');
      if (els.inProgressCareShowMoreBtn) {
        els.inProgressCareShowMoreBtn.setAttribute('aria-expanded', 'true');
        setShowMoreBtnLabel(els.inProgressCareShowMoreBtn, '접기');
      }
    }
    let highlightAndScroll = function () {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('is-highlighted');
      setTimeout(function () { row.classList.remove('is-highlighted'); }, 2600);
    };
    if (needsExpand) setTimeout(highlightAndScroll, 380);
    else highlightAndScroll();
  }
  function renderInProgressCareRow(s?: any, manager?: any, checkpoints?: any) {
    let row = document.createElement('div');
    row.className = 'admin-row';
    row.dataset.scheduleId = s.id; // '현장 이슈 접수' 카드의 [해당 케어 보기] → scrollToInProgressCareRow() 가 찾는 기준
    let statusKey = CARE_STATUS_LABEL.hasOwnProperty(s.status) ? s.status : 'assigned';
    let statusLabel = CARE_STATUS_LABEL[statusKey] || s.status;
    let daysSince = formatDaysSinceCreated(s.created_at);
    let daysBadge = daysSince
      ? '<span class="admin-badge is-dayago-' + daysSince.level + '">' + escapeHtml(daysSince.label) + '</span>'
      : '';
    let linkedApp = s.service_applications || null;
    let packageBadge = (linkedApp && linkedApp.is_package_used)
      ? '<span class="admin-badge is-package">패키지 차감' +
          (linkedApp.package_remaining_after != null ? ' · 신청 당시 잔여 ' + formatPkgCount(linkedApp.package_remaining_after) + '회' : '') +
        '</span>'
      : '';
    let refundBadge = (linkedApp && linkedApp.payment_status === 'PARTIALLY_REFUNDED')
      ? '<span class="admin-badge is-partially-refunded">부분 환불 완료' +
          (linkedApp.refund_amount ? ' (' + Number(linkedApp.refund_amount).toLocaleString('ko-KR') + '원)' : '') +
        '</span>'
      : (linkedApp && linkedApp.payment_status === 'REFUNDED'
        ? '<span class="admin-badge is-refunded">환불 완료</span>'
        : '');
    let head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div class="admin-row-head-main"><div class="admin-row-name">' + escapeHtml(seniorLabel(s)) + '</div>' +
      '<div class="admin-row-sub">보호자 ' + escapeHtml(s.guardian_name || '미등록') + ' · ' + escapeHtml(s.guardian_phone || '연락처 미등록') + '</div></div>' +
      '<div class="admin-badge-group">' +
        daysBadge +
        '<span class="admin-badge is-' + statusKey + '">' + escapeHtml(statusLabel) + '</span>' +
        packageBadge +
        refundBadge +
      '</div>';
    let managerText = manager
      ? manager.name + ' · ' + manager.phone + ' (' + (manager.activity_status === 'online' ? '온라인' : '휴식') + ')'
      : '매니저 정보를 찾을 수 없음 (id: ' + s.manager_id + ')';
    let meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>담당 매니저</dt><dd>' + escapeHtml(managerText) + '</dd>' +
      '<dt>예정 일시</dt><dd>' + formatDateTime(s.scheduled_at) + '</dd>' +
      '<dt>이동 경로</dt><dd>' + escapeHtml((s.origin || '출발지 확인 필요') + ' → ' + (s.destination || '목적지 확인 필요')) + '</dd>' +
      '<dt>요청 사항</dt><dd>' + escapeHtml(s.notes || '-') + '</dd>';
    let hasAnyCheckpoint = !!(checkpoints && CARE_CHECKPOINT_STEPS.some(function (step: any) { return checkpoints[step]; }));
    let actions = document.createElement('div');
    actions.className = 'admin-row-actions is-verify';
    let verifyBtn = document.createElement('button');
    verifyBtn.type = 'button';
    verifyBtn.className = 'admin-btn is-ghost';
    verifyBtn.textContent = '현장 인증 상세보기';
    verifyBtn.addEventListener('click', function () { openCareVerifyModal(s, checkpoints || {}); });
    actions.appendChild(verifyBtn);
    if (hasAnyCheckpoint) {
      let doneBadge = document.createElement('span');
      doneBadge.className = 'admin-badge is-done';
      doneBadge.textContent = '인증 완료';
      actions.appendChild(doneBadge);
    }
    if (s.status !== 'completed') {
      let reassignBtn = document.createElement('button');
      reassignBtn.type = 'button';
      reassignBtn.className = 'admin-btn is-ghost';
      reassignBtn.textContent = '매니저 교체';
      reassignBtn.addEventListener('click', function () { openReassignModal(s); });
      actions.appendChild(reassignBtn);
      let forceCompleteBtn = document.createElement('button');
      forceCompleteBtn.type = 'button';
      forceCompleteBtn.className = 'admin-btn is-danger';
      forceCompleteBtn.textContent = '강제 완료';
      forceCompleteBtn.addEventListener('click', function () { forceCompleteCare(s, forceCompleteBtn); });
      actions.appendChild(forceCompleteBtn);
      let interruptBtn = document.createElement('button');
      interruptBtn.type = 'button';
      interruptBtn.className = 'admin-btn is-ghost';
      interruptBtn.textContent = '케어 중단 처리';
      interruptBtn.addEventListener('click', function () { openCareInterruptModal(s); });
      actions.appendChild(interruptBtn);
    } else {
      appendExtraChargeActions(s, actions);
    }
    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(buildOrderIdRow(s.application_id));
    row.appendChild(actions);
    return row;
  }
  let reassignScheduleId: any = null;
  async function openReassignModal(schedule?: any) {
    if (!els.reassignModal) return;
    reassignScheduleId = schedule.id;
    els.reassignSub.textContent = (schedule.senior_name || '어르신') + ' · 현재 담당: ' +
      (lastInProgressManagerById[schedule.manager_id] ? lastInProgressManagerById[schedule.manager_id].name : '알 수 없음');
    els.reassignError.hidden = true;
    els.reassignSelect.innerHTML = '<option value="">불러오는 중…</option>';
    els.reassignSelect.disabled = true;
    els.reassignConfirmBtn.disabled = true;
    els.reassignModal.hidden = false;
    let result = await fetchActiveManagersWithNames();
    if (reassignScheduleId !== schedule.id) return; // 그 사이 모달을 닫거나 다른 일정으로 다시 열었으면 중단
    if (result.error) {
      console.error('[Admin] 매니저 목록 조회 실패(교체 모달):', result.error.code, result.error.message);
      els.reassignSelect.innerHTML = '<option value="">매니저 목록을 불러오지 못했습니다</option>';
      els.reassignError.textContent = '매니저 목록 조회에 실패했습니다: ' + result.error.message;
      els.reassignError.hidden = false;
      return;
    }
    let candidates = result.rows.filter(function (m: any) { return m.id !== schedule.manager_id; });
    if (!candidates.length) {
      els.reassignSelect.innerHTML = '<option value="">교체할 수 있는 다른 매니저가 없습니다</option>';
      return;
    }
    els.reassignSelect.innerHTML = '<option value="">매니저를 선택해 주세요</option>' +
      candidates.map(function (m: any) {
        let statusLabel = m.activity_status === 'online' ? '온라인' : '휴식';
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
    els.reassignModal.addEventListener('mousedown', function (e: any) { if (e.target === els.reassignModal) closeReassignModal(); });
    document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.reassignModal.hidden) closeReassignModal(); });
    els.reassignConfirmBtn.addEventListener('click', async function () {
      if (!reassignScheduleId) return;
      let newManagerId = els.reassignSelect.value;
      if (!newManagerId) {
        els.reassignError.textContent = '교체할 매니저를 선택해 주세요.';
        els.reassignError.hidden = false;
        return;
      }
      els.reassignError.hidden = true;
      els.reassignConfirmBtn.disabled = true;
      let res = await api.adminReassignCareManager(supabaseClient, reassignScheduleId, newManagerId);
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
  async function forceCompleteCare(s?: any, btn?: any) {
    let ok = window.confirm((s.senior_name || '이 어르신') + '의 케어를 지금 강제로 완료 처리할까요?');
    if (!ok) return;
    btn.disabled = true;
    let res = await api.adminForceCompleteCare(supabaseClient, s);
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
  function appendExtraChargeActions(s?: any, actions?: any) {
    let chargeStatus = s.extra_charge_status || 'NONE';
    let amountText = (s.extra_charge_amount != null) ? Number(s.extra_charge_amount).toLocaleString('ko-KR') + '원' : '';
    if (chargeStatus === 'PAID') {
      let paidBadge = document.createElement('span');
      paidBadge.className = 'admin-badge is-payment-done';
      paidBadge.textContent = '추가 요금 결제완료 · ' + amountText;
      actions.appendChild(paidBadge);
      return;
    }
    if (chargeStatus === 'REQUESTED') {
      let reqBadge = document.createElement('span');
      reqBadge.className = 'admin-badge is-payment-pending';
      reqBadge.textContent = '추가 요금 청구됨 · ' + amountText;
      actions.appendChild(reqBadge);
      let editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-btn is-ghost';
      editBtn.textContent = '청구 금액 수정';
      editBtn.addEventListener('click', function () { openExtraChargeModal(s); });
      actions.appendChild(editBtn);
      let cancelChargeBtn = document.createElement('button');
      cancelChargeBtn.type = 'button';
      cancelChargeBtn.className = 'admin-btn is-ghost';
      cancelChargeBtn.textContent = '청구 취소';
      cancelChargeBtn.addEventListener('click', function () { cancelExtraCharge(s, cancelChargeBtn); });
      actions.appendChild(cancelChargeBtn);
      return;
    }
    let requestBtn = document.createElement('button');
    requestBtn.type = 'button';
    requestBtn.className = 'admin-btn is-ghost';
    requestBtn.textContent = '추가 요금 청구';
    requestBtn.addEventListener('click', function () { openExtraChargeModal(s); });
    actions.appendChild(requestBtn);
  }
  let extraChargeScheduleId: any = null;
  function openExtraChargeModal(s?: any) {
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
    els.extraChargeModal.addEventListener('mousedown', function (e: any) { if (e.target === els.extraChargeModal) closeExtraChargeModal(); });
    document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.extraChargeModal.hidden) closeExtraChargeModal(); });
    els.extraChargeConfirmBtn.addEventListener('click', async function () {
      if (!extraChargeScheduleId) return;
      let amount = parseInt(els.extraChargeAmountInput.value, 10);
      if (!amount || amount <= 0) {
        els.extraChargeError.textContent = '0원보다 큰 금액을 입력해 주세요.';
        els.extraChargeError.hidden = false;
        return;
      }
      els.extraChargeError.hidden = true;
      els.extraChargeConfirmBtn.disabled = true;
      let res = await api.adminRequestExtraCharge(supabaseClient, extraChargeScheduleId, amount, els);
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
  async function cancelExtraCharge(s?: any, btn?: any) {
    let ok = window.confirm((s.senior_name || '이 어르신') + '의 추가 요금 청구를 취소할까요? (보호자가 아직 결제하지 않은 경우에만 가능)');
    if (!ok) return;
    btn.disabled = true;
    let res = await api.adminCancelExtraCharge(supabaseClient, s);
    if (res.error) {
      console.error('[Admin] 추가 요금 청구 취소 실패:', res.error.code, res.error.message);
      showToast('추가 요금 청구 취소에 실패했습니다: ' + res.error.message);
      btn.disabled = false;
      return;
    }
    showToast('추가 요금 청구를 취소했습니다.');
    reloadCareView();
  }
  let careInterruptState: any = null; // { schedule, isPackage, applicationId }
  function updateCareInterruptRefundPreview() {
    if (!careInterruptState || careInterruptState.isPackage) return;
    let payment = careInterruptState.schedule.payment_amount || 0;
    let fee = Number(els.careInterruptFeeInput.value || 0);
    if (!Number.isFinite(fee) || fee < 0) fee = 0;
    let refund = Math.max(payment - fee, 0);
    els.careInterruptRefundInfo.textContent = refund.toLocaleString('ko-KR') + '원';
  }
  els.careInterruptFeeInput.addEventListener('input', updateCareInterruptRefundPreview);
  async function openCareInterruptModal(s?: any) {
    careInterruptState = { schedule: s, isPackage: false, applicationId: s.application_id };
    els.careInterruptSub.textContent = (s.senior_name || '어르신') + ' · 현재 결제액 ' +
      (s.payment_amount || 0).toLocaleString('ko-KR') + '원';
    els.careInterruptFeeInput.value = '';
    els.careInterruptMemoInput.value = '';
    els.careInterruptError.hidden = true;
    els.careInterruptPaymentInfo.textContent = (s.payment_amount || 0).toLocaleString('ko-KR') + '원';
    els.careInterruptRefundInfo.textContent = (s.payment_amount || 0).toLocaleString('ko-KR') + '원';
    if (!s.application_id) {
      els.careInterruptRefundSection.hidden = false;
      els.careInterruptPackageSection.hidden = true;
      els.careInterruptConfirmBtn.hidden = false;
      els.careInterruptModal.hidden = false;
      return;
    }
    let res = await api.getServiceApplications2(supabaseClient, s);
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
  els.careInterruptModal.addEventListener('mousedown', function (e: any) { if (e.target === els.careInterruptModal) closeCareInterruptModal(); });
  document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.careInterruptModal.hidden) closeCareInterruptModal(); });
  els.careInterruptConfirmBtn.addEventListener('click', async function () {
    if (!careInterruptState) return;
    let s = careInterruptState.schedule;
    let fee = Number(els.careInterruptFeeInput.value);
    let memo = els.careInterruptMemoInput.value.trim();
    let payment = s.payment_amount || 0;
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
    let refund = payment - fee;
    if (refund <= 0) {
      els.careInterruptError.textContent = '환불 금액이 0원입니다. 환불할 금액이 없으면 [강제 완료]를 사용해 주세요.';
      els.careInterruptError.hidden = false;
      return;
    }
    let ok = window.confirm('출장비 ' + fee.toLocaleString('ko-KR') + '원을 제외하고 ' + refund.toLocaleString('ko-KR') +
      '원을 PortOne으로 실제 부분 취소합니다. 계속할까요?');
    if (!ok) return;
    els.careInterruptError.hidden = true;
    els.careInterruptConfirmBtn.disabled = true;
    els.careInterruptConfirmBtn.textContent = '처리 중…';
    try {
      let res = await api.invokeCancelPayment(supabaseClient, s, refund, memo);
      if (res.error) throw res.error;
      showToast('부분 취소/환불 처리가 완료되었습니다.');
      closeCareInterruptModal();
      reloadCareView();
    } catch (e: any) {
      let detail = (e && e.context && typeof e.context.json === 'function') ? await e.context.json().catch(function () { return null; }) : null;
      let isFetchFailure = e && e.name === 'FunctionsFetchError';
      console.error('[Admin] 부분 취소 처리 실패 — name=' + (e && e.name) + ', message=' + (e && e.message) + ':',
        '\n  함수 응답 본문(detail):', detail,
        '\n  네트워크 단계 원인(context, FunctionsFetchError일 때 특히 중요):', e && e.context,
        '\n  원본 에러 객체:', e);
      let userMsg = isFetchFailure
        ? 'Edge Function(cancel-payment)에 연결할 수 없습니다. 함수가 Supabase에 배포되어 있는지(supabase functions deploy cancel-payment), 네트워크 상태를 확인해 주세요.'
        : ((detail && detail.message) || e.message || String(e));
      els.careInterruptError.textContent = '부분 취소 처리에 실패했습니다: ' + userMsg;
      els.careInterruptError.hidden = false;
    } finally {
      els.careInterruptConfirmBtn.disabled = false;
      els.careInterruptConfirmBtn.textContent = '부분 취소 처리하기';
    }
  });
  async function submitPackageAdjust(restoreAmount?: any, btn?: any) {
    if (!careInterruptState) return;
    let memo = els.careInterruptMemoInput.value.trim();
    if (!memo) {
      els.careInterruptError.textContent = '처리 사유 메모를 입력해 주세요.';
      els.careInterruptError.hidden = false;
      return;
    }
    let label = restoreAmount === 1 ? '패키지 1회 전체 원복' : '패키지 0.5회 부분 차감 처리';
    let ok = window.confirm(label + '을 진행할까요? (패키지 회차가 즉시 조정됩니다)');
    if (!ok) return;
    els.careInterruptError.hidden = true;
    els.careInterruptRestoreFullBtn.disabled = true;
    els.careInterruptRestoreHalfBtn.disabled = true;
    btn.textContent = '처리 중…';
    let res = await api.adminAdjustPackageSession(supabaseClient, careInterruptState, restoreAmount, memo);
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
  let CARE_ISSUE_TYPE_LABEL = { documents_missing: '서류 미비', health_refusal: '어르신 건강/진료 거부', other: '기타 현장 문제' };
  async function loadCareIssues() {
    let list = els.careIssueList;
    if (!list) return;
    let res = await api.listCareIssueReports(supabaseClient);
    if (res.error) {
      console.warn('[Admin] care_issue_reports 조회 실패 → sql/care_interruption_refund_system.sql 을 실행했는지 확인하세요:', res.error.code, res.error.message);
      list.innerHTML = '<p class="admin-empty">현장 이슈 접수 내역을 불러오지 못했습니다.</p>';
      if (els.careIssueCount) els.careIssueCount.hidden = true;
      return;
    }
    let rows = res.data || [];
    if (els.careIssueCount) {
      els.careIssueCount.hidden = rows.length === 0;
      els.careIssueCount.textContent = rows.length + '건';
    }
    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">접수된 현장 이슈가 없습니다.</p>';
      return;
    }
    list.innerHTML = '';
    rows.forEach(function (r: any) { list.appendChild(renderCareIssueRow(r)); });
  }
  function renderCareIssueRow(r?: any) {
    let app = r.service_applications || {};
    let sched = r.care_schedules || {};
    let seniorName = app.senior_name || sched.senior_name || '어르신';
    let guardianName = sched.guardian_name || '보호자';
    let guardianPhone = app.user_contact || sched.guardian_phone || '연락처 미등록';
    let serviceType = app.service_type || '동행 서비스';
    let isManagerReport = r.reporter_role === 'manager';
    let row = document.createElement('div');
    row.className = 'admin-row';
    let head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div class="admin-row-head-main"><div class="admin-row-name">' + escapeHtml(seniorName) + '</div>' +
      '<div class="admin-row-sub">보호자 ' + escapeHtml(guardianName) + ' · ' + escapeHtml(guardianPhone) + '</div></div>' +
      '<div class="admin-badge-group">' +
      '<span class="admin-badge' + (isManagerReport ? ' is-assigned' : ' is-neutral') + '">' + (isManagerReport ? '매니저 접수' : '보호자 접수') + '</span>' +
      '<span class="admin-badge is-warn">' + escapeHtml(CARE_ISSUE_TYPE_LABEL[r.issue_type] || r.issue_type) + '</span></div>';
    let meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>서비스</dt><dd>' + escapeHtml(serviceType) + '</dd>' +
      '<dt>예정 일시</dt><dd>' + (sched.scheduled_at ? formatDateTime(sched.scheduled_at) : '-') + '</dd>' +
      '<dt>접수 시각</dt><dd>' + formatDateTime(r.created_at) + '</dd>' +
      '<dt>상세 내용</dt><dd>' + escapeHtml(r.detail || '-') + '</dd>';
    let actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    if (r.schedule_id) {
      let viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'admin-btn is-ghost';
      viewBtn.textContent = '해당 케어 보기';
      viewBtn.addEventListener('click', function () { scrollToInProgressCareRow(r.schedule_id); });
      actions.appendChild(viewBtn);
    }
    let resolveBtn = document.createElement('button');
    resolveBtn.type = 'button';
    resolveBtn.className = 'admin-btn is-ghost';
    resolveBtn.textContent = '확인 완료 처리';
    resolveBtn.addEventListener('click', async function () {
      resolveBtn.disabled = true;
      let res = await api.adminResolveCareIssue(supabaseClient, r);
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
  let CARE_VERIFY_SECTION_LABEL = {
    departure: '출발 (이동 중)', hospital_arrival: '병원 도착',
    treatment_complete: '진료/대행 완료', return_departure: '귀가 이동', return_complete: '케어 완료'
  };
  let careVerifyOpenToken = 0;
  function formatGpsCoords(lat?: any, lng?: any) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return '위도 ' + lat.toFixed(5) + ', 경도 ' + lng.toFixed(5);
  }
  function renderCareVerifySection(container?: any, step?: any, cp?: any, openToken?: any) {
    container.innerHTML = '';
    if (!cp || !cp.at) {
      let empty = document.createElement('p');
      empty.className = 'verify-empty';
      empty.textContent = '아직 ' + CARE_VERIFY_SECTION_LABEL[step] + ' 인증이 기록되지 않았습니다 (미인증).';
      container.appendChild(empty);
      return;
    }
    let hasLoc = typeof cp.lat === 'number' && typeof cp.lng === 'number';
    let kv = document.createElement('dl');
    kv.className = 'verify-kv';
    kv.innerHTML =
      '<dt>인증 시각</dt><dd>' + formatDateTime(cp.at) + '</dd>' +
      '<dt>GPS 위치</dt><dd id="careVerifyAddr-' + step + '">' + escapeHtml(hasLoc ? (formatGpsCoords(cp.lat, cp.lng) + ' (주소 확인 중…)') : '위치 정보 없음') + '</dd>';
    container.appendChild(kv);
    if (hasLoc) {
      reverseGeocodeCached(cp.lat, cp.lng).then(function (address: any) {
        if (openToken !== careVerifyOpenToken) return; // 그 사이 모달을 닫았거나 다른 일정으로 다시 열었으면 반영하지 않음
        let dd = $id('careVerifyAddr-' + step);
        if (!dd) return;
        let coords = formatGpsCoords(cp.lat, cp.lng);
        dd.textContent = address ? (address + ' 인근 (' + coords + ')') : coords;
      });
    }
    if (cp.photo) {
      let photoBtn = document.createElement('button');
      photoBtn.type = 'button';
      photoBtn.className = 'verify-photo-btn';
      let img = document.createElement('img');
      img.src = cp.photo;
      img.alt = CARE_VERIFY_SECTION_LABEL[step] + ' 인증 사진';
      img.loading = 'lazy';
      let caption = CARE_VERIFY_SECTION_LABEL[step] + ' 인증 사진 원본 보기';
      photoBtn.appendChild(img);
      let label = document.createElement('span');
      label.textContent = caption;
      photoBtn.appendChild(label);
      photoBtn.addEventListener('click', function () { openCareVerifyLightbox(cp.photo, caption); });
      container.appendChild(photoBtn);
    } else {
      let noPhoto = document.createElement('p');
      noPhoto.className = 'verify-empty';
      noPhoto.textContent = '사진이 첨부되지 않았습니다.';
      container.appendChild(noPhoto);
    }
  }
  function openCareVerifyModal(schedule?: any, checkpoints?: any) {
    careVerifyOpenToken++;
    let openToken = careVerifyOpenToken;
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
    els.careVerifyModal.addEventListener('mousedown', function (e: any) { if (e.target === els.careVerifyModal) closeCareVerifyModal(); });
    document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.careVerifyModal.hidden) closeCareVerifyModal(); });
  }
  function openCareVerifyLightbox(photoUrl?: any, caption?: any) {
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
    els.careVerifyLightbox.addEventListener('mousedown', function (e: any) { if (e.target === els.careVerifyLightbox) closeCareVerifyLightbox(); });
    document.addEventListener('keydown', function (e: any) { if (e.key === 'Escape' && !els.careVerifyLightbox.hidden) closeCareVerifyLightbox(); });
  }
  let careSchedulesChannel: any = null;
  function subscribeCareScheduleChanges() {
    if (!supabaseClient || careSchedulesChannel) return;
    careSchedulesChannel = supabaseClient
      .channel('admin-care-schedules')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_schedules' }, function (payload: any) {
        console.log('[Admin][Realtime] care_schedules 변경 감지 → 진행 중인 케어 현황판 다시 불러오기:', payload);
        reloadCareView();
        loadSummaryStats();
      })
      .subscribe(function (status: any) { console.log('[Admin][Realtime] care_schedules 구독 상태:', status); });
  }
  function resubscribeRealtime() {
    if (serviceApplicationsChannel) { supabaseClient.removeChannel(serviceApplicationsChannel); serviceApplicationsChannel = null; }
    if (careSchedulesChannel) { supabaseClient.removeChannel(careSchedulesChannel); careSchedulesChannel = null; }
    subscribeServiceApplicationChanges();
    subscribeCareScheduleChanges();
  }
  function refreshAll() {
    loadSummaryStats();
    if (currentStatusFilter === 'cancelled') loadCancelledApplications();
    else loadApplications();
    reloadCareView();
    loadCareIssues();
  }
  async function refreshAllAdminData() {
    await Promise.all([
      loadSummaryStats(),
      loadPendingManagers(),
      loadApplications(),
      loadUserPackages(),
      loadMembers()
    ]);
  }
  let POLL_INTERVAL_MS = 30000;
  let pollTimer: any = null;
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
  window.addEventListener('pageshow', function (e: any) {
    if (e.persisted) {
      console.log('[Admin] bfcache 에서 페이지가 복원됐습니다 — Realtime 재구독 + 최신 상태 다시 불러오기');
      resubscribeRealtime();
      refreshAll();
    }
  });
  if (els.refreshBtn) {
    els.refreshBtn.addEventListener('click', async function () {
      let originalLabel = els.refreshBtn.textContent;
      els.refreshBtn.disabled = true;
      els.refreshBtn.textContent = '갱신 중...';
      try {
        await refreshAllAdminData();
        showToast('최신 상태를 다시 불러왔습니다.');
      } catch (e: any) {
        console.error('[Admin] 새로고침 중 오류:', e);
        showToast('일부 데이터를 불러오지 못했습니다.');
      } finally {
        els.refreshBtn.disabled = false;
        els.refreshBtn.textContent = originalLabel;
      }
    });
  }
  async function fetchActiveManagersWithNames() {
    let managersRes = await api.listManagers(supabaseClient);
    if (managersRes.error && managersRes.error.code === '42703') {
      console.warn('[Admin] managers.last_active_at 컬럼이 없습니다(42703) → sql/manager_duty_status.sql 을 실행해 주세요. 최근 활동일 없이 계속 표시합니다.');
      managersRes = await api.listManagers2(supabaseClient);
    }
    if (managersRes.error) return { error: managersRes.error, rows: [] };
    let rawRows = managersRes.data || [];
    if (!rawRows.length) return { error: null, rows: [] };
    console.log('[Admin][디버그] managers 원본 조회 결과(' + rawRows.length + '건):',
      rawRows.map(function (m: any) {
        return {
          manager_id: m.id,
          profiles_embed_type: Array.isArray(m.profiles) ? 'array(비정상 — to-many로 추론됨)' : (m.profiles === null ? 'null(해당 id의 profiles 행을 못 읽음 — RLS 또는 행 없음)' : typeof m.profiles),
          profiles_embed_raw: m.profiles
        };
      }));
    let ids = rawRows.map(function (m: any) { return m.id; });
    let directProfilesRes = await api.listProfiles(supabaseClient, ids);
    if (directProfilesRes.error) {
      console.warn('[Admin][디버그] profiles 직접 조회 실패:', directProfilesRes.error.code, directProfilesRes.error.message);
    } else {
      let directProfileIds = (directProfilesRes.data || []).map(function (p: any) { return p.id; });
      let missingProfileIds = ids.filter(function (id: any) { return directProfileIds.indexOf(id) === -1; });
      console.log('[Admin][디버그] profiles 직접 조회(embed 없이) — 요청한 managers.id ' + ids.length + '개 중 ' +
        directProfileIds.length + '개에서 profiles 행을 찾음. ' + directProfilesRes.data.length + '건 상세:', directProfilesRes.data);
      if (missingProfileIds.length) {
        console.warn('[Admin][디버그] ⚠ 아래 managers.id 는 profiles 테이블에 같은 id의 행이 전혀 없습니다 ' +
          '(RLS 문제가 아니라 — RLS는 "있는 행을 못 보는" 것이고 이건 "행 자체가 없음" — managers.id 가 profiles.id 와 ' +
          '어긋났거나, 그 유저의 profiles 행이 삭제/누락된 경우입니다. Supabase 테이블 편집기에서 직접 확인해 보세요):',
          missingProfileIds);
      }
    }
    let appsRes = await api.listManagerApplications3(supabaseClient, ids);
    if (appsRes.error) {
      console.warn('[Admin] 이름/연락처 보조 조회 실패(manager_applications):', appsRes.error.code, appsRes.error.message);
    } else {
      console.log('[Admin][디버그] manager_applications 전체 조회(상태 무관, ' + (appsRes.data || []).length + '건):', appsRes.data);
      let appUserIds = (appsRes.data || []).map(function (a: any) { return a.user_id; });
      let noApplicationAtAll = ids.filter(function (id: any) { return appUserIds.indexOf(id) === -1; });
      if (noApplicationAtAll.length) {
        console.warn('[Admin][디버그] ⚠ 아래 managers.id 는 manager_applications 에 행이 아예 없습니다 — ' +
          '승인 절차(manager-apply.html → 관리자 승인)를 거치지 않고 직접 만들어진 매니저(수기 삽입/구버전 데이터)일 ' +
          '가능성이 큽니다. 이름/연락처를 가져올 보조 소스 자체가 없다는 뜻이라, profiles.name/phone 을 직접 채우는 ' +
          '수밖에 없습니다:', noApplicationAtAll);
      }
    }
    let infoById: any = {};
    (appsRes.data || []).forEach(function (a: any) {
      if (a.status !== 'approved') return;
      if (!infoById[a.user_id]) infoById[a.user_id] = { name: a.name, phone: a.phone, activity_areas: a.activity_areas };
    });
    let rows = rawRows.map(function (m: any) {
      let profile = Array.isArray(m.profiles) ? (m.profiles[0] || {}) : (m.profiles || {});
      let fallback = infoById[m.id] || {};
      let resolvedName = profile.name || fallback.name || '이름 미등록';
      let resolvedPhone = profile.phone || fallback.phone || '연락처 미등록';
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
        activity_areas: fallback.activity_areas || [],
        activity_status: m.activity_status,
        last_active_at: m.last_active_at || null,
        approved_at: m.approved_at,
        email: null,
        assigned_care_count: 0,
        completed_care_count: 0,
        avg_rating: null,
        review_count: 0
      };
    });
    return { error: null, rows: rows };
  }
  async function fetchManagerCareOverviewById() {
    let res = await api.adminManagerCareOverview(supabaseClient);
    if (res.error) {
      console.warn('[Admin] 매니저 케어 현황 집계 실패(admin_manager_care_overview):', res.error.code, res.error.message,
        '→ sql/admin_active_manager_enhancements.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요. ' +
        '이메일/배정 건수/평점 없이 나머지 목록은 계속 표시됩니다.');
      return {};
    }
    let byId: any = {};
    (res.data || []).forEach(function (r: any) {
      byId[r.manager_id] = {
        email: r.email || null,
        assigned_care_count: r.assigned_care_count || 0,
        completed_care_count: r.completed_care_count || 0,
        avg_rating: r.avg_rating,
        review_count: r.review_count || 0
      };
    });
    return byId;
  }
  async function loadActiveManagers() {
    let list = els.activeManagersList;
    if (!list) return;
    list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    if (els.activeManagersCount) els.activeManagersCount.hidden = true;
    let results = await Promise.all([fetchActiveManagersWithNames(), fetchManagerCareOverviewById()]);
    let result = results[0];
    let overviewById = results[1];
    if (result.error) {
      console.error('[Admin] 활동 매니저 조회 실패:', result.error.code, result.error.message,
        '→ sql/admin_profiles_select.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      renderErrorState(list, result.error.message, loadActiveManagers);
      return;
    }
    let rows = result.rows;
    rows.forEach(function (m: any) {
      let overview = overviewById[m.id];
      if (!overview) return;
      m.email = overview.email;
      m.assigned_care_count = overview.assigned_care_count;
      m.completed_care_count = overview.completed_care_count;
      m.avg_rating = overview.avg_rating;
      m.review_count = overview.review_count;
    });
    activeManagersCache = rows;
    if (!rows.length) {
      let approvedCountRes = await api.countManagerApplications(supabaseClient);
      if (!approvedCountRes.error && (approvedCountRes.count || 0) > 0) {
        console.warn('[Admin] 승인된 지원 내역은 ' + approvedCountRes.count + '건 있는데 활동 매니저 조회는 0건입니다 ' +
          '→ sql/admin_profiles_select.sql 이 아직 Supabase 에 실행되지 않아, RLS 가 다른 사용자의 managers/profiles 행을 가리고 있을 가능성이 높습니다.');
        list.innerHTML = '';
        let hint = document.createElement('div');
        hint.className = 'admin-error';
        hint.textContent = '승인된 지원 내역은 ' + approvedCountRes.count + '건 있지만 매니저 목록이 보이지 않습니다. ' +
          '관리자 RLS 정책(sql/admin_profiles_select.sql)이 Supabase 에 아직 적용되지 않았을 수 있습니다 — SQL Editor 에서 그 파일을 실행한 뒤 다시 시도해 주세요.';
        let retryBtn = document.createElement('button');
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
  function renderActiveManagersList() {
    let list = els.activeManagersList;
    if (!list) return;
    let filtered = activeManagersCache.filter(function (m: any) {
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
    filtered.forEach(function (m: any) { list.appendChild(renderActiveManagerRow(m)); });
  }
  function renderManagerRatingHtml(avgRating?: any, reviewCount?: any) {
    if (avgRating == null || !reviewCount) return '평가 없음';
    let avgNum = Number(avgRating); // RPC(numeric) 응답이 문자열로 올 수 있어 숫자로 변환 후 사용
    let filled = Math.min(5, Math.max(0, Math.round(avgNum)));
    let stars = '<span class="manager-rating-stars">' + '★'.repeat(filled) + '☆'.repeat(5 - filled) + '</span>';
    return stars + ' ' + avgNum.toFixed(1) + ' (' + reviewCount + '건)';
  }
  function renderActiveManagerRow(m?: any) {
    let row = document.createElement('div');
    row.className = 'admin-row';
    let isOnline = m.activity_status === 'online';
    let dutyBadgeClass = isOnline ? 'is-verified' : 'is-neutral';
    let dutyBadgeText = isOnline ? '근무 중' : '휴식 중';
    let assignedCount = m.assigned_care_count || 0;
    let contactLine = escapeHtml(m.phone) + ' | ' + escapeHtml(m.email || '이메일 미등록');
    let head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML =
      '<div class="admin-row-head-main"><div class="admin-row-name">' + escapeHtml(m.name) + '</div>' +
      '<div class="admin-row-sub">' + contactLine + '</div></div>' +
      '<div class="admin-badge-group">' +
      '<span class="admin-badge is-care-count">배정된 케어 ' + assignedCount + '건</span>' +
      '<span class="admin-badge ' + dutyBadgeClass + '">' + dutyBadgeText + '</span>' +
      '</div>';
    let meta = document.createElement('dl');
    meta.className = 'admin-row-meta';
    meta.innerHTML =
      '<dt>자격증</dt><dd>' + escapeHtml(m.certification || '미등록') + '</dd>' +
      '<dt>활동 가능 지역</dt><dd>' + escapeHtml((m.activity_areas || []).join(', ') || '미등록') + '</dd>' +
      '<dt>평균 평점</dt><dd>' + renderManagerRatingHtml(m.avg_rating, m.review_count) + '</dd>' +
      '<dt>완료 건수</dt><dd>' + (m.completed_care_count || 0) + '건</dd>' +
      '<dt>근무 상태</dt><dd>' + dutyBadgeText + '</dd>' +
      '<dt>최근 활동</dt><dd>' + (m.last_active_at ? formatDateTime(m.last_active_at) : '활동 이력 없음') + '</dd>' +
      '<dt>승인일</dt><dd>' + (m.approved_at ? formatDateTime(m.approved_at) : '정보 없음') + '</dd>';
    let actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    let dutyToggleBtn = document.createElement('button');
    dutyToggleBtn.type = 'button';
    dutyToggleBtn.className = 'admin-btn is-ghost';
    dutyToggleBtn.textContent = isOnline ? '휴식 중으로 전환' : '근무 중으로 전환';
    dutyToggleBtn.addEventListener('click', function () {
      setManagerDutyStatus(m.id, isOnline ? 'break' : 'online', dutyToggleBtn);
    });
    actions.appendChild(dutyToggleBtn);
    let revokeBtn = document.createElement('button');
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
  async function setManagerDutyStatus(managerId?: any, targetStatus?: any, btn?: any) {
    let targetLabel = targetStatus === 'online' ? '근무 중' : '휴식 중';
    let ok = window.confirm('이 매니저의 근무 상태를 \'' + targetLabel + '\'(으)로 변경할까요?');
    if (!ok) return;
    btn.disabled = true;
    try {
      let res = await api.adminSetManagerActivityStatus(supabaseClient, managerId, targetStatus);
      if (res.error) {
        console.error('[Admin] 매니저 근무 상태 변경 실패:', res.error.code, res.error.message,
          res.error.code === 'PGRST202'
            ? '→ admin_set_manager_activity_status() 함수가 없습니다. sql/admin_active_manager_enhancements.sql 을 실행했는지 확인하세요.'
            : '');
        showToast('근무 상태 변경에 실패했습니다: ' + res.error.message);
        btn.disabled = false;
        return;
      }
      showToast('근무 상태를 \'' + targetLabel + '\'(으)로 변경했습니다.');
      await loadActiveManagers();
    } catch (e: any) {
      console.error('[Admin] 매니저 근무 상태 변경 중 오류:', e);
      showToast('근무 상태 변경 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e));
      btn.disabled = false;
    }
  }
  async function revokeManager(managerId?: any, name?: any, btn?: any, rowEl?: any) {
    if (!managerId) {
      console.error('Revoke error: managerId 가 비어 있습니다. renderActiveManagerRow 에서 m.id 를 제대로 넘겼는지 확인하세요.', managerId);
      showToast('권한 해제에 실패했습니다: 매니저 ID 를 확인할 수 없습니다.');
      return;
    }
    let ok = window.confirm((name || '이 매니저') + '의 매니저 권한을 해제하고 일반 회원으로 전환할까요?');
    if (!ok) return;
    btn.disabled = true;
    console.log('[Admin] revoke_manager 호출:', { p_manager_id: managerId });
    try {
      let res = await api.revokeManager(supabaseClient, managerId);
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
      let verify = await api.getManagers(supabaseClient, managerId);
      console.log('[Admin] 해제 후 실제 DB 상태:', verify.data, verify.error);
      if (verify.data && verify.data.certification_verified === true) {
        console.error('Revoke error: RPC 는 성공을 반환했지만 certification_verified 가 여전히 true 입니다.', verify.data);
        showToast('권한 해제 요청은 성공했지만 상태가 반영되지 않았습니다. 콘솔 로그를 확인해 주세요.');
        btn.disabled = false;
        return;
      }
      showToast('매니저 권한을 해제했습니다.');
      if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
      await loadActiveManagers();
    } catch (e: any) {
      console.error('Revoke error:', e);
      showToast('권한 해제 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e));
      btn.disabled = false;
    }
  }
  function currentYearMonthValue() {
    let kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.getUTCFullYear() + '-' + String(kst.getUTCMonth() + 1).padStart(2, '0');
  }
  let settlementRequestSeq = 0;
  async function loadManagerSettlements() {
    let body = els.settlementTableBody;
    if (!body) return;
    let rawMonthValue = (els.settlementMonthInput && els.settlementMonthInput.value) || '';
    let monthValue = /^\d{4}-\d{2}$/.test(rawMonthValue) ? rawMonthValue : currentYearMonthValue();
    let pMonth = monthValue + '-01';
    let requestSeq = ++settlementRequestSeq;
    let requestPayload = { p_month: pMonth };
    console.log('[Admin] 매니저 정산 RPC 호출 — 함수명=admin_manager_monthly_settlements, 요청 바디=', requestPayload,
      '(요청 순번 ' + requestSeq + ', select 요소 현재값=' + rawMonthValue + ')');
    body.innerHTML = '<tr><td colspan="6" class="admin-loading">불러오는 중…</td></tr>';
    if (els.settlementCount) els.settlementCount.hidden = true;
    if (els.settlementTableFoot) els.settlementTableFoot.hidden = true;
    let res = await api.adminManagerMonthlySettlements(supabaseClient, requestPayload);
    console.log('[Admin] 매니저 정산 RPC 원본 응답(res) — p_month=' + pMonth + ':', res);
    if (requestSeq !== settlementRequestSeq) {
      console.log('[Admin] 매니저 정산 응답 도착했지만 그 사이 더 최근 요청이 시작되어 버림 — p_month=' + pMonth +
        ' (이 응답의 순번 ' + requestSeq + ' ≠ 현재 최신 순번 ' + settlementRequestSeq + ')');
      return; // 그 사이 다른 달을 선택해 더 최근 요청이 시작됨 — 이 응답은 화면에 반영하지 않음
    }
    if (res.error) {
      console.error('[Admin] 매니저 정산 집계 실패 — p_month=' + pMonth + ':', res.error.code, res.error.message,
        '→ sql/manager_hourly_rate_settlement.sql / admin_settlement_fixes_v3.sql / admin_settlement_add_manager_email.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      body.innerHTML = '<tr><td colspan="6" class="admin-empty">정산 내역을 불러오지 못했습니다: ' +
        escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    let rows = res.data || [];
    console.log('[Admin] 매니저 정산 집계 결과 — p_month=' + pMonth + ', ' + rows.length + '명:');
    rows.forEach(function (r: any, i: any) {
      console.log('  [' + i + '] manager_id=' + r.manager_id + ', name=' + r.manager_name +
        ', email=' + r.manager_email + ', completed_count=' + r.completed_count +
        ', payout_subtotal=' + r.payout_subtotal + ', net_payout=' + r.net_payout);
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
    let totalCount = 0, totalPayout = 0, totalTax = 0, totalNet = 0;
    rows.forEach(function (r: any) {
      totalCount += Number(r.completed_count || 0);
      totalPayout += Number(r.payout_subtotal || 0);
      totalTax += Number(r.withholding_tax || 0);
      totalNet += Number(r.net_payout || 0);
      let tr = document.createElement('tr');
      tr.className = 'is-clickable';
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', escapeHtml(r.manager_name) + ' ' + pMonth.slice(0, 7) + ' 정산 상세보기');
      tr.innerHTML =
        '<td><span class="settle-manager-name">' + escapeHtml(r.manager_name) + '</span>' +
        (r.manager_email ? '<span class="settle-manager-email">' + escapeHtml(r.manager_email) + '</span>' : '') +
        '<span class="settle-manager-phone">' + escapeHtml(r.manager_phone) + '</span></td>' +
        '<td>' + Number(r.completed_count || 0) + '건</td>' +
        '<td>' + won(r.payout_subtotal) + '</td>' +
        '<td>' + won(r.withholding_tax) + '</td>' +
        '<td class="settle-net">' + won(r.net_payout) + '</td>' +
        '<td><button type="button" class="admin-btn is-ghost settle-detail-btn">상세보기</button></td>';
      tr.addEventListener('click', function (e: any) {
        openSettlementDetailModal(r, pMonth);
      });
      tr.addEventListener('keydown', function (e: any) {
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
  let settlementDetailRequestSeq = 0;
  function closeSettlementDetailModal() {
    if (els.settlementDetailModal) els.settlementDetailModal.hidden = true;
  }
  if (els.settlementDetailModal) {
    els.settlementDetailModal.addEventListener('mousedown', function (e: any) {
      if (e.target === els.settlementDetailModal) closeSettlementDetailModal();
    });
    document.addEventListener('keydown', function (e: any) {
      if (e.key === 'Escape' && !els.settlementDetailModal.hidden) closeSettlementDetailModal();
    });
  }
  if (els.settlementDetailCloseBtn) els.settlementDetailCloseBtn.addEventListener('click', closeSettlementDetailModal);
  if (els.settlementDetailCloseBtn2) els.settlementDetailCloseBtn2.addEventListener('click', closeSettlementDetailModal);
  async function openSettlementDetailModal(managerRow?: any, pMonth?: any) {
    if (!els.settlementDetailModal) return;
    let monthLabel = pMonth.slice(0, 7).replace('-', '년 ') + '월';
    if (els.settlementDetailModalTitle) els.settlementDetailModalTitle.textContent = managerRow.manager_name + ' 매니저 정산 상세';
    if (els.settlementDetailModalSub) {
      els.settlementDetailModalSub.textContent = monthLabel + ' · 완료 ' + Number(managerRow.completed_count || 0) + '건 · 정산대상액 ' + won(managerRow.payout_subtotal);
    }
    if (els.settlementDetailTableFoot) els.settlementDetailTableFoot.hidden = true;
    if (els.settlementDetailTableBody) els.settlementDetailTableBody.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';
    els.settlementDetailModal.hidden = false;
    let requestSeq = ++settlementDetailRequestSeq;
    let res = await api.adminManagerMonthlySettlementDetails(supabaseClient, pMonth, managerRow);
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
    let items = res.data || [];
    if (!els.settlementDetailTableBody) return;
    if (!items.length) {
      els.settlementDetailTableBody.innerHTML = '<tr><td colspan="5" class="admin-empty">상세 내역이 없습니다.</td></tr>';
      return;
    }
    els.settlementDetailTableBody.innerHTML = '';
    let totalPayment = 0, totalPayout = 0;
    items.forEach(function (it: any) {
      totalPayment += Number(it.payment_amount || 0);
      totalPayout += Number(it.manager_payout || 0);
      let schedIso = it.scheduled_at, doneIso = it.completed_at;
      let schedDate = schedIso ? new Date(schedIso) : null;
      let doneDate = doneIso ? new Date(doneIso) : null;
      let dateCell = escapeHtml(formatDateTime(schedIso));
      if (schedDate && doneDate && (schedDate.getUTCFullYear() !== doneDate.getUTCFullYear() || schedDate.getUTCMonth() !== doneDate.getUTCMonth())) {
        dateCell += '<span class="detail-datetime-sub">완료 처리: ' + escapeHtml(formatDateTime(doneIso)) + '</span>';
      }
      let reviewCell = '<span class="admin-badge">평가 없음</span>';
      if (it.rating != null) {
        reviewCell = '<span class="detail-stars">' + '★'.repeat(it.rating) + '☆'.repeat(5 - it.rating) + '</span>';
        if (it.review_text) reviewCell += '<span class="detail-review-text">' + escapeHtml(it.review_text) + '</span>';
      }
      let tr = document.createElement('tr');
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
    if (Number(managerRow.payout_subtotal || 0) !== totalPayout) {
      console.warn('[Admin] 정산 상세 합계(' + totalPayout + ')가 요약 표의 정산대상액(' + managerRow.payout_subtotal +
        ')과 다릅니다 — admin_manager_monthly_settlements() 와 admin_manager_monthly_settlement_details() 의 WHERE 조건이 어긋났을 수 있습니다.');
    }
  }
  if (els.settlementMonthInput) {
    els.settlementMonthInput.value = currentYearMonthValue();
    console.log('[Admin] settlementMonthInput 요소를 찾았습니다. 초기값=' + els.settlementMonthInput.value +
      ', tagName=' + els.settlementMonthInput.tagName + ', type=' + els.settlementMonthInput.type);
    els.settlementMonthInput.addEventListener('change', function (e: any) {
      console.log('[Admin] settlementMonthInput change 이벤트 발생 — 새로 선택한 값(e.target.value)=' + e.target.value);
      loadManagerSettlements();
    });
  } else {
    console.warn('[Admin] #settlementMonthInput 요소를 찾지 못했습니다 — admin.html 의 id 를 확인하세요. ' +
      '월 선택 없이 항상 "이번 달" 기준으로만 정산이 조회됩니다.');
  }
  let USER_PACKAGE_TYPE_LABEL = { '5_sessions': '5회권', '10_sessions': '10회권', '10_hours': '10시간권', '20_hours': '20시간권' };
  let USER_PACKAGE_STATUS_LABEL = { active: '사용 중', exhausted: '소진', expired: '만료' };
  let USER_PACKAGE_STATUS_BADGE = { active: 'is-payment-done', exhausted: 'is-neutral', expired: 'is-overdue' };
  let lastUserPackagesRows: any[] = [];
  let userPackagesOffset = 0;
  let userPackagesHasMore = false;
  let userPackagesLoadingMore = false;
  let currentUserPackagesSearchText = '';
  let packageAdjustTarget: any = null; // [회차 조정] 모달이 지금 다루고 있는 user_packages 행
  let packageGroupDetailCurrentKey: any = null; // [상세보기] 모달이 지금 열어 둔 그룹의 key(groupUserPackagesByContact 참고) — 회차 조정 뒤 그 모달을 같은 그룹으로 다시 그리기 위해 기억
  function parseUserContact(raw?: any) {
    let s = (raw || '').trim();
    if (!s) return { name: '', phone: '' };
    let sepIdx = s.indexOf(' / ');
    if (sepIdx === -1) return { name: s, phone: '' };
    return { name: s.slice(0, sepIdx).trim(), phone: s.slice(sepIdx + 3).trim() };
  }
  function formatGuardianContactLabel(userContact?: any) {
    let c = parseUserContact(userContact);
    if (!c.name) return '확인 필요';
    return c.name + ' (' + (c.phone || '연락처 미등록') + ')';
  }
  async function fillMissingGuardianContact(pageRows?: any) {
    let missingIds: any[] = [];
    pageRows.forEach(function (p: any) {
      let profile = p.profiles || {};
      if ((!profile.name || !profile.phone) && p.user_id && missingIds.indexOf(p.user_id) === -1) {
        missingIds.push(p.user_id);
      }
    });
    if (!missingIds.length) return;
    let appsRes = await api.listServiceApplications3(supabaseClient, missingIds);
    if (appsRes.error) {
      console.warn('[Admin] 보호자 이름/연락처 보조 조회 실패(service_applications):', appsRes.error.code, appsRes.error.message);
      return;
    }
    let infoById: any = {};
    (appsRes.data || []).forEach(function (a: any) {
      if (!infoById[a.user_id]) infoById[a.user_id] = parseUserContact(a.user_contact); // 최신순 정렬 → 먼저 나온 값 채택
    });
    pageRows.forEach(function (p: any) {
      let fallback = infoById[p.user_id];
      if (!fallback) return;
      if (!p.profiles) p.profiles = {};
      if (!p.profiles.name) p.profiles.name = fallback.name;
      if (!p.profiles.phone) p.profiles.phone = fallback.phone;
    });
  }
  async function fetchUserPackagesPage(isFirstPage?: any) {
    let body = els.userPackagesTableBody;
    if (!body) return false;
    let res = await api.listUserPackages2(supabaseClient, userPackagesOffset, ADMIN_LIST_PAGE_SIZE);
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
    let rawRows = res.data || [];
    userPackagesHasMore = rawRows.length > ADMIN_LIST_PAGE_SIZE;
    let pageRows = rawRows.slice(0, ADMIN_LIST_PAGE_SIZE);
    await fillMissingGuardianContact(pageRows);
    userPackagesOffset += pageRows.length;
    lastUserPackagesRows = lastUserPackagesRows.concat(pageRows);
    return true;
  }
  function groupUserPackagesByContact(rows?: any) {
    let groups: any[] = [];
    let byKey: any = {};
    rows.forEach(function (p: any) {
      let profile = p.profiles || {};
      let phone = normalizeSearchText(profile.phone || '').trim();
      let key = phone ? ('phone:' + phone) : (p.user_id ? ('uid:' + p.user_id) : ('row:' + p.id));
      let g = byKey[key];
      if (!g) {
        g = { key: key, name: '', phone: '', packages: [] };
        byKey[key] = g;
        groups.push(g);
      }
      if (!g.name && profile.name) g.name = profile.name;
      if (!g.phone && profile.phone) g.phone = profile.phone;
      g.packages.push(p);
    });
    groups.forEach(function (g: any) {
      g.totalRemaining = g.packages.reduce(function (sum: any, p: any) { return sum + (Number(p.remaining_count) || 0); }, 0);
      g.totalCount = g.packages.reduce(function (sum: any, p: any) { return sum + (Number(p.total_count) || 0); }, 0);
      g.statusKey = g.packages.some(function (p: any) { return p.status === 'active'; }) ? 'active' :
        g.packages.some(function (p: any) { return p.status === 'exhausted'; }) ? 'exhausted' : 'expired';
    });
    return groups;
  }
  function renderUserPackageGroupRow(g?: any) {
    let tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="settle-manager-name">' + escapeHtml(g.name || '이름 미등록') + '</span>' +
        '<span class="settle-manager-phone">' + escapeHtml(g.phone || '연락처 미등록') + '</span></td>' +
      '<td>' + g.packages.length + '건</td>' +
      '<td>' + formatPkgCount(g.totalRemaining) + ' / ' + formatPkgCount(g.totalCount) + '회</td>' +
      '<td><span class="admin-badge ' + (USER_PACKAGE_STATUS_BADGE[g.statusKey] || 'is-neutral') + '">' + escapeHtml(USER_PACKAGE_STATUS_LABEL[g.statusKey]) + '</span></td>' +
      '<td><button type="button" class="admin-btn is-ghost pkg-detail-btn">상세보기</button></td>';
    tr.querySelector<any>('.pkg-detail-btn').addEventListener('click', function () { openPackageGroupDetailModal(g); });
    return tr;
  }
  function renderUserPackagesList() {
    let body = els.userPackagesTableBody;
    if (!body) return;
    let rows = lastUserPackagesRows.filter(function (p: any) {
      if (!currentUserPackagesSearchText) return true;
      let profile = p.profiles || {};
      return normalizeSearchText(profile.name).indexOf(currentUserPackagesSearchText) !== -1 ||
             normalizeSearchText(profile.phone).indexOf(currentUserPackagesSearchText) !== -1;
    });
    let groups = groupUserPackagesByContact(rows);
    if (els.userPackagesCount) {
      els.userPackagesCount.textContent = groups.length + '명 (' + rows.length + '건)';
      els.userPackagesCount.hidden = false;
    }
    if (!groups.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">' +
        (lastUserPackagesRows.length ? '조건에 맞는 회원이 없습니다.' : '등록된 패키지가 없습니다.') + '</td></tr>';
    } else {
      body.innerHTML = '';
      groups.forEach(function (g: any) { body.appendChild(renderUserPackageGroupRow(g)); });
    }
    if (els.userPackagesShowMoreWrap) {
      els.userPackagesShowMoreWrap.innerHTML = '';
      if (userPackagesHasMore) {
        els.userPackagesShowMoreWrap.appendChild(createLoadMoreButton(userPackagesLoadingMore, loadMoreUserPackages));
      }
    }
    if (packageGroupDetailCurrentKey && els.packageGroupDetailModal && !els.packageGroupDetailModal.hidden) {
      let reopened = groups.filter(function (g: any) { return g.key === packageGroupDetailCurrentKey; })[0];
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
    let body = els.userPackagesTableBody;
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
  function renderPackageGroupDetailModal(g?: any) {
    if (els.packageGroupDetailModalTitle) els.packageGroupDetailModalTitle.textContent = (g.name || '이름 미등록') + ' 패키지 상세';
    if (els.packageGroupDetailModalSub) {
      els.packageGroupDetailModalSub.textContent = (g.phone || '연락처 미등록') + ' · 보유 패키지 ' + g.packages.length +
        '건 · 총 잔여 ' + formatPkgCount(g.totalRemaining) + ' / ' + formatPkgCount(g.totalCount) + '회';
    }
    let body = els.packageGroupDetailTableBody;
    if (!body) return;
    body.innerHTML = '';
    g.packages.forEach(function (p: any) {
      let statusKey = USER_PACKAGE_STATUS_LABEL.hasOwnProperty(p.status) ? p.status : 'active';
      let tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(USER_PACKAGE_TYPE_LABEL[p.package_type] || p.package_type || '-') + '</td>' +
        '<td>' + escapeHtml(formatDateOnly(p.created_at)) + '</td>' +
        '<td>' + escapeHtml(formatDateOnly(p.expires_at)) + '</td>' +
        '<td>' + formatPkgCount(p.remaining_count) + ' / ' + formatPkgCount(p.total_count) + '회</td>' +
        '<td><span class="admin-badge ' + (USER_PACKAGE_STATUS_BADGE[statusKey] || 'is-neutral') + '">' + escapeHtml(USER_PACKAGE_STATUS_LABEL[statusKey]) + '</span></td>' +
        '<td><button type="button" class="admin-btn is-ghost pkg-detail-adjust-btn">회차 조정</button></td>';
      tr.querySelector<any>('.pkg-detail-adjust-btn').addEventListener('click', function () { openPackageAdjustModal(p); });
      body.appendChild(tr);
    });
  }
  function openPackageGroupDetailModal(g?: any) {
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
    els.packageGroupDetailModal.addEventListener('mousedown', function (e: any) {
      if (e.target === els.packageGroupDetailModal) closePackageGroupDetailModal();
    });
    document.addEventListener('keydown', function (e: any) {
      if (e.key === 'Escape' && !els.packageGroupDetailModal.hidden) closePackageGroupDetailModal();
    });
  }
  if (els.packageGroupDetailCloseBtn) els.packageGroupDetailCloseBtn.addEventListener('click', closePackageGroupDetailModal);
  if (els.packageGroupDetailCloseBtn2) els.packageGroupDetailCloseBtn2.addEventListener('click', closePackageGroupDetailModal);
  function openPackageAdjustModal(p?: any) {
    packageAdjustTarget = p;
    let profile = p.profiles || {};
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
    els.packageAdjustModal.addEventListener('mousedown', function (e: any) { if (e.target === els.packageAdjustModal) closePackageAdjustModal(); });
  }
  if (els.packageAdjustConfirmBtn) {
    els.packageAdjustConfirmBtn.addEventListener('click', async function () {
      if (!packageAdjustTarget) return;
      function showAdjustError(msg?: any) {
        if (els.packageAdjustError) { els.packageAdjustError.textContent = msg; els.packageAdjustError.hidden = false; }
      }
      let deltaRaw = (els.packageAdjustDeltaInput && els.packageAdjustDeltaInput.value || '').trim();
      let delta = Number(deltaRaw);
      let memo = (els.packageAdjustMemoInput && els.packageAdjustMemoInput.value || '').trim();
      if (!deltaRaw || isNaN(delta) || delta === 0) { showAdjustError('조정할 회차를 0이 아닌 숫자로 입력하세요 (예: 1 또는 -0.5).'); return; }
      if (!memo) { showAdjustError('사유 메모를 입력하세요.'); return; }
      if (els.packageAdjustError) els.packageAdjustError.hidden = true;
      let btn = els.packageAdjustConfirmBtn;
      let prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = '처리 중…';
      let res = await api.adminAdjustUserPackage(supabaseClient, packageAdjustTarget, delta, memo);
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
  let MEMBER_PROVIDER_LABEL = { email: '이메일', kakao: '카카오' };
  let MEMBERS_PAGE_SIZE = 10;
  let lastMembersRows: any[] = [];
  let membersTotalCount = 0;
  let membersPage = 1; // 1-based
  let currentMemberSearchText = '';
  let currentMemberProviderFilter = 'all';  // all | email | kakao
  let currentMemberVerifiedFilter = 'all';  // all | verified | unverified
  let memberSearchDebounceTimer: any = null;
  function isMemberSuspended(m?: any) {
    return !!(m.banned_until && new Date(m.banned_until).getTime() > Date.now());
  }
  async function fetchMembersPage(page?: any) {
    let res = await api.adminListMembers(supabaseClient, MEMBERS_PAGE_SIZE, page, currentMemberSearchText, currentMemberProviderFilter, currentMemberVerifiedFilter);
    if (res.error) {
      console.error('[Admin] 회원 목록 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_member_management.sql 을 Supabase SQL Editor 에서 실행했는지, 이 계정의 profiles.role 이 \'admin\' 인지 확인하세요.');
      return { rows: [], total: 0, error: res.error };
    }
    let rows = res.data || [];
    let total = rows.length ? Number(rows[0].total_count || 0) : 0;
    return { rows: rows, total: total, error: null };
  }
  function renderMemberRow(m?: any) {
    let verified = !!m.email_confirmed_at;
    let suspended = isMemberSuspended(m);
    let providerLabel = MEMBER_PROVIDER_LABEL[m.provider] || m.provider || '-';
    let tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(m.name || '이름 미등록') + '</td>' +
      '<td>' + escapeHtml(m.phone || '미등록') + '</td>' +
      '<td>' + escapeHtml(m.email || '-') + '</td>' +
      '<td><span class="admin-badge is-neutral">' + escapeHtml(providerLabel) + '</span></td>' +
      '<td><span class="admin-badge ' + (verified ? 'is-verified' : 'is-cancelled') + '">' + (verified ? '인증' : '미인증') + '</span></td>' +
      '<td><span class="admin-badge ' + (suspended ? 'is-suspended' : 'is-active-account') + '">' + (suspended ? '정지' : '정상') + '</span></td>' +
      '<td>' + escapeHtml(formatDateOnly(m.created_at)) + '</td>' +
      '<td><button type="button" class="admin-btn is-ghost member-detail-btn">상세 보기</button></td>';
    tr.querySelector<any>('.member-detail-btn').addEventListener('click', function () { openMemberDetailModal(m); });
    return tr;
  }
  function renderMembersPagination(totalPages?: any) {
    let wrap = els.membersPaginationWrap;
    if (!wrap) return;
    if (totalPages <= 1) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = '';
    function addPageBtn(label?: any, page?: any, opts?: any) {
      opts = opts || {};
      let btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-page-btn' + (opts.active ? ' is-active' : '');
      btn.textContent = label;
      if (opts.disabled || opts.active) btn.disabled = true;
      if (!opts.disabled && !opts.active) btn.addEventListener('click', function () { goToMembersPage(page); });
      wrap.appendChild(btn);
    }
    addPageBtn('‹ 이전', membersPage - 1, { disabled: membersPage <= 1 });
    let windowStart = Math.max(1, membersPage - 2);
    let windowEnd = Math.min(totalPages, membersPage + 2);
    if (windowStart > 1) {
      addPageBtn('1', 1, { active: false });
      if (windowStart > 2) {
        let ell1 = document.createElement('span');
        ell1.className = 'admin-page-ellipsis';
        ell1.textContent = '…';
        wrap.appendChild(ell1);
      }
    }
    for (let p = windowStart; p <= windowEnd; p++) addPageBtn(String(p), p, { active: p === membersPage });
    if (windowEnd < totalPages) {
      if (windowEnd < totalPages - 1) {
        let ell2 = document.createElement('span');
        ell2.className = 'admin-page-ellipsis';
        ell2.textContent = '…';
        wrap.appendChild(ell2);
      }
      addPageBtn(String(totalPages), totalPages, { active: false });
    }
    addPageBtn('다음 ›', membersPage + 1, { disabled: membersPage >= totalPages });
  }
  function renderMembersList() {
    let body = els.membersTableBody;
    if (!body) return;
    if (els.membersCount) {
      els.membersCount.textContent = membersTotalCount + '명';
      els.membersCount.hidden = false;
    }
    if (!lastMembersRows.length) {
      body.innerHTML = '<tr><td colspan="8" class="admin-empty">조건에 맞는 회원이 없습니다.</td></tr>';
    } else {
      body.innerHTML = '';
      lastMembersRows.forEach(function (m: any) { body.appendChild(renderMemberRow(m)); });
    }
    renderMembersPagination(Math.max(1, Math.ceil(membersTotalCount / MEMBERS_PAGE_SIZE)));
    if (memberDetailTarget && els.memberDetailModal && !els.memberDetailModal.hidden) {
      let reopened = lastMembersRows.filter(function (m: any) { return m.id === memberDetailTarget.id; })[0];
      if (reopened) { memberDetailTarget = reopened; renderMemberDetailInfo(reopened); }
    }
  }
  async function goToMembersPage(page?: any) {
    if (page < 1) return;
    membersPage = page;
    await loadMembers();
    if (els.membersTable) els.membersTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function loadMembers() {
    let body = els.membersTableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8" class="admin-loading">불러오는 중…</td></tr>';
    let result = await fetchMembersPage(membersPage);
    if (result.error) {
      body.innerHTML = '<tr><td colspan="8" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(result.error.message) + '</td></tr>';
      if (els.membersPaginationWrap) els.membersPaginationWrap.hidden = true;
      return;
    }
    lastMembersRows = result.rows;
    membersTotalCount = result.total;
    renderMembersList();
  }
  if (els.membersSearchInput) {
    els.membersSearchInput.addEventListener('input', function () {
      clearTimeout(memberSearchDebounceTimer);
      memberSearchDebounceTimer = setTimeout(function () {
        currentMemberSearchText = els.membersSearchInput.value.trim();
        membersPage = 1;
        loadMembers();
      }, 300);
    });
  }
  function bindMemberFilterChips(group?: any, attr?: any, applyFilter?: any) {
    if (!group) return;
    group.addEventListener('click', function (e: any) {
      let btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      let value = btn.getAttribute(attr);
      applyFilter(value);
      Array.prototype.forEach.call(group.querySelectorAll<any>('.admin-filter-chip'), function (chip: any) {
        chip.classList.toggle('is-active', chip === btn);
      });
      membersPage = 1;
      loadMembers();
    });
  }
  bindMemberFilterChips(els.membersProviderFilter, 'data-provider', function (v: any) { currentMemberProviderFilter = v; });
  bindMemberFilterChips(els.membersVerifiedFilter, 'data-verified', function (v: any) { currentMemberVerifiedFilter = v; });
  function csvEscape(value?: any) {
    let s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  async function exportMembersToCsv() {
    let btn = els.membersExportBtn;
    if (!btn) return;
    btn.disabled = true;
    let originalLabel = btn.textContent;
    btn.textContent = '다운로드 준비 중…';
    try {
      let allRows: any[] = [];
      let batchSize = 500;
      for (let offset = 0; ; offset += batchSize) {
        let res = await api.adminListMembers2(supabaseClient, batchSize, offset, currentMemberSearchText, currentMemberProviderFilter, currentMemberVerifiedFilter);
        if (res.error) {
          console.error('[Admin] 회원 목록 CSV 조회 실패:', res.error.code, res.error.message);
          showToast('엑셀 다운로드에 실패했습니다: ' + res.error.message);
          return;
        }
        let batch = res.data || [];
        allRows = allRows.concat(batch);
        if (batch.length < batchSize) break;
      }
      if (!allRows.length) {
        showToast('다운로드할 회원이 없습니다(현재 검색/필터 조건에 맞는 회원이 없음).');
        return;
      }
      let header = ['이름', '휴대폰 번호', '이메일', '가입 수단', '이메일 인증', '계정 상태', '가입일자', '주소'];
      let lines = [header.map(csvEscape).join(',')];
      allRows.forEach(function (m: any) {
        let addressText = [m.address, m.address_detail].filter(Boolean).join(' ');
        lines.push([
          m.name || '이름 미등록',
          m.phone || '미등록',
          m.email || '-',
          MEMBER_PROVIDER_LABEL[m.provider] || m.provider || '-',
          m.email_confirmed_at ? '인증' : '미인증',
          isMemberSuspended(m) ? '정지' : '정상',
          formatDateOnly(m.created_at),
          addressText || ''
        ].map(csvEscape).join(','));
      });
      let csvContent = '﻿' + lines.join('\r\n');
      let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url;
      a.download = '위드브릿지_회원목록_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(allRows.length + '명의 회원 목록을 내려받았습니다.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
  if (els.membersExportBtn) els.membersExportBtn.addEventListener('click', exportMembersToCsv);
  let MEMBER_BOOKING_STATUS_LABEL = {
    pending: '대기', payment_pending: '입금대기', matching_pending: '매칭대기',
    assigned: '배정됨', in_progress: '진행중', completed: '완료', cancelled: '취소'
  };
  let MEMBER_PACKAGE_TYPE_LABEL = { '5_sessions': '5회권', '10_sessions': '10회권', '10_hours': '10시간권', '20_hours': '20시간권' };
  let memberDetailTarget: any = null;
  let memberEditMode = false;
  function explainPermissionError(msg?: any) {
    if (msg && String(msg).indexOf('CANNOT_MANAGE_SUPER_ADMIN') !== -1) {
      return '최고관리자 계정은 최고관리자만 변경할 수 있습니다.';
    }
    return msg;
  }
  function showMemberActionError(msg?: any) {
    msg = explainPermissionError(msg);
    if (els.memberActionSuccess) els.memberActionSuccess.hidden = true;
    let el = els.memberActionError;
    if (!el) return;
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function showMemberActionSuccess(msg?: any) {
    if (els.memberActionError) els.memberActionError.hidden = true;
    let el = els.memberActionSuccess;
    if (!el) return;
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function renderMemberDetailInfo(m?: any) {
    let suspended = isMemberSuspended(m);
    if (els.memberDetailModalTitle) els.memberDetailModalTitle.textContent = (m.name || '이름 미등록') + ' 회원 상세';
    let verified = !!m.email_confirmed_at;
    if (els.memberDetailModalSub) {
      els.memberDetailModalSub.textContent =
        (MEMBER_PROVIDER_LABEL[m.provider] || m.provider || '-') + ' 가입 · ' + (verified ? '이메일 인증 완료' : '이메일 미인증') +
        ' · 가입일 ' + formatDateOnly(m.created_at);
    }
    if (els.memberDetailInfoGrid) {
      let addressText = [m.address, m.address_detail].filter(Boolean).join(' ');
      els.memberDetailInfoGrid.innerHTML =
        '<dt>이름</dt><dd>' + escapeHtml(m.name || '이름 미등록') + '</dd>' +
        '<dt>휴대폰</dt><dd>' + escapeHtml(m.phone || '미등록') + '</dd>' +
        '<dt>이메일</dt><dd>' + escapeHtml(m.email || '-') + '</dd>' +
        '<dt>계정 상태</dt><dd><span class="admin-badge ' + (suspended ? 'is-suspended' : 'is-active-account') + '">' + (suspended ? '정지됨' : '정상') + '</span></dd>' +
        '<dt>주소지</dt><dd>' + escapeHtml(addressText || '등록된 주소 없음') + '</dd>';
    }
    if (els.memberToggleStatusBtn) {
      els.memberToggleStatusBtn.textContent = suspended ? '계정 활성화' : '계정 정지';
      els.memberToggleStatusBtn.classList.toggle('is-danger', !suspended);
      els.memberToggleStatusBtn.classList.toggle('is-ghost', suspended);
    }
  }
  function closeMemberEditForm() {
    memberEditMode = false;
    if (els.memberEditForm) els.memberEditForm.hidden = true;
    if (els.memberEditError) els.memberEditError.hidden = true;
    if (els.memberEditSuccess) els.memberEditSuccess.hidden = true;
  }
  function openMemberEditForm(m?: any) {
    if (!els.memberEditForm) return;
    memberEditMode = true;
    if (els.memberEditName) els.memberEditName.value = m.name || '';
    if (els.memberEditPhone) els.memberEditPhone.value = m.phone || '';
    if (els.memberEditAddress) els.memberEditAddress.value = m.address || '';
    if (els.memberEditAddressDetail) els.memberEditAddressDetail.value = m.address_detail || '';
    if (els.memberEditError) els.memberEditError.hidden = true;
    if (els.memberEditSuccess) els.memberEditSuccess.hidden = true;
    els.memberEditForm.hidden = false;
    els.memberEditForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveMemberEdit() {
    if (!memberDetailTarget) return;
    let name = (els.memberEditName && els.memberEditName.value || '').trim();
    let phone = (els.memberEditPhone && els.memberEditPhone.value || '').trim();
    let address = (els.memberEditAddress && els.memberEditAddress.value || '').trim();
    let addressDetail = (els.memberEditAddressDetail && els.memberEditAddressDetail.value || '').trim();
    function showEditError(msg?: any) {
      msg = explainPermissionError(msg);
      if (els.memberEditSuccess) els.memberEditSuccess.hidden = true;
      if (els.memberEditError) { els.memberEditError.textContent = msg; els.memberEditError.hidden = false; }
    }
    function showEditSuccess(msg?: any) {
      if (els.memberEditError) els.memberEditError.hidden = true;
      if (els.memberEditSuccess) { els.memberEditSuccess.textContent = msg; els.memberEditSuccess.hidden = false; }
    }
    if (els.memberEditError) els.memberEditError.hidden = true;
    if (els.memberEditSuccess) els.memberEditSuccess.hidden = true;
    if (!name) return showEditError('이름을 입력해 주세요.');
    let saveBtn = els.memberEditSaveBtn;
    let originalLabel = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
    try {
      let res = await api.adminUpdateMemberProfile(supabaseClient, memberDetailTarget, name, phone, address, addressDetail);
      if (res.error) {
        console.error('[Admin] 회원 정보 수정 실패:', res.error.code, res.error.message,
          '→ sql/admin_member_management.sql 의 admin_update_member_profile() 이 적용돼 있는지 확인하세요.');
        showEditError(res.error.message);
        return;
      }
      showEditSuccess('✅ 회원 정보가 저장되었습니다.');
      showToast('회원 정보를 수정했습니다.');
      await loadMembers(); // 목록 재조회 — 성공 후 renderMembersList() 가 모달 상단 정보도 함께 갱신
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalLabel; }
    }
  }
  if (els.memberEditToggleBtn) {
    els.memberEditToggleBtn.addEventListener('click', function () {
      if (!memberDetailTarget) return;
      if (memberEditMode) { closeMemberEditForm(); } else { openMemberEditForm(memberDetailTarget); }
    });
  }
  if (els.memberEditCancelBtn) els.memberEditCancelBtn.addEventListener('click', closeMemberEditForm);
  if (els.memberEditSaveBtn) els.memberEditSaveBtn.addEventListener('click', saveMemberEdit);
  async function loadMemberDetailNotes(userId?: any) {
    let box = els.memberNotesList;
    if (!box) return;
    box.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let res = await api.listAdminMemberNotes(supabaseClient, userId);
    if (res.error) {
      console.error('[Admin] CS 메모 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_member_management.sql 의 admin_member_notes 테이블/정책이 적용돼 있는지 확인하세요.');
      box.innerHTML = '<p class="admin-empty">메모를 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</p>';
      return;
    }
    let rows = res.data || [];
    if (!rows.length) {
      box.innerHTML = '<p class="admin-empty">작성된 CS 메모가 없습니다.</p>';
      return;
    }
    box.innerHTML = '';
    rows.forEach(function (n: any) {
      let adminName = (n.profiles && n.profiles.name) || '관리자';
      let item = document.createElement('div');
      item.className = 'admin-note-item';
      item.innerHTML =
        '<span class="admin-note-item-meta">' + escapeHtml(adminName) + ' · ' + escapeHtml(formatDateTime(n.created_at)) + '</span>' +
        '<span>' + escapeHtml(n.note) + '</span>';
      box.appendChild(item);
    });
  }
  async function saveMemberNote() {
    if (!memberDetailTarget || !els.memberNoteInput) return;
    let note = els.memberNoteInput.value.trim();
    if (!note) { showToast('메모 내용을 입력해 주세요.'); return; }
    let btn = els.memberNoteSaveBtn;
    if (btn) btn.disabled = true;
    try {
      let res = await api.adminAddMemberNote(supabaseClient, memberDetailTarget, note);
      if (res.error) {
        console.error('[Admin] CS 메모 저장 실패:', res.error.code, res.error.message);
        showToast('메모 저장에 실패했습니다: ' + res.error.message);
        return;
      }
      els.memberNoteInput.value = '';
      await loadMemberDetailNotes(memberDetailTarget.id);
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  if (els.memberNoteSaveBtn) els.memberNoteSaveBtn.addEventListener('click', saveMemberNote);
  async function loadMemberDetailSeniors(userId?: any) {
    let box = els.memberSeniorsList;
    if (!box) return;
    box.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let res = await api.listSeniors(supabaseClient, userId);
    if (res.error) {
      console.error('[Admin] 등록된 어르신 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_member_management.sql 의 seniors_select_admin 정책이 적용돼 있는지 확인하세요.');
      box.innerHTML = '<p class="admin-empty">어르신 정보를 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</p>';
      return;
    }
    let rows = res.data || [];
    if (!rows.length) {
      box.innerHTML = '<p class="admin-empty">등록된 어르신이 없습니다.</p>';
      return;
    }
    box.innerHTML = '<div class="admin-mini-list"></div>';
    let list = box.querySelector<any>('.admin-mini-list');
    rows.forEach(function (s: any) {
      let age: any = null;
      if (s.senior_birth) {
        let birth = new Date(s.senior_birth);
        if (!isNaN(birth.getTime())) {
          let today = new Date();
          age = today.getFullYear() - birth.getFullYear();
          if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
        }
      }
      let metaParts = [age != null ? '만 ' + age + '세' : '연령 미입력'];
      if (s.gender) metaParts.push(s.gender);
      if (s.mobility_level) metaParts.push(s.mobility_level);
      let item = document.createElement('div');
      item.className = 'admin-mini-item';
      item.innerHTML =
        '<span class="admin-mini-item-title">' + escapeHtml(s.senior_name || '(이름 없음)') + '</span>' +
        '<span class="admin-mini-item-sub">' + escapeHtml(metaParts.join(' · ')) + (s.senior_phone ? ' · ' + escapeHtml(s.senior_phone) : '') + '</span>';
      list.appendChild(item);
    });
  }
  let COUPON_STATUS_LABEL = { active: '사용 가능', used: '사용됨', expired: '만료' };
  let PACKAGE_STATUS_LABEL = { active: '사용 중', exhausted: '소진', expired: '만료' };
  let memberDetailPackages: any[] = [];
  function renderMemberDeductPackageOptions() {
    let select = els.memberDeductPackageSelect;
    if (!select) return;
    select.innerHTML = '';
    let adjustable = memberDetailPackages.filter(function (p: any) { return Number(p.remaining_count) > 0; });
    if (!adjustable.length) {
      let opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '차감할 수 있는 패키지가 없습니다';
      select.appendChild(opt);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    adjustable.forEach(function (p: any) {
      let opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (MEMBER_PACKAGE_TYPE_LABEL[p.package_type] || p.package_type) +
        ' (잔여 ' + formatPkgCount(p.remaining_count) + ' / ' + formatPkgCount(p.total_count) + ')';
      select.appendChild(opt);
    });
  }
  async function loadMemberDetailBenefits(userId?: any) {
    let box = els.memberBenefitsList;
    if (!box) return;
    box.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let couponsRes = await api.listUserCoupons(supabaseClient, userId);
    let packagesRes = await api.listUserPackages3(supabaseClient, userId);
    if (couponsRes.error || packagesRes.error) {
      console.error('[Admin] 쿠폰/패키지 조회 실패:', (couponsRes.error || packagesRes.error).message,
        '→ sql/admin_member_management.sql 의 user_coupons_select_admin 정책이 적용돼 있는지 확인하세요.');
      box.innerHTML = '<p class="admin-empty">쿠폰/패키지 정보를 불러오지 못했습니다.</p>';
      memberDetailPackages = [];
      renderMemberDeductPackageOptions();
      return;
    }
    let coupons = couponsRes.data || [];
    let packages = packagesRes.data || [];
    memberDetailPackages = packages;
    renderMemberDeductPackageOptions();
    if (!coupons.length && !packages.length) {
      box.innerHTML = '<p class="admin-empty">보유한 쿠폰/패키지가 없습니다.</p>';
      return;
    }
    box.innerHTML = '<div class="admin-mini-list"></div>';
    let list = box.querySelector<any>('.admin-mini-list');
    coupons.forEach(function (c: any) {
      let item = document.createElement('div');
      item.className = 'admin-mini-item';
      item.innerHTML =
        '<div class="admin-mini-item-info">' +
          '<span class="admin-mini-item-title">쿠폰 · ' + won(c.amount) + '</span>' +
          '<span class="admin-mini-item-sub">' + escapeHtml(COUPON_STATUS_LABEL[c.status] || c.status || '-') +
          ' · ' + formatDateOnly(c.expires_at) + ' 까지</span>' +
        '</div>' +
        '<button type="button" class="admin-mini-item-delete" data-coupon-id="' + escapeHtml(c.id) + '">삭제</button>';
      item.querySelector<any>('.admin-mini-item-delete').addEventListener('click', function () { deleteMemberCoupon(c.id); });
      list.appendChild(item);
    });
    packages.forEach(function (p: any) {
      let item = document.createElement('div');
      item.className = 'admin-mini-item';
      item.innerHTML =
        '<div class="admin-mini-item-info">' +
          '<span class="admin-mini-item-title">' + escapeHtml(MEMBER_PACKAGE_TYPE_LABEL[p.package_type] || p.package_type) + '</span>' +
          '<span class="admin-mini-item-sub">잔여 ' + formatPkgCount(p.remaining_count) + ' / ' + formatPkgCount(p.total_count) +
          ' · ' + escapeHtml(PACKAGE_STATUS_LABEL[p.status] || p.status || '-') +
          ' · ' + formatDateOnly(p.expires_at) + ' 까지</span>' +
        '</div>';
      list.appendChild(item);
    });
  }
  let MEMBER_BENEFIT_FORMS = ['memberGrantCouponForm', 'memberGrantPackageForm', 'memberDeductPackageForm'];
  let MEMBER_BENEFIT_MEMO_MIN_LENGTH = 10;
  let MEMBER_GRANT_PACKAGE_SESSION_COUNT = { '10_hours': 5, '20_hours': 10 };
  function updateGrantPackageSessionHint() {
    let select = els.memberGrantPackageType;
    let hint = els.memberGrantPackageSessionHint;
    if (!select || !hint) return;
    let packageType = select.value;
    let sessionCount = MEMBER_GRANT_PACKAGE_SESSION_COUNT[packageType];
    let label = MEMBER_PACKAGE_TYPE_LABEL[packageType] || packageType;
    hint.textContent = sessionCount != null
      ? label + ' 선택 시 ' + formatPkgCount(sessionCount) + '회가 자동으로 지급됩니다.'
      : label + ' 의 회차 수를 확인할 수 없습니다.';
  }
  if (els.memberGrantPackageType) {
    els.memberGrantPackageType.addEventListener('change', updateGrantPackageSessionHint);
  }
  function closeAllBenefitForms() {
    MEMBER_BENEFIT_FORMS.forEach(function (key: any) { if (els[key]) els[key].hidden = true; });
  }
  function toggleBenefitForm(formKey?: any) {
    let alreadyOpen = els[formKey] && !els[formKey].hidden;
    closeAllBenefitForms();
    if (!alreadyOpen && els[formKey]) {
      els[formKey].hidden = false;
      if (formKey === 'memberGrantPackageForm') updateGrantPackageSessionHint();
    }
  }
  if (els.memberGrantCouponToggleBtn) els.memberGrantCouponToggleBtn.addEventListener('click', function () { toggleBenefitForm('memberGrantCouponForm'); });
  if (els.memberGrantPackageToggleBtn) els.memberGrantPackageToggleBtn.addEventListener('click', function () { toggleBenefitForm('memberGrantPackageForm'); });
  if (els.memberDeductPackageToggleBtn) els.memberDeductPackageToggleBtn.addEventListener('click', function () { toggleBenefitForm('memberDeductPackageForm'); });
  if (els.memberGrantCouponCancelBtn) els.memberGrantCouponCancelBtn.addEventListener('click', closeAllBenefitForms);
  if (els.memberGrantPackageCancelBtn) els.memberGrantPackageCancelBtn.addEventListener('click', closeAllBenefitForms);
  if (els.memberDeductPackageCancelBtn) els.memberDeductPackageCancelBtn.addEventListener('click', closeAllBenefitForms);
  function showBenefitFormError(errorEl?: any, msg?: any) {
    if (!errorEl) return;
    msg = explainPermissionError(msg);
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  if (els.memberGrantCouponConfirmBtn) {
    els.memberGrantCouponConfirmBtn.addEventListener('click', async function () {
      if (!memberDetailTarget) return;
      if (els.memberGrantCouponError) els.memberGrantCouponError.hidden = true;
      let amount = Number((els.memberGrantCouponAmount && els.memberGrantCouponAmount.value || '').trim());
      let memo = (els.memberGrantCouponMemo && els.memberGrantCouponMemo.value || '').trim();
      if (!amount || amount <= 0) return showBenefitFormError(els.memberGrantCouponError, '지급 금액을 1원 이상으로 입력해 주세요.');
      if (memo.length < MEMBER_BENEFIT_MEMO_MIN_LENGTH) return showBenefitFormError(els.memberGrantCouponError, '지급 사유를 ' + MEMBER_BENEFIT_MEMO_MIN_LENGTH + '자 이상 입력해 주세요.');
      let btn = els.memberGrantCouponConfirmBtn;
      btn.disabled = true;
      try {
        let res = await api.adminGrantMemberCoupon(supabaseClient, memberDetailTarget, amount, memo);
        if (res.error) {
          console.error('[Admin] 쿠폰 수동 지급 실패:', res.error.code, res.error.message,
            '→ sql/admin_member_benefit_grants.sql 의 admin_grant_member_coupon() 이 적용돼 있는지 확인하세요.');
          showBenefitFormError(els.memberGrantCouponError, '지급에 실패했습니다: ' + res.error.message);
          return;
        }
        closeAllBenefitForms();
        if (els.memberGrantCouponAmount) els.memberGrantCouponAmount.value = '';
        if (els.memberGrantCouponMemo) els.memberGrantCouponMemo.value = '';
        showToast(won(amount) + ' 쿠폰을 지급했습니다.');
        await loadMemberDetailBenefits(memberDetailTarget.id);
      } finally {
        btn.disabled = false;
      }
    });
  }
  if (els.memberGrantPackageConfirmBtn) {
    els.memberGrantPackageConfirmBtn.addEventListener('click', async function () {
      if (!memberDetailTarget) return;
      if (els.memberGrantPackageError) els.memberGrantPackageError.hidden = true;
      let packageType = els.memberGrantPackageType && els.memberGrantPackageType.value;
      let memo = (els.memberGrantPackageMemo && els.memberGrantPackageMemo.value || '').trim();
      if (memo.length < MEMBER_BENEFIT_MEMO_MIN_LENGTH) return showBenefitFormError(els.memberGrantPackageError, '지급 사유를 ' + MEMBER_BENEFIT_MEMO_MIN_LENGTH + '자 이상 입력해 주세요.');
      let btn = els.memberGrantPackageConfirmBtn;
      btn.disabled = true;
      try {
        let res = await api.adminGrantMemberPackage(supabaseClient, memberDetailTarget, packageType, memo);
        if (res.error) {
          console.error('[Admin] 회차 수동 지급 실패:', res.error.code, res.error.message,
            '→ sql/admin_member_benefit_grants.sql 의 admin_grant_member_package() 이 적용돼 있는지 확인하세요.');
          showBenefitFormError(els.memberGrantPackageError, '지급에 실패했습니다: ' + res.error.message);
          return;
        }
        closeAllBenefitForms();
        if (els.memberGrantPackageMemo) els.memberGrantPackageMemo.value = '';
        let granted = res.data; // admin_grant_member_package() 가 반환한 실제 user_packages 행 — 서버가 정한 회차가 그대로 담겨 있음
        showToast((MEMBER_PACKAGE_TYPE_LABEL[packageType] || packageType) + ' ' + formatPkgCount(granted && granted.total_count) + '회차를 지급했습니다.');
        await loadMemberDetailBenefits(memberDetailTarget.id);
      } finally {
        btn.disabled = false;
      }
    });
  }
  if (els.memberDeductPackageConfirmBtn) {
    els.memberDeductPackageConfirmBtn.addEventListener('click', async function () {
      if (!memberDetailTarget) return;
      if (els.memberDeductPackageError) els.memberDeductPackageError.hidden = true;
      let packageId = els.memberDeductPackageSelect && els.memberDeductPackageSelect.value;
      let count = Number((els.memberDeductPackageCount && els.memberDeductPackageCount.value || '').trim());
      let memo = (els.memberDeductPackageMemo && els.memberDeductPackageMemo.value || '').trim();
      if (!packageId) return showBenefitFormError(els.memberDeductPackageError, '차감할 패키지를 선택해 주세요.');
      if (!count || count <= 0) return showBenefitFormError(els.memberDeductPackageError, '차감할 회차 수를 0보다 크게 입력해 주세요.');
      if (memo.length < MEMBER_BENEFIT_MEMO_MIN_LENGTH) return showBenefitFormError(els.memberDeductPackageError, '차감 사유를 ' + MEMBER_BENEFIT_MEMO_MIN_LENGTH + '자 이상 입력해 주세요.');
      let btn = els.memberDeductPackageConfirmBtn;
      btn.disabled = true;
      try {
        let res = await api.adminAdjustMemberSessions(supabaseClient, packageId, count, memo);
        if (res.error) {
          console.error('[Admin] 회차 수동 차감 실패:', res.error.code, res.error.message,
            '→ sql/admin_member_benefit_grants.sql 의 admin_adjust_member_sessions() 이 적용돼 있는지 확인하세요.');
          showBenefitFormError(els.memberDeductPackageError, '차감에 실패했습니다: ' + res.error.message);
          return;
        }
        closeAllBenefitForms();
        if (els.memberDeductPackageCount) els.memberDeductPackageCount.value = '';
        if (els.memberDeductPackageMemo) els.memberDeductPackageMemo.value = '';
        showToast(formatPkgCount(count) + '회차를 차감했습니다.');
        await loadMemberDetailBenefits(memberDetailTarget.id);
      } finally {
        btn.disabled = false;
      }
    });
  }
  async function deleteMemberCoupon(couponId?: any) {
    if (!memberDetailTarget) return;
    let memo = window.prompt('이 쿠폰을 삭제하는 사유를 ' + MEMBER_BENEFIT_MEMO_MIN_LENGTH + '자 이상 입력해 주세요(이력에 저장됩니다).');
    if (memo === null) return; // 취소
    memo = memo.trim();
    if (memo.length < MEMBER_BENEFIT_MEMO_MIN_LENGTH) {
      showToast('사유는 ' + MEMBER_BENEFIT_MEMO_MIN_LENGTH + '자 이상 입력해야 합니다. 삭제가 취소되었습니다.');
      return;
    }
    if (!window.confirm('이 쿠폰을 정말 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')) return;
    let res = await api.adminDeleteMemberCoupon(supabaseClient, couponId, memo);
    if (res.error) {
      console.error('[Admin] 쿠폰 삭제 실패:', res.error.code, res.error.message,
        '→ sql/admin_member_benefit_grants.sql 의 admin_delete_member_coupon() 이 적용돼 있는지 확인하세요.');
      showToast('쿠폰 삭제에 실패했습니다: ' + res.error.message);
      return;
    }
    showToast('쿠폰을 삭제했습니다.');
    await loadMemberDetailBenefits(memberDetailTarget.id);
  }
  async function loadMemberDetailBookings(userId?: any) {
    let body = els.memberDetailBookingsBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';
    let res = await api.listServiceApplications4(supabaseClient, userId);
    if (res.error) {
      console.error('[Admin] 회원 예약 내역 조회 실패:', res.error.code, res.error.message);
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">예약 내역을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    let rows = res.data || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">예약 내역이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = '';
    rows.forEach(function (a: any) {
      let statusLabel = MEMBER_BOOKING_STATUS_LABEL[a.status] || a.status || '-';
      let tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatDateOnly(a.created_at)) + '</td>' +
        '<td>' + escapeHtml(a.service_type || '-') + '</td>' +
        '<td>' + escapeHtml(seniorLabel(a)) + '</td>' +
        '<td><span class="admin-badge is-neutral">' + escapeHtml(statusLabel) + '</span></td>' +
        '<td>' + won(a.final_amount) + '</td>';
      body.appendChild(tr);
    });
  }
  let MEMBER_RESET_PASSWORD_LABEL = '비밀번호 재설정 메일 발송';
  let MEMBER_RESET_PASSWORD_COOLDOWN_SECONDS = 30;
  let memberResetPasswordCooldownTimer: any = null;
  function startMemberResetPasswordCooldown() {
    let btn = els.memberResetPasswordBtn;
    if (!btn) return;
    let secondsLeft = MEMBER_RESET_PASSWORD_COOLDOWN_SECONDS;
    btn.disabled = true;
    btn.textContent = '재발송 가능 (' + secondsLeft + '초)';
    clearInterval(memberResetPasswordCooldownTimer);
    memberResetPasswordCooldownTimer = setInterval(function () {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(memberResetPasswordCooldownTimer);
        memberResetPasswordCooldownTimer = null;
        btn.disabled = false;
        btn.textContent = MEMBER_RESET_PASSWORD_LABEL;
      } else {
        btn.textContent = '재발송 가능 (' + secondsLeft + '초)';
      }
    }, 1000);
  }
  async function sendMemberPasswordReset() {
    if (!memberDetailTarget || !memberDetailTarget.email) {
      showMemberActionError('이 회원은 이메일이 없어 비밀번호 재설정 메일을 보낼 수 없습니다(카카오 가입 등).');
      return;
    }
    showMemberActionError('');
    let btn = els.memberResetPasswordBtn;
    if (btn) { btn.disabled = true; btn.textContent = '발송 중...'; }
    let redirectUrl = window.location.origin + '/reset-password.html';
    let res = await supabaseClient.auth.resetPasswordForEmail(memberDetailTarget.email, { redirectTo: redirectUrl });
    if (res.error) {
      console.error('[Admin] 비밀번호 재설정 메일 발송 실패:', res.error.message);
      showMemberActionError('메일 발송에 실패했습니다: ' + res.error.message);
      if (btn) { btn.disabled = false; btn.textContent = MEMBER_RESET_PASSWORD_LABEL; }
      return;
    }
    showMemberActionSuccess('✅ ' + memberDetailTarget.email + '로 비밀번호 재설정 메일을 발송했습니다. (재발송은 ' +
      MEMBER_RESET_PASSWORD_COOLDOWN_SECONDS + '초 후 다시 가능합니다.)');
    startMemberResetPasswordCooldown(); // 버튼 disabled/라벨은 이 카운트다운이 이어서 관리합니다.
  }
  if (els.memberResetPasswordBtn) els.memberResetPasswordBtn.addEventListener('click', sendMemberPasswordReset);
  async function toggleMemberStatus() {
    if (!memberDetailTarget) return;
    let suspended = isMemberSuspended(memberDetailTarget);
    let action = suspended ? 'activate' : 'suspend';
    let confirmMsg = suspended
      ? (memberDetailTarget.name || '이 회원') + ' 계정을 다시 활성화하시겠습니까?'
      : (memberDetailTarget.name || '이 회원') + ' 계정을 정지하시겠습니까? 정지하면 즉시 로그인할 수 없게 됩니다.';
    if (!window.confirm(confirmMsg)) return;
    showMemberActionError('');
    let btn = els.memberToggleStatusBtn;
    if (btn) btn.disabled = true;
    try {
      if (!WBEdgeFn) {
        showMemberActionError('내부 오류: 계정 정지/활성화 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        return;
      }
      let res = await WBEdgeFn.invoke(supabaseClient, 'admin-set-member-status', {
        user_id: memberDetailTarget.id,
        action: action
      });
      if (res.error) {
        console.error('[Admin] 계정 ' + action + ' 실패:', res.error);
        showMemberActionError('처리에 실패했습니다: ' + (res.error.message || 'UNKNOWN_ERROR'));
        return;
      }
      showToast(action === 'suspend' ? '계정을 정지했습니다.' : '계정을 활성화했습니다.');
      await loadMembers();
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  if (els.memberToggleStatusBtn) els.memberToggleStatusBtn.addEventListener('click', toggleMemberStatus);
  function resetMemberResetPasswordButton() {
    clearInterval(memberResetPasswordCooldownTimer);
    memberResetPasswordCooldownTimer = null;
    if (els.memberResetPasswordBtn) {
      els.memberResetPasswordBtn.disabled = false;
      els.memberResetPasswordBtn.textContent = MEMBER_RESET_PASSWORD_LABEL;
    }
  }
  function openMemberDetailModal(m?: any) {
    if (!els.memberDetailModal) return;
    memberDetailTarget = m;
    closeMemberEditForm();
    closeAllBenefitForms();
    showMemberActionError('');
    resetMemberResetPasswordButton();
    renderMemberDetailInfo(m);
    els.memberDetailModal.hidden = false;
    loadMemberDetailBookings(m.id);
    loadMemberDetailNotes(m.id);
    loadMemberDetailSeniors(m.id);
    loadMemberDetailBenefits(m.id);
  }
  function closeMemberDetailModal() {
    if (els.memberDetailModal) els.memberDetailModal.hidden = true;
    closeMemberEditForm();
    closeAllBenefitForms();
    resetMemberResetPasswordButton();
    memberDetailTarget = null;
  }
  if (els.memberDetailCloseBtn) els.memberDetailCloseBtn.addEventListener('click', closeMemberDetailModal);
  if (els.memberDetailCloseBtn2) els.memberDetailCloseBtn2.addEventListener('click', closeMemberDetailModal);
  if (els.memberDetailModal) {
    els.memberDetailModal.addEventListener('click', function (e: any) {
      if (e.target === els.memberDetailModal) closeMemberDetailModal();
    });
  }
  let PARTNER_INQUIRY_STATUS_LABEL = { new: '접수', contacted: '상담중', closed: '완료' };
  let partnerInquiriesAllRows: any[] = []; // 서버에서 받아온 전체 목록 — 상태 필터는 재조회 없이 이 배열을 걸러서 보여줍니다.
  let currentPartnerInquiryStatusFilter = 'all';
  function renderPartnerInquiryRow(row?: any) {
    let tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(formatDateTime(row.created_at)) + '</td>' +
      '<td>' + escapeHtml(row.org_name || '-') + '</td>' +
      '<td>' + escapeHtml(row.org_type || '-') + '</td>' +
      '<td>' + escapeHtml(row.contact_name || '-') + '</td>' +
      '<td>' + escapeHtml(row.phone || '-') + '</td>' +
      '<td>' + escapeHtml(row.email || '-') + '</td>' +
      '<td class="admin-cell-truncate" title="' + escapeHtml(row.message || '') + '">' + escapeHtml(row.message || '-') + '</td>' +
      '<td></td>';
    let statusCell = tr.lastElementChild;
    let select = document.createElement('select');
    select.className = 'admin-table-select';
    ['new', 'contacted', 'closed'].forEach(function (value: any) {
      let opt = document.createElement('option');
      opt.value = value;
      opt.textContent = PARTNER_INQUIRY_STATUS_LABEL[value];
      if (value === row.status) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      updatePartnerInquiryStatus(row, select.value, select);
    });
    statusCell.appendChild(select);
    return tr;
  }
  async function updatePartnerInquiryStatus(row?: any, newStatus?: any, select?: any) {
    let prevStatus = row.status;
    select.disabled = true;
    let res = await api.updatePartnerInquiries(supabaseClient, newStatus, row);
    if (res.error) {
      console.error('[Admin] 파트너 문의 상태 변경 실패:', res.error.code, res.error.message);
      showToast('처리 상태 변경에 실패했습니다: ' + res.error.message);
      select.value = prevStatus;
      select.disabled = false;
      return;
    }
    row.status = newStatus;
    showToast('처리 상태를 \'' + PARTNER_INQUIRY_STATUS_LABEL[newStatus] + '\'(으)로 변경했습니다.');
    renderPartnerInquiriesList(); // 필터가 걸려 있으면 바뀐 상태가 더 이상 맞지 않는 행은 여기서 바로 빠집니다.
  }
  function renderPartnerInquiriesList() {
    let body = els.partnerInquiriesTableBody;
    if (!body) return;
    let rows = currentPartnerInquiryStatusFilter === 'all'
      ? partnerInquiriesAllRows
      : partnerInquiriesAllRows.filter(function (r: any) { return r.status === currentPartnerInquiryStatusFilter; });
    if (els.partnerInquiriesCount) {
      els.partnerInquiriesCount.textContent = rows.length + '건';
      els.partnerInquiriesCount.hidden = false;
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="admin-empty">' +
        (currentPartnerInquiryStatusFilter === 'all' ? '접수된 제휴 문의가 없습니다.' : '해당 상태의 제휴 문의가 없습니다.') +
        '</td></tr>';
      return;
    }
    body.innerHTML = '';
    rows.forEach(function (row: any) { body.appendChild(renderPartnerInquiryRow(row)); });
  }
  async function loadPartnerInquiries() {
    let body = els.partnerInquiriesTableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8" class="admin-loading">불러오는 중…</td></tr>';
    let res = await api.listPartnerInquiries(supabaseClient);
    if (res.error) {
      console.error('[Admin] 파트너 문의 목록 조회 실패:', res.error.code, res.error.message,
        '→ sql/partner_inquiries.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      body.innerHTML = '<tr><td colspan="8" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    partnerInquiriesAllRows = res.data || [];
    renderPartnerInquiriesList();
  }
  if (els.partnerInquiriesStatusFilter) {
    els.partnerInquiriesStatusFilter.addEventListener('click', function (e: any) {
      let btn = e.target.closest('.admin-filter-chip');
      if (!btn) return;
      currentPartnerInquiryStatusFilter = btn.getAttribute('data-status');
      Array.prototype.forEach.call(els.partnerInquiriesStatusFilter.querySelectorAll<any>('.admin-filter-chip'), function (chip: any) {
        chip.classList.toggle('is-active', chip === btn);
      });
      renderPartnerInquiriesList();
    });
  }
  (async function init() {
    let access = await verifyAdminAccess();
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
    loadMembers();
    loadCareIssues();
    loadPartnerInquiries();
    subscribeServiceApplicationChanges();
    subscribeCareScheduleChanges();
    if (document.visibilityState === 'visible') startPolling(); // 처음 열렸을 때 탭이 보이는 상태면 폴링 안전망도 바로 시작
    supabaseClient.auth.onAuthStateChange(function (event: any) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();


}
