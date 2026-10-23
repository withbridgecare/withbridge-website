/* =========================================================
   위드브릿지 공통 커스텀 날짜/시간 선택기 (wb-datepicker)
   - 브라우저 기본 input[type=date|time|datetime-local] 피커를, 20px+ 라운드·소프트 섀도우·
     #F9FAFB 배경의 토스/당근마켓 스타일 커스텀 UI로 교체합니다.
   - 기존 input 요소는 그대로 두고(값 저장소·label for·form 제출 대상 유지) type만 text로 바꿔
     화면에서 숨긴 뒤, 바로 옆에 예쁜 트리거 버튼 + 팝업 패널을 붙입니다 — 기존 페이지의
     `.value` 읽기/쓰기, `.min`/`.max` 지정, `.focus()` 호출 코드는 한 줄도 안 고쳐도 그대로 동작합니다.
   사용법: <script src="/js/wb-datepicker.js"></script> 로드 후,
     WBDatePicker.attach(document.getElementById('seniorBirth'));
     (input 의 원래 type="date"|"time"|"datetime-local" 로 모드를 자동 인식합니다)
========================================================= */
(function () {
  'use strict';

  // ---------- 스타일 (한 번만 주입) ----------
  if (!document.getElementById('wbdp-style')) {
    var style = document.createElement('style');
    style.id = 'wbdp-style';
    style.textContent =
      '.wbdp-native{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;' +
      'margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}' +
      '.wbdp{position:relative;}' +
      '.wbdp-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:14px 18px;border:1px solid #E5E7EB;border-radius:20px;background:#F9FAFB;' +
      'font:inherit;font-size:15.5px;font-weight:600;color:#1A1D21;text-align:left;cursor:pointer;' +
      'box-shadow:0 2px 10px rgba(15,23,42,.05);' +
      'transition:border-color .15s ease,box-shadow .15s ease,background-color .15s ease;}' +
      '.wbdp-trigger .wbdp-text.is-placeholder{color:#9CA3AF;font-weight:500;}' +
      '.wbdp-trigger:hover{border-color:#D1D5DB;}' +
      '.wbdp-trigger:focus-visible,.wbdp-trigger.is-open{outline:none;border-color:#78866B;background:#fff;' +
      'box-shadow:0 0 0 3px rgba(120,134,107,.2),0 2px 10px rgba(15,23,42,.05);}' +
      '.wbdp-trigger:disabled{opacity:.55;cursor:not-allowed;}' +
      '.wbdp-trigger-icon{flex:none;display:inline-flex;color:#78866B;}' +
      '.wbdp-panel{position:absolute;z-index:200;top:calc(100% + 10px);left:0;width:320px;max-width:calc(100vw - 32px);' +
      'background:#fff;border:1px solid #F1F2F4;border-radius:24px;box-shadow:0 20px 48px rgba(15,23,42,.16),0 4px 14px rgba(15,23,42,.06);' +
      'padding:20px;transform:scale(.97) translateY(-4px);opacity:0;pointer-events:none;' +
      'transition:transform .15s ease,opacity .15s ease;}' +
      '.wbdp-panel.is-open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto;}' +
      '.wbdp-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;}' +
      '.wbdp-nav-btn{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid #E5E7EB;background:#fff;' +
      'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#1A1D21;' +
      'transition:background-color .15s ease;}' +
      '.wbdp-nav-btn:hover{background:#F3F4F6;}' +
      '.wbdp-nav-btn:disabled{opacity:.3;cursor:not-allowed;}' +
      '.wbdp-ym{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;justify-content:center;}' +
      '.wbdp-ym select{border:1px solid #E5E7EB;border-radius:9999px;padding:6px 10px;font:inherit;font-size:13px;' +
      'font-weight:700;color:#1A1D21;background:#F9FAFB;cursor:pointer;flex:none;box-sizing:content-box;}' +
      /* 연도는 "2026년"처럼 4자리+글자, 월은 "12월"처럼 최대 2자리+글자라 필요한 폭이 다릅니다 —
         공통 규칙에 min-width 없이 두면(.wbdp-nav 양옆 원형 버튼과 한 줄에 끼여 좁아지는 화면에서)
         select 가 내용보다 좁게 눌려 "2026년"이 "202"처럼 잘려 보이는 원인이 됩니다. */
      '.wbdp-ym select.wbdp-year-select{min-width:60px;text-align:center;}' +
      '.wbdp-ym select.wbdp-month-select{min-width:40px;text-align:center;}' +
      '.wbdp-dow{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:2px;}' +
      '.wbdp-dow span{text-align:center;font-size:11.5px;font-weight:700;color:#9CA3AF;padding-bottom:6px;}' +
      '.wbdp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}' +
      '.wbdp-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:none;background:transparent;' +
      'border-radius:12px;font-size:13.5px;font-weight:600;color:#1A1D21;cursor:pointer;transition:background-color .15s ease;}' +
      '.wbdp-day:hover:not(:disabled){background:#F3F4F6;}' +
      '.wbdp-day.is-today{color:#78866B;font-weight:800;}' +
      '.wbdp-day.is-selected{background:#78866B;color:#fff;font-weight:800;}' +
      '.wbdp-day:disabled{color:#E2E4E8;cursor:not-allowed;}' +
      '.wbdp-day-blank{aspect-ratio:1;}' +
      '.wbdp-time{display:flex;align-items:center;gap:6px;}' +
      '.wbdp-time-col{flex:1 1 0;height:196px;overflow-y:auto;scroll-snap-type:y mandatory;border-radius:16px;' +
      'background:#F9FAFB;scrollbar-width:none;}' +
      '.wbdp-time-col-ap{flex:0.85 1 0;}' + /* '오전'/'오후' 두 글자라 시·분 숫자 컬럼보다 살짝 좁게 */
      '.wbdp-time-col::-webkit-scrollbar{display:none;}' +
      '.wbdp-time-pad{height:78px;flex:none;}' +
      '.wbdp-time-opt{scroll-snap-align:center;display:flex;align-items:center;justify-content:center;height:40px;' +
      'margin:0 4px;border-radius:10px;font-size:14.5px;font-weight:600;color:#4B5563;cursor:pointer;' +
      'font-variant-numeric:tabular-nums;transition:background-color .15s ease;}' +
      '.wbdp-time-opt:hover{background:#F1F2F4;}' +
      '.wbdp-time-opt.is-selected{background:#78866B;color:#fff;font-weight:800;}' +
      '.wbdp-time-sep{flex:none;font-size:16px;font-weight:800;color:#D1D5DB;}' +
      '.wbdp-section-label{margin:16px 0 10px;font-size:12.5px;font-weight:700;color:#9CA3AF;}' +
      '.wbdp-section-label:first-child{margin-top:0;}' +
      '.wbdp-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}' +
      '.wbdp-btn{padding:9px 18px;border-radius:9999px;border:none;background:#78866B;color:#fff;font-size:13.5px;' +
      'font-weight:700;cursor:pointer;transition:background-color .15s ease;}' +
      '.wbdp-btn:hover{background:#556B2F;}' +
      '.wbdp-btn-ghost{background:transparent;color:#6B7280;}' +
      '.wbdp-btn-ghost:hover{background:#F3F4F6;}';
    document.head.appendChild(style);
  }

  // ---------- 아이콘 ----------
  var ICON_CALENDAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="4"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var ICON_CLOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- 값 파싱/포맷 ----------
  function parseDate(str) { // 'YYYY-MM-DD' → {y,m,d,iso} | null
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], iso: m[1] + '-' + m[2] + '-' + m[3] };
  }
  function parseTime(str) { // 'HH:MM' (또는 'YYYY-MM-DDTHH:MM' 의 뒷부분) → {h,mi} | null
    var m = /(\d{2}):(\d{2})(?::\d{2})?\s*$/.exec(String(str || ''));
    if (!m) return null;
    return { h: +m[1], mi: +m[2] };
  }
  function todayParts() {
    var d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), iso: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) };
  }
  function fmtDateDisplay(p) { return p.y + '-' + pad2(p.m) + '-' + pad2(p.d) + ' (' + WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()] + ')'; }
  function fmtTimeDisplay(t) { var ap = t.h < 12 ? '오전' : '오후'; return ap + ' ' + pad2(t.h % 12 || 12) + ':' + pad2(t.mi); }

  // ---------- 모듈 상태: 패널은 한 번에 하나만 열려 있게 ----------
  var openState = null; // { panel, trigger, close() }
  function closeOpen() { if (openState) { openState.close(); openState = null; } }
  document.addEventListener('mousedown', function (e) {
    if (!openState) return;
    if (openState.wrap.contains(e.target)) return;
    closeOpen();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openState) closeOpen(); });

  // 네이티브 input.value 를 patch 해서, 페이지 쪽 코드가 직접 `.value = ...` 로 값을 넣어도(예: 기본값
  // 미리 채우기) 트리거에 표시되는 문구가 자동으로 다시 그려지게 합니다.
  function patchValueProperty(input, onSet) {
    var proto = Object.getPrototypeOf(input);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (!desc || !desc.set) return; // 알 수 없는 환경이면 조용히 패치를 건너뜀 (동작에는 영향 없음)
    Object.defineProperty(input, 'value', {
      configurable: true,
      enumerable: true,
      get: function () { return desc.get.call(input); },
      set: function (v) { desc.set.call(input, v); onSet(); }
    });
  }

  function fireEvents(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- 날짜 그리드 빌더 (date / datetime 공용) ----------
  // state: {y, m, d} (d 는 선택된 날짜, 없으면 null) — onPick(y,m,d) 는 유효한 날짜를 눌렀을 때 호출됩니다.
  function buildDateSection(container, input, state, onPick) {
    var min = parseDate(input.getAttribute('min'));
    var max = parseDate(input.getAttribute('max'));
    var today = todayParts();

    var nav = el('div', 'wbdp-nav');
    var prevBtn = el('button', 'wbdp-nav-btn', '‹'); prevBtn.type = 'button'; prevBtn.setAttribute('aria-label', '이전 달');
    var nextBtn = el('button', 'wbdp-nav-btn', '›'); nextBtn.type = 'button'; nextBtn.setAttribute('aria-label', '다음 달');
    var ym = el('div', 'wbdp-ym');
    var ySel = document.createElement('select');
    ySel.className = 'wbdp-year-select';
    var mSel = document.createElement('select');
    mSel.className = 'wbdp-month-select';
    ym.append(ySel, el('span', '', '년'), mSel, el('span', '', '월'));
    nav.append(prevBtn, ym, nextBtn);
    container.appendChild(nav);

    var dow = el('div', 'wbdp-dow');
    WEEKDAYS.forEach(function (w) { dow.appendChild(el('span', '', w)); });
    container.appendChild(dow);

    var grid = el('div', 'wbdp-grid');
    container.appendChild(grid);

    function yearRange() {
      if (min && max) return [min.y, max.y];
      if (max && !min) return [max.y - 110, max.y]; // 생년월일처럼 과거 제한만 있는 경우
      if (min && !max) return [min.y, min.y + 5];
      return [today.y - 100, today.y + 10];
    }

    function fillYearSelect() {
      var range = yearRange();
      ySel.innerHTML = '';
      for (var y = range[0]; y <= range[1]; y++) {
        var o = document.createElement('option'); o.value = String(y); o.textContent = y + '년';
        if (y === state.y) o.selected = true;
        ySel.appendChild(o);
      }
    }
    function fillMonthSelect() {
      var lo = (min && state.y === min.y) ? min.m : 1;
      var hi = (max && state.y === max.y) ? max.m : 12;
      // 연도를 바꿔서 지금 달이 그 해의 허용 범위를 벗어나면(예: 최소 연도인데 그 최소 월보다 이전 달)
      // state.m 을 범위 안으로 당겨서, 드롭다운 표시값과 실제 달력 상태가 어긋나지 않게 합니다.
      if (state.m < lo) state.m = lo;
      if (state.m > hi) state.m = hi;
      mSel.innerHTML = '';
      for (var m = lo; m <= hi; m++) {
        var o = document.createElement('option'); o.value = String(m); o.textContent = m + '월';
        if (m === state.m) o.selected = true;
        mSel.appendChild(o);
      }
    }

    function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

    function renderGrid() {
      grid.innerHTML = '';
      var firstWd = new Date(state.y, state.m - 1, 1).getDay();
      for (var i = 0; i < firstWd; i++) grid.appendChild(el('span', 'wbdp-day-blank'));
      var total = daysInMonth(state.y, state.m);
      for (var d = 1; d <= total; d++) {
        var iso = state.y + '-' + pad2(state.m) + '-' + pad2(d);
        var disabled = (min && iso < min.iso) || (max && iso > max.iso);
        var btn = el('button', 'wbdp-day', String(d));
        btn.type = 'button';
        if (iso === today.iso) btn.classList.add('is-today');
        if (state.d === d) btn.classList.add('is-selected');
        if (disabled) { btn.disabled = true; }
        else { btn.addEventListener('click', function (dd) { return function () { onPick(state.y, state.m, dd); }; }(d)); }
        grid.appendChild(btn);
      }
    }

    function renderNavState() {
      // 이전 달 전체가 min 이전이면(이전 달의 마지막 날짜조차 min 보다 이르면) 더 못 가게 막고,
      // 다음 달 전체가 max 이후면(다음 달의 첫 날짜조차 max 보다 늦으면) 마찬가지로 막습니다.
      var prevY = state.m === 1 ? state.y - 1 : state.y;
      var prevM = state.m === 1 ? 12 : state.m - 1;
      var prevIso = prevY + '-' + pad2(prevM) + '-' + pad2(daysInMonth(prevY, prevM));
      var nextY = state.m === 12 ? state.y + 1 : state.y;
      var nextM = state.m === 12 ? 1 : state.m + 1;
      var nextIso = nextY + '-' + pad2(nextM) + '-01';
      prevBtn.disabled = !!(min && prevIso < min.iso);
      nextBtn.disabled = !!(max && nextIso > max.iso);
    }

    function rerender() {
      fillYearSelect(); fillMonthSelect();
      // 연/월만 바꾸고 일(day)은 그대로 둔 채 이동하는 경우(예: 생년월일에서 '일'은 고정하고 연도만 탐색),
      // 새 달에 없는 날짜(예: 2월 30일)로 남아 있지 않도록 그 달의 마지막 날짜로 당겨 줍니다.
      var total = daysInMonth(state.y, state.m);
      if (state.d && state.d > total) state.d = total;
      renderGrid(); renderNavState();
    }

    prevBtn.addEventListener('click', function () {
      if (state.m === 1) { state.m = 12; state.y -= 1; } else { state.m -= 1; }
      rerender();
    });
    nextBtn.addEventListener('click', function () {
      if (state.m === 12) { state.m = 1; state.y += 1; } else { state.m += 1; }
      rerender();
    });
    ySel.addEventListener('change', function () { state.y = +ySel.value; rerender(); });
    mSel.addEventListener('change', function () { state.m = +mSel.value; rerender(); });

    rerender();
  }

  // ---------- 오전/오후·시·분 스크롤 선택기 (time / datetime 공용) ----------
  // state: {h, mi} — h 는 항상 24시간제(0~23)로 유지합니다(기존에 'HH:mm' 24시간 문자열을 만드는
  // commit() 쪽 코드, <input type="time">의 저장 포맷을 전혀 고치지 않아도 되도록). 휠 UI만 오전/오후 +
  // 12시간제(01~12시)로 보여주고, 두 휠 중 하나가 바뀌면 바로 24시간 값으로 합쳐 state.h 에 반영합니다.
  // onChange() 는 값이 바뀔 때마다 호출(패널을 닫지는 않음).
  //
  // opts(모두 선택적, 지정 안 하면 기존과 동일하게 1분 단위·제한 없이 동작):
  //   minuteStep : 분 간격(기본 1). 예: 30 → 00/30분만 선택 가능.
  //   minHour/maxHour : 선택 가능한 시(0~23, 포함) 범위. 둘 다 주면 "운영 시간"처럼 그 밖의 시간대는
  //     휠에서 아예 빠집니다(예: minHour=8, maxHour=18 → 08:00~18:00만, 18시는 00분만 남아 18:30은 제외).
  var AMPM_LABELS = ['오전', '오후'];

  function toH24(ampmIndex, h12) { return ampmIndex === 0 ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12); }
  function timeBounds(opts) {
    return {
      lo: (opts && opts.minHour != null) ? opts.minHour * 60 : 0,
      hi: (opts && opts.maxHour != null) ? opts.maxHour * 60 : (24 * 60 - 1)
    };
  }
  // 그 시(h24) 안에서, step 간격으로 bounds 를 만족하는 분(0~59) 목록
  function validMinutesInHour(h24, step, bounds) {
    var out = [];
    for (var mm = 0; mm < 60; mm += step) {
      var total = h24 * 60 + mm;
      if (total >= bounds.lo && total <= bounds.hi) out.push(mm);
    }
    return out;
  }
  // 주어진 오전/오후에서, 유효한 분이 하나라도 있는 h12(1~12) 목록
  function validHoursForAmpm(ampmIndex, step, bounds) {
    var out = [];
    for (var h12 = 1; h12 <= 12; h12++) {
      if (validMinutesInHour(toH24(ampmIndex, h12), step, bounds).length) out.push(h12);
    }
    return out;
  }
  // 패널을 열 때 한 번, state.h/state.mi 를 범위 안의 가장 가까운 step 배수 slot 으로 당깁니다.
  function clampToBounds(state, step, bounds) {
    var total = state.h * 60 + state.mi;
    var snapped = Math.round(total / step) * step;
    if (snapped < bounds.lo) snapped = Math.ceil(bounds.lo / step) * step;
    if (snapped > bounds.hi) snapped = Math.floor(bounds.hi / step) * step;
    state.h = Math.floor(snapped / 60) % 24;
    state.mi = snapped % 60;
  }

  function buildTimeSection(container, state, onChange, opts) {
    var step = (opts && opts.minuteStep) || 1;
    var bounds = timeBounds(opts);
    clampToBounds(state, step, bounds);

    var wrap = el('div', 'wbdp-time');
    var apCol = el('div', 'wbdp-time-col wbdp-time-col-ap');
    var hCol = el('div', 'wbdp-time-col');
    var sep = el('div', 'wbdp-time-sep', ':');
    var mCol = el('div', 'wbdp-time-col');
    wrap.append(apCol, hCol, sep, mCol);
    container.appendChild(wrap);

    var ampmIndex = state.h < 12 ? 0 : 1;
    var h12 = state.h % 12 || 12; // 1~12

    // labels[i] 를 보여주고, 누르면 onPick(i) 을 부르는 범용 휠 컬럼 — 오전/오후·시·분 셋 다 이 하나로 만듭니다.
    function buildOptCol(colEl, labels, selectedIndex, onPick) {
      colEl.innerHTML = '';
      colEl.appendChild(el('div', 'wbdp-time-pad'));
      labels.forEach(function (label, i) {
        var opt = el('div', 'wbdp-time-opt', label);
        if (i === selectedIndex) opt.classList.add('is-selected');
        opt.addEventListener('click', function (idx) {
          return function () {
            onPick(idx);
            colEl.querySelectorAll('.wbdp-time-opt').forEach(function (o) { o.classList.remove('is-selected'); });
            var target = colEl.children[idx + 1]; // +1: 위 패딩 요소만큼 보정
            if (target) { target.classList.add('is-selected'); target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          };
        }(i));
        colEl.appendChild(opt);
      });
      colEl.appendChild(el('div', 'wbdp-time-pad'));
      requestAnimationFrame(function () {
        var target = colEl.children[selectedIndex + 1];
        if (target) target.scrollIntoView({ block: 'center' });
      });
    }

    // 분 휠: "지금 선택된 시" 에 따라 유효 목록이 달라지므로(예: 운영 마감 시각엔 00분만 남음),
    // 시/오전오후가 바뀔 때마다 다시 그립니다.
    function renderMinuteCol() {
      var minuteValues = validMinutesInHour(state.h, step, bounds);
      if (!minuteValues.length) minuteValues = [0]; // 이론상 비지 않지만, 혹시 비면 최소 하나는 보여줌
      if (minuteValues.indexOf(state.mi) === -1) {
        state.mi = minuteValues.reduce(function (best, v) {
          return Math.abs(v - state.mi) < Math.abs(best - state.mi) ? v : best;
        }, minuteValues[0]);
      }
      buildOptCol(mCol, minuteValues.map(pad2), minuteValues.indexOf(state.mi), function (i) {
        state.mi = minuteValues[i]; onChange();
      });
    }

    // 시 휠: "지금 선택된 오전/오후" 에 따라 유효 목록이 달라집니다.
    function renderHourCol() {
      var hours = validHoursForAmpm(ampmIndex, step, bounds);
      if (!hours.length) hours = [h12]; // 안전장치
      if (hours.indexOf(h12) === -1) h12 = hours[0];
      state.h = toH24(ampmIndex, h12);
      buildOptCol(hCol, hours.map(pad2), hours.indexOf(h12), function (i) {
        h12 = hours[i];
        state.h = toH24(ampmIndex, h12);
        renderMinuteCol();
        onChange();
      });
    }

    buildOptCol(apCol, AMPM_LABELS, ampmIndex, function (i) {
      ampmIndex = i;
      renderHourCol();
      renderMinuteCol();
      onChange();
    });
    renderHourCol();
    renderMinuteCol();
  }

  // ---------- 모드별 패널 렌더 ----------
  function renderDatePanel(panel, input, commit) {
    panel.innerHTML = '';
    var cur = parseDate(input.value) || todayParts();
    var state = { y: cur.y, m: cur.m, d: parseDate(input.value) ? cur.d : null };
    buildDateSection(panel, input, state, function (y, m, d) {
      commit(y + '-' + pad2(m) + '-' + pad2(d));
    });
  }

  function renderTimePanel(panel, input, commit, opts) {
    panel.innerHTML = '';
    var cur = parseTime(input.value);
    var state = { h: cur ? cur.h : 9, mi: cur ? cur.mi : 0 };
    buildTimeSection(panel, state, function () {}, opts);
    var foot = el('div', 'wbdp-foot');
    var okBtn = el('button', 'wbdp-btn', '확인'); okBtn.type = 'button';
    okBtn.addEventListener('click', function () { commit(pad2(state.h) + ':' + pad2(state.mi)); });
    foot.appendChild(okBtn);
    panel.appendChild(foot);
  }

  function renderDateTimePanel(panel, input, commit, opts) {
    // dState/tState 는 패널이 열려 있는 동안 계속 재사용되는 상태입니다 — 날짜를 다시 고를 때마다
    // renderBody() 로 화면만 다시 그리고, input.value(아직 커밋 전)로 되돌아가 상태를 잃지 않게 합니다.
    var raw = input.value || '';
    var dPart = parseDate(raw) || todayParts();
    var tPart = parseTime(raw);
    var dState = { y: dPart.y, m: dPart.m, d: parseDate(raw) ? dPart.d : todayParts().d };
    var tState = { h: tPart ? tPart.h : 9, mi: tPart ? tPart.mi : 0 };

    function renderBody() {
      panel.innerHTML = '';
      panel.appendChild(el('p', 'wbdp-section-label', '날짜'));
      buildDateSection(panel, input, dState, function (y, m, d) { dState.y = y; dState.m = m; dState.d = d; renderBody(); });
      panel.appendChild(el('p', 'wbdp-section-label', '시간'));
      buildTimeSection(panel, tState, function () {}, opts);

      var foot = el('div', 'wbdp-foot');
      var okBtn = el('button', 'wbdp-btn', '확인'); okBtn.type = 'button';
      okBtn.addEventListener('click', function () {
        commit(dState.y + '-' + pad2(dState.m) + '-' + pad2(dState.d) + 'T' + pad2(tState.h) + ':' + pad2(tState.mi));
      });
      foot.appendChild(okBtn);
      panel.appendChild(foot);
    }
    renderBody();
  }

  var RENDERERS = { date: renderDatePanel, time: renderTimePanel, datetime: renderDateTimePanel };
  var MODE_BY_TYPE = { date: 'date', time: 'time', 'datetime-local': 'datetime' };
  var ICON_BY_MODE = { date: ICON_CALENDAR, time: ICON_CLOCK, datetime: ICON_CALENDAR };

  function attach(input, opts) {
    if (!input || input.dataset.wbdpAttached) return;
    var originalType = (input.getAttribute('type') || '').toLowerCase();
    var mode = (opts && opts.mode) || MODE_BY_TYPE[originalType];
    if (!mode) { console.warn('[wb-datepicker] 지원하지 않는 input type:', originalType, input); return; }
    input.dataset.wbdpAttached = '1';

    input.type = 'text';
    input.readOnly = true;
    input.tabIndex = -1;
    input.autocomplete = 'off';
    input.classList.add('wbdp-native');

    var wrap = el('div', 'wbdp' + ((opts && opts.wrapClass) ? ' ' + opts.wrapClass : ''));
    var trigger = el('button', 'wbdp-trigger');
    trigger.type = 'button';
    var icon = el('span', 'wbdp-trigger-icon', ICON_BY_MODE[mode]);
    var text = el('span', 'wbdp-text');
    trigger.append(text, icon);
    var panel = el('div', 'wbdp-panel');
    panel.setAttribute('role', 'dialog');
    wrap.append(trigger, panel);
    input.insertAdjacentElement('afterend', wrap);

    var placeholder = (opts && opts.placeholder) || (mode === 'time' ? '시간을 선택해 주세요' : '날짜를 선택해 주세요');

    function syncTrigger() {
      var v = input.value;
      if (!v) { text.textContent = placeholder; text.classList.add('is-placeholder'); return; }
      text.classList.remove('is-placeholder');
      if (mode === 'date') { var p = parseDate(v); text.textContent = p ? fmtDateDisplay(p) : v; }
      else if (mode === 'time') { var t = parseTime(v); text.textContent = t ? fmtTimeDisplay(t) : v; }
      else { var dp = parseDate(v), tp = parseTime(v); text.textContent = (dp ? fmtDateDisplay(dp) : v) + (tp ? ' ' + fmtTimeDisplay(tp) : ''); }
    }

    function commit(newValue) {
      input.value = newValue; // patch 된 setter 가 syncTrigger 도 같이 호출해 줌
      fireEvents(input);
      closeOpen();
      trigger.focus();
    }

    function openPanel() {
      if (trigger.disabled) return;
      if (openState && openState.trigger === trigger) return; // 이미 이 트리거가 열려 있으면 재사용
      closeOpen();
      RENDERERS[mode](panel, input, commit, opts);
      trigger.classList.add('is-open');
      panel.classList.add('is-open');
      panel.style.left = ''; // 매번 기본값(트리거 좌측 기준)에서 다시 계산
      // 좁은 화면에서 트리거가 화면 오른쪽 절반(예: 날짜+시간이 나란히 있는 행의 시간 칸)에 있으면
      // 패널(최대 320px)이 뷰포트 오른쪽 밖으로 넘어가 html 의 overflow-x:hidden 에 잘려 보이지 않는
      // 부분이 생깁니다 — 열린 뒤 실제 위치를 측정해 화면 안으로 들어오도록 보정합니다.
      var margin = 12;
      var rect = panel.getBoundingClientRect();
      var overflowRight = rect.right - (window.innerWidth - margin);
      if (overflowRight > 0) panel.style.left = (-overflowRight) + 'px';
      var rect2 = panel.getBoundingClientRect();
      if (rect2.left < margin) panel.style.left = (parseFloat(panel.style.left || '0') + (margin - rect2.left)) + 'px';
      openState = {
        wrap: wrap, panel: panel, trigger: trigger,
        close: function () { trigger.classList.remove('is-open'); panel.classList.remove('is-open'); }
      };
    }

    trigger.addEventListener('click', function () {
      if (openState && openState.trigger === trigger) closeOpen();
      else openPanel();
    });
    // label[for] 클릭이나 다른 코드의 input.focus() 호출도 커스텀 트리거로 자연스럽게 이어지도록
    input.addEventListener('focus', function () { trigger.focus(); openPanel(); });

    patchValueProperty(input, syncTrigger);
    syncTrigger();

    // 페이지 쪽에서 input.disabled 를 쓰는 경우를 대비해 트리거도 함께 잠급니다
    var disabledDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'disabled');
    if (disabledDesc && disabledDesc.set) {
      Object.defineProperty(input, 'disabled', {
        configurable: true, enumerable: true,
        get: function () { return disabledDesc.get.call(input); },
        set: function (v) { disabledDesc.set.call(input, v); trigger.disabled = !!v; }
      });
    }
  }

  function attachAll(selectorOrList) {
    var list = typeof selectorOrList === 'string' ? document.querySelectorAll(selectorOrList) : selectorOrList;
    Array.prototype.forEach.call(list, function (el) { attach(el); });
  }

  window.WBDatePicker = { attach: attach, attachAll: attachAll };
})();
