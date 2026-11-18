/* =========================================================
   위드브릿지 예상 요금 계산기 (pricing.html 전용)
   - 원래 index.html '이용 요금 안내' 하단에 있던 계산기 스크립트를 그대로 옮겼습니다.
   - 서비스 카드(data-price 등)의 이름·금액은 apply.html SERVICES 와 반드시 같아야 합니다.
   - updateStickyTotal(): 모바일 하단 고정 바(#wb-sticky-total)에도 같은 금액을 반영합니다.
========================================================= */
// 추가 이용 시간 — 30분 단위(0~4 = 0~2시간). 서비스 유형 카드를 바꿔도 값이 유지되다가,
// '1시간 라이트 케어'를 고르면 calculatePrice() 가 0으로 되돌립니다.
let extraUnits = 0;

function selectedServiceCard() {
  return document.querySelector('.wb-service-card.is-selected');
}

// 지금 선택된 서비스 카드의 실제 service_type 이름(apply.html SERVICES/service_applications.service_type
// 과 완전히 같은 문자열)을 꺼냅니다 — [이 조건으로 바로 예약하기] 버튼이 신청서로 조건을 그대로
// 넘길 때 씁니다.
function currentServiceTypeName() {
  const card = selectedServiceCard();
  return card ? card.dataset.name : '';
}

// 30분 단위 추가 시간 값을 "0시간/30분/1시간 30분" 형태로 표시합니다.
function formatExtraDuration(units) {
  const totalMin = units * 30;
  if (totalMin === 0) return '0시간';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return m + '분';
  return m === 0 ? h + '시간' : h + '시간 ' + m + '분';
}

// 서비스 유형 카드 선택 — 드롭다운 대신 클릭형 카드 버튼. '1시간 라이트 케어'(기본 60분)는 추가
// 시간 개념이 없으므로 선택 즉시 extraUnits를 0으로 되돌립니다.
function selectServiceCard(btn) {
  document.querySelectorAll('.wb-service-card').forEach((c) => c.classList.remove('is-selected'));
  btn.classList.add('is-selected');
  if (parseInt(btn.dataset.baseMinutes, 10) === 60) extraUnits = 0;
  calculatePrice();
}

// 추가 이용 시간 스테퍼([- 0시간 +]) — 30분 단위로 0~2시간(0~4단위) 사이에서만 움직입니다.
function stepExtraTime(delta) {
  const card = selectedServiceCard();
  if (!card || parseInt(card.dataset.baseMinutes, 10) === 60) return;
  extraUnits = Math.max(0, Math.min(4, extraUnits + delta));
  calculatePrice();
}

function calculatePrice() {
  const card = selectedServiceCard();
  if (!card) return;

  const basePrice = parseInt(card.dataset.price, 10);
  const extraPricePerUnit = parseInt(card.dataset.extraUnit, 10);
  const baseMinutes = parseInt(card.dataset.baseMinutes, 10) || 120;
  const isOneHour = baseMinutes === 60; // '1시간 라이트 케어' — 기본 포함 시간이 2시간이 아니라 1시간뿐인 유일한 상품
  if (isOneHour) extraUnits = 0;

  // 스테퍼 버튼 활성/비활성 + 안내 문구 갱신
  const minusBtn = document.getElementById('wb-extra-time-minus');
  const plusBtn = document.getElementById('wb-extra-time-plus');
  const hintEl = document.getElementById('wb-extra-time-hint');
  const labelEl = document.getElementById('wb-extra-time-label');
  minusBtn.disabled = isOneHour || extraUnits <= 0;
  plusBtn.disabled = isOneHour || extraUnits >= 4;
  hintEl.hidden = !isOneHour;
  labelEl.textContent = isOneHour ? '2. 추가 이용 시간' : '2. 추가 이용 시간 (기본 2시간 외)';

  document.getElementById('wb-extra-time-value').textContent = formatExtraDuration(extraUnits);
  const totalMinutes = baseMinutes + extraUnits * 30;
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  document.getElementById('wb-extra-time-total').textContent =
    '총 ' + totalH + '시간' + (totalM ? ' ' + totalM + '분' : '');

  // 추가 시간 요금 (30분 = 1단위, 1시간 상품은 위에서 이미 0으로 고정됨)
  const extraTimeTotal = extraUnits * extraPricePerUnit;

  // 선택 옵션 추가금
  let optionTotal = 0;
  const urgentEl = document.getElementById('wb-opt-urgent');
  if (urgentEl && urgentEl.checked) optionTotal += parseInt(urgentEl.value, 10);

  // 주말/야간 할증 (기본요금 기준 20%)
  let surcharge = 0;
  if (document.getElementById('wb-opt-night').checked) {
    surcharge = basePrice * 0.2;
  }

  // 총 예상 요금 산출 및 화면 업데이트
  const totalPrice = basePrice + extraTimeTotal + optionTotal + surcharge;
  document.getElementById('wb-total-price').textContent = totalPrice.toLocaleString('ko-KR') + '원';
  updateStickyTotal(totalPrice);
}

// [이 조건으로 바로 예약하기] — 계산기에서 고른 서비스 유형을 신청서(apply.html)로 그대로 넘겨
// 서비스 카드가 자동 선택되게 합니다(apply.html 의 prefillFromCalculator() 참고). 추가 시간/주말
// 할증은 신청서 폼 자체에 그 입력란이 없어(실제 초과 요금은 매니저가 실제 소요 시간을 보고한 뒤
// 자동 산정 — report_care_duration_and_bill_extra) 넘길 대상이 없고, 긴급 매칭 옵션만 체크박스로
// 존재해 함께 넘깁니다.
function bookWithCalc(event) {
  const params = new URLSearchParams();
  const serviceType = currentServiceTypeName();
  if (serviceType) params.set('service', serviceType);
  if (document.getElementById('wb-opt-urgent').checked) params.set('urgent', '1');
  const url = 'apply.html' + (params.toString() ? '?' + params.toString() : '');
  document.getElementById('btn-book-with-calc').href = url; // 미들클릭/새 탭 열기 대비 — goIfLoggedIn 은 href 를 보지 않고 아래 url 을 직접 씁니다
  if (window.WBAuth && window.WBAuth.goIfLoggedIn) window.WBAuth.goIfLoggedIn(event, url);
  else { if (event && event.preventDefault) event.preventDefault(); window.location.href = url; }
}

// 초기 렌더링 — 기본 선택값이 '1시간 라이트 케어'(30,000원)로 바뀌었으므로, 페이지 로드 시 한 번
// 계산해 총액/스테퍼 상태를 전부 맞춰 둡니다.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', calculatePrice);
} else {
  calculatePrice();
}

// 모바일 하단 고정 요약 바(#wb-sticky-total) — 계산기 결과와 같은 금액을 보여 주고, [예약하기] 는
// 계산기 결과 바의 버튼과 똑같이 bookWithCalc() 로 이어집니다. 계산 결과 바(.wb-calc-total-bar)가
// 화면에 보이는 동안에는 같은 정보가 두 번 보이지 않도록 고정 바를 내려 숨깁니다.
function updateStickyTotal(totalPrice) {
  const el = document.getElementById('wb-sticky-price');
  if (el) el.textContent = totalPrice.toLocaleString('ko-KR') + '원';
}

(function initStickyTotal() {
  function setup() {
    const sticky = document.getElementById('wb-sticky-total');
    const resultBar = document.querySelector('.wb-calc-total-bar');
    if (!sticky || !resultBar || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('is-hidden', entries[0].isIntersecting);
    }, { threshold: 0.2 }).observe(resultBar);
    const sum = document.getElementById('wb-sticky-sum');
    if (sum) sum.addEventListener('click', function () {
      document.getElementById('calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
