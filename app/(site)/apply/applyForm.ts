// 이 파일은 예전 apply.html 의 결제 스크립트를 "로직 그대로" 옮긴 것입니다 (결제·할인 계산이 달라지지 않도록).
// 화면 요소를 id 로 직접 다루는 코드라 타입을 느슨하게(any) 두었습니다. 상태 기반 React 컴포넌트로의 정리는
// NEXTJS_MIGRATION_PLAN.md 의 후속 과제입니다. DB 호출은 모두 lib/api 를 거칩니다 (원칙 2).
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const, no-var */
import { getSupabase } from '@/lib/supabase/client';
import { claimServiceApplications } from '@/lib/api/auth';
import {
  getCheckoutProfile,
  getLatestApplicantContact,
  insertServiceApplication,
  issueVirtualAccount,
  listActiveCoupons,
  listActivePackages,
} from '@/lib/api/applications';
import { findSeniorIdByName, listMySeniors, saveSenior } from '@/lib/api/seniors';
import { requestPayment } from '@/lib/payments/portone';
import { loadScript, SCRIPTS } from '@/lib/browser/load-script';
import { readPendingApplications, writePendingApplications } from '@/lib/browser/storage';
import { ROUTES, SITE } from '@/lib/config';
import { ADDONS as CATALOG_ADDONS, SERVICES as CATALOG_SERVICES } from '@/lib/services';

declare global {
  interface Window {
    daum?: any;
    WBPlaceSearch?: any;
    WBDatePicker?: any;
  }
}

/**
 * 신청서 화면 동작을 붙입니다. 이미 붙어 있으면(개발 모드의 이중 실행 등) 아무것도 하지 않습니다.
 * 돌려주는 함수를 부르면 전역 리스너를 정리합니다.
 */
export function initApplyForm(): () => void {
  const formEl = document.getElementById('applyForm');
  if (!formEl || formEl.dataset.wbInit === '1') return () => {};
  formEl.dataset.wbInit = '1';
  const cleanups: (() => void)[] = [];
  const supabaseClient: any = getSupabase();

  // 비로그인으로 저장된 신청을 내 계정에 바로 연결 (예전 WBAuth.claimPendingApplications)
  const claimNow = async () => {
    const list = readPendingApplications();
    if (!list.length) return;
    const ids = list.map((x) => x.id);
    const claimed = await claimServiceApplications(supabaseClient, ids);
    if (claimed === null) return;
    writePendingApplications(readPendingApplications().filter((x) => !ids.includes(x.id)));
  };

  // 외부 스크립트: 주소 검색 · 장소 검색 (날짜 선택기는 아래에서 불러온 뒤 붙임)
  loadScript(SCRIPTS.postcode).catch((e) => console.warn(e));
  loadScript(SCRIPTS.placeSearch).catch((e) => console.warn(e));


  const FALLBACK_FORM_URL = SITE.fallbackFormUrl;
  const KAKAO_REST_API_KEY = SITE.kakaoRestApiKey;
  async function kakaoLocalGet(url: any) {
    const res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_API_KEY } });
    if (!res.ok) throw new Error('kakao local api ' + res.status);
    return res.json();
  }
  async function geocodeAddress(text: any) {
    if (!KAKAO_REST_API_KEY || !String(text || '').trim()) return null;
    const q = encodeURIComponent(text.trim());
    const tryUrl = async (url: any) => {
      try {
        const data = await kakaoLocalGet(url);
        const doc = data.documents && data.documents[0];
        return doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
      } catch (e: any) { return null; }
    };
    return (await tryUrl(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`))
        || (await tryUrl(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}`));
  }
  const RELATIONSHIPS = ['어르신 본인', '자녀', '사위·며느리', '기타'];
  const MOBILITIES = ['혼자 걸음 가능', '지팡이·보행기 사용', '휠체어 사용', '매니저 부축 필수'];
  const PAY_METHOD_MAP: Record<string, string> = { '카드': 'CARD', '계좌이체': 'TRANSFER' };
  // 서비스별 요금·안내 문구 — 원본은 lib/catalog.json (lib/services.ts 설명 참고). 아래 코드는 예전과 같은 모양으로 만들어 씁니다.
  const SERVICES: Record<string, any> = Object.fromEntries(
    CATALOG_SERVICES.map((s) => [s.name, { price: s.basePrice, overtimeRate: s.extraPer30Min, ...s.apply }]),
  );
  const SERVICE_NAMES = Object.keys(SERVICES);
  const ADDONS: Record<string, any> = { urgent: { ...CATALOG_ADDONS.urgent } };
  const DEFAULT_TEXT = {
    destLabel: '목적지 / 방문 장소',
    destPlaceholder: '예: 방문하실 병원명 또는 장소',
    detailsPlaceholder: '예: 진료과, 장보기 목록, 은행 업무 등 구체적인 요청을 적어 주세요.'
  };
  const $ = (id: string): any => document.getElementById(id);
  const form = $('applyForm');
  const won = (n: any) => Number(n).toLocaleString('ko-KR');
  let currentPointsBalance: any = null;
  let availableCoupons: any[] = [];
  let pointsUsedValue = 0;
  const MIN_PAYABLE_AMOUNT = 100; // PG사 결제 가능 최소 금액 — 할인으로 전액을 채워 0원 결제가 되는 것을 막음
  const couponSelectEl = $('couponSelect');
  const pointsInputEl = $('pointsInput');
  const pointsMaxBtnEl = $('pointsMaxBtn');
  let activePackage: any = null;
  let activePackageTotalRemaining = 0;
  function isPackageDeductionChosen() {
    return form.querySelector('input[name="payment_method"]:checked')?.value === '패키지차감';
  }
  function defaultSubmitLabel() {
    return isPackageDeductionChosen() ? '잔여 횟수 차감 예약하기' : '신청서 및 결제하기';
  }
  function updateSubmitButtonLabel() {
    const btn = $('submitBtn');
    if (!submitting) btn.textContent = defaultSubmitLabel();
  }
  function updatePackageModeUi() {
    const usePackage = isPackageDeductionChosen();
    if (usePackage) {
      couponSelectEl.value = '';
      couponSelectEl.disabled = true;
      pointsUsedValue = 0;
      pointsInputEl.value = '';
      pointsInputEl.disabled = true;
      pointsMaxBtnEl.disabled = true;
    }
    refreshDiscountSummary();
    updateSubmitButtonLabel();
  }
  form.querySelectorAll('input[name="payment_method"]').forEach((el: any) => {
    el.addEventListener('change', updatePackageModeUi);
  });
  function currentServicePrice() {
    const svc = SERVICES[$('serviceType').value];
    return svc ? svc.price : null;
  }
  const ADDON_CHECKBOX_IDS: Record<string, string> = { urgent: 'addonUrgent' };
  function selectedAddons() {
    return Object.keys(ADDONS)
      .filter((key: any) => $(ADDON_CHECKBOX_IDS[key])?.checked)
      .map((key: any) => ({ key, ...ADDONS[key] }));
  }
  function addonTotal() {
    return selectedAddons().reduce((sum: any, a: any) => sum + a.amount, 0);
  }
  function selectedCoupon() {
    return availableCoupons.find((c: any) => c.id === couponSelectEl.value) || null;
  }
  function maxUsablePoints(price: any, couponDiscount: any, addon: any) {
    if (!currentPointsBalance) return 0;
    return Math.max(0, Math.min(currentPointsBalance, price + (addon || 0) - couponDiscount - MIN_PAYABLE_AMOUNT));
  }
  function updateDiscountInputsEnabled(enabled: any) {
    couponSelectEl.disabled = !enabled;
    if (!enabled) { pointsInputEl.disabled = true; pointsMaxBtnEl.disabled = true; }
  }
  function refreshDiscountSummary() {
    const price = currentServicePrice();
    const summary = $('discountSummary');
    const packageNote = $('dsPackageNote');
    if (!price) {
      summary.hidden = true;
      packageNote.hidden = true;
      updateDiscountInputsEnabled(false);
      updateSubmitButtonLabel();
      return;
    }
    if (isPackageDeductionChosen()) {
      updateDiscountInputsEnabled(false);
      const addon = addonTotal();
      $('dsBase').textContent = '패키지 1회 차감 (0원)';
      $('dsAddonRow').hidden = addon <= 0;
      $('dsAddon').textContent = '+' + won(addon) + '원';
      $('dsCouponRow').hidden = true;
      $('dsPointsRow').hidden = true;
      $('dsFinal').textContent = won(addon) + '원';
      packageNote.textContent = addon > 0
        ? '※ 패키지 1회가 차감되며, 선택 옵션 금액(' + won(addon) + '원)만 매니저 수락 후 별도 결제됩니다.'
        : '※ 패키지 1회가 차감되며, 결제 없이 바로 접수됩니다.';
      packageNote.hidden = false;
      summary.hidden = false;
      updateSubmitButtonLabel();
      return;
    }
    packageNote.hidden = true;
    updateDiscountInputsEnabled(true);
    const coupon = selectedCoupon();
    const couponDiscount = coupon ? coupon.amount : 0;
    const addon = addonTotal();
    const max = maxUsablePoints(price, couponDiscount, addon);
    pointsUsedValue = Math.min(pointsUsedValue, max);
    pointsInputEl.max = String(max);
    pointsInputEl.value = pointsUsedValue ? String(pointsUsedValue) : '';
    pointsInputEl.disabled = max <= 0;
    pointsMaxBtnEl.disabled = max <= 0;
    const pointsHint = $('pointsHint');
    if (currentPointsBalance === null) {
      pointsHint.hidden = true;
    } else {
      pointsHint.hidden = false;
      pointsHint.textContent = max > 0
        ? ('보유 ' + won(currentPointsBalance) + '원 중 최대 ' + won(max) + '원까지 사용할 수 있어요.')
        : (currentPointsBalance > 0 ? '지금은 더 사용할 수 있는 적립금이 없어요.' : '보유 중인 적립금이 없어요.');
    }
    $('pointsBalanceLabel').textContent = currentPointsBalance !== null ? '(보유 ' + won(currentPointsBalance) + '원)' : '';
    const finalAmount = Math.max(price + addon - couponDiscount - pointsUsedValue, 0);
    $('dsBase').textContent = won(price) + '원';
    $('dsAddonRow').hidden = addon <= 0;
    $('dsAddon').textContent = '+' + won(addon) + '원';
    $('dsCouponRow').hidden = couponDiscount <= 0;
    $('dsCoupon').textContent = '-' + won(couponDiscount) + '원';
    $('dsPointsRow').hidden = pointsUsedValue <= 0;
    $('dsPoints').textContent = '-' + won(pointsUsedValue) + '원';
    $('dsFinal').textContent = won(finalAmount) + '원';
    summary.hidden = false;
    updateSubmitButtonLabel();
  }
  pointsInputEl.addEventListener('input', () => {
    const price = currentServicePrice();
    if (!price) return;
    const coupon = selectedCoupon();
    const max = maxUsablePoints(price, coupon ? coupon.amount : 0, addonTotal());
    let v = parseInt(pointsInputEl.value, 10);
    if (!Number.isFinite(v) || v < 0) v = 0;
    pointsUsedValue = Math.min(v, max);
    refreshDiscountSummary();
  });
  pointsMaxBtnEl.addEventListener('click', () => {
    const price = currentServicePrice();
    if (!price) return;
    const coupon = selectedCoupon();
    pointsUsedValue = maxUsablePoints(price, coupon ? coupon.amount : 0, addonTotal());
    refreshDiscountSummary();
    pointsInputEl.focus();
  });
  couponSelectEl.addEventListener('change', refreshDiscountSummary);
  Object.values(ADDON_CHECKBOX_IDS).forEach((id: any) => {
    $(id).addEventListener('change', refreshDiscountSummary);
  });
  function renderCouponOptions() {
    couponSelectEl.innerHTML = '';
    couponSelectEl.appendChild(new Option('쿠폰 사용 안 함', ''));
    availableCoupons.forEach((c: any) => {
      const expiresText = c.expires_at ? new Date(c.expires_at).toLocaleDateString('ko-KR') + '까지' : '';
      couponSelectEl.appendChild(new Option(
        (c.label || '쿠폰') + ' - ' + won(c.amount) + '원 할인' + (expiresText ? ' (' + expiresText + ')' : ''),
        c.id
      ));
    });
    const hint = $('couponHint');
    if (!availableCoupons.length) {
      hint.hidden = false;
      hint.textContent = '지금 사용할 수 있는 쿠폰이 없어요.';
    } else {
      hint.hidden = true;
      const welcome = availableCoupons.find((c: any) => /WELCOME/i.test(c.code || ''));
      if (welcome) couponSelectEl.value = welcome.id;
    }
  }
  function formatPhoneDigits(digits: any) {
    if (digits.length < 4) return digits;
    if (digits.length < 8) return digits.slice(0, 3) + '-' + digits.slice(3);
    if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
  }
  $('contactPhone').addEventListener('input', (e: any) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = formatPhoneDigits(digits);
  });
  $('seniorPhone').addEventListener('input', (e: any) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = formatPhoneDigits(digits);
  });
  const ONE_HOUR_CUSTOM_VALUE = '기타 (직접 입력)';
  function updateOneHourCustomInputUi(purpose: any) {
    const isCustom = purpose === ONE_HOUR_CUSTOM_VALUE;
    $('oneHourCustomInput').hidden = !isCustom;
    if (!isCustom) $('oneHourCustomInput').value = '';
  }
  function updateOneHourPurposeUi(name: any) {
    const isOneHour = name === '1시간 라이트 케어';
    $('oneHourPurposeWrap').hidden = !isOneHour;
    if (!isOneHour) $('oneHourPurpose').value = '';
    updateOneHourCustomInputUi($('oneHourPurpose').value);
  }
  $('oneHourPurpose').addEventListener('change', (e: any) => updateOneHourCustomInputUi(e.target.value));
  function applyService(name: any) {
    const svc = SERVICES[name];
    const fee = $('feeBox');
    fee.textContent = '';
    updateOneHourPurposeUi(name);
    if (!svc) { // 아직 선택 전 (또는 알 수 없는 값)
      pointsUsedValue = 0;
      fee.className = 'fee-box is-empty';
      fee.textContent = '서비스를 선택하시면 총 예상 금액이 표시됩니다.';
      $('routeDestLabel').textContent = DEFAULT_TEXT.destLabel;
      $('routeDestination').placeholder = DEFAULT_TEXT.destPlaceholder;
      $('details').placeholder = DEFAULT_TEXT.detailsPlaceholder;
      $('routeHint').hidden = true;
      refreshDiscountSummary();
      return;
    }
    fee.className = 'fee-box';
    const main = document.createElement('div');
    main.className = 'fee-main';
    const label = document.createElement('span'); label.className = 'fee-label'; label.textContent = '총 예상 금액:';
    const amount = document.createElement('span'); amount.className = 'fee-amount'; amount.textContent = won(svc.price) + '원';
    const unit = document.createElement('span'); unit.className = 'fee-unit'; unit.textContent = svc.durationLabel || '(기본 2시간)';
    main.append(label, ' ', amount, ' ', unit);
    const note = document.createElement('p');
    note.className = 'fee-note';
    note.textContent = '* 시간 초과, 주말·야간 할증, 교통비 등 실비는 별도이며 확정 요금은 확인 전화에서 안내드립니다.';
    fee.append(main, note);
    refreshDiscountSummary();
    $('routeDestLabel').textContent = svc.destLabel;
    $('routeDestination').placeholder = svc.destPlaceholder;
    $('details').placeholder = svc.detailsPlaceholder;
    $('routeHint').textContent = svc.routeHint;
    $('routeHint').hidden = false;
  }
  const MIN_LEAD_HOURS = 24;
  const LEAD_TIME_MESSAGE = '서비스 희망일은 최소 24시간 이후부터 선택할 수 있습니다.';
  function minBookableDateTime() { return new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000); }
  $('datetimeDate').min = (() => { const d = minBookableDateTime(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const BUSINESS_HOUR_START = 8;  // 오전 8시
  const BUSINESS_HOUR_END = 18;   // 오후 6시 (18:00 까지만 선택 가능, 18:05 이후는 제외)
  loadScript(SCRIPTS.datepicker).then(() => { if (window.WBDatePicker) {
    window.WBDatePicker.attach($('datetimeDate'), { wrapClass: 'dt-date' });
    window.WBDatePicker.attach($('datetimeTime'), {
      wrapClass: 'dt-time', minuteStep: 5, minHour: BUSINESS_HOUR_START, maxHour: BUSINESS_HOUR_END
    });
  } }).catch((e: unknown) => console.warn(e));
  function formatDesiredDateTime(dateStr: any, timeStr: any) {
    if (!dateStr || !timeStr) return '';
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    const ampm = h < 12 ? '오전' : '오후';
    const h12 = (h % 12) || 12;
    const weekday = '일월화수목금토'[new Date(y, mo - 1, d).getDay()];
    return mo + '월 ' + d + '일 (' + weekday + ') ' + ampm + ' ' + h12 + '시' + (mi ? ' ' + mi + '분' : '');
  }
  function combineAddress(base: any, detail: any) {
    const b = String(base || '').trim();
    const d = String(detail || '').trim();
    return d ? (b ? b + ' ' + d : d) : b;
  }
  const SERVICE_AREAS = [
    { sido: '인천', sigunguList: ['남동구', '연수구', '미추홀구', '부평구', '계양구', '서구', '검단', '검단구'] },
    { sido: '경기', sigunguList: ['시흥시', '부천시', '안산시'] }
  ];
  function isServiceableArea(sido: any, sigungu: any) {
    const s = String(sido || '').trim();
    const g = String(sigungu || '').trim();
    if (!s || !g) return false;
    return SERVICE_AREAS.some((area: any) => s.includes(area.sido) && area.sigunguList.some((name: any) => g.startsWith(name)));
  }
  let originAreaServiceable = true;
  function checkOriginServiceArea(sido: any, sigungu: any) {
    const note = $('originAreaNote');
    const submitBtn = $('submitBtn');
    originAreaServiceable = isServiceableArea(sido, sigungu);
    note.hidden = false;
    if (originAreaServiceable) {
      note.textContent = '✅ 서비스 제공 가능 지역입니다.';
      note.className = 'addr-area-note is-ok';
      submitBtn.disabled = false;
    } else {
      note.textContent = '⚠️ 현재 서비스 준비 중인 지역입니다.';
      note.className = 'addr-area-note is-warn';
      submitBtn.disabled = true;
      openAreaModal();
    }
  }
  function openAreaModal() {
    const overlay = $('areaModalOverlay');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('areaModalClose').focus();
  }
  function closeAreaModal() {
    const overlay = $('areaModalOverlay');
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  $('areaModalClose').addEventListener('click', closeAreaModal);
  $('areaModalOverlay').addEventListener('click', (e: any) => {
    if (e.target === $('areaModalOverlay')) closeAreaModal();
  });
  const onEscKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && $('areaModalOverlay').classList.contains('is-open')) closeAreaModal();
  };
  document.addEventListener('keydown', onEscKey);
  cleanups.push(() => document.removeEventListener('keydown', onEscKey));
  function openAddressSearch() {
    if (!window.daum || !window.daum.Postcode) {
      alert('주소 검색 서비스를 불러오지 못했어요. 네트워크 상태를 확인하고 새로고침 후 다시 시도해 주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: function (data: any) {
        const address = data.roadAddress || data.jibunAddress || '';
        $('routeOrigin').value = address;
        $('routeOriginZip').value = data.zonecode || '';
        $('f-route').classList.remove('has-error');
        $('e-route').hidden = true;
        checkOriginServiceArea(data.sido, data.sigungu);
        $('routeOriginDetail').focus();
      }
    }).open();
  }
  function openDestinationSearch() {
    if (!window.WBPlaceSearch) {
      alert('장소 검색 서비스를 불러오지 못했어요. 네트워크 상태를 확인하고 새로고침 후 다시 시도해 주세요.');
      return;
    }
    window.WBPlaceSearch.open({
      apiKey: KAKAO_REST_API_KEY,
      title: $('routeDestLabel').textContent || '목적지 검색',
      placeholder: $('routeDestination').placeholder || '장소 이름으로 검색',
      onSelect: function (place: any) {
        $('routeDestination').value = place.name;
        $('routeDestinationZip').value = '';
        $('f-route').classList.remove('has-error');
        $('e-route').hidden = true;
        const note = $('destinationNote');
        note.textContent = place.address ? ('선택한 주소: ' + place.address) : '선택한 장소의 주소 정보가 없습니다.';
        note.className = 'addr-area-note is-info';
        note.hidden = false;
        $('routeDestinationDetail').focus();
      }
    });
  }
  $('btnSearchOrigin').addEventListener('click', () => openAddressSearch());
  $('btnSearchDestination').addEventListener('click', () => openDestinationSearch());
  $('routeOrigin').addEventListener('click', () => openAddressSearch());
  $('routeDestination').addEventListener('click', () => openDestinationSearch());
  function readForm() {
    const radio = (name: any) => { const el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; };
    const desiredDate = $('datetimeDate').value;
    const desiredTime = $('datetimeTime').value;
    return {
      service_type: $('serviceType').value,
      one_hour_purpose: $('oneHourPurpose').value || '',
      one_hour_custom: $('oneHourCustomInput').value.trim(),
      relationship: radio('relationship'),
      senior_name: $('seniorName').value.trim(),
      senior_id: selectedSeniorProfile ? selectedSeniorProfile.senior_id : null,
      senior_age: selectedSeniorProfile ? calcAge(selectedSeniorProfile.senior_birth) : null,
      senior_note: selectedSeniorProfile ? (selectedSeniorProfile.health_note || null) : null,
      senior_phone: $('seniorPhone').value.trim() || null,
      senior_gender: selectedSeniorProfile ? (selectedSeniorProfile.gender || null) : null,
      applicant_name: $('contactName').value.trim(),
      applicant_phone: $('contactPhone').value.trim(),
      desired_date: desiredDate,
      desired_time: desiredTime,
      desired_datetime: formatDesiredDateTime(desiredDate, desiredTime),
      route_origin_base: $('routeOrigin').value.trim(),
      route_destination_base: $('routeDestination').value.trim(),
      route_origin: combineAddress($('routeOrigin').value, $('routeOriginDetail').value),
      route_destination: combineAddress($('routeDestination').value, $('routeDestinationDetail').value),
      request_details: $('details').value.trim() || null,
      mobility: radio('mobility'),
      payment_method: radio('payment_method'),
      privacy_consent: $('consent').checked,
      terms_agreement: $('terms').checked,  // 이용약관 동의: 필수 입력으로 검증만 함 (DB 에는 별도 컬럼이 없어 저장하지 않음 → toDbRow 참고)
      coupon_id: selectedCoupon() ? selectedCoupon().id : null,
      coupon_discount: selectedCoupon() ? selectedCoupon().amount : 0,
      points_used: pointsUsedValue || 0,
      addon_codes: selectedAddons().map((a: any) => a.code),
      addon_total: addonTotal()
    };
  }
  function toDbRow(v: any, originPoint: any, destPoint: any) {
    const address = v.route_origin && v.route_destination ? v.route_origin + ' / ' + v.route_destination
      : (v.route_origin || v.route_destination);
    const lines = ['희망 일시: ' + v.desired_datetime, '어르신 거동 상태: ' + v.mobility];
    if (v.senior_gender) lines.push('어르신 성별: ' + v.senior_gender);
    if (v.senior_phone) lines.push('어르신 연락처: ' + v.senior_phone);
    if (v.service_type === '1시간 라이트 케어' && v.one_hour_purpose) {
      const purposeText = v.one_hour_purpose === ONE_HOUR_CUSTOM_VALUE
        ? '기타 (' + v.one_hour_custom + ')'
        : v.one_hour_purpose;
      lines.push('세부 목적: ' + purposeText);
    }
    if (v.request_details) lines.push('요청 상세: ' + v.request_details);
    const price = SERVICES[v.service_type] ? SERVICES[v.service_type].price : 0;
    const usePackage = v.payment_method === '패키지차감' && !!activePackage;
    const addonTotalAmount = v.addon_total || 0;
    const discountAmount = usePackage ? price : (v.coupon_discount || 0) + (v.points_used || 0);
    return {
      service_type: v.service_type,
      user_relation: v.relationship,
      senior_name: v.senior_name,
      senior_id: v.senior_id,
      senior_age: v.senior_age,
      senior_note: v.senior_note,
      user_contact: v.applicant_name + ' / ' + v.applicant_phone,
      address: address,
      request_details: lines.join('\n'),
      origin_lat: originPoint ? originPoint.lat : null,
      origin_lng: originPoint ? originPoint.lng : null,
      destination_lat: destPoint ? destPoint.lat : null,
      destination_lng: destPoint ? destPoint.lng : null,
      privacy_agreed: v.privacy_consent,
      coupon_id: usePackage ? null : (v.coupon_id || null),
      coupon_discount: usePackage ? 0 : (v.coupon_discount || 0),
      points_used: usePackage ? 0 : (v.points_used || 0),
      addon_codes: v.addon_codes || [],
      addon_total: addonTotalAmount,
      discount_amount: discountAmount,
      final_amount: Math.max(price + addonTotalAmount - discountAmount, 0),
      package_id: usePackage ? activePackage.id : null,
      is_package_used: usePackage
    };
  }
  function validate(v: any) {
    const errors: any = {};
    if (!SERVICE_NAMES.includes(v.service_type)) errors.service = '신청하실 서비스를 선택해 주세요.';
    else if (v.service_type === '1시간 라이트 케어' && !v.one_hour_purpose) errors.service = '1시간 라이트 케어의 세부 목적을 선택해 주세요.';
    else if (v.service_type === '1시간 라이트 케어' && v.one_hour_purpose === ONE_HOUR_CUSTOM_VALUE && !v.one_hour_custom) errors.service = '기타 단기 케어 내용을 입력해 주세요.';
    if (!RELATIONSHIPS.includes(v.relationship)) errors.relationship = '어르신과의 관계를 선택해 주세요.';
    if (!v.senior_name) errors['senior-name'] = '어르신 성함을 입력해 주세요.';
    const phoneDigits = v.applicant_phone.replace(/\D/g, '').length;
    if (!v.applicant_name) errors.contact = '신청자 성함을 입력해 주세요.';
    else if (!v.applicant_phone || phoneDigits < 9) errors.contact = '연락처를 정확히 입력해 주세요. (예: 010-1234-5678)';
    if (!v.desired_date) errors.datetime = '희망 날짜를 선택해 주세요.';
    else if (!v.desired_time) errors.datetime = '희망 시간을 선택해 주세요.';
    else {
      const [y, mo, d] = v.desired_date.split('-').map(Number);
      const [desiredHour, desiredMinute] = v.desired_time.split(':').map(Number);
      const chosenDateTime = new Date(y, mo - 1, d, desiredHour, desiredMinute, 0, 0);
      if (desiredHour < BUSINESS_HOUR_START || desiredHour > BUSINESS_HOUR_END ||
          (desiredHour === BUSINESS_HOUR_END && desiredMinute > 0)) {
        errors.datetime = `서비스 운영 시간(오전 ${BUSINESS_HOUR_START}시~오후 ${BUSINESS_HOUR_END - 12}시) 내에서 선택해 주세요.`;
      } else if (chosenDateTime < minBookableDateTime()) {
        errors.datetime = LEAD_TIME_MESSAGE;
        errors.datetimeLeadTime = true;
      }
    }
    if (!v.route_origin_base || !v.route_destination_base) errors.route = '주소 검색 버튼을 통해 정식 주소를 입력해주세요.';
    else if (!originAreaServiceable) errors.route = '현재 선택하신 출발지는 서비스 준비 중인 지역입니다. 다른 주소를 선택해 주세요.';
    if (!MOBILITIES.includes(v.mobility)) errors.mobility = '어르신의 거동 상태를 선택해 주세요.';
    if (!PAY_METHOD_MAP[v.payment_method] && v.payment_method !== '패키지차감') errors.payment = '결제 수단을 선택해 주세요.';
    if (!v.terms_agreement) errors.terms = '이용약관에 동의해 주셔야 신청할 수 있어요.';
    if (!v.privacy_consent) errors.consent = '개인정보 수집 및 이용에 동의해 주셔야 신청할 수 있어요.';
    return errors;
  }
  const FIELD_KEYS = ['service', 'relationship', 'senior-name', 'contact', 'datetime', 'route', 'mobility', 'payment', 'terms', 'consent'];
  function showErrors(errors: any) {
    FIELD_KEYS.forEach((key: any) => {
      const box = $('f-' + key), msg = $('e-' + key);
      const text = errors[key];
      box.classList.toggle('has-error', !!text);
      msg.hidden = !text;
      msg.textContent = text || '';
    });
    const first = FIELD_KEYS.find((k: any) => errors[k]);
    if (first) {
      const box = $('f-' + first);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = box.querySelector('input, select');
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }
  FIELD_KEYS.forEach((key: any) => {
    $('f-' + key).addEventListener('input', () => { $('f-' + key).classList.remove('has-error'); $('e-' + key).hidden = true; });
    $('f-' + key).addEventListener('change', () => { $('f-' + key).classList.remove('has-error'); $('e-' + key).hidden = true; });
  });
  ['input', 'change'].forEach((evt: any) => form.addEventListener(evt, () => { $('formError').hidden = true; }));
  $('f-service').addEventListener('change', (e: any) => {
    if (e.target && e.target.name === 'service') applyService(e.target.value);
  });
  const NOT_READY_CODES = ['PGRST205', '42P01', 'PGRST204', '42703']; // 테이블/컬럼이 DB 에 없음 (테이블 이름·컬럼 이름 불일치 포함)
  const BAD_INPUT_CODES = ['23514', '23502', '22001', '22P02'];       // 값이 DB 규칙(체크/필수/길이/형식)에 맞지 않음
  function submitErrorMessage(error: any) {
    if (!error) return '';
    if (NOT_READY_CODES.includes(error.code)) return '신청서 접수 준비가 아직 끝나지 않았어요.';
    if (BAD_INPUT_CODES.includes(error.code)) return '입력하신 내용을 다시 확인해 주세요.';
    return '신청서를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  function isPaymentCanceled(payment: any) {
    if (!payment) return false;
    const code = String(payment.code || '').toUpperCase();
    const message = String(payment.message || payment.error_msg || '');
    return code.includes('CANCEL') || /CANCEL|취소/i.test(message);
  }
  function showFormError(message: any, code?: any) {
    const box = $('formError');
    box.classList.remove('is-notice');
    box.textContent = '';
    box.append(message + ' 문제가 계속되면 고객센터(');
    const tel = document.createElement('a'); tel.href = 'tel:01055305760'; tel.textContent = '010-5530-5760';
    box.append(tel, ') 또는 카카오톡 채널로 문의하시거나, ');
    const gf = document.createElement('a'); gf.href = FALLBACK_FORM_URL; gf.target = '_blank'; gf.rel = 'noopener noreferrer'; gf.textContent = '기존 신청서(구글폼)';
    box.append(gf, '로 신청해 주세요.');
    if (code) { // 문의할 때 원인을 바로 알 수 있도록 작게 표시 (개인정보 없음)
      const small = document.createElement('small');
      small.style.cssText = 'display:block;margin-top:6px;opacity:.75;';
      small.textContent = '오류 코드: ' + code;
      box.appendChild(small);
    }
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  let submitting = false;
  form.addEventListener('submit', async (e: any) => {
    e.preventDefault();
    if (submitting) return; // 더블 클릭으로 같은 신청이 두 번 들어가는 것 방지
    $('formError').hidden = true;
    const values = readForm();
    const errors = validate(values);
    showErrors(errors);
    if (errors.route) alert(errors.route); // 주소 검색을 건너뛴 경우: 인라인 안내와 별도로 경고창도 띄워 확실히 알림
    if (errors.datetimeLeadTime) alert(LEAD_TIME_MESSAGE); // 24시간 이내 임박 일정을 강제로 제출하려는 경우: 인라인 안내와 별도로 경고창도 띄워 확실히 알림
    if (Object.keys(errors).length) return;
    if ($('website').value) { showDone(values); return; }
    const { id: userId, email: applicantEmail } = await resolveIdentity();
    if (!userId) {
      alert('로그인이 만료되었거나 로그아웃되었습니다. 다시 로그인해 주세요.');
      window.location.href = ROUTES.login;
      return;
    }
    submitting = true;
    const btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = '제출 중…';
    const [originPoint, destPoint] = await Promise.all([
      geocodeAddress(values.route_origin), geocodeAddress(values.route_destination)
    ]);
    const row = toDbRow(values, originPoint, destPoint);
    const applicationId = newUuid();
    const insertRow = (r: any) => insertServiceApplication(supabaseClient, r);
    let linkedToAccount = !!userId;
    let { error } = await insertRow(Object.assign({}, row, { id: applicationId, applicant_email: applicantEmail },
      userId ? { user_id: userId } : {}));
    if (error && userId && error.code === '42501') {
      console.warn('[신청] user_id 를 포함한 저장이 DB 권한(42501)으로 거부되어 user_id 없이 저장합니다. 로그인 후 자동 연결로 보완됩니다. ' +
                   '→ supabase-claim-applications.sql 을 실행하세요. 오류:', error.message);
      linkedToAccount = false;
      ({ error } = await insertRow(Object.assign({}, row, { applicant_email: applicantEmail, id: applicationId })));
    }
    if (error && NOT_READY_CODES.includes(error.code)) {
      console.warn('[신청] 좌표/이메일/쿠폰/적립금/추가 옵션 컬럼이 DB 에 없어(42703/PGRST204) 그 컬럼들 없이 다시 저장합니다. → sql/supabase_schema_latest.sql, sql/user_coupons_checkout.sql 을 실행하세요. 오류:', error.message);
      const { origin_lat, origin_lng, destination_lat, destination_lng, coupon_id, coupon_discount,
        points_used, discount_amount, final_amount, addon_codes, addon_total, ...rowWithoutCoords } = row;
      ({ error } = await insertRow(Object.assign({}, rowWithoutCoords, { id: applicationId },
        linkedToAccount ? { user_id: userId } : {})));
    }
    if (!error) {
      console.log('[신청] 저장됨:', { application_id: applicationId, user_id: linkedToAccount ? userId : null });
      if (!linkedToAccount) {
        rememberPendingApplication(applicationId); // 로그인하면 내 계정에 연결
        if (userId) claimNow();
      }
      const saveProfileCheckbox = $('saveSeniorProfile');
      console.log('[신청서] 어르신 프로필 저장 체크박스 상태 — userId=' + userId +
        ', checkbox 존재=' + !!saveProfileCheckbox + ', checked=' + (saveProfileCheckbox && saveProfileCheckbox.checked));
      if (userId && saveProfileCheckbox && saveProfileCheckbox.checked) {
        saveSeniorProfileFromApplication(userId);
      }
    }
    if (error) {
      submitting = false;
      btn.disabled = false;
      btn.textContent = defaultSubmitLabel();
      console.error('신청서 저장 실패:', error.code, error.message);
      if (NOT_READY_CODES.includes(error.code)) {
        console.error('[운영자용 안내] Supabase 의 service_applications 테이블에 이 화면이 보내는 컬럼이 없습니다 ' +
                      '(service_type, user_relation, senior_name, senior_id, senior_age, senior_note, user_contact, address, request_details, privacy_agreed). ' +
                      '테이블의 컬럼 이름을 확인하거나 apply.html 의 toDbRow() 를 테이블에 맞게 고쳐 주세요(senior_* 컬럼들은 sql/supabase_schema_latest.sql 을 다시 실행하면 생깁니다). 상세: ' + error.message);
      } else if (error.code === '42501') {
        console.error('[운영자용 안내] 저장 권한(RLS 정책)이 막았습니다. service_applications 에 anon/authenticated 의 INSERT 정책이 있는지 확인해 주세요.');
      }
      if (row.is_package_used && /PACKAGE_/.test(error.message || '')) {
        console.error('[패키지 차감] 패키지를 사용할 수 없어 접수에 실패했습니다:', error.message);
        form.querySelector('input[name="payment_method"][value="카드"]').checked = true;
        updatePackageModeUi();
        showFormError('보유 패키지를 확인할 수 없어 접수하지 못했어요. 다른 결제 수단으로 다시 시도해 주세요.', error.code);
        return;
      }
      showFormError(submitErrorMessage(error), error.code);
      return;
    }
    if (row.is_package_used) {
      submitting = false;
      btn.disabled = false;
      btn.textContent = defaultSubmitLabel();
      const remainingAfter = Math.max((activePackageTotalRemaining || 1) - 1, 0);
      const addonNotice = row.addon_total > 0
        ? (' 선택하신 추가 옵션(' + won(row.addon_total) + '원)은 매니저 수락 후 별도로 결제받습니다.')
        : '';
      showDone(values, linkedToAccount ? 'linked' : (userId ? 'linking' : 'anonymous'),
        '보유 패키지에서 1회가 차감되어 예약이 접수되었습니다. (잔여 ' + remainingAfter + '회)' + addonNotice);
      return;
    }
    btn.textContent = '결제창 여는 중…';
    const payMethod = PAY_METHOD_MAP[values.payment_method] || 'CARD';
    const payableAmount = Math.max(SERVICES[values.service_type].price + (values.addon_total || 0) - (values.coupon_discount || 0) - (values.points_used || 0), 0);
    console.log('[결제] PortOne.requestPayment 호출 시작 — payMethod=' + payMethod + ', applicationId=' + applicationId +
      ', addonCodes=' + (values.addon_codes || []).join(',') + ', couponId=' + (values.coupon_id || 'none') + ', couponDiscount=' + (values.coupon_discount || 0) +
      ', pointsUsed=' + (values.points_used || 0) + ', payableAmount=' + payableAmount);
    window.scrollTo(0, 0);
    let payment: any;
    try {
      payment = await requestPayment({
        paymentId: applicationId, // issue-virtual-account/portone-webhook 이 이 값으로 application_id 를 역추적합니다
        orderName: values.service_type,
        totalAmount: payableAmount,
        currency: 'CURRENCY_KRW',
        payMethod,
        windowType: { pc: 'IFRAME', mobile: 'IFRAME' }, // 모바일에서도 전체 화면 오버레이로 고정해 레이아웃 잘림을 방지
        customer: {
          fullName: values.applicant_name,
          phoneNumber: values.applicant_phone.replace(/\D/g, ''),
          email: applicantEmail || undefined
        },
        customData: { application_id: applicationId }
      });
    } catch (e: any) {
      console.error('[결제] PortOne.requestPayment 호출 자체가 실패했습니다 — name:', e && e.name,
        '/ code:', e && e.code, '/ message:', e && e.message, '/ 원본:', e);
      payment = { code: 'CLIENT_ERROR', message: '결제창을 여는 중 오류가 발생했어요.' };
    }
    console.log('[결제] PortOne.requestPayment 응답(원본):', JSON.parse(JSON.stringify(payment || null)));
    console.log('[결제] 실패로 판단한 기준(payment.code !== undefined) 결과:', !!(payment && payment.code !== undefined));
    if (payment && payment.code !== undefined) {
      submitting = false;
      btn.disabled = false;
      btn.textContent = defaultSubmitLabel();
      console.warn('[결제] 결제가 완료되지 않았습니다:', payment.code, payment.message);
      if (isPaymentCanceled(payment)) {
        const box = $('formError');
        box.classList.add('is-notice');
        box.textContent = '결제가 취소되었습니다.';
        box.hidden = false;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        showFormError('결제가 완료되지 않았어요. (' + (payment.message || payment.code) +
          ') 신청 내용은 저장되어 있으니, 고객센터(010-5530-5760)로 문의해 주시면 결제를 도와드릴게요.');
      }
      return;
    }
    btn.textContent = '결제 확인 중…';
    const RECHECK_DELAYS_MS = [1500, 3000, 5000]; // 최초 1회 + 최대 3회 재시도, 총 대기 최대 9.5초
    let vaData: any = null, vaError: any = null;
    for (let attempt = 0; ; attempt++) {
      console.log('[결제] issue-virtual-account 호출 시도 ' + (attempt + 1) + ' — application_id=' + applicationId);
      try {
        const res: any = await issueVirtualAccount(supabaseClient, applicationId);
        vaData = res.data; vaError = res.error;
      } catch (e: any) {
        vaData = null; vaError = e;
      }
      if (!vaError) break;
      console.error('[결제] issue-virtual-account 호출 실패(' + (attempt + 1) + '번째 시도):', vaError);
      const retryable = vaError.error === 'PAYMENT_NOT_APPROVED' && attempt < RECHECK_DELAYS_MS.length;
      if (!retryable) break;
      btn.textContent = '결제 승인 확인 중… (' + (attempt + 2) + '/' + (RECHECK_DELAYS_MS.length + 1) + ')';
      await new Promise((r: any) => setTimeout(r, RECHECK_DELAYS_MS[attempt]));
    }
    submitting = false;
    btn.disabled = false;
    btn.textContent = '신청서 제출하기';
    let paymentNotice = null;
    if (vaError) {
      console.error('[결제] issue-virtual-account 재시도 끝에도 실패:', vaError);
      paymentNotice = '결제가 성공적으로 완료되었습니다.';
    } else if (vaData && vaData.status === 'PAID') {
      paymentNotice = '결제가 성공적으로 완료되었습니다.';
    }
    showDone(values, linkedToAccount ? 'linked' : (userId ? 'linking' : 'anonymous'), paymentNotice);
  });
  async function resolveIdentity() {
    try {
      const { data: { user }, error } = await supabaseClient.auth.getUser();
      if (user && user.id) return { id: user.id, email: user.email || null };
      if (!error || error.name !== 'AuthRetryableFetchError') return { id: null, email: null }; // 로그인하지 않았거나 세션이 무효
    } catch (e: any) { /* 아래에서 저장된 세션으로 대체 */ }
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const u = session && session.user;
      return { id: (u && u.id) || null, email: (u && u.email) || null };
    } catch (e: any) { return { id: null, email: null }; }
  }
  function newUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; // UUID v4 표식
    const hex = Array.from(b, (x: any) => x.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  const PENDING_KEY = 'wb_pending_applications';
  function rememberPendingApplication(id: any) {
    try {
      const now = Date.now();
      const list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]').filter((x: any) => x && x.id && now - x.at < 14 * 864e5);
      list.push({ id, at: now });
      localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-10)));
    } catch (e: any) { /* 저장소를 쓸 수 없으면(사생활 보호 모드 등) 자동 연결만 못 할 뿐, 신청은 이미 접수됨 */ }
  }
  const ANON_HINT_HTML = $('doneLoginHint').innerHTML;
  function showDone(values: any, mode?: any, paymentNotice?: any) {
    const svc = SERVICES[values.service_type];
    const addonNote = values.addon_total > 0 ? (' · 선택 옵션 ' + won(values.addon_total) + '원') : '';
    const couponNote = values.coupon_discount > 0 ? (' · 쿠폰 ' + won(values.coupon_discount) + '원 할인') : '';
    const pointsNote = values.points_used > 0 ? (' · 적립금 ' + won(values.points_used) + '원 사용') : '';
    $('doneService').textContent = '신청 서비스: ' + values.service_type + (svc ? ' · 총 예상 금액 ' + won(svc.price) + '원 ' + (svc.durationLabel || '(기본 2시간)') + addonNote + couponNote + pointsNote : '');
    $('doneContact').textContent = values.applicant_name + ' (' + values.applicant_phone + ')';
    const paymentNoticeEl = $('donePaymentNotice');
    if (paymentNotice) { paymentNoticeEl.textContent = paymentNotice; paymentNoticeEl.hidden = false; }
    else paymentNoticeEl.hidden = true;
    const hint = $('doneLoginHint');
    if (mode === 'anonymous') { hint.innerHTML = ANON_HINT_HTML; hint.hidden = false; }
    else if (mode === 'linking') { hint.textContent = '신청을 내 계정에 연결하고 있어요. 잠시 후 마이페이지에서 확인하실 수 있어요.'; hint.hidden = false; }
    else hint.hidden = true;
    $('applyCard').hidden = true;   // 안내 배너 + 입력 양식이 들어 있는 하나의 카드를 통째로 숨김
    form.hidden = true;
    $('doneCard').hidden = false;
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    void getComputedStyle(root).scrollBehavior; // 바꾼 값이 '지금' 적용되도록 스타일을 강제 반영 (안 하면 브라우저가 옛 smooth 값으로 스크롤을 시작해 중간에 멈출 수 있음)
    window.scrollTo(0, 0);
    root.style.scrollBehavior = prevBehavior;
    $('doneTitle').focus({ preventScroll: true }); // 스크린리더가 '신청서가 접수되었습니다'를 읽도록 (화면은 움직이지 않음)
  }
  (function prefillFromCalculator() {
    const params = new URLSearchParams(location.search);
    const serviceParam = params.get('service');
    if (serviceParam && SERVICES[serviceParam]) {
      $('serviceType').value = serviceParam;
    }
    if (params.get('urgent') === '1') {
      const urgentBox = $(ADDON_CHECKBOX_IDS.urgent);
      if (urgentBox) urgentBox.checked = true;
    }
  })();
  (function prefillFromCareReportRebook() {
    const params = new URLSearchParams(location.search);
    const seniorName = params.get('senior_name');
    if (seniorName) $('seniorName').value = seniorName;
    const mobility = params.get('mobility');
    if (mobility && MOBILITIES.includes(mobility)) {
      setRadio('mobility', mobility);
      $('f-mobility').classList.remove('has-error');
      $('e-mobility').hidden = true;
    }
    const origin = params.get('origin');
    if (origin) {
      $('routeOrigin').value = origin;
      $('routeOriginZip').value = '';
      $('f-route').classList.remove('has-error');
      $('e-route').hidden = true;
    }
    const destination = params.get('destination');
    if (destination) {
      $('routeDestination').value = destination;
      $('routeDestinationZip').value = '';
      $('f-route').classList.remove('has-error');
      $('e-route').hidden = true;
    }
    const desiredDate = params.get('desired_date');
    if (desiredDate && /^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) $('datetimeDate').value = desiredDate;
  })();
  (function restoreSelection() {
    if ($('serviceType').value) applyService($('serviceType').value);
  })();
  function calcAge(birth: any) {
    if (!birth) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth);
    if (!m) return null;
    const now = new Date();
    let age = now.getFullYear() - Number(m[1]);
    const diffMonth = now.getMonth() + 1 - Number(m[2]);
    if (diffMonth < 0 || (diffMonth === 0 && now.getDate() < Number(m[3]))) age--;
    return age >= 0 ? age : null;
  }
  let selectedSeniorProfile: any = null;
  function setRadio(name: any, value: any) {
    if (!value) return;
    const el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }
  function inferMobility(healthNote: any) {
    const note = String(healthNote || '');
    if (note.includes('휠체어')) return '휠체어 사용';
    if (note.includes('지팡이') || note.includes('보행기')) return '지팡이·보행기 사용';
    return '';
  }
  async function loadSeniorProfiles(userId: any) {
    const card = $('seniorQuickfill');
    const select = $('seniorProfileSelect');
    const nameInput = $('seniorName');
    if (!card || !select) return;
    const { data: seniors, error } = await listMySeniors(supabaseClient, userId);
    if (error) {
      console.warn('[신청서] 어르신 프로필 조회 실패 — 직접 입력으로 대체합니다:', error.code, error.message);
      return;
    }
    if (!seniors || !seniors.length) return; // 등록된 프로필이 없으면 카드를 아예 보여주지 않음
    select.innerHTML = '';
    select.appendChild(new Option('어르신 성함을 직접 입력', ''));
    seniors.forEach((s: any) => select.appendChild(new Option(s.senior_name || '(이름 없음)', s.senior_id)));
    card.hidden = false;
    select.addEventListener('change', () => {
      const chosen = seniors.find((s: any) => s.senior_id === select.value);
      selectedSeniorProfile = chosen || null;
      const originNote = $('originAreaNote');
      const destNote = $('destinationNote');
      if (!chosen) {
        nameInput.readOnly = false;
        nameInput.value = '';
        nameInput.focus();
        $('f-senior-name').classList.remove('has-error');
        $('e-senior-name').hidden = true;
        $('seniorPhone').value = '';
        return;
      }
      nameInput.value = chosen.senior_name || '';
      nameInput.readOnly = true; // 프로필에서 가져온 이름은 나이·특이사항과 짝이 맞아야 하므로 직접 고치지 못하게 함
      $('f-senior-name').classList.remove('has-error');
      $('e-senior-name').hidden = true;
      $('seniorPhone').value = chosen.senior_phone || '';
      const mobility = chosen.mobility_level || inferMobility(chosen.health_note);
      if (mobility) {
        setRadio('mobility', mobility);
        $('f-mobility').classList.remove('has-error');
        $('e-mobility').hidden = true;
      }
      if (chosen.address) {
        $('routeOrigin').value = chosen.address;
        $('routeOriginDetail').value = chosen.address_detail || '';
        $('routeOriginZip').value = '';
        $('f-route').classList.remove('has-error');
        $('e-route').hidden = true;
        originNote.textContent = '마이페이지에 등록된 주소를 불러왔어요. 주소가 바뀌었다면 \'주소 검색\' 버튼으로 다시 선택해 주세요.';
        originNote.className = 'addr-area-note is-info';
        originNote.hidden = false;
      }
      if (chosen.frequent_hospital) {
        $('routeDestination').value = chosen.frequent_hospital;
        $('routeDestinationDetail').value = chosen.frequent_hospital_detail || '';
        $('routeDestinationZip').value = '';
        $('f-route').classList.remove('has-error');
        $('e-route').hidden = true;
        destNote.textContent = '자주 가시는 병원을 불러왔어요. 다른 병원이면 \'병원/목적지 검색\' 버튼으로 다시 선택해 주세요.';
        destNote.className = 'addr-area-note is-info';
        destNote.hidden = false;
      } else {
        destNote.hidden = true;
      }
    });
  }
  async function saveSeniorProfileFromApplication(userId: any) {
    console.log('[신청서][어르신 프로필 저장] 시작 — 전달받은 userId=' + userId + ' (typeof ' + typeof userId + ')');
    const name = $('seniorName').value.trim();
    if (!name) {
      console.warn('[신청서][어르신 프로필 저장] 어르신 성함이 비어 있어 저장을 건너뜁니다(필수 입력인데 비어 있으면 안 되는 상태 — 폼 검증을 다시 확인하세요).');
      return;
    }
    const payload = {
      senior_name: name,
      senior_phone: $('seniorPhone').value.trim() || null,
      mobility_level: (form.querySelector('input[name="mobility"]:checked') || {}).value || null,
      address: $('routeOrigin').value.trim() || null,
      address_detail: $('routeOriginDetail').value.trim() || null,
      frequent_hospital: $('routeDestination').value.trim() || null,
      frequent_hospital_detail: $('routeDestinationDetail').value.trim() || null,
      health_note: $('details').value.trim() || null
    };
    try {
      const { data: { session: liveSession } } = await supabaseClient.auth.getSession();
      const liveUid = liveSession && liveSession.user && liveSession.user.id;
      console.log('[신청서][어르신 프로필 저장] 지금 supabaseClient 세션의 auth.uid() 추정값=' + liveUid +
        ' vs 전달받은 userId=' + userId + ' → ' + (liveUid === userId ? '일치' : '⚠ 불일치!'));
      if (!liveUid) {
        console.error('[신청서][어르신 프로필 저장] 중단 — 지금 세션에서 로그인 사용자를 확인할 수 없습니다(liveUid 없음). ' +
          '신청 자체는 정상 접수됐지만, 세션이 끊겼거나 만료되어 어르신 프로필은 저장되지 않습니다.');
        return;
      }
      if (liveUid !== userId) {
        console.warn('[신청서][어르신 프로필 저장] userId 불일치를 감지해 liveUid 로 대신 저장합니다(더 신뢰할 수 있는 값 — ' +
          '지금 이 순간 실제로 insert 를 실행할 세션 기준).');
        userId = liveUid;
      }
      let existingId = selectedSeniorProfile ? selectedSeniorProfile.senior_id : null;
      if (!existingId) {
        const { data: existing, error: lookupError } = await findSeniorIdByName(supabaseClient, userId, name);
        if (lookupError) {
          console.error('[신청서][어르신 프로필 저장] 기존 프로필 조회 실패(중복 확인을 건너뛰고 새로 등록 시도) — 전체 에러:',
            lookupError, '\nJSON:', JSON.stringify(lookupError));
        }
        existingId = existing ? existing.senior_id : null;
      }
      const requestRow = Object.assign({ user_id: userId }, payload);
      console.log('[신청서][어르신 프로필 저장] ' + (existingId ? ('UPDATE(senior_id=' + existingId + ') 실행 — 보낼 값:')
        : 'INSERT 실행 — 보낼 행(user_id 포함):'), existingId ? payload : requestRow);
      const { data: savedRow, error } = await saveSenior(supabaseClient, userId, existingId, payload);
      if (error) {
        const msg = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
        const userIdColumnHint = /user_id/i.test(msg)
          ? ' ⚠ 에러 문구에 user_id 가 직접 언급됩니다 — 실제 seniors 테이블의 보호자 식별 컬럼명이 ' +
            'user_id 가 아니라 guardian_id 등 다른 이름일 가능성이 있습니다. Supabase 대시보드 → ' +
            'Table Editor → seniors 테이블의 실제 컬럼명을 확인하고, 다르다면 이 함수(그리고 mypage.html ' +
            '의 loadSeniors/openSeniorModal 저장 로직)의 user_id 를 그 이름으로 맞춰 고쳐야 합니다.'
          : '';
        console.error('[신청서][어르신 프로필 저장] 실패(신청 자체는 정상 접수됨) — code=' + error.code +
          ', message=' + error.message + ', details=' + error.details + ', hint=' + error.hint +
          '\n→ 42501 이면 sql/seniors_rls_fix.sql 실행 여부와, 위에서 찍힌 "세션 일치 여부" 로그를 확인하세요. ' +
          '42703/PGRST204 면 seniors 테이블에 ' + Object.keys(requestRow).join(', ') + ' 컬럼이 전부 있는지 확인하세요.' +
          userIdColumnHint,
          '\n보낸 행:', requestRow, '\n원본 에러 객체:', error, '\nJSON:', JSON.stringify(error));
        return;
      }
      console.log('[신청서][어르신 프로필 저장] ' + (existingId ? '갱신' : '새로 등록') + ' 성공 — senior_id=' +
        (savedRow && savedRow.senior_id) + ', user_id=' + (savedRow && savedRow.user_id));
    } catch (e: any) {
      console.error('[신청서][어르신 프로필 저장] 예외(신청 자체는 정상 접수됨) — 원본:', e, '\nJSON:', JSON.stringify(e, Object.getOwnPropertyNames(e || {})));
    }
  }
  const { data: authSub } = supabaseClient.auth.onAuthStateChange((event: string) => {
    if (event === 'SIGNED_OUT') {
      alert('로그인이 만료되었거나 로그아웃되었습니다. 다시 로그인해 주세요.');
      window.location.href = ROUTES.login;
    }
  });
  cleanups.push(() => authSub.subscription.unsubscribe());
  async function initApplicantContactFromAccount(profile: any, userId: any) {
    const nameInput = $('contactName');
    const phoneInput = $('contactPhone');
    const lockNote = $('contactLockNote');
    let fallbackApp: any = null;
    if (!(profile && profile.name) || !(profile && profile.phone)) {
      const { data: lastApp, error: lastAppErr } = await getLatestApplicantContact(supabaseClient, userId);
      if (lastAppErr) {
        console.warn('[신청서] 이전 신청 내역 조회 실패 — 신청자 성함/연락처 보조 채움을 건너뜁니다:', lastAppErr.code, lastAppErr.message);
      } else {
        fallbackApp = lastApp;
      }
    }
    let lockedAny = false;
    if (profile && profile.name) {
      nameInput.value = profile.name;
      nameInput.readOnly = true;
      lockedAny = true;
    } else if (!nameInput.value.trim() && fallbackApp && fallbackApp.applicant_name) {
      nameInput.value = fallbackApp.applicant_name; // 계정 정보가 아니라 이전 입력값이므로 잠그지 않음
    }
    if (profile && profile.phone) {
      phoneInput.value = profile.phone;
      phoneInput.readOnly = true;
      lockedAny = true;
    } else if (!phoneInput.value.trim() && fallbackApp && fallbackApp.applicant_phone) {
      phoneInput.value = fallbackApp.applicant_phone; // 계정 정보가 아니라 이전 입력값이므로 잠그지 않음
    }
    lockNote.hidden = !lockedAny;
  }
  (async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const note = $('loginNote');
    if (!session) {
      note.className = 'nt-login is-warning';
      note.innerHTML = '로그인이 필요한 서비스입니다.<a href="/login" class="nt-login-cta">로그인하기</a>';
      note.hidden = false;
      return;
    }
    note.className = 'nt-login'; // 로그인 상태(위 is-warning 과 반대) — 다른 탭 로그아웃 후 다시 로그인했을 때도 깔끔히 되돌아가도록 명시적으로 리셋
    loadSeniorProfiles(session.user.id);
    note.textContent = '로그인한 계정' + (session.user.email ? '(' + session.user.email + ')' : '') + '과 연결되어 접수됩니다.';
    note.hidden = false;
    $('doneMypage').hidden = false;
    const saveProfileBox = $('f-save-senior-profile');
    if (saveProfileBox) saveProfileBox.hidden = false;
    const { data: profile, error: profileErr } = await getCheckoutProfile(supabaseClient, session.user.id);
    if (profileErr) {
      console.warn('[적립금] points_balance 조회 실패 — 적립금 사용 입력란을 비활성 상태로 둡니다. → sql/user_coupons_checkout.sql 을 실행했는지 확인하세요:',
        profileErr.code, profileErr.message);
    } else {
      currentPointsBalance = (profile && Number.isFinite(profile.points_balance)) ? profile.points_balance : 0;
    }
    await initApplicantContactFromAccount(profile, session.user.id);
    const { data: coupons, error: couponsErr } = await listActiveCoupons(supabaseClient, session.user.id);
    if (couponsErr) {
      console.warn('[쿠폰] user_coupons 조회 실패 — 쿠폰 드롭다운을 비워 둡니다. → sql/welcome_coupons.sql 을 실행했는지 확인하세요:',
        couponsErr.code, couponsErr.message);
    } else {
      const COUPON_LABELS: Record<string, string> = { WELCOME_2000: '첫 동행 웰컴 쿠폰' };
      availableCoupons = (coupons || []).map((c: any) => ({
        id: c.id, code: c.coupon_code, amount: c.amount, expires_at: c.expires_at, label: COUPON_LABELS[c.coupon_code] || c.coupon_code
      }));
      renderCouponOptions();
    }
    refreshDiscountSummary(); // 적립금/쿠폰 조회 결과를 반영해 입력란·요약을 다시 그림 (뒤로 가기 복원 등으로 서비스가 이미 선택돼 있었다면)
    const { data: packages, error: packagesErr } = await listActivePackages(supabaseClient, session.user.id);
    if (packagesErr) {
      console.warn('[패키지] user_packages 조회 실패 — 패키지 차감 옵션을 숨깁니다. → sql/user_packages_system.sql 을 실행했는지 확인하세요:',
        packagesErr.code, packagesErr.message);
    } else if (packages && packages.length) {
      activePackage = packages[0];
      activePackageTotalRemaining = packages.reduce((sum: any, p: any) => sum + (p.remaining_count || 0), 0);
      $('packageRemainingLabel').textContent = '보유 패키지 차감 (잔여 ' + activePackageTotalRemaining + '회)';
      $('optUsePackage').hidden = false;
      $('packageHint').hidden = false;
    }
  })();
  return () => cleanups.forEach((fn) => fn());
}
