// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 보호자 마이페이지 동작 — 예전 mypage.html 의 인라인 스크립트를 "로직 그대로" 옮긴 것입니다.
// (예약·결제·케어 리포트·어르신 프로필 등 기능이 많아 동작이 달라지지 않도록 줄 단위로 옮김)
// 화면 요소를 id 로 직접 다루는 코드라 타입을 느슨하게(any) 두었습니다. 상태 기반 React 로의 정리는 후속 과제입니다.
// DB 호출은 lib/api/guardian-mypage.ts, 예전 전역 도우미(WBAuth 등)는 lib/browser/legacy-shims.ts 를 거칩니다.
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const, no-var, @typescript-eslint/no-unused-vars */
import { getSupabase } from '@/lib/supabase/client';
import * as api from '@/lib/api/guardian-mypage';
import { createLegacyShims } from '@/lib/browser/legacy-shims';
import { loadScript, SCRIPTS } from '@/lib/browser/load-script';

declare global {
  interface Window {
    daum?: any;
    WBPlaceSearch?: any;
    WBDatePicker?: any;
  }
}

/** 마이페이지 동작을 붙입니다 (공용 위젯 스크립트를 먼저 불러온 뒤 실행). 개발 모드의 이중 실행은 무시합니다. */
export function initGuardianMypage(shimOpts: Parameters<typeof createLegacyShims>[0] = {}): void {
  const root = document.querySelector<HTMLElement>('main.mp-main');
  if (!root || root.dataset.wbInit === '1') return;
  root.dataset.wbInit = '1';
  // 공용 위젯 스크립트(날짜 선택·장소 검색·카카오 우편번호)는 모달을 열 때만 필요하므로 기다리지 않고
  // 화면 동작(로그인 확인·데이터 조회)을 바로 시작합니다. 예전엔 셋 다 받을 때까지 화면 전체가 멈춰 있어
  // 휴대폰에서 카카오 CDN 이 느리면 그만큼 첫 화면이 늦게 떴습니다. 각 사용처가 스크립트 유무를 직접 확인합니다.
  void Promise.allSettled([loadScript(SCRIPTS.datepicker), loadScript(SCRIPTS.placeSearch), loadScript(SCRIPTS.postcode)]);
  run(createLegacyShims(shimOpts));
}

function run({ WBAuth, WBEdgeFn, PortOne, WBPrivacy }: ReturnType<typeof createLegacyShims>): void {
  const $id = (id: string): any => document.getElementById(id);
  (function lockScrollWhileModalOpen() {
    const backdrops = Array.prototype.slice.call(document.querySelectorAll<any>('.modal-backdrop'));
    if (!backdrops.length) return;
    const root = document.documentElement;
    const body = document.body;
    let lockedY: any = null;
    function lock() {
      if (lockedY !== null) return;
      lockedY = window.scrollY || root.scrollTop || 0;
      root.classList.add('wb-modal-open');
      body.style.position = 'fixed';
      body.style.top = -lockedY + 'px';
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }
    function unlock() {
      if (lockedY === null) return;
      const y = lockedY;
      lockedY = null;
      root.classList.remove('wb-modal-open');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo({ top: y, behavior: 'instant' }); // html 의 scroll-behavior:smooth 를 무시하고 제자리로
    }
    function sync() {
      if (backdrops.some((el: any) => !el.hidden)) lock(); else unlock();
    }
    const observer = new MutationObserver(sync);
    backdrops.forEach((el: any) => observer.observe(el, { attributes: true, attributeFilter: ['hidden'] }));
    sync();
  })();
  const supabaseClient: any = getSupabase();
  const DEMO = new URLSearchParams(location.search).has('demo');
  const APPLY_URL = 'apply.html'; // 동행 서비스 신청서 (사이트 안 페이지)
  function demoPhotoDataUri(bg?: any, fg?: any, label?: any) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">' +
      '<rect width="480" height="360" fill="' + bg + '"/>' +
      '<text x="50%" y="50%" font-family="sans-serif" font-size="30" font-weight="700" fill="' + fg + '" text-anchor="middle" dominant-baseline="middle">' + label + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  const DEMO_REPORTS = [
    { report_id: 'demo-1', submitted_at: '2026-09-12T18:20:00+09:00', scheduled_at: '2026-09-12T13:00:00+09:00',
      senior_name: '홍길동 어르신', destination: '서울아산병원 내과', manager_name: '김은지',
      physician_notes: '혈압 132/84 (정상 범위)\n처방약 2주분 수령 완료, 다음 진료는 10월 3일입니다.',
      senior_condition: '식사·보행 양호. 귀가 후 복약 안내까지 마쳤습니다.',
      next_visit_date: '2026-10-03',
      medication_notes: '혈압약(암로디핀) 1일 1회 아침 식후 복용, 2주분 수령.\n어지러움이 느껴지면 복용을 멈추고 병원에 문의하세요.',
      condition_tags: ['#휠체어이동', '#컨디션양호', '#식사완료'],
      photos: [
        { url: demoPhotoDataUri('#ECFDF5', '#059669', '처방전'), label: '처방전' },
        { url: demoPhotoDataUri('#F8FAFC', '#475569', '병원 영수증'), label: '병원 영수증' }
      ] },
    { report_id: 'demo-2', submitted_at: '2026-08-29T17:05:00+09:00', scheduled_at: '2026-08-29T14:00:00+09:00',
      senior_name: '홍길동 어르신', destination: '인하대병원 정형외과', manager_name: '박서준',
      physician_notes: '물리치료 30분 진행.',
      senior_condition: '보행 상태 양호. 다음 방문 전까지 무리한 계단 이용은 피하도록 안내드렸습니다.',
      condition_tags: ['#보행양호', '#물리치료완료'] },
    { report_id: 'demo-3', application_id: 'demo-a5', schedule_id: 'demo-schedule-5', submitted_at: '2026-09-25T09:00:00+09:00', scheduled_at: '2026-09-24T10:00:00+09:00',
      senior_name: '송미자 어르신', destination: '인하대병원 순환기내과', manager_name: '송하늘',
      physician_notes: '심전도 검사 정상, 처방약 4주분 수령.',
      senior_condition: '컨디션 양호. 다음 진료 예약 확인함.', read_at: null,
      next_visit_date: '2026-10-22',
      medication_notes: '항응고제 1일 1회 저녁 식후 복용, 4주분 수령. 멍이 쉽게 들 수 있어 낙상에 주의해 주세요.',
      condition_tags: ['#휠체어이동', '#컨디션양호', '#검사정상'],
      checkpoints: {
        departure: { at: '2026-09-24T09:00:00+09:00', location: { lat: 37.4595, lng: 126.6318, accuracy: 12 }, photo: demoPhotoDataUri('#ECFDF5', '#059669', '출발 인증') },
        hospital_arrival: { at: '2026-09-24T09:35:00+09:00', location: { lat: 37.5270, lng: 127.0276, accuracy: 18 }, photo: demoPhotoDataUri('#ECFDF5', '#059669', '도착 인증') },
        treatment_complete: { at: '2026-09-24T10:20:00+09:00', location: { lat: 37.5270, lng: 127.0276, accuracy: 15 } },
        return_departure: { at: '2026-09-24T10:35:00+09:00' },
        return_complete: { at: '2026-09-24T11:05:00+09:00', photo: demoPhotoDataUri('#F8FAFC', '#475569', '귀가 확인') }
      },
      photos: [
        { url: demoPhotoDataUri('#ECFDF5', '#059669', '처방전'), label: '처방전' },
        { url: demoPhotoDataUri('#F8FAFC', '#475569', '병원 영수증'), label: '병원 영수증' },
        { url: demoPhotoDataUri('#FFFBEB', '#B45309', '대기표'), label: '대기표' }
      ] },
    { report_id: 'demo-4', application_id: 'demo-a6', schedule_id: 'demo-schedule-6', submitted_at: '2026-09-24T15:00:00+09:00', scheduled_at: '2026-09-23T11:00:00+09:00',
      senior_name: '김말순 어르신', destination: '남동구청 민원실', manager_name: '이도현',
      physician_notes: '특이사항 없음.',
      senior_condition: '거동 양호. 서류 발급까지 원활히 완료.', read_at: '2026-09-24T16:00:00+09:00' }
  ];
  let currentUser: any = null;
  function h(tag?: any, className?: any, text?: any) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function svgChevronDown(className?: any) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg class="' + className + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    return wrap.firstElementChild;
  }
  function svgEditIcon() {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .622.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
      '<path d="m15 5 4 4"/></svg>';
    return wrap.firstElementChild;
  }
  function svgDeleteIcon() {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    return wrap.firstElementChild;
  }
  function svgCloseIcon() {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    return wrap.firstElementChild;
  }
  function svgIcon(innerPaths?: any, size?: any) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      innerPaths + '</svg>';
    return wrap.firstElementChild;
  }
  const svgFileIcon = (size: any) => svgIcon(
    '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>' +
    '<path d="M14 3v4a1 1 0 0 0 1 1h4"/>' +
    '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>', size);
  const svgPhoneIcon = (size: any) => svgIcon(
    '<path d="M6.6 10.8a15.7 15.7 0 0 0 6.6 6.6l2.2-2.2a1.3 1.3 0 0 1 1.3-.3c1.2.4 2.5.6 3.8.6a1.3 1.3 0 0 1 1.3 1.3V20a1.3 1.3 0 0 1-1.3 1.3C10.6 21.3 2.7 13.4 2.7 3.5A1.3 1.3 0 0 1 4 2.2h3.2A1.3 1.3 0 0 1 8.5 3.5c0 1.3.2 2.6.6 3.8a1.3 1.3 0 0 1-.3 1.3z"/>', size);
  const svgInboxIcon = (size: any) => svgIcon(
    '<polyline points="3 10 8 10 10 13 14 13 16 10 21 10"/>' +
    '<path d="M5.4 4.6 3 10v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8l-2.4-5.4A2 2 0 0 0 16.8 3H7.2a2 2 0 0 0-1.8 1.6z"/>', size);
  const svgUserIcon = (size: any) => svgIcon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>', size);
  const svgCheckCircleIcon = (size: any) => svgIcon('<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>', size);
  const svgHospitalIcon = (size: any) => svgIcon(
    '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
    '<line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>', size);
  const svgCartIcon = (size: any) => svgIcon(
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
    '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>', size);
  const svgBundleIcon = (size: any) => svgIcon( // 복합(다중) 서비스: 2x2 그리드로 '여러 서비스가 묶여 있음'을 표현
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', size);
  const CATEGORY_ICONS: Record<string, any> = { hospital: svgHospitalIcon, life: svgCartIcon, mixed: svgBundleIcon };
  const svgCalendarIcon = (size: any) => svgIcon(
    '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
    '<line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>', size);
  const svgMapPinIcon = (size: any) => svgIcon(
    '<path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', size);
  const svgActivityIcon = (size: any) => svgIcon('<polyline points="3 12 8 12 10 8 14 16 16 12 21 12"/>', size);
  const svgNoteIcon = (size: any) => svgIcon('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', size);
  function kv(dl?: any, label?: any, value?: any) {
    dl.appendChild(h('dt', '', label));
    dl.appendChild(h('dd', '', value));
  }
  function seniorInfoItem(iconFn?: any, label?: any, valueNode?: any) {
    const item = h('div', 'senior-info-item');
    const icon = h('span', 'senior-info-icon');
    icon.appendChild(iconFn(16));
    item.appendChild(icon);
    const body = h('div', 'senior-info-body');
    body.appendChild(h('span', 'senior-info-label', label));
    body.appendChild(valueNode);
    item.appendChild(body);
    return item;
  }
  function calcAge(birth?: any) {
    if (!birth) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth);
    if (!m) return null;
    const now = new Date();
    let age = now.getFullYear() - Number(m[1]);
    const diffMonth = now.getMonth() + 1 - Number(m[2]);
    if (diffMonth < 0 || (diffMonth === 0 && now.getDate() < Number(m[3]))) age--;
    return age >= 0 ? age : null;
  }
  function displayName(user?: any) {
    const meta = user.user_metadata || {};
    return meta.name || meta.full_name || meta.nickname || meta.preferred_username ||
           (user.email ? user.email.split('@')[0] : '회원');
  }
  let toastTimer: any = null;
  function showToast(message?: any, duration?: any) {
    const toast = $id('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, duration || 2600);
  }
  function isPaymentCanceled(payment?: any) {
    if (!payment) return false;
    const code = String(payment.code || '').toUpperCase();
    const message = String(payment.message || payment.error_msg || '');
    return code.includes('CANCEL') || /CANCEL|취소/i.test(message);
  }
  let extraChargePaidPendingId: any = null;
  function showExtraChargePaidModal() {
    $id('extraChargePaidOverlay').hidden = false;
  }
  $id('extraChargePaidConfirmBtn').addEventListener('click', () => {
    $id('extraChargePaidOverlay').hidden = true;
    if (extraChargePaidPendingId) {
      extraChargePendingRemovalIds.delete(extraChargePaidPendingId);
      extraChargePaidPendingId = null;
    }
    loadExtraCharges(); // 결제 완료된 항목을 목록에서 빼고 나머지도 최신 상태로 새로고침
    loadCare(true);     // 하단 '케어 현황'도 같은 시점에 다시 동기화
  });
  $id('extraChargeLockConfirmBtn').addEventListener('click', () => {
    $id('extraChargeLockOverlay').hidden = true;
    const section = $id('extraChargeSection');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.setAttribute('tabindex', '-1');
    section.focus({ preventScroll: true });
  });
  async function guardBooking(event?: any) {
    if (!currentUser || !WBAuth || !WBAuth.hasUnpaidExtraCharge) return;
    event.preventDefault();
    const targetUrl = event.currentTarget.href;
    const locked = await WBAuth.hasUnpaidExtraCharge(currentUser.id);
    if (locked) $id('extraChargeLockOverlay').hidden = false;
    else window.location.href = targetUrl;
  }
  ['bookNowBtnDesktop', 'bookNowBtnMobile', 'applyMoreBtn'].forEach((id: any) => {
    const btn = $id(id);
    if (btn) btn.addEventListener('click', guardBooking);
  });
  function renderProfile(user?: any) {
    const name = displayName(user);
    $id('welcomeTitle').textContent = name + ' 님';
    const emailEl = $id('welcomeEmail');
    emailEl.textContent = user.email || '';
    emailEl.hidden = !user.email;
    const meta = user.user_metadata || {};
    const avatarUrl = (meta.avatar_url || meta.picture || '').replace(/^http:\/\//i, 'https://');
    const av = $id('guardianAvatar');
    av.textContent = '';
    if (avatarUrl) {
      const img = document.createElement('img');
      img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = avatarUrl;
      img.onerror = () => { av.textContent = name.charAt(0); };
      av.appendChild(img);
    } else {
      av.textContent = name.charAt(0);
    }
  }
  function setGuardianStatusBadge(tone?: any, text?: any) {
    const badge = $id('guardianStatusBadge');
    badge.className = 'status-tag st-' + tone;
    badge.textContent = text;
    badge.hidden = false; // 처음엔 숨겨 둬서(HTML 기본값) 실제 상태가 정해지기 전까지 '불러오는 중' 같은 placeholder 글자가 보이지 않게 함
  }
  function updateGuardianStatusBadge(activeApps?: any, totalCount?: any) {
    if (!totalCount) { setGuardianStatusBadge('completed', '예정된 케어 없음'); return; }
    if (!activeApps.length) { setGuardianStatusBadge('completed', '예정된 케어 없음'); return; }
    const isLive = activeApps.some((a: any) => effectiveStatusInfo(a).tone === 'live');
    if (isLive) setGuardianStatusBadge('departed', '케어 진행 중');
    else setGuardianStatusBadge('assigned', '예정된 케어 있음');
  }
  const COUPON_LABELS: Record<string, any> = { WELCOME_2000: '첫 동행 웰컴 쿠폰' }; // apply.html 의 같은 상수와 동일하게 유지
  let guardianPhone = ''; // 어르신 등록 모달의 '보호자 연락처와 동일' 체크박스에서 사용 (loadBenefitSummary 가 채움)
  function formatYmd(iso?: any) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  function couponStatusInfo(c?: any) {
    if (c.status === 'used') return { text: '사용 완료 · ' + formatYmd(c.used_at), cls: 'is-used' };
    const isExpired = c.status === 'expired' || (c.expires_at && new Date(c.expires_at).getTime() <= Date.now());
    if (isExpired) return { text: '기간 만료 · ' + formatYmd(c.expires_at), cls: 'is-expired' };
    return { text: '미사용 · ' + formatYmd(c.expires_at) + '까지', cls: 'is-unused' };
  }
  async function loadBenefitSummary() {
    const section = $id('benefitSection');
    if (DEMO || !currentUser) { section.hidden = true; return; }
    section.hidden = false;
    const [{ data: profile, error: profileErr }, { data: coupons, error: couponsErr }] = await Promise.all([
      api.getMyPointsAndPhone(supabaseClient, currentUser),
      api.listMyCoupons(supabaseClient, currentUser)
    ]);
    if (profileErr) {
      console.warn('[내 혜택 정보] points_balance 조회 실패 → sql/user_points.sql 을 실행했는지 확인하세요:', profileErr.code, profileErr.message);
      $id('benefitPointsBalance').textContent = '-';
    } else {
      const balance = (profile && Number.isFinite(profile.points_balance)) ? profile.points_balance : 0;
      $id('benefitPointsBalance').textContent = won(balance) + '원';
      guardianPhone = (profile && profile.phone) || ''; // 어르신 등록 모달의 '보호자 연락처와 동일' 체크박스에서 사용
    }
    if (couponsErr) {
      console.warn('[내 혜택 정보] user_coupons 조회 실패 → sql/welcome_coupons.sql 을 실행했는지 확인하세요:', couponsErr.code, couponsErr.message);
      $id('benefitCouponCount').textContent = '-';
      renderBenefitCoupons([]);
    } else {
      const usableCount = (coupons || []).filter((c: any) => couponStatusInfo(c).cls === 'is-unused').length;
      $id('benefitCouponCount').textContent = usableCount + '장';
      renderBenefitCoupons(coupons || []);
    }
  }
  function renderBenefitCoupons(coupons?: any) {
    const list = $id('benefitCouponList');
    list.textContent = '';
    if (!coupons.length) {
      list.appendChild(h('p', 'benefit-coupon-empty', '보유한 쿠폰이 없어요.'));
      return;
    }
    coupons.forEach((c: any) => {
      const info = couponStatusInfo(c);
      const item = h('div', 'benefit-coupon-item ' + info.cls);
      const label = COUPON_LABELS[c.coupon_code] || c.coupon_code;
      item.appendChild(h('span', '', label + ' - ' + won(c.amount) + '원 할인'));
      item.appendChild(h('span', 'bc-status', info.text));
      list.appendChild(item);
    });
  }
  (function wireBenefitCouponToggle() {
    const stat = $id('benefitCouponStat');
    const chevron = $id('benefitCouponChevron');
    const list = $id('benefitCouponList');
    if (!stat || !chevron || !list) return;
    chevron.appendChild(svgChevronDown('benefit-stat-chevron-icon'));
    stat.addEventListener('click', () => {
      const open = list.hidden;
      list.hidden = !open;
      stat.setAttribute('aria-expanded', String(open));
    });
  })();
  async function loadExtraCharges() {
    const section = $id('extraChargeSection');
    if (DEMO || !currentUser) { section.hidden = true; return; }
    const { data, error } = await api.listRequestedExtraCharges(supabaseClient, currentUser);
    if (error) {
      console.warn('[추가 요금 결제 안내] care_schedules 조회 실패 → sql/extra_charge_billing.sql 을 실행했는지 확인하세요:', error.code, error.message);
      section.hidden = true;
      return;
    }
    renderExtraCharges(data || []);
  }
  const extraChargePendingRemovalIds = new Set();
  function renderExtraCharges(rows?: any) {
    const section = $id('extraChargeSection');
    const list = $id('extraChargeList');
    const count = $id('extraChargeCount');
    const keepNodes = Array.from(list.children)
      .filter((el: any) => extraChargePendingRemovalIds.has(el.dataset.scheduleId));
    if (!rows.length && !keepNodes.length) { section.hidden = true; return; }
    section.hidden = false;
    count.hidden = rows.length === 0;
    if (rows.length) count.textContent = '추가 요금 결제 필요 (' + rows.length + '건)';
    list.textContent = '';
    rows.forEach((r: any) => list.appendChild(extraChargeRow(r)));
    keepNodes.forEach((el: any) => list.appendChild(el)); // 결제 완료 뱃지를 보여주는 중인 항목은 맨 뒤에 그대로 유지
  }
  function serviceTypeFromNotes(notes?: any) {
    const m = /^\[(.+?)\]/.exec(String(notes || ''));
    return m ? m[1] : null;
  }
  function extraChargeRow(r?: any) {
    const item = h('div', 'extra-charge-item');
    item.dataset.scheduleId = String(r.id);
    const info = h('div', 'extra-charge-info');
    const serviceType = serviceTypeFromNotes(r.notes);
    info.appendChild(h('strong', '', (r.senior_name || '어르신') + ' · ' + (serviceType || '추가 요금 안내')));
    if (r.scheduled_at) {
      info.appendChild(h('span', '', fmtReportDate(r.scheduled_at) + ' ' + fmtTime(r.scheduled_at) + ' 이용분'));
    }
    info.appendChild(h('span', 'extra-charge-reason',
      r.extra_charge_memo || '기본 이용 시간을 초과해 추가 요금이 청구되었습니다.'));
    item.appendChild(info);
    const amount = h('span', 'extra-charge-amount', Number(r.extra_charge_amount || 0).toLocaleString('ko-KR') + '원');
    item.appendChild(amount);
    const payBtn = h('button', 'btn btn-sm extra-charge-pay-btn', '결제하기');
    payBtn.type = 'button';
    payBtn.addEventListener('click', () => payExtraCharge(r, payBtn));
    item.appendChild(payBtn);
    return item;
  }
  async function payExtraCharge(r?: any, btn?: any) {
    if (!PortOne) {
      showToast('결제 모듈을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    btn.disabled = true;
    btn.textContent = '결제창 여는 중…';
    window.scrollTo(0, 0);
    let payment: any;
    try {
      payment = await PortOne.requestPayment({
        paymentId: r.extra_charge_payment_id,
        orderName: (r.senior_name || '어르신') + ' 추가 요금',
        totalAmount: r.extra_charge_amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD', // 추가 요금은 가상계좌 없이 즉시결제만 지원 (confirm-extra-charge-payment 참고)
        windowType: { pc: 'IFRAME', mobile: 'IFRAME' }, // 모바일에서도 전체 화면 오버레이로 고정해 레이아웃 잘림을 방지
        customer: { email: (currentUser && currentUser.email) || undefined },
        customData: { extra_charge_schedule_id: r.id }
      });
    } catch (e: any) {
      console.error('[추가 요금 결제] PortOne.requestPayment 호출 자체가 실패했습니다:', e);
      payment = { code: 'CLIENT_ERROR', message: '결제창을 여는 중 오류가 발생했어요.' };
    }
    if (payment && payment.code !== undefined) {
      btn.disabled = false;
      btn.textContent = '결제하기';
      showToast(isPaymentCanceled(payment)
        ? '결제가 취소되었습니다.'
        : '결제가 완료되지 않았어요. (' + (payment.message || payment.code) + ')');
      return;
    }
    btn.textContent = '결제 확인 중…';
    try {
      const { data: confirmData, error: confirmErr } = await WBEdgeFn.invoke(supabaseClient, 'confirm-extra-charge-payment', {
        payment_id: r.extra_charge_payment_id
      });
      if (confirmErr) throw confirmErr;
      console.log('[추가 요금 결제] 확인 완료:', confirmData);
      handleExtraChargePaid(r, btn);
    } catch (e: any) {
      console.error('[추가 요금 결제] 결제 확인(confirm-extra-charge-payment) 실패:', e);
      btn.disabled = false;
      btn.textContent = '결제하기';
      showToast('결제 확인에 실패했어요. 고객센터(010-5530-5760)로 문의해 주세요.');
    }
  }
  function handleExtraChargePaid(r?: any, btn?: any) {
    const scheduleId = String(r.id);
    extraChargePendingRemovalIds.add(scheduleId);
    extraChargePaidPendingId = scheduleId;
    btn.disabled = true;
    btn.textContent = '결제 완료 ✓';
    btn.classList.add('is-paid');
    showExtraChargePaidModal();
    loadCare(true); // 하단 '케어 현황'의 결제 내역·상태 문구를 새로고침 없이 즉시 동기화
  }
  const PACKAGE_HOURS_PER_SESSION = 2;
  async function loadMyPackages() {
    const section = $id('packageSection');
    if (DEMO || !currentUser) { section.hidden = true; return; }
    section.hidden = false;
    const { data, error } = await api.listMyActivePackageCounts(supabaseClient);
    if (error) {
      console.warn('[내 패키지] user_packages 조회 실패 → sql/user_packages_system.sql 을 실행했는지 확인하세요:', error.code, error.message);
      return;
    }
    const total = (data || []).reduce((sum: any, p: any) => sum + (p.remaining_count || 0), 0);
    const totalHours = total * PACKAGE_HOURS_PER_SESSION;
    $id('packageRemainingTotal').textContent = totalHours + '시간 (' + total + '회분)';
    if (myPackageTotalRemaining !== total) {
      myPackageTotalRemaining = total;
      renderCareCalendar();
    }
  }
  const SERVICES: Record<string, any> = {
    '시니어 병원 동행': { price: 50000, badge: '병원 동행', cat: 'hospital' },
    '생활 편의 대행': { price: 40000, badge: '생활 편의', cat: 'life' },
    '복합 매칭 서비스 (동행 + 생활편의)': { price: 60000, badge: '복합 서비스', cat: 'mixed' }
  };
  const won = (n: any) => Number(n).toLocaleString('ko-KR');
  const formatPkgCount = (n: any) => { const v = Number(n || 0); return (v % 1 === 0) ? String(v) : v.toFixed(1); };
  function toKst(iso?: any) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : new Date(d.getTime() + 9 * 60 * 60 * 1000);
  }
  const fmtTime = (iso: any) => {
    const k = toKst(iso);
    if (!k) return '';
    const h24 = k.getUTCHours();
    const period = h24 < 12 ? '오전' : '오후';
    const h12 = h24 % 12 || 12;
    return period + ' ' + String(h12).padStart(2, '0') + ':' + String(k.getUTCMinutes()).padStart(2, '0');
  };
  function serviceInfo(type?: any) {
    const t = String(type || '');
    if (SERVICES[t]) return SERVICES[t];
    if (t.includes('복합')) return SERVICES['복합 매칭 서비스 (동행 + 생활편의)']; // 이름이 조금 달라도 알아보도록
    if (t.includes('병원')) return SERVICES['시니어 병원 동행'];
    if (t.includes('생활')) return SERVICES['생활 편의 대행'];
    return null;
  }
  const KAKAO_REST_API_KEY = '4e94e702177afc63f2f05c3abfffdf3c';
  async function kakaoLocalGet(url?: any) {
    const res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_API_KEY } });
    if (!res.ok) throw new Error('kakao local api ' + res.status);
    return res.json();
  }
  async function reverseGeocode(lat?: any, lng?: any) {
    if (!KAKAO_REST_API_KEY) return null;
    try {
      const data = await kakaoLocalGet(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`);
      const doc = data.documents && data.documents[0];
      if (!doc) return null;
      const detail = (doc.road_address && doc.road_address.address_name) || (doc.address && doc.address.address_name);
      return detail || null;
    } catch (e: any) { console.warn('[카카오 지오코딩] 좌표→지명 변환 실패:', e.message); return null; }
  }
  const reverseGeocodeCache = new Map();
  async function reverseGeocodeCached(lat?: any, lng?: any) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    const key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key);
    const result = await reverseGeocode(lat, lng);
    reverseGeocodeCache.set(key, result);
    return result;
  }
  function statusInfo(raw?: any, hasManager?: any) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    const isEn = (...words) => words.includes(s);
    const hasKo = (...words) => words.some((w: any) => s.includes(w));
    let st: any;
    if (isEn('expired_cancelled')) st = { label: '자동 취소 · 환불 완료', tone: 'cancel' };
    else if (isEn('partially_refunded')) st = { label: '부분 환불 완료', tone: 'cancel' };
    else if (isEn('cancelled', 'canceled', 'cancel') || hasKo('취소')) st = { label: '취소됨', tone: 'cancel' };
    else if (isEn('payment_pending', 'pending_payment')) st = { label: '입금 대기 중', tone: 'wait' };
    else if (!s || isEn('pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'matching_pending', 'waiting_matching') || hasKo('접수', '대기', '신청')) st = { label: '매칭 대기 중', tone: 'wait' };
    else if (isEn('contacted', 'confirmed') || hasKo('상담', '확인')) st = { label: '상담·확인 완료', tone: 'info' };
    else if (isEn('matched', 'assigned') || hasKo('배정', '매칭')) st = { label: '배정 완료', tone: 'live', assigned: true };
    else if (isEn('in_progress', 'ongoing', 'progress', 'processing') || hasKo('진행')) st = { label: '진행 중', tone: 'live', assigned: true };
    else if (isEn('completed', 'complete', 'done', 'finished') || hasKo('완료', '종료')) st = { label: '완료', tone: 'done' };
    else st = { label: String(raw), tone: 'wait' }; // 처음 보는 값은 그대로 표시
    if (hasManager && st.tone !== 'cancel') {
      if (st.tone === 'wait' || st.tone === 'info') return { label: '배정 완료', tone: 'live', assigned: true };
      return Object.assign({}, st, { assigned: true });
    }
    return st;
  }
  const CARE_STEP_LABELS_BY_TYPE: Record<string, any> = {
    hospital: ['접수 완료', '배정 완료', '출발 완료', '병원 도착', '진료/대행 완료', '귀가 이동', '케어 완료'],
    life:     ['접수 완료', '배정 완료', '출발 완료', '현장 도착', '대행 업무 완료', '귀가 이동', '대행 완료'],
    mixed:    ['접수 완료', '배정 완료', '출발 완료', '목적지 도착', '진료/대행 완료', '귀가 이동', '케어 완료']
  };
  const CARE_STEP_LABELS = CARE_STEP_LABELS_BY_TYPE.hospital; // cat 을 모를 때의 기본값/폴백
  const CARE_STEP_LAST = CARE_STEP_LABELS.length - 1; // 6 — '케어 완료'(또는 '대행 완료') 인덱스
  function careStepLabelsFor(a?: any) {
    const cat = (serviceInfo(a && a.service_type) || {}).cat;
    return CARE_STEP_LABELS_BY_TYPE[cat] || CARE_STEP_LABELS;
  }
  function normalizeCareStep(raw?: any) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!s) return null;
    const isEn = (...words) => words.includes(s);
    const hasKo = (...words) => words.some((w: any) => s.includes(w));
    if (isEn('completed', 'complete', 'done', 'finished', 'care_completed') || hasKo('케어완료', '케어 완료')) return 6;
    if (isEn('returning', 'return_departure', 'returning_home') || hasKo('귀가이동', '귀가 이동', '복귀이동', '복귀 이동')) return 5;
    if (isEn('treatment_done', 'treatment_complete') || hasKo('진료완료', '진료 완료', '진료/대행 완료', '대행업무완료', '대행 업무 완료')) return 4;
    if (isEn('arrived', 'arrived_at_hospital') || hasKo('병원도착', '병원 도착', '현장도착', '현장 도착', '목적지도착', '목적지 도착', '도착')) return 3;
    if (isEn('departed', 'on_the_way', 'ontheway', 'moving', 'in_transit') || hasKo('출발완료', '출발 완료', '이동중', '이동 중', '출발')) return 2;
    if (isEn('matched', 'assigned', 'accepted') || hasKo('배정완료', '배정 완료', '배정', '매칭')) return 1;
    if (isEn('pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'applied', 'payment_pending', 'pending_payment', 'matching_pending', 'waiting_matching') || hasKo('접수완료', '접수 완료', '접수', '대기', '신청')) return 0;
    if (hasKo('완료')) return CARE_STEP_LAST; // 위 어느 것에도 안 걸린 값만 최후 수단으로 '완료' 취급
    return null;
  }
  function scheduleStatusInfo(raw?: any) {
    const step = normalizeCareStep(raw);
    if (step == null || step <= 1) return null; // 'pending'/'assigned' 등은 기존 statusInfo() 결과를 그대로 사용
    return { label: CARE_STEP_LABELS[step], tone: step === CARE_STEP_LAST ? 'done' : 'live', assigned: true };
  }
  function resolveCareStep(a?: any) {
    const scheduleStep = a._schedule && normalizeCareStep(a._schedule.schedule_status);
    const appStep = normalizeCareStep(a.status);
    return [scheduleStep, appStep].reduce((best: any, s: any) => (s != null && (best == null || s > best) ? s : best), null);
  }
  const SCHEDULE_PROPOSAL_KEY = 'wb_schedule_proposals';
  const PROPOSAL_STATUS: Record<string, any> = { PROPOSED: '일정 변경 요청', CONFIRMED: '배정 완료' };
  function loadScheduleProposals() {
    try { return JSON.parse(localStorage.getItem(SCHEDULE_PROPOSAL_KEY) || '{}'); }
    catch (e: any) { return {}; }
  }
  function getScheduleProposal(applicationId?: any) {
    return loadScheduleProposals()[applicationId] || null;
  }
  function setScheduleProposalStatus(applicationId?: any, status?: any) {
    const all = loadScheduleProposals();
    if (!all[applicationId]) return;
    all[applicationId].status = status;
    try { localStorage.setItem(SCHEDULE_PROPOSAL_KEY, JSON.stringify(all)); } catch (e: any) { /* 사생활 보호 모드 등으로 저장이 안 돼도 화면은 이미 갱신됨 */ }
  }
  function clearScheduleProposal(applicationId?: any) {
    const all = loadScheduleProposals();
    delete all[applicationId];
    try { localStorage.setItem(SCHEDULE_PROPOSAL_KEY, JSON.stringify(all)); } catch (e: any) { /* 위와 동일 */ }
  }
  function fmtProposedDateTime(iso?: any) {
    const k = toKst(iso); // KST 고정 변환(toKst) — 로컬 시간대 getter 를 쓰지 않습니다
    if (!k) return '';
    const p2 = (n: any) => String(n).padStart(2, '0');
    const h24 = k.getUTCHours();
    const ampm = h24 < 12 ? '오전' : '오후';
    const h12 = h24 % 12 || 12;
    return k.getUTCFullYear() + '-' + p2(k.getUTCMonth() + 1) + '-' + p2(k.getUTCDate()) +
      ' (' + '일월화수목금토'[k.getUTCDay()] + ') ' + ampm + ' ' + h12 + ':' + p2(k.getUTCMinutes());
  }
  function proposalStatusInfo(a?: any) {
    const p = getScheduleProposal(a.id);
    if (!p) return null;
    if (p.status === PROPOSAL_STATUS.PROPOSED) return { label: '일정 변경 제안', tone: 'propose' };
    if (p.status === PROPOSAL_STATUS.CONFIRMED) return { label: '배정 완료', tone: 'live', assigned: true };
    return null;
  }
  const CARE_CHECKPOINTS_KEY = 'wb_care_checkpoints';
  const careCheckpointsChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('wb_care_checkpoints') : null;
  const careCheckpointsDbCache: any = {}; // schedule_id -> { step: { at, location, photo } } (care_checkpoints 조회 결과)
  const CHECKPOINT_STEP_ALIASES: Record<string, any> = {
    departure: 'departure',
    hospital_arrival: 'hospital_arrival', site_arrival: 'hospital_arrival',
    treatment_complete: 'treatment_complete', task_complete: 'treatment_complete',
    return_departure: 'return_departure',
    return_complete: 'return_complete'
  };
  function normalizeCheckpointStep(step?: any) { return CHECKPOINT_STEP_ALIASES[step] || null; }
  async function refreshCareCheckpointsFromDb(scheduleId?: any) {
    if (!scheduleId || !supabaseClient || DEMO) return;
    try {
      const { data: rows, error } = await api.listCareCheckpoints(supabaseClient, scheduleId);
      if (error) throw error;
      console.table((rows || []).map((r: any) => ({
        step: r.step, checkpoint_at: r.checkpoint_at, created_at: r.created_at,
        '시각(표시)': (r.checkpoint_at || r.created_at) ? fmtTime(r.checkpoint_at || r.created_at) : '(없음)',
        lat: r.lat, lng: r.lng, has_photo: !!r.photo_url
      })));
      const bucket: any = {};
      (rows || []).forEach((r: any) => {
        const key = normalizeCheckpointStep(r.step);
        if (!key) { console.warn('[동행 타임라인] 알 수 없는 step 값 — 무시합니다:', r.step); return; }
        const hasAny = r.checkpoint_at || r.created_at || r.lat != null || r.lng != null || r.photo_url;
        if (!hasAny) return;
        bucket[key] = { // 오름차순이므로 이후에 오는(더 최근) 행이 항상 마지막에 덮어씁니다
          at: r.checkpoint_at || r.created_at,
          location: (r.lat != null && r.lng != null) ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy } : null,
          photo: r.photo_url || null
        };
      });
      careCheckpointsDbCache[scheduleId] = bucket;
    } catch (err: any) {
      console.warn('[동행 타임라인] care_checkpoints 조회 실패(supabase-care-checkpoints.sql 실행 여부 확인) — 로컬(storage/BroadcastChannel) 데이터만으로 표시합니다:', err);
    }
  }
  function readCareCheckpoint(scheduleId?: any) {
    if (!scheduleId) return null;
    try {
      const all = JSON.parse(localStorage.getItem(CARE_CHECKPOINTS_KEY) || '{}');
      return all[scheduleId] || null;
    } catch (e: any) { return null; }
  }
  function pickCheckpointTime(sources?: any, keys?: any) {
    for (const src of sources) {
      if (!src) continue;
      for (const key of keys) {
        const v = src[key];
        if (v && !isNaN(new Date(v).getTime())) return v;
      }
    }
    return null;
  }
  function isGuardianConfirmed(raw?: any) {
    return String(raw == null ? '' : raw).trim().toLowerCase() === 'guardian_confirmed';
  }
  function effectiveStatusInfo(a?: any) {
    if (isGuardianConfirmed(a.status)) return { label: '이용 완료', tone: 'confirmed', assigned: true };
    const base = statusInfo(a.status, !!a.manager_id);
    if (base.tone === 'wait' && !a.manager_id && a.payment_status === 'PAID') {
      const iso = a.matching_started_at || careRefIso(a);
      const t = iso ? new Date(iso).getTime() : NaN;
      if (!isNaN(t) && t < careCutoffMs()) {
        return { label: '만료 처리 중 (자동 취소·환불 예정)', tone: 'cancel', pendingExpiry: true };
      }
    }
    if (base.tone === 'cancel') {
      if (base.label === '취소됨' && a.payment_status === 'REFUNDED') {
        return Object.assign({}, base, { label: '환불 완료' });
      }
      if (base.label === '취소됨' && a.is_package_used && a.package_restored) {
        return Object.assign({}, base, { label: '패키지 복구 완료' });
      }
      return base;
    }
    const step = resolveCareStep(a);
    if (step != null && step >= 2) return { label: careStepLabelsFor(a)[step], tone: step === CARE_STEP_LAST ? 'done' : 'live', assigned: true };
    const proposal = proposalStatusInfo(a);
    if (proposal) return proposal;
    return base;
  }
  function parseRequestDetails(text?: any) {
    const out = { when: '', mobility: '', purpose: '', note: '' };
    const src = String(text == null ? '' : text).trim();
    if (!src) return out;
    const KEYS: Record<string, any> = { '희망 일시': 'when', '어르신 거동 상태': 'mobility', '세부 목적': 'purpose', '요청 상세': 'note' };
    let current = null, matched = false;
    src.split('\n').forEach((line: any) => {
      const m = /^\s*(희망 일시|어르신 거동 상태|세부 목적|요청 상세)\s*:\s*(.*)$/.exec(line);
      if (m) { current = KEYS[m[1]]; matched = true; out[current] = m[2].trim(); }
      else if (current === 'note') out.note += '\n' + line; // 요청 상세는 여러 줄일 수 있음
    });
    out.note = out.note.trim();
    if (!matched) out.note = src;
    return out;
  }
  const CARE_VISIBLE_COUNT = 2;
  const CARE_WINDOW_HOURS = 48;
  const careCutoffMs = () => Date.now() - CARE_WINDOW_HOURS * 60 * 60 * 1000;
  const careRefIso = (a: any) => (a && (a.accepted_at || a.created_at)) || '';
  function withinCareWindow(a?: any) {
    const tone = effectiveStatusInfo(a).tone;
    if (tone !== 'wait') return true; // 접수 완료/대기 상태가 아니면 48시간이 지나도 계속 표시
    const iso = careRefIso(a);
    const t = iso ? new Date(iso).getTime() : NaN;
    return !isNaN(t) && t >= careCutoffMs(); // 시각이 없거나 읽을 수 없으면 숨김
  }
  const byCreatedAtDesc = (a: any, b: any) => new Date(b.created_at) - new Date(a.created_at);
  const DEBUG_ALL = new URLSearchParams(location.search).has('debug');
  const hoursAgo = (n: any) => new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
  const DEMO_APPLICATIONS = [
    { id: 'demo-a1', created_at: hoursAgo(3), service_type: '시니어 병원 동행', status: 'pending',
      address: '마포구 아현동 / 신촌세브란스병원',
      request_details: '희망 일시: 9월 25일 오전 10시\n어르신 거동 상태: 지팡이·보행기 사용\n요청 상세: 내과 진료 후 약 수령까지 도와주세요' },
    { id: 'demo-a2', created_at: hoursAgo(80), accepted_at: hoursAgo(5), service_type: '복합 매칭 서비스 (동행 + 생활편의)', status: 'matched', // 3일 전 접수 · 배정 완료라 계속 표시
      manager_id: 'demo-manager', _manager: { name: '김은지', phone: '010-2345-6789', cert: '요양보호사' }, // 배정된 매니저 (실제로는 my_application_managers() 가 채움)
      _schedule: {
        schedule_status: 'arrived',
        departed_at: hoursAgo(3), departed_location: { lat: 37.4595, lng: 126.6318, accuracy: 12 }, departed_photo: null,
        arrived_at: hoursAgo(2.6), arrived_location: { lat: 37.5270, lng: 127.0276, accuracy: 18 }, arrived_photo: null,
        completed_at: null
      },
      address: '인천 남동구 소래역로 93 / 서울아산병원 → 약국 → 우리은행',
      request_details: '희망 일시: 9월 18일 오후 2시\n어르신 거동 상태: 휠체어 사용' },
    { id: 'demo-a3', created_at: hoursAgo(120), service_type: '생활 편의 대행', status: 'completed', // 완료 후 24시간이 지나 완충 종료 → 상단에는 안 보이고 하단 달력에서만 확인 (대조군)
      address: '부평구 부평대로 12 / 부평구청',
      request_details: '희망 일시: 9월 1일 오전 9시 30분\n어르신 거동 상태: 혼자 걸음 가능\n요청 상세: 주민등록등본 발급' },
    { id: 'demo-a4', created_at: hoursAgo(3), service_type: '시니어 병원 동행', status: 'completed', // 완료된 지 2시간(24시간 이내) · 리포트 아직 없음 → 상단에 '작성 중' 안내로 완충
      _schedule: { schedule_status: 'completed', completed_at: hoursAgo(2) },
      address: '남동구 소래역로 93 / 길병원',
      request_details: '희망 일시: 9월 24일 오후 1시\n어르신 거동 상태: 지팡이 사용' },
    { id: 'demo-a5', created_at: hoursAgo(6), service_type: '시니어 병원 동행', status: 'completed', // 완료된 지 5시간 · 리포트는 있지만 아직 안 읽음 → 상단에 '리포트 확인하기' 버튼으로 완충
      _schedule: { schedule_status: 'completed', departed_at: hoursAgo(5.6), arrived_at: hoursAgo(5.3), completed_at: hoursAgo(5), schedule_id: 'demo-schedule-5' },
      address: '연수구 송도과학로 15 / 인하대병원',
      request_details: '희망 일시: 9월 24일 오전 10시\n어르신 거동 상태: 휠체어 사용' },
    { id: 'demo-a6', created_at: hoursAgo(30), service_type: '생활 편의 대행', status: 'guardian_confirmed', // 보호자가 이미 [확인 및 이용 완료] 처리한 건 → '진행 중인 신청'엔 안 보이고 하단 달력에서만 조회되며, 리포트를 다시 열어도 [확인 및 이용 완료] 버튼 없이 "이미 이용 완료 처리된 서비스예요" 안내만 뜹니다
      _schedule: { schedule_status: 'completed', completed_at: hoursAgo(28), schedule_id: 'demo-schedule-6' },
      address: '남동구 만수동 / 남동구청',
      request_details: '희망 일시: 9월 23일 오전 11시\n어르신 거동 상태: 혼자 걸음 가능\n요청 상세: 기초생활수급자 서류 발급' }
  ];
  const loggedOnce = new Set();
  function logOnce(kind?: any, key?: any, ...args: any[]) {
    const id = kind + '|' + key;
    if (loggedOnce.has(id)) return;
    loggedOnce.add(id);
    console[kind](...args);
  }
  const errInfo = (e: any) => ({ code: e && e.code, message: e && e.message, details: e && e.details, hint: e && e.hint });
  async function attachManagers(apps?: any) {
    const assigned = apps.filter((a: any) => a.manager_id);
    if (!assigned.length) return;
    const fillSelf = async () => {
      const mine = assigned.filter((a: any) => !a._manager && a.manager_id === currentUser.id);
      if (!mine.length) return;
      let prof: any = null;
      try { const r = await api.getMyNameAndPhone(supabaseClient, currentUser); prof = r && r.data; } catch (e: any) { /* 프로필을 못 읽어도 이름만 표시 */ }
      const meta = currentUser.user_metadata || {};
      const name = (prof && prof.name) || meta.name || meta.full_name || meta.nickname || '';
      mine.forEach((a: any) => { a._manager = { name, phone: (prof && prof.phone) || '', cert: '' }; });
    };
    try {
      const { data, error } = await api.listMyApplicationManagers(supabaseClient);
      if (error) throw error;
      logOnce('log', 'mgr-' + JSON.stringify(data), 'Assigned manager info (rpc my_application_managers):', data); // 내용이 같으면 30초마다 반복 출력하지 않음
      const byApp = new Map((data || []).map((r: any) => [r.application_id, r]));
      assigned.forEach((a: any) => {
        const m = byApp.get(a.id);
        if (m) a._manager = { name: m.manager_name, phone: m.manager_phone, cert: m.manager_certification };
        else logOnce('warn', 'nomgr-' + a.id, '[담당 매니저] 신청 ' + a.id + ' 은(는) 배정되었지만 매니저 정보가 조회되지 않았습니다 → "담당 케어 매니저 지정됨"으로 표시합니다. ' +
                     '(내 신청(user_id)이 아니거나, 매니저 프로필/연락처가 비어 있을 수 있어요)');
      });
      await fillSelf();
    } catch (err: any) {
      logOnce('error', 'rpc-' + (err && (err.code || err.message)),
        '[담당 매니저] my_application_managers() 호출 실패 → 매니저 정보 없이 "담당 케어 매니저 지정됨"으로 표시합니다.', errInfo(err),
        '\n확인: supabase-fix-guardian-visibility.sql 을 실행했는지 (GRANT EXECUTE ON FUNCTION public.my_application_managers() TO authenticated)');
      await fillSelf();
    }
  }
  const SCHED_MINIMAL = 'id, status, scheduled_at, departed_at, departed_location, departed_photo, arrived_at, arrived_location, arrived_photo, completed_at';
  const SCHED_OPTIONAL_COLS = ['application_id', 'manager_lat, manager_lng, manager_location_at'];
  function scheduleRowToState(r?: any) {
    return {
      schedule_id: r.id, schedule_status: r.status, scheduled_at: r.scheduled_at,
      departed_at: r.departed_at, departed_location: r.departed_location, departed_photo: r.departed_photo,
      arrived_at: r.arrived_at, arrived_location: r.arrived_location, arrived_photo: r.arrived_photo,
      completed_at: r.completed_at,
      manager_lat: r.manager_lat, manager_lng: r.manager_lng, manager_location_at: r.manager_location_at
    };
  }
  async function attachSchedules(apps?: any) {
    const managedApps = apps.filter((a: any) => a.manager_id);
    const buildSchedQuery = (cols: any, col: any, ids: any) => api.selectCareSchedulesIn(supabaseClient, cols, col, ids);
    async function querySched(col?: any, ids?: any) {
      let remaining = SCHED_OPTIONAL_COLS.slice();
      for (;;) {
        const cols = SCHED_MINIMAL + (remaining.length ? ', ' + remaining.join(', ') : '');
        const { data, error } = await buildSchedQuery(cols, col, ids);
        if (!error || error.code !== '42703' || !remaining.length) return { data, error };
        const msg = String(error.message || '');
        const hitIdx = remaining.findIndex((group: any) => group.split(',').some((c: any) => msg.includes(c.trim())));
        remaining.splice(hitIdx >= 0 ? hitIdx : 0, 1);
        logOnce('warn', 'sched-cols-42703-' + remaining.length,
          '[동행 진행 현황] care_schedules 컬럼 일부가 없습니다(42703):', msg, '→ 줄여서 다시 시도:', cols);
      }
    }
    const noScheduleId = managedApps.filter((a: any) => !a.schedule_id);
    if (noScheduleId.length) {
      logOnce('warn', 'app-no-schedule-id-' + noScheduleId.map((a: any) => a.id).join(','),
        '[Guardian] ID 매핑 불일치: 매니저가 배정됐는데 schedule_id 가 비어 있는 신청:',
        noScheduleId.map((a: any) => ({ application_id: a.id, status: a.status, manager_id: a.manager_id })),
        '→ service_applications.schedule_id 가 안 채워져 있습니다. Auto-Link fallback(care_schedules.application_id 로 재조회)을 시도합니다.',
        '\n근본 해결: supabase-fix-schedule-links.sql 을 실행하면 이 링크가 DB 에 영구히 복구되고, 앞으로 수락하는 건도 끊기지 않습니다.');
      try {
        const noIdIds = noScheduleId.map((a: any) => a.id);
        const { data: relinked, error: relinkErr } = await querySched('application_id', noIdIds);
        if (relinkErr && relinkErr.code !== '42703') throw relinkErr;
        if (relinked && relinked.length) {
          const byAppId = new Map(relinked.map((r: any) => [r.application_id, r]));
          noScheduleId.forEach((a: any) => {
            const r = byAppId.get(a.id);
            if (!r) return;
            console.log('[Guardian] Auto-Link 성공: 신청', a.id, '↔ 일정', r.id, '| status:', r.status,
              '(DB 의 service_applications.schedule_id 는 아직 비어 있어 다음 로드에도 이 fallback 을 다시 탑니다 — 영구 복구는 supabase-fix-schedule-links.sql 참고)');
            a._schedule = scheduleRowToState(r);
          });
        }
        const stillMissing = noScheduleId.filter((a: any) => !a._schedule);
        if (stillMissing.length) {
          logOnce('warn', 'app-relink-failed-' + stillMissing.map((a: any) => a.id).join(','),
            '[Guardian] Auto-Link 로도 못 찾은 신청:', stillMissing.map((a: any) => a.id),
            '→ care_schedules 에 application_id 로 연결된 일정 자체가 없다는 뜻입니다(수동 확인 필요).',
            '   → SQL Editor: select id, status, guardian_id from care_schedules where guardian_id = \'' + currentUser.id + '\';');
        }
      } catch (relinkCatchErr: any) {
        logOnce('error', 'relink-' + (relinkCatchErr && (relinkCatchErr.code || relinkCatchErr.message)),
          '[Guardian] Auto-Link 조회 실패:', errInfo(relinkCatchErr));
      }
    }
    const assigned = managedApps.filter((a: any) => a.schedule_id);
    if (!assigned.length) return;
    try {
      const ids = [...new Set(assigned.map((a: any) => a.schedule_id))];
      const { data, error } = await querySched('id', ids);
      if (error) throw error;
      console.log('최신 케어 상태:', data); // ← 매니저가 DB 에서 바꾼 care_schedules.status 원본이 여기 그대로 찍힙니다
      console.log('[Guardian] care_schedules 조회 결과 · 요청 id', ids.length, '건 →', (data || []).length, '건 수신:', data);
      const byId = new Map((data || []).map((r: any) => [r.id, r]));
      const missing = ids.filter((id: any) => !byId.has(id));
      if (missing.length) {
        logOnce('warn', 'sched-missing-' + missing.join(','),
          '[Guardian] care_schedules 에서 못 찾은 schedule_id:', missing,
          '→ 이 신청은 "배정 완료"에 고정된 채 진행 상태(이동 중/병원 도착 등)가 절대 안 바뀝니다.',
          '\n확인 순서: (1) supabase-guardian-realtime.sql 을 이 Supabase 프로젝트에 실행했는지',
          '(2) 이 schedule 행의 guardian_id 컬럼이 실제로 내 계정 id(' + (currentUser && currentUser.id) + ')와 같은지',
          '   → SQL Editor: select id, guardian_id, status from care_schedules where id in (' + missing.map((id: any) => "'" + id + "'").join(',') + ');');
        try {
          const { data: rpcRows, error: rpcErr } = await api.listMyApplicationSchedules(supabaseClient);
          if (!rpcErr && rpcRows) {
            const byAppId = new Map(rpcRows.map((r: any) => [r.application_id, r]));
            let rescued = 0;
            missing.forEach((id: any) => {
              const a = assigned.find((x: any) => x.schedule_id === id);
              const r = a && byAppId.get(a.id);
              if (r) { byId.set(id, { id: r.schedule_id || id, status: r.schedule_status, ...r }); rescued++; }
            });
            if (rescued) console.log('[Guardian] my_application_schedules() RPC 로 ' + rescued + '건 구제됨 (테이블 select 는 실패했지만 RPC 는 배포돼 있던 경우)');
          }
        } catch (rpcCatchErr: any) { /* RPC 도 없으면(404 등) 위 경고 로그가 이미 원인을 안내했으므로 조용히 넘어감 */ }
      }
      assigned.forEach((a: any) => {
        const r = byId.get(a.schedule_id);
        if (!r) return;
        console.log('[Guardian] Fetched status:', r.status, '(application', a.id, '/ schedule', r.id + ')');
        a._schedule = scheduleRowToState(r);
      });
    } catch (err: any) {
      logOnce('error', 'sched-select-' + (err && (err.code || err.message)),
        '[동행 진행 현황] care_schedules 조회 실패 → 진행 현황 없이 "배정 완료" 상태만 표시합니다.', errInfo(err),
        '\n확인: supabase-guardian-realtime.sql 을 실행했는지 (care_schedules_select_guardian 정책)');
    }
  }
  let careLoading = false;
  let lastCareSig = '';
  let careListExpanded = false;
  const careSignature = (list: any) => JSON.stringify(list.map((a: any) => {
    const proposal = getScheduleProposal(a.id); // 매니저가 다른 탭/기기에서 '일정 변경 제안'을 보내거나 상태를 바꿨을 때도 30초 조용한 새로고침이 다시 그리도록 서명에 포함
    return [
      a.id, a.status, a.manager_id || null,
      a._manager ? [a._manager.name, a._manager.phone] : null,
      a._schedule ? [a._schedule.schedule_status, a._schedule.departed_at, a._schedule.arrived_at, a._schedule.completed_at] : null,
      proposal ? [proposal.status, proposal.proposedDate] : null
    ];
  }));
  async function loadCare(silent?: any) {
    if (careLoading) return;
    if (DEMO && silent) return;
    careLoading = true;
    try {
      const body = $id('careBody');
      if (!silent) {
        body.textContent = '';
        body.appendChild(h('div', 'empty', '케어 현황을 불러오는 중…')); // 불러오는 동안 '신청 없음' 화면이 잠깐 보이지 않도록
      }
      if (DEMO) { renderCare(DEMO_APPLICATIONS.filter(withinCareWindow).sort(byCreatedAtDesc)); return; }
      if (!currentUser) return;
      const uid = currentUser.id;
      const myEmail = String(currentUser.email || '').trim().toLowerCase();
      const APP_BASE_CORE = 'id, created_at, user_id, service_type, user_relation, address, request_details, status';
      const APP_OPTIONAL_COLS = ['applicant_email', 'manager_id', 'accepted_at', 'schedule_id', 'payment_status', 'refunded_at', 'refund_amount', 'matching_started_at', 'is_package_used', 'package_restored'];
      let appsRemaining = APP_OPTIONAL_COLS.slice();
      let apps: any, error: any;
      for (;;) {
        const cols = APP_BASE_CORE + (appsRemaining.length ? ', ' + appsRemaining.join(', ') : '');
        let q = api.selectServiceApplications(supabaseClient, cols, DEBUG_ALL);
        if (!DEBUG_ALL) {
          q = (myEmail && appsRemaining.includes('applicant_email'))
            ? q.or('user_id.eq.' + uid + ',applicant_email.ilike.' + myEmail)
            : q.eq('user_id', uid);
        }
        ({ data: apps, error } = await q);
        if (!error || error.code !== '42703' || !appsRemaining.length) break;
        const msg = String(error.message || '');
        const hitIdx = appsRemaining.findIndex((c: any) => msg.includes(c));
        const removed = appsRemaining.splice(hitIdx >= 0 ? hitIdx : 0, 1)[0];
        logOnce('warn', 'no-col-' + removed, '[신청 내역] service_applications 에 ' + removed + ' 컬럼이 없습니다(42703) → 그 컬럼 없이 다시 조회합니다. sql/supabase_schema_latest.sql 을 실행하세요.');
      }
      if (error) {
        logOnce('error', 'fetch-' + (error.code || error.message), 'Applications fetch error:', errInfo(error),
          '\n확인: (1) 42501/빈 결과 → service_applications_select_own 정책(user_id 일치 또는 인증된 이메일 일치)과 GRANT SELECT 를 실행했는지 (2) 이 신청 행의 user_id 가 로그인 계정 id(' + currentUser.id + ')와 같은지');
        if (!silent) renderCare([]);
        return;
      }
      (apps || []).forEach((a: any) => {
        const emailMatch = !!(myEmail && a.applicant_email && String(a.applicant_email).trim().toLowerCase() === myEmail);
        a._link = (a.user_id === uid || emailMatch) ? 'mine' : (a.user_id == null ? 'null' : 'other');
      });
      const unlinked = (apps || []).filter((a: any) => a._link !== 'mine');
      if (unlinked.length) {
        logOnce('warn', 'unlinked-' + unlinked.map((a: any) => a.id).join(','), '[신청 내역] 내 계정(' + uid + ')에 연결되지 않은 신청이 보입니다 (user_id 가 비어 있거나 다른 계정, 이메일도 불일치):',
                unlinked.map((a: any) => ({ id: a.id, user_id: a.user_id, status: a.status })), '→ DB 에서 user_id 를 내 계정으로 고쳐야 정상적으로 보입니다 (supabase-fix-guardian-visibility.sql 의 D).');
      }
      const list = (DEBUG_ALL ? (apps || []) : (apps || []).filter(withinCareWindow)).sort(byCreatedAtDesc);
      // 담당 매니저(_manager)와 진행 일정(_schedule)은 서로 다른 칸을 채우는 독립 조회라 동시에 보냅니다 (서버 왕복 1번 절약)
      await Promise.all([attachManagers(list), attachSchedules(list)]);
      list.forEach((a: any) => {
        const raw = (a._schedule && a._schedule.schedule_status) || a.status;
        console.log('[Guardian] Fetched status:', raw, '| application:', a.id,
          '| care_schedules 연결:', !!a._schedule, '| 정규화된 step(0~6):', normalizeCareStep(raw));
      });
      const sig = careSignature(list);
      if (!silent || sig !== lastCareSig) { // 처음 불러올 때와 내용이 바뀌었을 때만 출력 (30초 새로고침마다 반복하지 않음)
        console.log('Applications fetched:', apps);
        console.log('[케어 현황] 로그인 사용자 id:', currentUser.id, '| 받아온 신청', (apps || []).length, '건 → 표시 대상', list.length, '건',
                    '| 상태:', (apps || []).map((a: any) => a.status + (a.manager_id ? '(manager)' : '')).join(', ') || '없음');
        if (!apps || apps.length === 0) {
          console.info('[신청 내역] 이 계정(user_id=' + currentUser.id + ', email=' + (currentUser.email || '(없음)') + ')의 신청 0건. ' +
                       '방금 신청/배정됐는데 안 보이면: (1) 신청 행의 user_id 가 위 id 와 같은지, 또는 applicant_email 이 위 email 과 같은지(둘 다 아니면 DB 규칙상 이 계정에는 절대 보이지 않습니다) ' +
                       '(2) service_applications_select_own SELECT 정책(user_id 일치 OR 인증된 이메일 일치)이 있는지 → sql/supabase_schema_latest.sql. 주소 뒤에 ?debug 를 붙이면 권한이 허용하는 전체 신청과 연결 상태를 볼 수 있어요.');
        }
      }
      if (silent && sig === lastCareSig) return; // 바뀐 게 없으면 다시 그리지 않음 (시간 글자는 tickCare 가 갱신)
      lastCareSig = sig;
      renderCare(list);
    } catch (err: any) {
      console.error('[케어 현황] 신청 내역 처리 중 예외:', err);
      if (!silent) renderCare([]);
    } finally {
      careLoading = false;
    }
  }
  const CARE_POLL_MS = 8000;
  setInterval(() => { if (!document.hidden) loadCare(true); }, CARE_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCare(true); });
  window.addEventListener('wb-applications-claimed', () => {
    let tries = 0;
    const go = () => { if (careLoading && tries++ < 10) setTimeout(go, 800); else loadCare(true); };
    go();
  });
  window.addEventListener('storage', (e: any) => { if (e.key === SCHEDULE_PROPOSAL_KEY) renderCare(lastCareApps); });
  function relTime(iso?: any) {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!(min >= 1)) return '방금 전'; // 1분 미만 (기기 시계가 조금 앞서 음수가 되어도 '방금 전')
    if (min < 60) return min + '분 전';
    const hr = Math.floor(min / 60);
    return hr < 48 ? hr + '시간 전' : Math.floor(hr / 24) + '일 전'; // 카드가 48시간만 표시되므로 그 안에서는 시간 단위로
  }
  const remainMs = (iso: any) => new Date(iso).getTime() + CARE_WINDOW_HOURS * 60 * 60 * 1000 - Date.now();
  function remainLabel(ms?: any) {
    if (ms >= 3 * 3600e3) return Math.ceil(ms / 3600e3) + '시간'; // 방금 접수하면 '48시간'
    const m = Math.max(1, Math.ceil(ms / 60000));
    const hr = Math.floor(m / 60), mm = m % 60;
    return hr ? (mm ? hr + '시간 ' + mm + '분' : hr + '시간') : mm + '분';
  }
  function setTimerText(el?: any) {
    const ms = remainMs(el.dataset.created);
    if (ms <= 0) { el.textContent = CARE_WINDOW_HOURS + '시간 경과'; el.classList.add('is-soon'); return; } // 기간이 지난 카드는 (테스트 모드에서만 보임)
    el.textContent = CARE_WINDOW_HOURS + '시간 내 매칭 예정 · ' + remainLabel(ms) + ' 남음';
    el.classList.toggle('is-soon', ms <= 6 * 3600e3);
  }
  let lastCareApps: any[] = []; // 지금 그려진 신청 목록 (48시간이 지난 카드를 자동으로 걷어내기 위해 보관)
  let myPackageTotalRemaining: any = null;
  function tickCare() {
    const body = $id('careBody');
    if (!body) return;
    if (lastCareApps.some((a: any) => !withinCareWindow(a))) { renderCare(lastCareApps.filter(withinCareWindow)); return; } // 방금 48시간이 지난 카드는 사라짐
    body.querySelectorAll<any>('[data-rel]').forEach((el: any) => { el.textContent = relTime(el.dataset.rel); });
    body.querySelectorAll<any>('.app-timer[data-created]').forEach(setTimerText);
  }
  setInterval(tickCare, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickCare(); }); // 탭에 돌아오면 바로 갱신 (백그라운드 탭은 타이머가 느려짐)
  function managerBlock(a?: any, st?: any) {
    if (!st.assigned) return null;
    const m = a._manager || {}; // 매니저 정보가 없어도(null/undefined) 안전하게 기본값으로
    const name = m.name || '';
    const box = h('div', 'manager app-manager');
    box.appendChild(h('div', 'manager-avatar', name ? name.charAt(0) : '매'));
    const info = h('div', 'manager-info');
    info.appendChild(h('div', 'manager-role', '담당 매니저'));
    info.appendChild(h('div', 'manager-name', name ? name + ' 매니저' : '담당 케어 매니저 지정됨')); // 매니저 이름·연락처를 못 가져와도 배정 사실은 표시
    if (m.cert) info.appendChild(h('div', 'manager-meta', m.cert));
    const verify = verifyLinksRow(a); // 매니저가 남긴 GPS/사진 인증이 있으면 이름 아래에 작은 링크로만 노출
    if (verify) info.appendChild(verify);
    box.appendChild(info);
    const actions = h('div', 'manager-actions');
    const infoBtn = h('button', 'btn manager-info-btn');
    infoBtn.type = 'button';
    infoBtn.append(svgPhoneIcon(15), '매니저 정보 확인하기');
    infoBtn.addEventListener('click', () => openManagerInfoModal(m, name));
    actions.appendChild(infoBtn);
    box.appendChild(actions);
    return box;
  }
  function verifyLinksRow(a?: any) {
    if (!a._schedule) return null; // 매니저가 아직 일정을 수락하지 않았으면(care_schedules 없음) 표시하지 않음
    const checkpoints = resolveReportCheckpoints(a, reportForSchedule(a) || {});
    const row = h('div', 'manager-verify-row');
    reportTimelineStepsFor(a).forEach((step: any) => {
      const cp = checkpoints[step.key];
      const at = cp && cp.at && !isNaN(new Date(cp.at).getTime()) ? cp.at : null;
      if (!at || !(cp.location || cp.photo)) return; // 실제 GPS/사진 기록이 있는 단계만 링크로 노출
      const btn = h('button', 'manager-verify-btn', step.label + ' 인증 보기');
      btn.type = 'button';
      btn.addEventListener('click', () => openVerifyViewModal(step.label, at, cp.location, cp.photo));
      row.appendChild(btn);
    });
    return row.childElementCount ? row : null;
  }
  function proposalBlock(a?: any, proposal?: any) {
    const box = h('div', 'propose-box');
    box.appendChild(h('div', 'propose-label', '매니저 제안 일시'));
    box.appendChild(h('div', 'propose-value', fmtProposedDateTime(proposal.proposedDate)));
    box.appendChild(h('p', 'propose-hint', '매니저가 새로운 일정을 제안했어요. 확인 후 수락하시면 이 일시로 배정이 확정돼요.'));
    const actions = h('div', 'propose-actions');
    const acceptBtn = h('button', 'btn btn-sm', '제안 수락');
    acceptBtn.type = 'button';
    acceptBtn.addEventListener('click', () => acceptScheduleProposal(a));
    const rejectBtn = h('button', 'btn btn-sm btn-ghost', '거절 · 기존 유지');
    rejectBtn.type = 'button';
    rejectBtn.addEventListener('click', () => rejectScheduleProposal(a));
    actions.append(acceptBtn, rejectBtn);
    box.appendChild(actions);
    return box;
  }
  function acceptScheduleProposal(a?: any) {
    setScheduleProposalStatus(a.id, PROPOSAL_STATUS.CONFIRMED);
    showToast('제안을 수락했습니다. 새 일정으로 배정이 확정되었어요.');
    renderCare(lastCareApps);
  }
  function rejectScheduleProposal(a?: any) {
    clearScheduleProposal(a.id);
    showToast('제안을 거절하고 기존 일정을 유지했습니다.');
    renderCare(lastCareApps);
  }
  function careStepIndex(a?: any, st?: any) {
    const step = resolveCareStep(a);
    if (step != null) return step;
    if (st.tone === 'done') return CARE_STEP_LAST;
    if (st.assigned) return 1;
    return 0;
  }
  function careProgressBar(a?: any, st?: any) {
    const cur = careStepIndex(a, st);
    const labels = careStepLabelsFor(a);
    const last = labels.length - 1;
    const stepper = h('ol', 'stepper app-stepper');
    stepper.setAttribute('aria-label', '케어 진행 단계');
    labels.forEach((label: any, i: any) => {
      const done = i < cur || cur >= last;
      const current = !done && i === cur;
      const li = h('li', 'step' + (done ? ' is-done' : current ? ' is-current' : ''));
      if (current) li.setAttribute('aria-current', 'step');
      if (done) li.appendChild(h('span', 'step-check', '✓'));
      li.appendChild(h('span', 'step-label', label));
      stepper.appendChild(li);
    });
    return stepper;
  }
  function pendingTimeline() {
    const stepper = h('ol', 'stepper app-stepper pending-stepper');
    stepper.setAttribute('aria-label', '신청 진행 단계');
    const step1 = h('li', 'step is-done');
    step1.appendChild(h('span', 'step-check', '✓'));
    step1.appendChild(h('span', 'step-label', '신청 완료'));
    const step2 = h('li', 'step is-current');
    step2.setAttribute('aria-current', 'step');
    step2.appendChild(h('span', 'step-label', '매니저 배정 중 (' + CARE_WINDOW_HOURS + '시간 이내 확정)'));
    const step3 = h('li', 'step');
    step3.appendChild(h('span', 'step-label', '동행 시작'));
    stepper.append(step1, step2, step3);
    return stepper;
  }
  let scheduleChangesChannel: any = null;
  function subscribeCareScheduleChanges() {
    if (!supabaseClient || scheduleChangesChannel || !currentUser) return;
    console.log('[Realtime] care_schedules 구독 시작 · guardian_id =', currentUser.id);
    scheduleChangesChannel = supabaseClient
      .channel('care-schedule-changes:' + currentUser.id)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'care_schedules', filter: 'guardian_id=eq.' + currentUser.id },
        (payload: any) => {
          try {
            const oldStatus = payload.old && payload.old.status;
            const newStatus = payload.new && payload.new.status;
            console.log('[Realtime] care_schedules UPDATE payload:', payload);
            console.log('[Realtime] status 변경 감지:', oldStatus, '→', newStatus);
            if (oldStatus === newStatus) {
              return;
            }
            loadCare(true).then(() => {
              const matched = lastCareApps.find((a: any) => a._schedule && a._schedule.schedule_id === (payload.new && payload.new.id));
              console.log('[Realtime] loadCare() 재조회 완료 → 화면에 반영된 schedule.status:',
                matched && matched._schedule ? matched._schedule.schedule_status : '(연결된 신청을 못 찾음)',
                '· 정규화된 단계:', matched ? normalizeCareStep(matched._schedule && matched._schedule.schedule_status) : null);
            }).catch((e: any) => console.error('[Realtime] loadCare() 재조회 실패:', e));
          } catch (e: any) {
            console.error('[Realtime] care_schedules UPDATE 이벤트 처리 중 오류:', e);
          }
        })
      .subscribe((status: any) => console.log('[Realtime] 구독 상태:', status));
  }
  let arrivalLogsChannel: any = null;
  function subscribeArrivalVerificationLogs() {
    if (!supabaseClient || arrivalLogsChannel || !currentUser) return;
    arrivalLogsChannel = supabaseClient
      .channel('arrival-verification-logs:' + currentUser.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'arrival_verification_logs' },
        (payload: any) => {
          const row = payload.new || {};
          console.log('[Realtime] arrival_verification_logs INSERT:', row);
          showToast('매니저님이 병원에 도착했습니다 (인증 사진 및 시간 확인 가능)');
          loadCare(true).catch((e: any) => console.error('[Realtime] 도착 인증 로그 반영을 위한 loadCare() 재조회 실패:', e));
        })
      .subscribe((status: any) => console.log('[Realtime] arrival_verification_logs 구독 상태:', status));
  }
  window.addEventListener('beforeunload', () => {
    if (scheduleChangesChannel) supabaseClient.removeChannel(scheduleChangesChannel);
    if (arrivalLogsChannel) supabaseClient.removeChannel(arrivalLogsChannel);
    if (careCheckpointsRealtimeChannel) supabaseClient.removeChannel(careCheckpointsRealtimeChannel);
    if (careCheckpointsChannel) careCheckpointsChannel.close();
  });
  function applicationCard(a?: any) {
    const svc = serviceInfo(a.service_type);
    const st = effectiveStatusInfo(a); // 매니저의 실시간 인증 상태(이동 중/병원 도착 등)나 일정 변경 제안이 있으면 그 상태를 우선 표시
    const req = parseRequestDetails(a.request_details);
    const proposal = getScheduleProposal(a.id);
    const card = h('li', 'app-card tone-' + st.tone);
    card.dataset.appId = a.id; // 취소 시 이 카드만 짚어 부드럽게 사라지는 전환을 걸기 위한 훅(fadeOutApplicationCard 참고)
    const top = h('div', 'app-top');
    const title = h('div', 'app-title');
    const catBadge = h('span', 'app-icon' + (svc && svc.cat ? ' cat-' + svc.cat : ''));
    const catIcon = CATEGORY_ICONS[svc && svc.cat] || svgBundleIcon;
    catBadge.append(catIcon(14), svc ? svc.badge : '서비스');
    title.appendChild(catBadge);
    title.appendChild(h('span', '', a.service_type || '동행 서비스'));
    top.appendChild(title);
    if (svc) {
      const price = h('div', 'app-price app-price-top');
      price.appendChild(h('span', 'app-price-label', '총 예상 금액'));
      price.appendChild(h('b', '', won(svc.price) + '원'));
      price.appendChild(h('small', '', '(기본 2시간)'));
      top.appendChild(price);
    }
    card.appendChild(top);
    if (DEBUG_ALL && a._link && a._link !== 'mine') { // 테스트 모드: 내 계정과 연결되지 않은 신청 표시
      card.appendChild(h('div', 'app-debug-chip', a._link === 'null' ? 'user_id 비어 있음 (어느 계정에도 미연결)' : 'user_id 가 다른 계정: ' + a.user_id));
    }
    if (st.assigned || st.tone === 'done') {
      card.appendChild(careProgressBar(a, st));
    } else if (st.tone === 'wait') {
      card.appendChild(pendingTimeline());
    }
    if (proposal && proposal.status === PROPOSAL_STATUS.PROPOSED) {
      card.appendChild(proposalBlock(a, proposal));
    }
    const dl = h('dl', 'app-kv');
    const row = (icon, label, value, cls) => {
      const dt = h('dt');
      dt.append(icon(16), label); /* w-4 h-4 */
      dl.appendChild(dt);
      dl.appendChild(h('dd', cls || '', value));
    };
    const confirmedWhen = proposal && proposal.status === PROPOSAL_STATUS.CONFIRMED
      ? fmtProposedDateTime(proposal.proposedDate) + ' · 변경 확정' : '';
    const scheduledIso = a._schedule && a._schedule.scheduled_at;
    const actualWhen = scheduledIso ? fmtProposedDateTime(scheduledIso) + ' · 확정' : '';
    const whenValue = confirmedWhen || actualWhen || req.when || '확인 전화 시 협의';
    row(svgCalendarIcon, (confirmedWhen || actualWhen) ? '확정 일시' : '희망 일시', whenValue);
    row(svgMapPinIcon, '출발지·목적지', a.address || '-');
    if (a.user_relation) row(svgActivityIcon, '어르신과의 관계', a.user_relation);
    if (req.mobility) row(svgActivityIcon, '거동 상태', req.mobility);
    if (req.purpose) row(svgActivityIcon, '세부 목적', req.purpose);
    if (req.note) row(svgNoteIcon, '요청 사항', req.note, 'note');
    card.appendChild(dl);
    const mgr = managerBlock(a, st); // 배정 완료된 신청이면 담당 매니저 정보 (+ GPS/사진 인증 링크)
    if (mgr) card.appendChild(mgr);
    const foot = h('div', 'app-foot');
    const meta = h('div', 'app-meta');
    if (a.created_at) {
      const date = h('div', 'app-date');
      const rel = h('span', 'app-rel', relTime(a.created_at));
      rel.dataset.rel = a.created_at;
      date.append(fmtReportDate(a.created_at) + ' 신청 · ', rel);
      meta.appendChild(date);
      if (st.tone === 'wait') {
        const timer = h('span', 'app-timer');
        timer.dataset.created = careRefIso(a);
        setTimerText(timer);
        timer.title = '신청 후 ' + CARE_WINDOW_HOURS + '시간 동안 이 화면에 표시돼요';
        meta.appendChild(timer);
      }
    }
    foot.appendChild(meta);
    card.appendChild(foot);
    if (st.tone === 'wait') {
      const waitActions = h('div', 'app-done-actions');
      waitActions.appendChild(h('p', 'app-hint', '신청서 작성 후 2시간 이내에 담당 매니저가 확인 전화를 드립니다.'));
      const cancelAppBtn = h('button', 'app-cancel-link', '신청 취소하기');
      cancelAppBtn.type = 'button';
      cancelAppBtn.addEventListener('click', () => cancelMyApplication(a));
      waitActions.appendChild(cancelAppBtn);
      card.appendChild(waitActions);
    } else if (st.tone === 'done') {
      const buf = careReportBuffer(a);
      const actions = h('div', 'app-done-actions');
      if (!buf.hasReport) {
        actions.appendChild(h('p', 'app-hint', '어르신 케어가 완료되었습니다. 매니저가 리포트를 작성 중입니다.'));
        const waitBtn = h('button', 'btn btn-confirm', '리포트 작성 중');
        waitBtn.type = 'button';
        waitBtn.disabled = true;
        actions.appendChild(waitBtn);
      } else {
        actions.appendChild(h('p', 'app-hint', '매니저의 케어 리포트가 도착했습니다! 내용을 확인해 주세요.'));
        const btnRow = h('div', 'app-done-btn-row');
        const viewBtn = h('button', 'btn btn-ghost');
        viewBtn.append(svgFileIcon(16), '케어 리포트 보기');
        viewBtn.type = 'button';
        viewBtn.addEventListener('click', () => openCareReportViewModal(a, buf.report));
        btnRow.appendChild(viewBtn);
        const confirmBtn = h('button', 'btn btn-confirm', '케어 이용 완료 확정');
        confirmBtn.type = 'button';
        confirmBtn.addEventListener('click', () => confirmServiceApplication(a));
        btnRow.appendChild(confirmBtn);
        actions.appendChild(btnRow);
      }
      card.appendChild(actions);
    } else if (st.tone === 'live') {
      const issueActions = h('div', 'app-done-actions');
      const issueBtn = h('button', 'btn btn-ghost', '운영팀 문의하기');
      issueBtn.type = 'button';
      issueBtn.addEventListener('click', () => openOpsContactModal(a));
      issueActions.appendChild(issueBtn);
      card.appendChild(issueActions);
    }
    return card;
  }
  const confirmCompletionModal = $id('confirmCompletionModal');
  const confirmCompletionOkBtn = $id('confirmCompletionOkBtn');
  const confirmCompletionCancelBtn = $id('confirmCompletionCancelBtn');
  function openConfirmCompletionModal() {
    return new Promise((resolve: any) => {
      const finish = (result: any) => {
        confirmCompletionModal.hidden = true;
        confirmCompletionOkBtn.removeEventListener('click', onOk);
        confirmCompletionCancelBtn.removeEventListener('click', onCancel);
        confirmCompletionModal.removeEventListener('mousedown', onBackdrop);
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (e: any) => { if (e.target === confirmCompletionModal) finish(false); };
      const onKeydown = (e: any) => { if (e.key === 'Escape') finish(false); };
      confirmCompletionOkBtn.addEventListener('click', onOk);
      confirmCompletionCancelBtn.addEventListener('click', onCancel);
      confirmCompletionModal.addEventListener('mousedown', onBackdrop);
      document.addEventListener('keydown', onKeydown);
      confirmCompletionModal.hidden = false;
    });
  }
  async function confirmServiceApplication(a?: any) {
    if (!careReportBuffer(a).isRead) {
      showToast('먼저 케어 리포트를 확인해 주세요.');
      return;
    }
    const ok = await openConfirmCompletionModal();
    if (!ok) return;
    if (DEMO) { // 미리보기(?demo=1)는 서버가 없으므로 화면에서만 바로 반영
      a.status = 'guardian_confirmed';
      showToast('이용이 완료 처리되었습니다.');
      renderCare(lastCareApps);
      return;
    }
    try {
      const { error } = await api.confirmServiceApplication(supabaseClient, a);
      if (error) throw error;
      a.status = 'guardian_confirmed'; // 다음 폴링을 기다리지 않고 즉시 '진행 중인 신청'에서 빠지도록 낙관적으로 반영
      showToast('이용이 완료 처리되었습니다. 이용해 주셔서 감사합니다.');
      renderCare(lastCareApps);
      loadCare(true); // 서버 값으로 조용히 다시 동기화
    } catch (err: any) {
      console.error('[이용 완료 확인] confirm_service_application 실패 (supabase-confirm-application.sql 또는 supabase-guardian-confirm-completion.sql 실행 여부 확인):', errInfo(err));
      alert('처리 중 오류가 발생했습니다: ' + (err && err.message ? err.message : err));
    }
  }
  const cancelApplicationModal = $id('cancelApplicationModal');
  const cancelApplicationOkBtn = $id('cancelApplicationOkBtn');
  const cancelApplicationCancelBtn = $id('cancelApplicationCancelBtn');
  function openCancelApplicationModal() {
    return new Promise((resolve: any) => {
      const finish = (result: any) => {
        cancelApplicationModal.hidden = true;
        cancelApplicationOkBtn.removeEventListener('click', onOk);
        cancelApplicationCancelBtn.removeEventListener('click', onCancel);
        cancelApplicationModal.removeEventListener('mousedown', onBackdrop);
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (e: any) => { if (e.target === cancelApplicationModal) finish(false); };
      const onKeydown = (e: any) => { if (e.key === 'Escape') finish(false); };
      cancelApplicationOkBtn.addEventListener('click', onOk);
      cancelApplicationCancelBtn.addEventListener('click', onCancel);
      cancelApplicationModal.addEventListener('mousedown', onBackdrop);
      document.addEventListener('keydown', onKeydown);
      cancelApplicationModal.hidden = false;
    });
  }
  function fadeOutApplicationCard(applicationId?: any) {
    return new Promise((resolve: any) => {
      const el = document.querySelector<any>('.app-card[data-app-id="' + applicationId + '"]');
      if (!el) { resolve(); return; }
      el.classList.add('is-leaving');
      setTimeout(resolve, 220);
    });
  }
  async function cancelMyApplication(a?: any) {
    const ok = await openCancelApplicationModal();
    if (!ok) return;
    const CANCEL_TOAST_MSG = "신청이 취소되었습니다. 환불 및 처리 내역은 '지난 이용 내역' 탭에서 확인하실 수 있습니다.";
    const CANCEL_TOAST_MS = 4200;
    if (DEMO) { // 미리보기(?demo=1)는 서버가 없으므로 화면에서만 바로 반영
      a.status = 'CANCELLED';
      showToast(CANCEL_TOAST_MSG, CANCEL_TOAST_MS);
      await fadeOutApplicationCard(a.id);
      renderCare(lastCareApps);
      return;
    }
    try {
      const { error } = await api.cancelMyApplication(supabaseClient, a);
      if (error) throw error;
      a.status = 'CANCELLED'; // 다음 폴링을 기다리지 않고 즉시 '진행 중인 신청'에서 빠지도록 낙관적으로 반영
      showToast(CANCEL_TOAST_MSG, CANCEL_TOAST_MS);
      await fadeOutApplicationCard(a.id); // 카드가 뚝 끊기듯 사라지지 않도록, 통째 리렌더 전에 이 카드만 먼저 부드럽게 전환
      renderCare(lastCareApps); // 이 재렌더가 activeApps 에서는 빼고 '지난 이용 내역' 달력(groupScheduleByDay)에는 올립니다(effectiveStatusInfo 의 tone==='cancel' 분기)
      loadCare(true); // 서버 값으로 조용히 다시 동기화
    } catch (err: any) {
      console.error('[신청 취소] cancel_my_application 실패 (sql/guardian_cancel_application.sql 실행 여부 확인):', errInfo(err));
      const msg = String((err && err.message) || err);
      if (/ALREADY_ASSIGNED|APPLICATION_NOT_CANCELLABLE/.test(msg)) {
        showToast('이미 매니저가 배정되었거나 처리된 신청이라 취소할 수 없어요.');
        loadCare(true); // 최신 상태로 다시 불러와 화면을 서버 값과 맞춤
      } else if (/NOT_YOUR_APPLICATION/.test(msg)) {
        showToast('이 신청을 취소할 권한이 없어요. 고객센터(010-5530-5760)로 문의해 주세요.');
        loadCare(true);
      } else if (/APPLICATION_NOT_FOUND/.test(msg)) {
        showToast('신청 정보를 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.');
        loadCare(true);
      } else if (/PGRST202|Could not find the function/i.test(msg)) {
        showToast('취소 기능이 아직 준비되지 않았어요. 고객센터(010-5530-5760)로 문의해 주세요.');
        renderCare(lastCareApps);
      } else {
        showToast('취소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 4200);
        renderCare(lastCareApps);
      }
    }
  }
  const opsContactModal = $id('opsContactModal');
  function openOpsContactModal(a?: any) {
    $id('opsContactTarget').textContent =
      (a.service_type || '동행 서비스') + ' · ' + (a.senior_name || a.user_relation || '어르신');
    opsContactModal.hidden = false;
  }
  function closeOpsContactModal() { opsContactModal.hidden = true; }
  $id('opsContactCloseBtn').addEventListener('click', closeOpsContactModal);
  opsContactModal.addEventListener('mousedown', (e: any) => { if (e.target === opsContactModal) closeOpsContactModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !opsContactModal.hidden) closeOpsContactModal(); });
  function renderCare(applications?: any) {
    const body = $id('careBody');
    const badge = $id('careBadge');
    const moreBtn = $id('applyMoreBtn');
    const apps = applications || [];
    console.log('Final Render Data:', apps); // 화면에 실제로 그려지는 신청 목록 (담당 매니저 정보 포함)
    lastCareApps = apps;
    body.textContent = '';
    moreBtn.hidden = apps.length === 0;
    badge.hidden = false; // 아래에서 필요할 때만 숨김 (다시 그릴 때 숨김 상태가 남지 않도록)
    if (DEBUG_ALL) body.appendChild(h('p', 'app-debug', '테스트 모드(?debug): user_id 조건과 48시간 제한 없이, 로그인 권한(RLS)이 허용한 신청을 모두 표시합니다. 내 계정과 연결되지 않은 신청에는 표시가 붙어요.'));
    const activeApps = apps.filter((a: any) => {
      const tone = effectiveStatusInfo(a).tone;
      if (tone === 'confirmed' || tone === 'cancel') return false; // 둘 다 곧바로 이 목록에서 제외
      if (tone !== 'done') return true; // A
      return careReportBuffer(a).buffered; // B
    });
    if (apps.length) {
      badge.hidden = true;
      if (activeApps.length) {
        body.appendChild(h('p', 'app-label', '진행 중인 신청 · ' + activeApps.length + '건'));
        const visible = activeApps.slice(0, CARE_VISIBLE_COUNT);
        const rest = activeApps.slice(CARE_VISIBLE_COUNT);
        const list = h('ul', 'list app-list');
        visible.forEach((a: any) => list.appendChild(applicationCard(a)));
        body.appendChild(list);
        if (rest.length) {
          const collapse = h('div', 'app-collapse');
          const restList = h('ul', 'list app-list');
          rest.forEach((a: any) => restList.appendChild(applicationCard(a)));
          collapse.appendChild(restList);
          body.appendChild(collapse);
          const moreBtnEl = h('button', 'app-more-btn');
          moreBtnEl.type = 'button';
          const moreLabel = h('span', '', '');
          const chevron = svgChevronDown('chevron');
          moreBtnEl.append(moreLabel, chevron);
          const setMoreText = (expanded: any) => { moreLabel.textContent = expanded ? '접기' : '진행 중인 신청 ' + rest.length + '건 더보기'; };
          const applyExpandState = (expanded: any, animate: any) => {
            careListExpanded = expanded;
            moreBtnEl.classList.toggle('is-open', expanded);
            moreBtnEl.setAttribute('aria-expanded', String(expanded));
            setMoreText(expanded);
            if (!animate) collapse.style.transition = 'none';
            collapse.style.maxHeight = expanded ? collapse.scrollHeight + 'px' : '';
            if (!animate) requestAnimationFrame(() => { collapse.style.transition = ''; });
          };
          setMoreText(false);
          moreBtnEl.setAttribute('aria-expanded', 'false');
          moreBtnEl.addEventListener('click', () => applyExpandState(!moreBtnEl.classList.contains('is-open'), true));
          body.appendChild(moreBtnEl);
          if (careListExpanded) applyExpandState(true, false);
        } else {
          careListExpanded = false; // 남은 카드가 없어 아코디언 자체가 없으면 상태도 초기화
        }
      } else {
        careListExpanded = false;
        const emptyActive = h('div', 'empty');
        emptyActive.appendChild(h('span', 'empty-icon')).appendChild(svgCheckCircleIcon(30));
        emptyActive.appendChild(h('strong', '', '현재 진행 중인 케어 일정이 없습니다.'));
        emptyActive.appendChild(h('span', '', '완료되었거나 취소된 케어 내역은 아래 \'지난 이용 내역\' 달력에서 확인하실 수 있어요. 새로운 병원 진료·외출 동행이 필요하시면 언제든 신청해 주세요.'));
        body.appendChild(emptyActive);
      }
    } else {
      badge.hidden = true; // '진행 중인 신청 N건'(app-label)과 같은 패턴으로, 배지 대신 본문 위에 0건 라벨을 둠
      body.appendChild(h('p', 'app-label', '진행 중인 케어 신청 0건'));
      const empty = h('div', 'empty');
      empty.appendChild(h('span', 'empty-icon')).appendChild(svgInboxIcon(30));
      empty.appendChild(h('strong', '', '아직 신청하신 케어 일정이 없어요.'));
      empty.appendChild(h('span', '', '병원 진료·외출 동행이 필요하시면 신청해 주세요. 신청 후 48시간 동안 이곳에서 접수 상태를 확인하실 수 있습니다.'));
      empty.appendChild(document.createElement('br'));
      const link = h('a', 'btn', '동행 서비스 신청하기');
      link.href = APPLY_URL;
      empty.appendChild(link);
      body.appendChild(empty);
    }
    renderCareCalendar(); // 이 신청 목록(lastCareApps) 기준으로 하단 '이용 내역 & 케어 리포트' 달력도 함께 갱신
    updateGuardianStatusBadge(activeApps, apps.length); // 프로필 헤더의 상태 배지도 같은 목록 기준으로 동기화
    maybeAutoOpenReportFromUrl(); // ?report_id=... 로 들어온 경우, 신청/리포트 데이터가 둘 다 갖춰지는 순간 모달을 1회 자동으로 엶
  }
  async function loadSeniors() {
    const box = $id('seniorList');
    const addBtn = $id('addSeniorBtn');
    addBtn.hidden = true; // 불러오는 동안/오류 시/등록된 어르신이 없을 때는 숨김
    box.textContent = '';
    box.appendChild(h('div', 'empty', '어르신 정보를 불러오는 중…'));
    const { data: { session: liveSession } } = await supabaseClient.auth.getSession();
    const liveUid = liveSession && liveSession.user && liveSession.user.id;
    console.log('[어르신 프로필] 조회 시작 — currentUser.id=' + (currentUser && currentUser.id) +
      ' vs 지금 세션의 auth.uid()=' + liveUid + ' → ' + (liveUid === (currentUser && currentUser.id) ? '일치' : '⚠ 불일치!'));
    const { data: seniors, error } = await api.listMySeniorsAll(supabaseClient, currentUser);
    box.textContent = '';
    if (error) {
      console.error('어르신 정보 조회 에러 — user_id=' + currentUser.id + ', code=' + error.code +
        ', message=' + error.message + ', details=' + error.details + ', hint=' + error.hint,
        '\n→ 42501(RLS)이면 sql/seniors_rls_fix.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.',
        '\n원본 에러 객체:', error);
      const err = h('div', 'error-box', '어르신 정보를 불러오지 못했습니다. ');
      const retry = h('button', 'btn btn-sm btn-ghost', '다시 시도');
      retry.type = 'button';
      retry.addEventListener('click', loadSeniors);
      err.appendChild(retry);
      box.appendChild(err);
      return;
    }
    console.log('[어르신 프로필] user_id=' + currentUser.id + ' 기준 조회(.eq 필터 적용) — ' + (seniors || []).length + '건:', seniors);
    if (!seniors || seniors.length === 0) {
      const probe = await api.probeSeniorsVisibility(supabaseClient);
      if (probe.error) {
        console.warn('[어르신 프로필][진단] 필터 없는 재조회도 실패 — code=' + probe.error.code + ', message=' + probe.error.message);
      } else if ((probe.data || []).length) {
        console.warn('[어르신 프로필][진단] ⚠ RLS를 통과한 행이 ' + probe.data.length + '건 있는데도 ' +
          '.eq(\'user_id\', \'' + currentUser.id + '\') 필터에서는 0건입니다 — 이 행들의 실제 user_id 값을 ' +
          'currentUser.id 와 직접 비교해 보세요:', probe.data);
      } else {
        console.log('[어르신 프로필][진단] 필터를 완전히 뺀 조회도 0건입니다 — RLS(seniors_select_own)가 전혀 ' +
          '적용되지 않았거나(그러면 정책이 없는 게 아니라 "아무 행도 안 보임"이라 42501 과는 다른 증상), ' +
          '이 계정의 seniors 행이 정말 하나도 없는 상태입니다. sql/seniors_rls_fix.sql 실행 여부를 확인하세요.');
      }
    }
    if (!seniors || seniors.length === 0) {
      const empty = h('div', 'empty');
      empty.appendChild(h('span', 'empty-icon')).appendChild(svgUserIcon(30));
      empty.appendChild(h('strong', '', '등록된 어르신이 없습니다'));
      empty.appendChild(h('span', '', '동행을 받으실 어르신 정보를 등록해 주세요.'));
      empty.appendChild(document.createElement('br'));
      const add = h('button', 'btn', '+ 어르신 등록하기');
      add.type = 'button';
      add.addEventListener('click', () => openSeniorModal());
      empty.appendChild(add);
      box.appendChild(empty);
      return;
    }
    renderSeniorTabsAndCard(seniors);
    addBtn.hidden = false; // 등록된 어르신이 있을 때만 우측 상단 '추가 등록' 버튼 표시
  }
  const MOBILITY_DISPLAY: Record<string, any> = {
    '혼자 걸음 가능': '독립 보행 가능',
    '지팡이·보행기 사용': '지팡이 이용',
    '휠체어 사용': '휠체어 이용',
    '매니저 부축 필수': '매니저 부축 필수'
  };
  function seniorDisplayName(name?: any) {
    const n = (name || '').trim();
    if (!n) return '어르신';
    return n.endsWith('어르신') ? n : n + ' 어르신';
  }
  function seniorCard(s?: any) {
    const li = h('li', 'list-item senior-card');
    const top = h('div', 'senior-top');
    const idGroup = h('div', 'senior-top-id');
    idGroup.appendChild(h('span', 'senior-name', seniorDisplayName(s.senior_name)));
    const age = calcAge(s.senior_birth);
    const metaParts = [age !== null ? '만 ' + age + '세' : '연령 미입력'];
    if (s.gender) metaParts.push(s.gender === '남' ? '남성' : s.gender === '여' ? '여성' : s.gender);
    idGroup.appendChild(h('span', 'senior-meta-badge', metaParts.join(' · ')));
    top.appendChild(idGroup);
    const actions = h('div', 'senior-actions');
    const editBtn = h('button', 'senior-action-btn');
    editBtn.type = 'button';
    editBtn.appendChild(svgEditIcon());
    editBtn.appendChild(document.createTextNode('수정'));
    editBtn.setAttribute('aria-label', s.senior_name ? s.senior_name + ' 정보 수정' : '어르신 정보 수정');
    editBtn.addEventListener('click', () => openSeniorModal(s));
    actions.appendChild(editBtn);
    const deleteBtn = h('button', 'senior-action-btn is-danger');
    deleteBtn.type = 'button';
    deleteBtn.appendChild(svgDeleteIcon());
    deleteBtn.appendChild(document.createTextNode('삭제'));
    deleteBtn.setAttribute('aria-label', s.senior_name ? s.senior_name + ' 프로필 삭제' : '어르신 프로필 삭제');
    deleteBtn.addEventListener('click', () => deleteSenior(s));
    actions.appendChild(deleteBtn);
    top.appendChild(actions);
    li.appendChild(top);
    const sectionGrid = h('div', 'senior-section-grid');
    const basicSection = h('div', 'senior-section');
    basicSection.appendChild(h('h4', 'senior-section-title', '기본 정보'));
    basicSection.appendChild(seniorInfoItem(svgPhoneIcon, '연락처', h('span', 'senior-info-value', s.senior_phone || '-')));
    const addressBody = h('div', 'senior-info-stack');
    if (s.address) {
      addressBody.appendChild(h('span', 'senior-info-value', s.address));
      if (s.address_detail) addressBody.appendChild(h('span', 'senior-info-value-sub', s.address_detail));
    } else {
      addressBody.appendChild(h('span', 'senior-info-value', '-'));
    }
    basicSection.appendChild(seniorInfoItem(svgMapPinIcon, '자택 주소', addressBody));
    sectionGrid.appendChild(basicSection);
    const careSection = h('div', 'senior-section');
    careSection.appendChild(h('h4', 'senior-section-title', '케어 정보'));
    careSection.appendChild(seniorInfoItem(svgActivityIcon, '거동 상태',
      h('span', 'senior-mobility-badge', MOBILITY_DISPLAY[s.mobility_level] || '-')));
    const hospitalBody = h('div', 'senior-chip-group');
    if (s.frequent_hospital) {
      const hospitalText = s.frequent_hospital + (s.frequent_hospital_detail ? ' · ' + s.frequent_hospital_detail : '');
      hospitalBody.appendChild(h('span', 'senior-chip', hospitalText));
    } else {
      hospitalBody.appendChild(h('span', 'senior-info-empty', '등록된 병원이 없습니다'));
    }
    careSection.appendChild(seniorInfoItem(svgHospitalIcon, '자주 가는 병원', hospitalBody));
    sectionGrid.appendChild(careSection);
    li.appendChild(sectionGrid);
    const noteBox = h('div', 'senior-note-box');
    const noteIcon = h('span', 'senior-info-icon');
    noteIcon.appendChild(svgNoteIcon(16));
    noteBox.appendChild(noteIcon);
    const noteBody = h('div', 'senior-info-body');
    noteBody.appendChild(h('span', 'senior-info-label', '특이사항'));
    if (s.health_note) {
      const noteChips = h('div', 'senior-chip-group');
      noteChips.appendChild(h('span', 'senior-chip', s.health_note));
      noteBody.appendChild(noteChips);
    } else {
      noteBody.appendChild(h('span', 'senior-info-empty', '등록된 특이사항이 없습니다'));
    }
    noteBox.appendChild(noteBody);
    li.appendChild(noteBox);
    return li;
  }
  let activeSeniorId: any = null;
  function renderSeniorTabsAndCard(seniors?: any) {
    const box = $id('seniorList');
    box.textContent = '';
    const list = h('ul', 'list');
    if (seniors.length > 1) {
      if (!seniors.some((s: any) => s.senior_id === activeSeniorId)) activeSeniorId = seniors[0].senior_id;
      const tabs = h('div', 'senior-tabs');
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '어르신 선택');
      seniors.forEach((s: any) => {
        const isActive = s.senior_id === activeSeniorId;
        const tabBtn = h('button', 'senior-tab' + (isActive ? ' is-active' : ''), s.senior_name || '(이름 없음)');
        tabBtn.type = 'button';
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-selected', String(isActive));
        tabBtn.addEventListener('click', () => { activeSeniorId = s.senior_id; renderSeniorTabsAndCard(seniors); });
        tabs.appendChild(tabBtn);
      });
      box.appendChild(tabs);
      list.appendChild(seniorCard(seniors.find((s: any) => s.senior_id === activeSeniorId) || seniors[0]));
    } else {
      list.appendChild(seniorCard(seniors[0]));
    }
    box.appendChild(list);
  }
  const fmtReportDate = (iso: any) => {
    const k = toKst(iso); // KST 고정 변환 — 자정 근처 시각이 로컬 시간대에 따라 하루 어긋나 보이는 것을 방지
    return k ? k.getUTCFullYear() + '.' + String(k.getUTCMonth() + 1).padStart(2, '0') + '.' + String(k.getUTCDate()).padStart(2, '0') : '';
  };
  const CARE_REPORTS_ENABLED = true;
  let lastCareReports: any[] = [];
  const REPORT_BASE_COLS = 'report_id, submitted_at, scheduled_at, senior_name, destination, manager_name, physician_notes, senior_condition';
  const REPORT_OPTIONAL_COLS = ['schedule_id', 'read_at', 'application_id', 'condition_tags', 'photos', 'next_visit_date', 'care_type', 'quick_tags', 'manager_memo', 'ai_message'];
  async function queryReports() {
    let remaining = REPORT_OPTIONAL_COLS.slice();
    for (;;) {
      const cols = REPORT_BASE_COLS + (remaining.length ? ', ' + remaining.join(', ') : '');
      const { data, error } = await api.listGuardianCareReports(supabaseClient, cols);
      if (!error || error.code !== '42703' || !remaining.length) return { data, error };
      const msg = String(error.message || '');
      const hitIdx = remaining.findIndex((c: any) => msg.includes(c));
      remaining.splice(hitIdx >= 0 ? hitIdx : 0, 1);
      logOnce('warn', 'report-cols-42703-' + remaining.length,
        '[케어 리포트] guardian_care_reports 컬럼 일부가 없습니다(42703):', msg, '→ 줄여서 다시 시도:', cols,
        '\n확인: supabase-care-report-read-tracking.sql 을 이 Supabase 프로젝트에 실행했는지 (CREATE OR REPLACE VIEW 가 컬럼 순서 제약으로 실패하지 않았는지도 함께 확인하세요)');
    }
  }
  const reportsSignature = (list: any) => JSON.stringify((list || []).map((r: any) => [r.report_id, r.read_at || null]));
  let lastReportsSig = '';
  async function loadReports(silent?: any) {
    if (DEMO && silent) return; // 미리보기는 고정 데이터라 다시 불러올 필요가 없음
    if (DEMO) { lastCareReports = DEMO_REPORTS; renderCare(lastCareApps); return; }
    if (!CARE_REPORTS_ENABLED) { lastCareReports = []; renderCare(lastCareApps); return; } // 요청 없이 '리포트 없음' 상태만 표시
    const { data: reports, error } = await queryReports();
    console.log('Fetched Reports:', reports, error ? ('| error: ' + JSON.stringify(errInfo(error))) : '');
    if (error) {
      logOnce('error', 'reports-fetch-' + (error.code || error.message), '케어 리포트 조회 에러:', errInfo(error),
        '\n확인: supabase-care-report-read-tracking.sql · supabase-guardian-care-reports-application-id.sql · supabase-guardian-care-reports-fix-visibility.sql 을 이 Supabase 프로젝트에 실행했는지');
      if (silent) return; // 백그라운드 폴링 실패는 화면을 건드리지 않고 다음 폴링에서 조용히 재시도
      lastCareReports = [];
      renderCare(lastCareApps);
      return;
    }
    const sig = reportsSignature(reports);
    if (silent && sig === lastReportsSig) return; // 바뀐 게 없으면 다시 그리지 않음
    lastReportsSig = sig;
    lastCareReports = reports || [];
    renderCare(lastCareApps);
  }
  setInterval(() => { if (!document.hidden) loadReports(true); }, CARE_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadReports(true); });
  let careCalMonth: any = null;       // 지금 보고 있는 달 (해당 월 1일 0시, Date)
  let careCalSelectedKey: any = null; // 선택한 날짜 'YYYY-MM-DD' (달을 넘기면 초기화)
  let careHistoryFilter = 'all'; // '지난 이용 내역' 상단 소형 필터: 'all' | 'done' | 'cancel'
  const calDateKey = (d: any) => {
    const k = toKst(d);
    return k ? k.getUTCFullYear() + '-' + String(k.getUTCMonth() + 1).padStart(2, '0') + '-' + String(k.getUTCDate()).padStart(2, '0') : '';
  };
  const careCompletedIso = (a: any) => (a._schedule && a._schedule.completed_at) || a.accepted_at || a.created_at;
  const careScheduleDateIso = (a: any) => {
    const p = getScheduleProposal(a.id);
    return (a._schedule && a._schedule.scheduled_at) ||
      (p && p.status === PROPOSAL_STATUS.CONFIRMED ? p.proposedDate : null) ||
      a.accepted_at || a.created_at;
  };
  function matchesHistoryFilter(tone?: any) {
    if (careHistoryFilter === 'done') return tone === 'done' || tone === 'confirmed';
    if (careHistoryFilter === 'cancel') return tone === 'cancel';
    return tone === 'done' || tone === 'confirmed' || tone === 'cancel'; // 'all'
  }
  function groupScheduleByDay(apps?: any) {
    const map = new Map();
    (apps || []).forEach((a: any) => {
      const tone = effectiveStatusInfo(a).tone;
      if (!matchesHistoryFilter(tone)) return;
      const iso = (tone === 'done' || tone === 'confirmed') ? careCompletedIso(a) : careScheduleDateIso(a);
      if (!iso || isNaN(new Date(iso).getTime())) return;
      const key = calDateKey(iso);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    map.forEach((arr: any) => arr.sort((x: any, y: any) => new Date(careScheduleDateIso(x)) - new Date(careScheduleDateIso(y))));
    return map;
  }
  function reportForSchedule(a?: any) {
    const list = lastCareReports || [];
    const scheduleId = (a._schedule && a._schedule.schedule_id) || a.schedule_id || null;
    console.log('Current Application Schedule ID:', scheduleId, '| Application ID:', a.id,
      '| available reports:', list.map((r: any) => ({ report_id: r.report_id, application_id: r.application_id, schedule_id: r.schedule_id })));
    const byApplication = list.find((r: any) => r.application_id && r.application_id === a.id);
    if (byApplication) return byApplication;
    if (!scheduleId) return null;
    return list.find((r: any) => r.schedule_id === scheduleId) || null;
  }
  const CARE_REPORT_BUFFER_HOURS = 24;
  function careReportBuffer(a?: any) {
    const report = reportForSchedule(a);
    const isRead = !!(report && report.read_at);
    const completedIso = careCompletedIso(a);
    const hoursSinceCompleted = completedIso ? (Date.now() - new Date(completedIso).getTime()) / 3600000 : Infinity;
    const buffered = hoursSinceCompleted < CARE_REPORT_BUFFER_HOURS;
    return { report, hasReport: !!report, isRead, buffered };
  }
  function renderCareCalendar() {
    const box = $id('careCalendar');
    if (!box) return; // 이 카드가 아직 DOM 에 없는 시점(초기 로드 순서)이면 조용히 건너뜀
    if (!careCalMonth) careCalMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const byDay = groupScheduleByDay(lastCareApps);
    const year = careCalMonth.getFullYear(), month = careCalMonth.getMonth();
    box.textContent = '';
    const split = h('div', 'cal-split');
    const left = h('div', 'cal-left');
    const right = h('div', 'cal-right');
    const head = h('div', 'cal-head');
    const nav = h('div', 'cal-nav');
    const prevBtn = h('button', 'cal-nav-btn', '‹');
    prevBtn.type = 'button'; prevBtn.setAttribute('aria-label', '이전 달');
    prevBtn.addEventListener('click', () => { careCalMonth = new Date(year, month - 1, 1); careCalSelectedKey = null; renderCareCalendar(); });
    const nextBtn = h('button', 'cal-nav-btn', '›');
    nextBtn.type = 'button'; nextBtn.setAttribute('aria-label', '다음 달');
    nextBtn.addEventListener('click', () => { careCalMonth = new Date(year, month + 1, 1); careCalSelectedKey = null; renderCareCalendar(); });
    nav.append(prevBtn, h('div', 'cal-month', year + '년 ' + (month + 1) + '월'), nextBtn);
    head.appendChild(nav);
    left.appendChild(head);
    const grid = h('div', 'cal-grid');
    ['일', '월', '화', '수', '목', '금', '토'].forEach((d: any, i: any) => {
      grid.appendChild(h('div', 'cal-dow' + (i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''), d));
    });
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = calDateKey(new Date());
    for (let i = 0; i < firstDow; i++) grid.appendChild(h('div', 'cal-cell is-pad'));
    for (let day = 1; day <= daysInMonth; day++) {
      const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const items = byDay.get(key) || [];
      const dow = new Date(year, month, day).getDay();
      let cls = 'cal-cell' + (dow === 0 ? ' is-sun' : dow === 6 ? ' is-sat' : '');
      if (key === todayKey) cls += ' is-today';
      if (key === careCalSelectedKey) cls += ' is-selected';
      const cell = h('div', cls);
      cell.appendChild(h('span', 'cal-daynum', String(day)));
      if (items.length) {
        cell.appendChild(h('span', 'cal-count', items.length + '건'));
        cell.addEventListener('click', () => { careCalSelectedKey = key; renderCareCalendar(); }); // 뱃지(이용 내역)가 있는 날짜만 클릭 가능
      }
      grid.appendChild(cell);
    }
    left.appendChild(grid);
    let monthCount = 0, monthDoneCount = 0, monthPaid = 0;
    byDay.forEach((arr: any, key: any) => {
      const [ky, km] = key.split('-').map(Number);
      if (ky === year && km === month + 1) {
        monthCount += arr.length;
        arr.forEach((a: any) => {
          const t = effectiveStatusInfo(a).tone;
          if (t === 'done' || t === 'confirmed') {
            monthDoneCount++;
            const svc = serviceInfo(a.service_type); if (svc) monthPaid += svc.price;
          }
        });
      }
    });
    right.appendChild(h('p', 'cal-right-title', (month + 1) + '월 요약'));
    right.appendChild(h('p', 'cal-right-hint', '완료는 완료 처리일 기준으로 집계돼요.'));
    const summary = h('div', 'cal-summary-v');
    const countStat = h('span', 'cal-stat'); countStat.append('총 이용 횟수', h('b', '', monthCount + '건'));
    const doneStat = h('span', 'cal-stat'); doneStat.append('완료', h('b', '', monthDoneCount + '건'));
    const paidStat = h('span', 'cal-stat'); paidStat.append('총 결제 금액', h('b', '', won(monthPaid) + '원'));
    summary.append(countStat, doneStat, paidStat);
    right.appendChild(summary);
    split.append(left, right);
    box.appendChild(split);
    const detail = h('div', 'cal-detail');
    if (!careCalSelectedKey) {
      detail.appendChild(h('p', 'cal-detail-title',
        byDay.size === 0 ? '지난 케어 이용 내역이 없습니다.' : '날짜를 선택하시면 해당 날짜의 케어 일정과 리포트를 확인하실 수 있습니다.'));
    } else {
      const [sy, sm, sd] = careCalSelectedKey.split('-').map(Number);
      detail.appendChild(h('p', 'cal-detail-title', sy + '년 ' + sm + '월 ' + sd + '일 케어 일정'));
      const items = byDay.get(careCalSelectedKey) || [];
      if (items.length === 0) {
        detail.appendChild(h('div', 'cal-detail-empty', '해당 날짜에 케어 일정이 없습니다.'));
      } else {
        items.forEach((a: any) => detail.appendChild(careCalCaseCard(a, reportForSchedule(a))));
      }
    }
    box.appendChild(detail);
  }
  function careCalCaseCard(a?: any, report?: any) {
    const svc = serviceInfo(a.service_type);
    const st = effectiveStatusInfo(a); // 케어 완료(done)와 보호자 최종 확인(confirmed)을 같은 배지 로직으로 구분
    const isDone = st.tone === 'done' || st.tone === 'confirmed';
    const isCancelled = st.tone === 'cancel';
    const card = h('div', 'cal-case');
    const top = h('div', 'cal-case-top');
    const timeLabel = isDone ? '케어 이용 시각' : isCancelled ? '희망 일시' : '케어 희망 시각';
    const time = h('div', 'cal-case-time');
    time.appendChild(h('span', 'cal-case-time-label', timeLabel));
    time.appendChild(document.createTextNode(fmtTime(careScheduleDateIso(a))));
    time.appendChild(h('small', '', a.service_type || '동행 서비스'));
    top.appendChild(time);
    const badges = h('div', 'cal-case-badges');
    badges.appendChild(h('span', 'app-tag tone-' + st.tone, st.label)); // [케어 진행 중]/[케어 완료]/[취소됨]/[환불 완료] 등 구분
    if (svc) badges.appendChild(h('span', 'badge' + (isCancelled ? ' is-strike' : ''), won(svc.price) + '원'));
    top.appendChild(badges);
    card.appendChild(top);
    const dl = h('dl', 'kv');
    dl.appendChild(h('dt', '', '이동 경로')); dl.appendChild(h('dd', '', a.address || '-'));
    card.appendChild(dl);
    const foot = h('div', 'sched-foot');
    if (isCancelled) {
      let cancelMsg = st.pendingExpiry
        ? '48시간 내 매니저가 배정되지 않아 자동 취소·환불 처리를 기다리고 있어요. 잠시 후 다시 확인해 주세요.'
        : a.is_package_used
          ? (a.package_restored
              ? '사용하신 패키지 횟수 1회가 정상적으로 복구되었습니다.'
              : '이 신청은 취소되었습니다. 사용하신 패키지 횟수가 곧 복구될 예정입니다.')
        : a.payment_status === 'REFUNDED'
          ? '결제하신 금액의 환불이 완료되었습니다.'
          : a.payment_status === 'PARTIALLY_REFUNDED'
            ? '케어 진행 중 중단되어, 결제하신 금액 중 일부가 환불되었습니다.'
            : a.payment_status === 'PAID'
              ? '이 신청은 취소되었습니다. 결제하신 금액의 환불은 관리자 확인 후 처리됩니다.'
              : '이 신청은 취소되었습니다.';
      if (a.payment_status === 'PARTIALLY_REFUNDED' && a.refund_amount) {
        cancelMsg += ' (환불액: ' + won(a.refund_amount) + '원)';
      }
      if (a.payment_status === 'REFUNDED' && a.refunded_at) {
        cancelMsg += ' (환불 완료 일시: ' + fmtReportDate(a.refunded_at) + ' ' + fmtTime(a.refunded_at) + ')';
      }
      if (a.is_package_used && a.package_restored && myPackageTotalRemaining != null) {
        cancelMsg += ' (취소 전 잔여 ' + formatPkgCount(Math.max(myPackageTotalRemaining - 1, 0)) + '회 → 복구 후 잔여 ' +
          formatPkgCount(myPackageTotalRemaining) + '회)';
      }
      foot.appendChild(h('span', '', cancelMsg));
    } else if (!isDone) {
      foot.appendChild(h('span', '', '현재 ' + st.label + ' 상태예요. 케어가 완료되면 리포트를 확인할 수 있어요.'));
    } else if (report) {
      const viewBtn = h('button', 'btn-outline-emerald');
      viewBtn.append(svgFileIcon(15), '케어 리포트 보기');
      viewBtn.type = 'button';
      viewBtn.addEventListener('click', () => openCareReportViewModal(a, report));
      foot.appendChild(viewBtn);
    } else {
      foot.appendChild(h('span', '', '아직 케어 리포트가 작성되지 않았어요.'));
    }
    if (isDone) {
      const receiptLink = h('button', 'receipt-link', '결제 영수증 보기');
      receiptLink.type = 'button';
      receiptLink.addEventListener('click', () => openReceiptModal(a, svc));
      foot.appendChild(receiptLink);
    }
    card.appendChild(foot);
    return card;
  }
  function openReceiptModal(a?: any, svc?: any) {
    const body = $id('receiptSummaryBody');
    body.textContent = '';
    const addRow = (label: any, value: any) => {
      if (!value) return;
      body.appendChild(h('dt', '', label));
      body.appendChild(h('dd', '', value));
    };
    const whenIso = careScheduleDateIso(a);
    addRow('서비스명', a.service_type || '동행 서비스');
    addRow('이용 일시', whenIso ? fmtReportDate(whenIso) + ' ' + fmtTime(whenIso) : '-');
    addRow('어르신', a.senior_name);
    addRow('이용 장소', a.destination || a.address);
    if (a._manager && a._manager.name) addRow('담당 매니저', a._manager.name + ' 매니저');
    if (svc) addRow('예상 금액', won(svc.price) + '원');
    $id('receiptModal').hidden = false;
  }
  function closeReceiptModal() { $id('receiptModal').hidden = true; }
  $id('receiptModalCloseBtn').addEventListener('click', closeReceiptModal);
  $id('receiptModal').addEventListener('mousedown', (e: any) => {
    if (e.target === $id('receiptModal')) closeReceiptModal();
  });
  document.addEventListener('keydown', (e: any) => {
    if (e.key === 'Escape' && !$id('receiptModal').hidden) closeReceiptModal();
  });
  const careReportViewModal = $id('careReportViewModal');
  const careReportViewConfirmedBadge = $id('careReportViewConfirmedBadge');
  let careReportViewCurrentApp: any = null; // 지금 모달에 띄운 리포트가 속한 신청
  let careReportViewCurrentReport: any = null; // 지금 모달에 띄운 리포트 자체 — wb_care_checkpoints 실시간 반영 시 재사용
  const REPORT_TIMELINE_KEYS = ['departure', 'hospital_arrival', 'treatment_complete', 'return_departure', 'return_complete'];
  const REPORT_TIMELINE_LABELS_BY_CAT: Record<string, any> = {
    hospital: ['출발/미팅', '병원 도착', '진료 완료', '귀가 이동', '귀가 및 완료'],
    life:     ['출발/미팅', '현장 도착', '대행 업무 완료', '복귀 이동', '서비스 완료'],
    mixed:    ['출발/미팅', '목적지 도착', '동행/대행 완료', '귀가 이동', '서비스 완료']
  };
  function reportTimelineStepsFor(a?: any) {
    const cat = (serviceInfo(a && a.service_type) || {}).cat;
    const labels = REPORT_TIMELINE_LABELS_BY_CAT[cat] || REPORT_TIMELINE_LABELS_BY_CAT.hospital;
    return REPORT_TIMELINE_KEYS.map((key: any, i: any) => ({ key, label: labels[i] }));
  }
  function formatGpsLocation(loc?: any) {
    if (!loc) return null;
    if (typeof loc === 'string') return loc;
    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return '위도 ' + loc.lat.toFixed(5) + ', 경도 ' + loc.lng.toFixed(5) + (loc.accuracy ? ' (오차범위 약 ' + loc.accuracy + 'm)' : '');
    }
    return null;
  }
  function normalizeCheckpointEntry(entry?: any) {
    if (!entry) return null;
    const at = entry.at || entry.time || entry.timestamp || null;
    const location = entry.location || entry.gps || entry.coords || null;
    const photo = entry.photo || entry.photo_url || entry.photoUrl || entry.image || null;
    return (at || location || photo) ? { at, location, photo } : null;
  }
  function pickCheckpointEntry(containers?: any, stepKey?: any) {
    for (const c of containers) {
      if (!c) continue;
      const raw = Array.isArray(c) ? c.find((x: any) => x && (x.key === stepKey || x.step === stepKey || x.name === stepKey)) : c[stepKey];
      const norm = normalizeCheckpointEntry(raw);
      if (norm) return norm;
    }
    return null;
  }
  function resolveReportCheckpoints(a?: any, report?: any) {
    const sc = a._schedule || {};
    const scheduleKey = report.schedule_id || sc.schedule_id;
    const localCp = readCareCheckpoint(scheduleKey) || {};
    const containers = [careCheckpointsDbCache[scheduleKey], report.checkpoints, report.timeline_logs, a.checkpoints, a.timeline_logs, localCp.checkpoints, localCp.timeline_logs, localCp];
    const legacyAt = (keys: any) => pickCheckpointTime([sc, a, report, localCp], keys);
    const legacyEntry = (keys: any, location: any, photo: any) => {
      const at = legacyAt(keys);
      return (at || location || photo) ? { at, location, photo } : null;
    };
    const resolved = {
      departure: pickCheckpointEntry(containers, 'departure') ||
        legacyEntry(['departed_at', 'departure_time'], sc.departed_location, sc.departed_photo),
      hospital_arrival: pickCheckpointEntry(containers, 'hospital_arrival') ||
        legacyEntry(['arrived_at', 'hospital_arrival_time'], sc.arrived_location, sc.arrived_photo),
      treatment_complete: pickCheckpointEntry(containers, 'treatment_complete') ||
        legacyEntry(['treatment_complete_time'], null, null),
      return_departure: pickCheckpointEntry(containers, 'return_departure') ||
        legacyEntry(['return_departure_time'], null, null),
      return_complete: pickCheckpointEntry(containers, 'return_complete') ||
        legacyEntry(['completed_at', 'return_complete_time'], null, null) ||
        (report.submitted_at && !isNaN(new Date(report.submitted_at).getTime())
          ? { at: report.submitted_at, location: null, photo: null } : null)
    };
    resolved._debug = { scheduleKey, localCp }; // renderReportTimeline() 의 진단 로그용 — resolveReportCheckpoints() 는
    return resolved;
  }
  async function renderReportTimeline(a?: any, report?: any) {
    const checkpoints = resolveReportCheckpoints(a, report);
    const steps = reportTimelineStepsFor(a);
    console.log('[케어 리포트 · 동행 타임라인] schedule_id =', checkpoints._debug.scheduleKey || '(없음)',
      '| localStorage(wb_care_checkpoints) 원본 =', checkpoints._debug.localCp);
    console.table(steps.map((step: any) => {
      const cp = checkpoints[step.key];
      return {
        단계: step.label,
        '시각(raw)': (cp && cp.at) || '없음',
        '시각(표시)': (cp && cp.at && !isNaN(new Date(cp.at).getTime())) ? fmtTime(cp.at) : '- (미기록)',
        GPS: (cp && formatGpsLocation(cp.location)) || '없음',
        사진: (cp && cp.photo) ? '있음' : '없음'
      };
    }));
    const addresses = await Promise.all(steps.map((step: any) => {
      const loc = checkpoints[step.key] && checkpoints[step.key].location;
      return (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number')
        ? reverseGeocodeCached(loc.lat, loc.lng) : Promise.resolve(null);
    }));
    const list = $id('careReportViewTimeline');
    list.textContent = '';
    steps.forEach((step: any, i: any) => {
      const cp = checkpoints[step.key];
      const at = cp && cp.at && !isNaN(new Date(cp.at).getTime()) ? cp.at : null;
      const done = !!at;
      const li = h('li', 'rv-tl-step' + (done ? ' is-done' : ' is-none')); // is-none: 미인증 단계 — 슬레이트 톤 비활성화 처리
      const rail = h('div', 'rv-tl-rail');
      rail.appendChild(h('div', 'rv-tl-dot', done ? '✓' : String(i + 1)));
      li.appendChild(rail);
      const content = h('div', 'rv-tl-content');
      const head = h('div', 'rv-tl-head');
      head.appendChild(h('span', 'rv-tl-label', step.label));
      head.appendChild(h('span', 'rv-tl-time', done ? fmtTime(at) : '- (미기록)'));
      content.appendChild(head);
      const loc = cp && cp.location;
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        const gpsLine = h('p', 'rv-tl-gps');
        const address = addresses[i];
        const gpsText = address ? (address + ' 인근') : ('위도 ' + loc.lat.toFixed(5) + ', 경도 ' + loc.lng.toFixed(5));
        gpsLine.appendChild(h('span', 'rv-tl-gps-badge', 'GPS 인증 완료 · ' + gpsText));
        content.appendChild(gpsLine);
      }
      if (cp && cp.photo) {
        const photoBtn = h('button', 'rv-tl-photo');
        photoBtn.type = 'button';
        const img = document.createElement('img');
        img.src = cp.photo; img.alt = step.label + ' 인증 사진'; img.loading = 'lazy';
        photoBtn.append(img, h('span', '', '인증 사진 보기'));
        photoBtn.addEventListener('click', () => openPhotoLightbox(cp.photo, step.label + ' 인증 사진'));
        content.appendChild(photoBtn);
      }
      li.appendChild(content);
      list.appendChild(li);
    });
  }
  function renderReportPhotos(report?: any) {
    const section = $id('careReportViewPhotosSection');
    const grid = $id('careReportViewPhotoGrid');
    grid.textContent = '';
    const photos = (report && report.photos) || [];
    section.hidden = photos.length === 0;
    photos.forEach((p: any) => {
      const btn = h('button', 'rv-photo-thumb');
      btn.type = 'button';
      const img = document.createElement('img');
      img.src = p.url; img.alt = p.label || '증빙 사진'; img.loading = 'lazy';
      btn.appendChild(img);
      if (p.label) btn.appendChild(h('span', 'rv-photo-thumb-label', p.label));
      btn.addEventListener('click', () => openPhotoLightbox(p.url, p.label));
      grid.appendChild(btn);
    });
  }
  async function openCareReportViewModal(a?: any, report?: any) {
    $id('careReportViewServicePlace').textContent =
      (a.service_type || '동행 서비스') + ' · ' + (report.destination || a.address || '장소 정보 없음');
    $id('careReportViewManager').textContent =
      report.manager_name || (a._manager && a._manager.name) || '담당 매니저 정보 없음';
    $id('careReportViewSubmitted').textContent =
      report.submitted_at ? (fmtReportDate(report.submitted_at) + ' ' + fmtTime(report.submitted_at)) : '-';
    const timelineScheduleId = report.schedule_id || (a._schedule && a._schedule.schedule_id) || null;
    console.log('[케어 리포트 · 동행 타임라인] 조회에 쓸 schedule_id =', timelineScheduleId,
      '(report.schedule_id =', report.schedule_id, ', a._schedule.schedule_id =', a._schedule && a._schedule.schedule_id, ')');
    await refreshCareCheckpointsFromDb(timelineScheduleId);
    console.log('[케어 리포트 · 동행 타임라인] care_checkpoints 조회 결과(schedule_id 별 step 캐시):',
      timelineScheduleId ? careCheckpointsDbCache[timelineScheduleId] : '(schedule_id 없음 — 조회 자체를 못 함)');
    await renderReportTimeline(a, report);
    const aiSection = $id('careReportViewAiSection');
    aiSection.hidden = !report.ai_message;
    if (report.ai_message) {
      const quickTagsBox = $id('careReportViewQuickTags');
      quickTagsBox.textContent = '';
      const quickTags = report.quick_tags || [];
      quickTagsBox.hidden = quickTags.length === 0;
      quickTags.forEach((t: any) => quickTagsBox.appendChild(h('span', 'rv-tag', t.startsWith('#') ? t : '#' + t)));
      const memoEl = $id('careReportViewMemo');
      memoEl.hidden = !report.manager_memo;
      memoEl.textContent = report.manager_memo || '';
      $id('careReportViewAiMessage').textContent = report.ai_message;
    }
    const isLifeCat = (serviceInfo(a && a.service_type) || {}).cat === 'life';
    $id('careReportViewPhysicianNotesTitle').textContent =
      isLifeCat ? '대행 업무 수행 내용 및 특이사항' : '진료 소견 · 의사 안내사항';
    $id('careReportViewPhysicianNotes').textContent = report.physician_notes || '(작성된 내용 없음)';
    const nextVisitBox = $id('careReportViewNextVisitBox');
    nextVisitBox.hidden = !report.next_visit_date;
    if (report.next_visit_date) $id('careReportViewNextVisit').textContent = fmtReportDate(report.next_visit_date);
    const medSection = $id('careReportViewMedicationSection');
    medSection.hidden = !report.medication_notes;
    if (report.medication_notes) $id('careReportViewMedication').textContent = report.medication_notes;
    const tagsBox = $id('careReportViewConditionTags');
    tagsBox.textContent = '';
    const tags = report.condition_tags || [];
    tagsBox.hidden = tags.length === 0;
    tags.forEach((t: any) => tagsBox.appendChild(h('span', 'rv-tag', t.startsWith('#') ? t : '#' + t)));
    $id('careReportViewSeniorCondition').textContent = report.senior_condition || '(작성된 내용 없음)';
    const hasLegacyDetail = !!(report.physician_notes || tags.length || (report.photos || []).length);
    $id('careReportViewLegacySection').hidden = !hasLegacyDetail && !!report.ai_message;
    $id('careReportViewConditionSection').hidden =
      !report.senior_condition && tags.length === 0 && !!report.ai_message;
    renderReportPhotos(report);
    await resetRatePanel(report);
    careReportViewCurrentApp = a;
    careReportViewCurrentReport = report;
    const tone = effectiveStatusInfo(a).tone;
    careReportViewConfirmedBadge.hidden = tone !== 'confirmed';
    careReportViewModal.hidden = false;
    if (report && !report.read_at && report.schedule_id) {
      report.read_at = new Date().toISOString();
      renderCare(lastCareApps);
      try {
        const { error } = await api.markCareReportRead(supabaseClient, report);
        if (error) throw error;
      } catch (err: any) {
        console.warn('[케어 리포트] 읽음 처리 저장 실패(supabase-care-report-read-tracking.sql 실행 여부 확인) — 화면에는 이미 반영됨:', err);
      }
    }
  }
  let pendingAutoOpenReportId = new URLSearchParams(location.search).get('report_id');
  function maybeAutoOpenReportFromUrl() {
    if (!pendingAutoOpenReportId) return;
    const report = (lastCareReports || []).find((r: any) => r.report_id === pendingAutoOpenReportId);
    if (!report) return; // 아직 로딩 전이거나(다음 폴링에서 재시도) 이 보호자 소유가 아닌 리포트
    const app = (lastCareApps || []).find((a: any) =>
      (report.application_id && report.application_id === a.id) ||
      (((a._schedule && a._schedule.schedule_id) || a.schedule_id) === report.schedule_id));
    if (!app) return; // 신청 목록이 아직 안 불려왔으면 다음 폴링에서 재시도
    pendingAutoOpenReportId = null; // 한 번만 열림 — 모달을 닫은 뒤 다음 폴링에서 다시 뜨지 않게
    const params = new URLSearchParams(location.search);
    params.delete('report_id');
    const newSearch = params.toString();
    history.replaceState(null, '', location.pathname + (newSearch ? '?' + newSearch : '') + location.hash);
    openCareReportViewModal(app, report);
  }
  function closeCareReportViewModal() { careReportViewModal.hidden = true; careReportViewCurrentReport = null; }
  $id('careReportViewCloseBtn').addEventListener('click', closeCareReportViewModal);
  careReportViewModal.addEventListener('mousedown', (e: any) => { if (e.target === careReportViewModal) closeCareReportViewModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !careReportViewModal.hidden) closeCareReportViewModal(); });
  $id('careReportViewRebookBtn').addEventListener('click', () => {
    const a = careReportViewCurrentApp, report = careReportViewCurrentReport;
    if (!a || !report) return;
    const params = new URLSearchParams();
    if (a.service_type) params.set('service', a.service_type);
    if (report.senior_name) params.set('senior_name', report.senior_name);
    const origin = report.origin || (a._schedule && a._schedule.origin);
    if (origin) params.set('origin', origin);
    const destination = report.destination || (a._schedule && a._schedule.destination) || a.address;
    if (destination) params.set('destination', destination);
    const mobilityMatch = /어르신 거동 상태:\s*([^\n]+)/.exec(a.request_details || '');
    if (mobilityMatch) params.set('mobility', mobilityMatch[1].trim());
    if (report.next_visit_date) params.set('desired_date', report.next_visit_date);
    window.location.href = 'apply.html?' + params.toString();
  });
  async function handleCareCheckpointSignal(scheduleId?: any) {
    const targets = new Set();
    if (scheduleId) targets.add(scheduleId);
    if (!careReportViewModal.hidden && careReportViewCurrentApp) {
      const sc = careReportViewCurrentApp._schedule || {};
      const openId = (careReportViewCurrentReport && careReportViewCurrentReport.schedule_id) || sc.schedule_id;
      if (openId) targets.add(openId);
    }
    await Promise.all(Array.from(targets).map(refreshCareCheckpointsFromDb));
    renderCare(lastCareApps);
    if (!careReportViewModal.hidden && careReportViewCurrentApp && careReportViewCurrentReport) {
      await renderReportTimeline(careReportViewCurrentApp, careReportViewCurrentReport);
    }
  }
  window.addEventListener('storage', (e: any) => {
    if (e.key !== CARE_CHECKPOINTS_KEY) return;
    handleCareCheckpointSignal(null);
  });
  if (careCheckpointsChannel) {
    careCheckpointsChannel.onmessage = (e: any) => {
      const scheduleId = e.data && e.data.scheduleId;
      handleCareCheckpointSignal(scheduleId || null);
    };
  }
  let careCheckpointsRealtimeChannel: any = null;
  function subscribeCareCheckpoints() {
    if (!supabaseClient || careCheckpointsRealtimeChannel || !currentUser) return;
    careCheckpointsRealtimeChannel = supabaseClient
      .channel('care-checkpoints:' + currentUser.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'care_checkpoints' },
        (payload: any) => {
          const row = payload.new || {};
          console.log('[Realtime] care_checkpoints INSERT:', row);
          handleCareCheckpointSignal(row.schedule_id || null);
        })
      .subscribe((status: any) => console.log('[Realtime] care_checkpoints 구독 상태:', status));
  }
  const rvPhotoLightbox = $id('rvPhotoLightbox');
  function openPhotoLightbox(url?: any, label?: any) {
    const img = $id('rvPhotoLightboxImg');
    img.src = url;
    img.alt = label || '증빙 사진';
    $id('rvPhotoLightboxCaption').textContent = label || '';
    rvPhotoLightbox.hidden = false;
  }
  function closePhotoLightbox() { rvPhotoLightbox.hidden = true; }
  $id('rvPhotoLightboxCloseBtn').addEventListener('click', closePhotoLightbox);
  rvPhotoLightbox.addEventListener('mousedown', (e: any) => { if (e.target === rvPhotoLightbox) closePhotoLightbox(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !rvPhotoLightbox.hidden) closePhotoLightbox(); });
  const rvRatePanel = $id('careReportViewRatePanel');
  const rvRateToggleBtn = $id('careReportViewRateToggleBtn');
  const rvRateStars = $id('careReportViewStars');
  const rvRateText = $id('careReportViewRateText');
  const rvRateSubmitBtn = $id('careReportViewRateSubmitBtn');
  const rvRateError = $id('careReportViewRateError');
  const rvRateDone = $id('careReportViewRateDone');
  const rvRateScore = $id('careReportViewRateScore');
  const rvStarBtns = Array.from(rvRateStars.querySelectorAll<any>('.rv-star'));
  const RATE_SCORE_LABELS: Record<string, any> = { 1: '매우 불만족', 2: '불만족', 3: '보통', 4: '만족', 5: '매우 만족' };
  let rvRateSelected = 0;
  let rvRateCurrentScheduleId: any = null; // care_reviews.schedule_id — report.schedule_id 가 없으면(레거시/
  function paintRateStars(value?: any) {
    rvStarBtns.forEach((btn: any) => btn.classList.toggle('is-active', Number(btn.dataset.value) <= value));
    if (value > 0) {
      rvRateScore.textContent = value + '점 (' + RATE_SCORE_LABELS[value] + ')';
      rvRateScore.hidden = false;
    } else {
      rvRateScore.hidden = true;
    }
  }
  function showRateDone(rating?: any, reviewText?: any) {
    rvRateDone.textContent = '소중한 평가 감사합니다! (★' + rating + ')';
    if (reviewText) rvRateDone.appendChild(h('span', 'rv-rate-done-text', reviewText));
    rvRateDone.hidden = false;
    rvRateStars.hidden = true;
    rvRateScore.hidden = true;
    rvRateText.hidden = true;
    rvRateSubmitBtn.hidden = true;
  }
  rvStarBtns.forEach((btn: any) => btn.addEventListener('click', () => {
    rvRateSelected = Number(btn.dataset.value);
    paintRateStars(rvRateSelected);
  }));
  rvRateStars.addEventListener('mouseover', (e: any) => {
    const btn = e.target.closest('.rv-star');
    if (btn) paintRateStars(Number(btn.dataset.value));
  });
  rvRateStars.addEventListener('mouseout', (e: any) => {
    if (!rvRateStars.contains(e.relatedTarget)) paintRateStars(rvRateSelected);
  });
  rvRateSubmitBtn.addEventListener('click', async () => {
    rvRateError.hidden = true;
    if (!rvRateSelected) { showToast('별점을 먼저 선택해 주세요.'); return; }
    if (!rvRateCurrentScheduleId) { showToast('이 리포트는 평가를 연결할 수 없어요.'); return; }
    const reviewText = rvRateText.value.trim() || null;
    rvRateSubmitBtn.disabled = true;
    try {
      const { error } = await api.upsertCareReview(supabaseClient, rvRateCurrentScheduleId, rvRateSelected, reviewText);
      if (error) throw error;
      showRateDone(rvRateSelected, reviewText);
      showToast('평가해 주셔서 감사합니다.');
    } catch (err: any) {
      console.error('[만족도 평가] 저장 실패 — sql/care_reviews.sql 을 Supabase 에 실행했는지 확인하세요:', err);
      rvRateError.textContent = '평가 저장에 실패했어요: ' + (err.message || err);
      rvRateError.hidden = false;
    } finally {
      rvRateSubmitBtn.disabled = false;
    }
  });
  rvRateToggleBtn.addEventListener('click', () => {
    const opening = rvRatePanel.hidden;
    rvRatePanel.hidden = !opening;
    rvRateToggleBtn.classList.toggle('is-open', opening);
  });
  async function resetRatePanel(report?: any) {
    rvRateCurrentScheduleId = (report && report.schedule_id) || null;
    rvRatePanel.hidden = true;
    rvRateToggleBtn.classList.remove('is-open');
    rvRateError.hidden = true;
    rvRateSelected = 0;
    paintRateStars(0);
    rvRateText.value = '';
    rvRateStars.hidden = false;
    rvRateText.hidden = false;
    rvRateSubmitBtn.hidden = false;
    rvRateDone.hidden = true;
    if (!rvRateCurrentScheduleId) {
      rvRateToggleBtn.hidden = true;
      return;
    }
    rvRateToggleBtn.hidden = false;
    const { data, error } = await api.getCareReview(supabaseClient, rvRateCurrentScheduleId);
    if (error) {
      console.warn('[만족도 평가] 기존 평가 조회 실패(sql/care_reviews.sql 실행 여부 확인):', error);
      return;
    }
    if (data) {
      rvRateSelected = data.rating;
      paintRateStars(data.rating);
      rvRateText.value = data.review_text || '';
      showRateDone(data.rating, data.review_text);
    }
  }
  const modal = $id('seniorModal');
  const modalTitle = $id('seniorModalTitle');
  const form = $id('seniorForm');
  const formError = $id('seniorFormError');
  const saveBtn = $id('seniorSaveBtn');
  function formatSeniorBirth(value?: any) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return digits.slice(0, 4) + '.' + digits.slice(4);
    return digits.slice(0, 4) + '.' + digits.slice(4, 6) + '.' + digits.slice(6);
  }
  function seniorBirthToIso(value?: any) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 8) return '';
    return digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6);
  }
  const SENIOR_PK = 'senior_id';
  let editingSeniorId: any = null; // null 이면 신규 등록, 값이 있으면 그 senior_id 를 수정
  function setRadioValue(name?: any, value?: any) {
    form.querySelectorAll<any>('input[name="' + name + '"]').forEach((el: any) => { el.checked = !!value && el.value === value; });
  }
  function seniorFieldOf(inputId?: any) {
    const input = $id(inputId);
    return input ? input.closest('.field') : null;
  }
  function setSeniorFieldError(inputId?: any, message?: any) {
    const field = seniorFieldOf(inputId);
    if (!field) return;
    field.classList.add('has-error');
    const input = $id(inputId);
    input.setAttribute('aria-invalid', 'true');
    let msg = field.querySelector<any>(':scope > .field-error');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'field-error';
      msg.id = inputId + 'Error';
      field.appendChild(msg);
    }
    msg.textContent = message;
    input.setAttribute('aria-describedby', msg.id);
  }
  function clearSeniorFieldError(inputId?: any) {
    const field = seniorFieldOf(inputId);
    if (!field || !field.classList.contains('has-error')) return;
    field.classList.remove('has-error');
    const input = $id(inputId);
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    const msg = field.querySelector<any>(':scope > .field-error');
    if (msg) msg.remove();
    updateSeniorErrorSummary();
  }
  function updateSeniorErrorSummary() {
    const left = form.querySelectorAll<any>('.field.has-error > .field-error');
    if (!left.length) { formError.hidden = true; return; }
    formError.textContent = left.length > 1 ? '빨간색으로 표시된 ' + left.length + '개 항목을 확인해 주세요.' : left[0].textContent;
    formError.hidden = false;
  }
  function clearAllSeniorFieldErrors() {
    ['seniorName', 'seniorAddress', 'seniorBirth'].forEach(clearSeniorFieldError);
  }
  function focusSeniorField(inputId?: any) {
    const field = seniorFieldOf(inputId);
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = inputId === 'seniorAddress' ? $id('seniorAddressSearchBtn')
      : (field.querySelector<any>('.wbdp-trigger') || $id(inputId));
    if (target) target.focus({ preventScroll: true });
  }
  $id('seniorName').addEventListener('input', (e: any) => {
    if (e.target.value.trim()) clearSeniorFieldError('seniorName');
  });
  $id('seniorBirth').addEventListener('input', (e: any) => {
    e.target.value = formatSeniorBirth(e.target.value);
    if (e.target.value) clearSeniorFieldError('seniorBirth');
  });
  $id('seniorBirth').addEventListener('change', () => clearSeniorFieldError('seniorBirth'));
  function openSeniorModal(senior?: any) {
    form.reset();
    formError.hidden = true;
    clearAllSeniorFieldErrors();
    $id('seniorPhone').readOnly = false;
    $id('frequentHospitalAddrNote').hidden = true; // 이전에 고른 병원 주소 안내는 모달을 다시 열 때마다 지움
    editingSeniorId = senior ? senior[SENIOR_PK] : null;
    modalTitle.textContent = senior ? '어르신 정보 수정' : '어르신 추가 등록';
    saveBtn.textContent = senior ? '수정하기' : '저장하기';
    if (senior) {
      $id('seniorName').value = senior.senior_name || '';
      $id('seniorBirth').value = senior.senior_birth ? String(senior.senior_birth).slice(0, 10).replace(/-/g, '.') : '';
      $id('seniorAddress').value = senior.address || '';
      $id('seniorAddressDetail').value = senior.address_detail || '';
      $id('seniorPhone').value = senior.senior_phone || '';
      $id('frequentHospital').value = senior.frequent_hospital || '';
      $id('frequentHospitalDetail').value = senior.frequent_hospital_detail || '';
      $id('healthNote').value = senior.health_note || '';
      setRadioValue('seniorGender', senior.gender || '');
      setRadioValue('seniorMobility', senior.mobility_level || '');
    }
    modal.hidden = false;
    $id('seniorName').focus();
  }
  function closeSeniorModal() {
    modal.hidden = true;
    editingSeniorId = null;
    $id('addSeniorBtn').focus();
  }
  function openSeniorAddressSearch() {
    if (!window.daum || !window.daum.Postcode) {
      alert('주소 검색 서비스를 불러오지 못했어요. 네트워크 상태를 확인하고 새로고침 후 다시 시도해 주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: function (data: any) {
        const addressInput = $id('seniorAddress');
        addressInput.value = data.roadAddress || data.jibunAddress || '';
        if (addressInput.value) clearSeniorFieldError('seniorAddress');
        $id('seniorAddressDetail').focus();
      }
    }).open();
  }
  $id('seniorAddressSearchBtn').addEventListener('click', openSeniorAddressSearch);
  $id('seniorAddress').addEventListener('click', openSeniorAddressSearch);
  function openFrequentHospitalSearch() {
    if (!window.WBPlaceSearch) {
      alert('병원 검색 서비스를 불러오지 못했어요. 네트워크 상태를 확인하고 새로고침 후 다시 시도해 주세요.');
      return;
    }
    window.WBPlaceSearch.open({
      apiKey: KAKAO_REST_API_KEY,
      title: '병원 검색',
      placeholder: '예: 인하대병원',
      onSelect: function (place: any) {
        $id('frequentHospital').value = place.name;
        const note = $id('frequentHospitalAddrNote');
        note.textContent = place.address ? ('선택한 주소: ' + place.address) : '선택한 장소의 주소 정보가 없습니다.';
        note.hidden = false;
        $id('frequentHospitalDetail').focus();
      }
    });
  }
  $id('frequentHospitalSearchBtn').addEventListener('click', openFrequentHospitalSearch);
  $id('frequentHospital').addEventListener('click', openFrequentHospitalSearch);
  $id('seniorModalCloseBtn').appendChild(svgCloseIcon());
  $id('addSeniorBtn').addEventListener('click', () => openSeniorModal());
  $id('seniorCancelBtn').addEventListener('click', closeSeniorModal);
  $id('seniorModalCloseBtn').addEventListener('click', closeSeniorModal);
  modal.addEventListener('mousedown', (e: any) => { if (e.target === modal) closeSeniorModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !modal.hidden) closeSeniorModal(); });
  $id('seniorPhoneSameAsGuardian').addEventListener('change', (e: any) => {
    const phoneInput = $id('seniorPhone');
    if (e.target.checked) {
      phoneInput.value = guardianPhone;
      phoneInput.readOnly = true;
    } else {
      phoneInput.readOnly = false;
      phoneInput.focus();
    }
  });
  $id('seniorPhone').addEventListener('input', (e: any) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = digits.length > 7 ? digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7)
      : digits.length > 3 ? digits.slice(0, 3) + '-' + digits.slice(3) : digits;
  });
  form.addEventListener('submit', async (e: any) => {
    e.preventDefault();
    const name = $id('seniorName').value.trim();
    const birthInput = $id('seniorBirth').value.trim();
    const birth = birthInput ? seniorBirthToIso(birthInput) : '';
    const address = $id('seniorAddress').value.trim();
    const addressDetail = $id('seniorAddressDetail').value.trim() || null;
    const note = $id('healthNote').value.trim();
    const gender = (form.querySelector<any>('input[name="seniorGender"]:checked') || {}).value || null;
    const seniorPhone = $id('seniorPhone').value.trim() || null;
    const mobilityLevel = (form.querySelector<any>('input[name="seniorMobility"]:checked') || {}).value || null;
    const frequentHospital = $id('frequentHospital').value.trim() || null;
    const frequentHospitalDetail = $id('frequentHospitalDetail').value.trim() || null;
    clearAllSeniorFieldErrors();
    const invalid: any[] = [];
    if (!name) invalid.push(['seniorName', '어르신 성함을 입력해 주세요.']);
    const [birthYear, birthMonth, birthDay] = birth ? birth.split('-').map(Number) : [];
    const parsedBirth = birth ? new Date(Date.UTC(birthYear, birthMonth - 1, birthDay)) : null;
    const today = new Date();
    const todayIso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    const validBirthDate = !!parsedBirth && !Number.isNaN(parsedBirth.getTime()) && parsedBirth.toISOString().slice(0, 10) === birth && birth <= todayIso;
    if (birthInput && (!birth || !validBirthDate || calcAge(birth) === null)) invalid.push(['seniorBirth', '생년월일을 올바르게 입력해 주세요. (미래 날짜이거나 형식이 올바르지 않습니다)']);
    if (!address) invalid.push(['seniorAddress', '[주소 검색]을 눌러 거주지 주소를 선택해 주세요.']);
    if (invalid.length) {
      invalid.forEach(([id, message]: any) => setSeniorFieldError(id, message));
      updateSeniorErrorSummary();
      focusSeniorField(invalid[0][0]);
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = editingSeniorId ? '수정 중…' : '저장 중…';
    const payload = {
      senior_name: name, senior_birth: birth || null, address: address, address_detail: addressDetail, health_note: note,
      gender: gender, senior_phone: seniorPhone, mobility_level: mobilityLevel, frequent_hospital: frequentHospital,
      frequent_hospital_detail: frequentHospitalDetail
    };
    const { data: savedRow, error } = editingSeniorId
      ? await api.updateSenior(supabaseClient, payload, SENIOR_PK, editingSeniorId, currentUser)
      : await api.insertSenior(supabaseClient, currentUser, payload);
    saveBtn.disabled = false;
    saveBtn.textContent = editingSeniorId ? '수정하기' : '저장하기';
    if (error) {
      formError.textContent = '저장 중 오류가 발생했습니다: ' + error.message;
      formError.hidden = false;
      return;
    }
    const wasEditing = !!editingSeniorId;
    closeSeniorModal();
    showToast(wasEditing ? '어르신 정보가 수정되었습니다.' : '어르신 정보가 등록되었습니다.');
    if (savedRow && savedRow[SENIOR_PK] != null) activeSeniorId = savedRow[SENIOR_PK];
    loadSeniors();
  });
  async function deleteSenior(senior?: any) {
    const ok = confirm('정말 이 어르신 프로필을 삭제하시겠습니까?\n(이미 접수된 케어 신청 내역에는 영향을 주지 않습니다)');
    if (!ok) return;
    try {
      const { error } = await api.deleteSenior(supabaseClient, SENIOR_PK, senior, currentUser);
      if (error) {
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
        return;
      }
      showToast('어르신 프로필이 삭제되었습니다.');
      loadSeniors();
    } catch (err: any) {
      console.error('어르신 프로필 삭제 중 예외:', err);
      alert('삭제 중 오류가 발생했습니다: ' + (err && err.message ? err.message : err));
    }
  }
  const verifyViewModal = $id('verifyViewModal');
  function openVerifyViewModal(label?: any, atIso?: any, location?: any, photo?: any) {
    $id('verifyViewTitle').textContent = label + ' 인증 내역';
    $id('verifyViewSub').textContent = fmtReportDate(atIso) + ' ' + fmtTime(atIso) + ' 기록';
    const locBox = $id('verifyViewLocationBox');
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      locBox.hidden = false;
      $id('verifyViewLocationText').textContent =
        '위도 ' + location.lat.toFixed(5) + ', 경도 ' + location.lng.toFixed(5) +
        (location.accuracy ? ' (오차범위 약 ' + location.accuracy + 'm)' : '');
      $id('verifyViewMapLink').href = 'https://www.google.com/maps?q=' + location.lat + ',' + location.lng;
    } else {
      locBox.hidden = true;
    }
    const photoBox = $id('verifyViewPhotoBox');
    if (photo) {
      photoBox.hidden = false;
      $id('verifyViewPhoto').src = photo;
    } else {
      photoBox.hidden = true;
    }
    verifyViewModal.hidden = false;
  }
  function closeVerifyViewModal() { verifyViewModal.hidden = true; }
  $id('verifyViewCloseBtn').addEventListener('click', closeVerifyViewModal);
  verifyViewModal.addEventListener('mousedown', (e: any) => { if (e.target === verifyViewModal) closeVerifyViewModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !verifyViewModal.hidden) closeVerifyViewModal(); });
  function formatPhoneDisplay(raw?: any) {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (digits.length === 10) {
      return digits.startsWith('02')
        ? digits.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3')
        : digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }
    return String(raw || '').trim();
  }
  const managerInfoModal = $id('managerInfoModal');
  function openManagerInfoModal(m?: any, name?: any) {
    $id('managerInfoSub').textContent = (name ? name + ' 매니저' : '담당 케어 매니저') + '님의 정보예요.';
    const body = $id('managerInfoBody');
    body.textContent = '';
    const addRow = (label: any, value: any) => {
      body.appendChild(h('dt', '', label));
      body.appendChild(h('dd', '', value));
    };
    addRow('이름', name ? name + ' 매니저' : '담당 케어 매니저 지정됨');
    if (m.cert) addRow('자격', m.cert);
    addRow('연락처', m.phone ? formatPhoneDisplay(m.phone) : '배정 확인 중 (고객센터: 010-5530-5760)');
    managerInfoModal.hidden = false;
  }
  function closeManagerInfoModal() { managerInfoModal.hidden = true; }
  $id('managerInfoCloseBtn').addEventListener('click', closeManagerInfoModal);
  managerInfoModal.addEventListener('mousedown', (e: any) => { if (e.target === managerInfoModal) closeManagerInfoModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !managerInfoModal.hidden) closeManagerInfoModal(); });
  const MP_TAB_PANEL_ID: Record<string, any> = { care: 'careSection', seniors: 'seniorSection', history: 'careCalendarSection' };
  const MP_TAB_BTN_ID: Record<string, any> = { care: 'tabBtnCare', seniors: 'tabBtnSeniors', history: 'tabBtnHistory' };
  function moveMpTabPill() {
    const pill = $id('mpTabPill');
    const activeBtn = document.querySelector<any>('.mgr-tab.is-active');
    if (!pill || !activeBtn) return;
    pill.style.width = activeBtn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + activeBtn.offsetLeft + 'px)';
  }
  function activateMpTab(name?: any) {
    Object.keys(MP_TAB_PANEL_ID).forEach((key: any) => {
      const isActive = key === name;
      $id(MP_TAB_PANEL_ID[key]).hidden = !isActive;
      const btn = $id(MP_TAB_BTN_ID[key]);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    });
    moveMpTabPill();
  }
  Object.keys(MP_TAB_BTN_ID).forEach((key: any) => {
    $id(MP_TAB_BTN_ID[key]).addEventListener('click', () => activateMpTab(key));
  });
  window.addEventListener('resize', moveMpTabPill);
  window.addEventListener('load', moveMpTabPill);
  moveMpTabPill();
  const MP_TAB_FROM_QUERY: Record<string, any> = { elder: 'seniors', history: 'history' };
  (function openTabFromQuery() {
    const params = new URLSearchParams(location.search);
    const tab = MP_TAB_FROM_QUERY[params.get('tab')];
    if (!tab) return;
    activateMpTab(tab);
    params.delete('tab');
    const newSearch = params.toString();
    history.replaceState(null, '', location.pathname + (newSearch ? '?' + newSearch : '') + location.hash);
  })();
  (function openCouponsFromQuery() {
    const params = new URLSearchParams(location.search);
    if (params.get('openCoupons') !== '1') return;
    params.delete('openCoupons');
    const newSearch = params.toString();
    history.replaceState(null, '', location.pathname + (newSearch ? '?' + newSearch : '') + location.hash);
    setTimeout(() => {
      const stat = $id('benefitCouponStat');
      const list = $id('benefitCouponList');
      if (!stat || !list) return;
      list.hidden = false;
      stat.setAttribute('aria-expanded', 'true');
      stat.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  })();
  const careHistoryFilterBar = $id('careHistoryFilterBar');
  if (careHistoryFilterBar) {
    careHistoryFilterBar.querySelectorAll<any>('.cal-filter-chip').forEach((btn: any) => {
      btn.addEventListener('click', () => {
        careHistoryFilter = btn.dataset.filter;
        careCalSelectedKey = null;
        careHistoryFilterBar.querySelectorAll<any>('.cal-filter-chip').forEach((b: any) => b.classList.toggle('is-active', b === btn));
        renderCareCalendar();
      });
    });
  }
  function checkPackagePurchaseBanner() {
    const params = new URLSearchParams(location.search);
    const purchasedLabel = params.get('purchased');
    if (!purchasedLabel) return;
    const hours = params.get('hours');
    const banner = $id('packagePurchaseBanner');
    $id('packagePurchaseBannerText').textContent =
      purchasedLabel + ' 구매가 완료되었어요!' + (hours ? ' (' + hours + '시간 충전 완료)' : '');
    banner.hidden = false;
    $id('packagePurchaseBannerClose').addEventListener('click', () => { banner.hidden = true; }, { once: true });
    params.delete('purchased');
    params.delete('hours');
    const newSearch = params.toString();
    history.replaceState(null, '', location.pathname + (newSearch ? '?' + newSearch : '') + location.hash);
  }
  function initGuardianView(user?: any) {
    currentUser = user;
    renderProfile(user);
    checkPackagePurchaseBanner();
    loadCare();
    loadBenefitSummary();
    loadExtraCharges();
    loadMyPackages();
    loadReports();
    loadSeniors();
    subscribeCareScheduleChanges();
    subscribeCareCheckpoints();
    subscribeArrivalVerificationLogs();
  }
  setInterval(() => { if (!document.hidden && currentUser) loadExtraCharges(); }, CARE_POLL_MS);
  (async function init() {
    const loading = $id('loading');
    if (!supabaseClient) {
      loading.textContent = '로그인 모듈을 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해 주세요.';
      return;
    }
    // 1) 이 기기에 저장된 로그인(세션)으로 바로 시작합니다 — 인증 서버를 한 번 더 다녀오지 않아 첫 화면이 빨라집니다.
    //    (만료됐으면 supabase-js 가 여기서 자동 갱신합니다. 데이터 보호는 화면이 아니라 DB 권한(RLS)이 합니다.)
    // 2) 동시에 인증 서버에도 확인(getUser)해서, 탈퇴·강제 로그아웃 등으로 더는 유효하지 않으면 예전처럼 로그인 페이지로 보냅니다.
    const toLoginOrNetworkNotice = (error: any) => {
      if (error && error.name === 'AuthRetryableFetchError') { // 네트워크 문제: 로그인 화면으로 보내지 않고 안내
        loading.textContent = '사용자 정보를 확인하지 못했습니다. 네트워크 상태를 확인하고 새로고침해 주세요.';
        return;
      }
      window.location.replace('login.html'); // 비로그인 → 로그인 페이지
    };
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    const user = session && session.user;
    if (!user) {
      toLoginOrNetworkNotice(sessionError);
      return;
    }
    supabaseClient.auth.getUser().then(({ data, error }: any) => {
      if (!data || !data.user) {
        if (error && error.name === 'AuthRetryableFetchError') return; // 일시적 네트워크 문제면 이미 보여 준 화면 유지
        window.location.replace('login.html');
      }
    });
    const isManager = await WBAuth.checkIsManager(user.id);
    if (isManager && !DEMO && WBAuth.getUserMode() === 'manager') {
      window.location.replace('mypage-manager.html');
      return;
    }
    if (!isManager) WBAuth.setUserMode('guardian');
    loading.hidden = true;
    $id('app').hidden = false;
    moveMpTabPill(); // #app 이 hidden 상태였던 동안은 탭 너비를 잴 수 없었으므로, 보여진 직후 한 번 더 맞춤
    initGuardianView(user);
    supabaseClient.auth.onAuthStateChange((event: any) => {
      if (event === 'SIGNED_OUT' && !WBAuth.loggingOut) window.location.replace('login.html');
    });
  })();

}
