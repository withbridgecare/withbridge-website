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
      '.wbdp-trigger:focus-visible,.wbdp-trigger.is-open{outline:none;border-color:#9ca3af;background:#fff;' +
      'box-shadow:0 0 0 3px rgba(107,114,128,.15),0 2px 10px rgba(15,23,42,.05);}' +
      '.wbdp-trigger:disabled{opacity:.55;cursor:not-allowed;}' +
      '.wbdp-trigger-icon{flex:none;display:inline-flex;color:#78866B;}' +
      /* [레이아웃 재설계] 이 패널은 '케어 완료' 같은 모달(overflow-y:auto 로 스크롤되는 .modal) 안에서
         열릴 때가 많습니다 — position:absolute 로 트리거의 부모 기준에 두면, 트리거가 모달 하단 쪽에
         있을 때 패널이 모달의 overflow-y:auto 경계에 그대로 잘려 나가(스크롤 영역을 벗어난 부분이
         숨겨짐) "레이아웃이 깨진다"는 증상으로 보였습니다. position:fixed 로 바꿔 뷰포트 기준 좌표로
         직접 배치하면(openPanel()의 positionPanel() 참고) 어떤 overflow:auto 조상 안에서도 잘리지
         않습니다. z-index 도 이 사이트의 모달 배경(.modal-backdrop 등)이 쓰는 200보다 넉넉히 높여
         둡니다. */
      '.wbdp-panel{position:fixed;z-index:2000;width:320px;max-width:calc(100vw - 24px);' +
      'background:#fff;border:1px solid #F1F2F4;border-radius:24px;' +
      'box-shadow:0 24px 56px rgba(15,23,42,.18),0 6px 16px rgba(15,23,42,.08);' +
      'padding:20px;transform:scale(.97) translateY(-4px);opacity:0;pointer-events:none;' +
      'transition:transform .15s ease,opacity .15s ease;}' +
      '.wbdp-panel.is-open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto;}' +
      '.wbdp-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:16px;}' +
      '.wbdp-nav-btn{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid #E5E7EB;background:#fff;' +
      'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#1A1D21;' +
      'transition:background-color .15s ease;}' +
      '.wbdp-nav-btn:hover{background:#F3F4F6;}' +
      '.wbdp-nav-btn:disabled{opacity:.3;cursor:not-allowed;}' +
      /* [레이아웃 재설계] 네이티브 <select> 는 브라우저/OS 마다 화살표 폭이 달라 글자와 겹치는 문제가
         반복됐습니다 — select 자체를 버리고, 이 사이트의 다른 UI(트리거 버튼·필 모양 뱃지)와 같은
         톤의 버튼 + 팝오버 목록으로 다시 만듭니다. 화살표는 항상 버튼 안의 <span> 아이콘으로 직접
         그리므로(네이티브 렌더링에 의존하지 않음) 글자와 겹칠 수 없습니다. */
      '.wbdp-ym{display:flex;align-items:center;flex-wrap:nowrap;gap:8px;min-width:0;flex:1 1 auto;justify-content:center;}' +
      '.wbdp-ym-dd{position:relative;flex:none;}' +
      '.wbdp-ym-btn{display:flex;align-items:center;justify-content:center;gap:4px;height:34px;box-sizing:border-box;' +
      'padding:0 12px;border:1px solid #E5E7EB;border-radius:9999px;background:#F9FAFB;' +
      'font:inherit;font-size:13.5px;font-weight:700;color:#1A1D21;cursor:pointer;white-space:nowrap;' +
      'transition:border-color .15s ease,background-color .15s ease,box-shadow .15s ease;}' +
      '.wbdp-ym-btn:hover{border-color:#D1D5DB;}' +
      '.wbdp-ym-btn.is-open,.wbdp-ym-btn:focus-visible{outline:none;border-color:#9ca3af;background:#fff;' +
      'box-shadow:0 0 0 3px rgba(107,114,128,.15);}' +
      '.wbdp-ym-btn-chevron{flex:none;display:inline-flex;color:#9CA3AF;transition:transform .15s ease,color .15s ease;}' +
      '.wbdp-ym-btn.is-open .wbdp-ym-btn-chevron{transform:rotate(180deg);color:#6b7280;}' +
      /* 연도는 "2026년"처럼 4자리+글자, 월은 "12월"처럼 최대 2자리+글자라 필요한 폭이 다릅니다 —
         min-width 로 각각 넉넉한 최소 폭을 고정해 둬서, .wbdp-nav 양옆 원형 버튼과 한 줄에 끼여
         좁아지는 화면에서도 글자가 잘리거나 화살표와 부딪히지 않습니다. */
      '.wbdp-year-dd .wbdp-ym-btn{min-width:88px;}' +
      '.wbdp-month-dd .wbdp-ym-btn{min-width:66px;}' +
      '.wbdp-ym-pop{position:absolute;z-index:10;top:calc(100% + 6px);left:50%;width:112px;' +
      'transform:translateX(-50%) scale(.96) translateY(-2px);background:#fff;border:1px solid #F1F2F4;' +
      'border-radius:16px;box-shadow:0 16px 36px rgba(15,23,42,.16),0 4px 10px rgba(15,23,42,.06);' +
      'opacity:0;pointer-events:none;transition:transform .12s ease,opacity .12s ease;}' +
      '.wbdp-ym-pop.is-open{transform:translateX(-50%) scale(1) translateY(0);opacity:1;pointer-events:auto;}' +
      '.wbdp-ym-pop-list{max-height:216px;overflow-y:auto;padding:6px;scrollbar-width:none;}' +
      '.wbdp-ym-pop-list::-webkit-scrollbar{display:none;}' +
      '.wbdp-ym-pop-item{display:block;width:100%;box-sizing:border-box;padding:9px 10px;border:none;' +
      'border-radius:10px;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:#374151;' +
      'text-align:center;cursor:pointer;font-variant-numeric:tabular-nums;transition:background-color .15s ease;}' +
      '.wbdp-ym-pop-item:hover{background:#F3F4F6;}' +
      '.wbdp-ym-pop-item.is-selected{background:#78866B;color:#fff;font-weight:800;}' +
      '.wbdp-dow{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:4px;}' +
      '.wbdp-dow span{text-align:center;font-size:11.5px;font-weight:700;color:#9CA3AF;padding-bottom:6px;}' +
      '.wbdp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}' +
      '.wbdp-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:none;background:transparent;' +
      'border-radius:14px;font-size:13.5px;font-weight:600;color:#1A1D21;cursor:pointer;transition:background-color .15s ease;}' +
      '.wbdp-day:hover:not(:disabled){background:#F1F5F0;}' +
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
  // 연/월 커스텀 드롭다운 버튼의 화살표 — 네이티브 select 화살표 대신 항상 이 아이콘 하나만 그려서
  // 브라우저마다 다르게 렌더링되는 네이티브 화살표와 글자가 겹치는 문제를 원천적으로 없앱니다.
  var ICON_CHEVRON_DOWN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- 연/월 선택용 커스텀 드롭다운 (select 대체) ----------
  // 한 번에 하나만 열리게(연도 드롭다운을 열어 둔 채 월 드롭다운을 누르면 먼저 닫힘) openYm 로 공유합니다.
  var openYm = null; // { dd, close() }
  function closeYmDropdown() { if (openYm) { openYm.close(); openYm = null; } }

  function createYmDropdown(cls) {
    var wrap = el('div', 'wbdp-ym-dd ' + cls);
    var btn = el('button', 'wbdp-ym-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var btnText = el('span', 'wbdp-ym-btn-text');
    var chevron = el('span', 'wbdp-ym-btn-chevron', ICON_CHEVRON_DOWN);
    btn.append(btnText, chevron);
    var pop = el('div', 'wbdp-ym-pop');
    pop.setAttribute('role', 'listbox');
    var list = el('div', 'wbdp-ym-pop-list');
    pop.appendChild(list);
    wrap.append(btn, pop);

    var dd = { wrap: wrap, btn: btn, btnText: btnText, list: list };

    function toggle() {
      if (openYm && openYm.dd === dd) { closeYmDropdown(); return; }
      closeYmDropdown();
      pop.classList.add('is-open');
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      var sel = list.querySelector('.is-selected');
      if (sel) sel.scrollIntoView({ block: 'center' });
      openYm = {
        dd: dd,
        close: function () { pop.classList.remove('is-open'); btn.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
      };
    }
    btn.addEventListener('click', toggle);

    // items: [{value, label}] — selectedValue 와 같은 항목에 is-selected, 누르면 onPick(value) 후 닫힘.
    dd.fill = function (items, selectedValue, selectedLabel, onPick) {
      btnText.textContent = selectedLabel;
      list.innerHTML = '';
      items.forEach(function (it) {
        var item = el('button', 'wbdp-ym-pop-item', it.label);
        item.type = 'button';
        item.setAttribute('role', 'option');
        if (it.value === selectedValue) item.classList.add('is-selected');
        item.addEventListener('click', function () { closeYmDropdown(); onPick(it.value); });
        list.appendChild(item);
      });
    };
    return dd;
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
  // 패널/트리거 내부 클릭인지 판단 — wrap.contains() 만으로는 충분하지만, closest() 로도 한 번 더
  // 확인해 어떤 경로로 들어와도(예: 향후 마크업이 바뀌어 wrap 바깥에 포털로 붙는 경우 등) 패널 내부
  // 클릭이 바깥 클릭으로 오판되지 않도록 이중으로 막아 둡니다.
  function isInsideOpenPanel(target) {
    if (!openState || !target || typeof target.closest !== 'function') return false;
    return openState.wrap.contains(target) || !!target.closest('.wbdp, .wbdp-panel, .wbdp-ym-pop');
  }
  document.addEventListener('mousedown', function (e) {
    if (!openState) return;
    if (isInsideOpenPanel(e.target)) return;
    closeOpen();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openState) closeOpen(); });
  // 패널이 position:fixed 로 뷰포트 좌표에 고정되므로(아래 openPanel() 참고), 모달 안쪽처럼 트리거만
  // 스크롤되는 상황에서는 패널이 트리거를 따라가지 못하고 그 자리에 둥 떠 보일 수 있습니다 — 스크롤이
  // 일어나면 그냥 닫아, 다시 열 때 트리거의 새 위치에 맞춰 정확히 다시 뜨게 합니다. capture:true 로
  // 등록해야 overflow:auto 모달 안쪽 스크롤(버블링되지 않음)도 놓치지 않고 잡습니다.
  //
  // [버그 수정] 이 리스너가 capture:true 라서 "어디서든" 스크롤이 일어나면 무조건 닫아 버렸는데, 연/월
  // 드롭다운을 열 때 선택된 항목으로 스크롤하는 scrollIntoView()나, 시/분을 휠로 스크롤해서 고르는
  // 동작까지도 전부 "스크롤"로 잡혀서 패널 내부를 만지는 순간 패널 자체가 닫혀버리는 증상이 있었습니다.
  // 스크롤 이벤트의 target 이 지금 열려 있는 패널 내부(연/월 팝업, 시간 휠 등)면 무시하고, 패널 밖
  // (페이지/모달 쪽)이 스크롤될 때만 닫습니다.
  window.addEventListener('scroll', function (e) {
    if (!openState) return;
    if (isInsideOpenPanel(e.target)) return;
    closeOpen();
  }, true);
  window.addEventListener('resize', function () { closeOpen(); });

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
    var yDd = createYmDropdown('wbdp-year-dd');
    var mDd = createYmDropdown('wbdp-month-dd');
    ym.append(yDd.wrap, mDd.wrap);
    nav.append(prevBtn, ym, nextBtn);
    container.appendChild(nav);
    // 날짜 그리드를 눌러 달력을 넘기거나(이전/다음 달) 날짜를 고를 때는, 열려 있던 연/월 드롭다운을
    // 먼저 닫습니다 — 네이티브 select 가 아니라 직접 띄운 팝오버라서, 다른 곳을 눌러도 저절로 닫히지
    // 않고 그대로 겹쳐 남아 있을 수 있기 때문입니다.
    container.addEventListener('mousedown', function (e) {
      if (openYm && !openYm.dd.wrap.contains(e.target)) closeYmDropdown();
    });

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
      var items = [];
      for (var y = range[0]; y <= range[1]; y++) items.push({ value: y, label: y + '년' });
      yDd.fill(items, state.y, state.y + '년', function (v) { state.y = v; rerender(); });
    }
    function fillMonthSelect() {
      var lo = (min && state.y === min.y) ? min.m : 1;
      var hi = (max && state.y === max.y) ? max.m : 12;
      // 연도를 바꿔서 지금 달이 그 해의 허용 범위를 벗어나면(예: 최소 연도인데 그 최소 월보다 이전 달)
      // state.m 을 범위 안으로 당겨서, 드롭다운 표시값과 실제 달력 상태가 어긋나지 않게 합니다.
      if (state.m < lo) state.m = lo;
      if (state.m > hi) state.m = hi;
      var items = [];
      for (var m = lo; m <= hi; m++) items.push({ value: m, label: m + '월' });
      mDd.fill(items, state.m, state.m + '월', function (v) { state.m = v; rerender(); });
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

    // 패널은 position:fixed 라 뷰포트 좌표를 직접 계산해 넣어야 합니다(이 사이트의 '케어 완료' 같은
    // 모달은 overflow-y:auto 로 스크롤되는데, 트리거의 부모 기준 position:absolute 로 두면 패널이
    // 그 모달 경계에 그대로 잘려 보이는 문제가 있었습니다 — 자세한 설명은 위 .wbdp-panel 스타일 주석 참고).
    //
    // [레이아웃 수정] 예전에는 트리거 아래로 폈을 때 화면 밖으로 넘치면 위로 뒤집어 띄웠는데, 모달
    // 안에서는 그렇게 위로 뒤집힌 패널의 윗부분이 모달 테두리나 위쪽 다른 필드에 가려 보이는 문제가
    // 있었습니다(사용자 보고: '다음 진료 예약일' 입력창). 위로 뒤집는 분기를 없애고 항상 트리거
    // 아래쪽에만(10px 여백) 열며, 혹시 뷰포트 아래 공간이 패널 전체 높이보다 부족하면 패널 자체의
    // 최대 높이를 남은 공간에 맞춰 줄이고 내부 스크롤(overflow-y:auto)로 전부 볼 수 있게 합니다 —
    // 이렇게 하면 패널이 항상 입력 필드 아래쪽에서, 모달 스크롤 영역 안에서도 잘리지 않고 온전히 보입니다.
    function positionPanel() {
      var margin = 12;
      var tRect = trigger.getBoundingClientRect();
      var pRect = panel.getBoundingClientRect();
      var top = tRect.bottom + 10;
      var available = window.innerHeight - margin - top;
      if (available < pRect.height) {
        panel.style.maxHeight = Math.max(available, 160) + 'px';
        panel.style.overflowY = 'auto';
      } else {
        panel.style.maxHeight = '';
        panel.style.overflowY = '';
      }

      var left = tRect.left;
      if (left + pRect.width > window.innerWidth - margin) left = window.innerWidth - margin - pRect.width;
      if (left < margin) left = margin;
      panel.style.top = top + 'px';
      panel.style.left = left + 'px';
    }

    function openPanel() {
      if (trigger.disabled) return;
      if (openState && openState.trigger === trigger) return; // 이미 이 트리거가 열려 있으면 재사용
      closeOpen();
      RENDERERS[mode](panel, input, commit, opts);
      trigger.classList.add('is-open');
      panel.classList.add('is-open');
      positionPanel();
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
