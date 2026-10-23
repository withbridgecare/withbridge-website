/* =========================================================
   위드브릿지 공통 장소(병원 등) 검색 모달 (wb-place-search)
   - 카카오 로컬 키워드 검색 API(v2/local/search/keyword.json)로 실제 존재하는 장소만 검색해,
     목록에서 고른 곳의 상호명 + 주소만 입력할 수 있게 합니다(자유 타이핑으로 임의의 병원명을
     적어 넣는 것을 막음 — 매니저가 나중에 그 위치로 길찾기/방문해야 하므로 실제 장소여야 함).
   - apply.html(목적지/병원 검색), mypage.html(어르신 프로필의 '자주 가는 병원')이 공유합니다.
   사용법: <script src="/js/wb-place-search.js"></script> 로드 후,
     WBPlaceSearch.open({
       apiKey: KAKAO_REST_API_KEY,         // 호출하는 페이지가 이미 가진 카카오 REST API 키
       title: '병원 검색',                  // 모달 제목(선택, 기본값 있음)
       placeholder: '예: 인하대병원',        // 검색창 placeholder(선택)
       onSelect: function (place) { ... }  // place = { name, address, roadAddress, phone }
     });
========================================================= */
(function () {
  'use strict';

  if (!document.getElementById('wbps-style')) {
    var style = document.createElement('style');
    style.id = 'wbps-style';
    style.textContent =
      '.wbps-backdrop{position:fixed;inset:0;z-index:300;background:rgba(15,23,42,.45);display:flex;' +
      'align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;' +
      'transition:opacity .15s ease;}' +
      '.wbps-backdrop.is-open{opacity:1;pointer-events:auto;}' +
      '.wbps-panel{width:100%;max-width:440px;max-height:min(640px,86vh);display:flex;flex-direction:column;' +
      'background:#fff;border-radius:24px;box-shadow:0 24px 60px rgba(15,23,42,.22);' +
      'transform:scale(.97) translateY(6px);transition:transform .15s ease;overflow:hidden;}' +
      '.wbps-backdrop.is-open .wbps-panel{transform:scale(1) translateY(0);}' +
      '.wbps-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:18px 20px 0;}' +
      '.wbps-title{font-size:16.5px;font-weight:800;color:#1A1D21;}' +
      '.wbps-close{flex:none;width:32px;height:32px;border:none;background:#F3F4F6;border-radius:50%;' +
      'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:15px;' +
      'transition:background-color .15s ease;}' +
      '.wbps-close:hover{background:#E5E7EB;}' +
      '.wbps-search-row{display:flex;gap:8px;padding:14px 20px;}' +
      '.wbps-input{flex:1 1 auto;min-width:0;padding:12px 16px;border:1px solid #E5E7EB;border-radius:14px;' +
      'font:inherit;font-size:15px;background:#F9FAFB;color:#1A1D21;}' +
      '.wbps-input:focus{outline:none;border-color:#78866B;background:#fff;box-shadow:0 0 0 3px rgba(120,134,107,.18);}' +
      '.wbps-search-btn{flex:none;padding:0 18px;border:none;border-radius:14px;background:#78866B;color:#fff;' +
      'font-size:14px;font-weight:700;cursor:pointer;transition:background-color .15s ease;}' +
      '.wbps-search-btn:hover{background:#556B2F;}' +
      '.wbps-list{flex:1 1 auto;overflow-y:auto;padding:0 10px 14px;min-height:120px;}' +
      '.wbps-item{display:block;width:100%;text-align:left;padding:12px 10px;border:none;background:transparent;' +
      'border-radius:14px;cursor:pointer;transition:background-color .15s ease;}' +
      '.wbps-item:hover,.wbps-item:focus-visible{background:#F3F4F6;outline:none;}' +
      '.wbps-item-name{font-size:15px;font-weight:700;color:#1A1D21;}' +
      '.wbps-item-cat{margin-left:6px;font-size:11.5px;font-weight:700;color:#78866B;background:#EEF1E9;' +
      'border-radius:999px;padding:2px 8px;}' +
      '.wbps-item-addr{margin-top:3px;font-size:13px;color:#6B7280;}' +
      '.wbps-state{padding:28px 20px;text-align:center;font-size:14px;color:#9CA3AF;}' +
      '.wbps-state.is-error{color:#C0392B;}';
    document.head.appendChild(style);
  }

  var backdrop, panel, titleEl, input, searchBtn, closeBtn, listEl;
  var currentOnSelect = null;
  var currentApiKey = null;
  var searchSeq = 0;
  var debounceTimer = null;

  function buildDom() {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'wbps-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.innerHTML =
      '<div class="wbps-panel" role="dialog" aria-modal="true" aria-label="장소 검색">' +
        '<div class="wbps-head"><span class="wbps-title" id="wbpsTitle">장소 검색</span>' +
          '<button type="button" class="wbps-close" id="wbpsClose" aria-label="닫기">✕</button></div>' +
        '<div class="wbps-search-row"><input type="search" class="wbps-input" id="wbpsInput" autocomplete="off">' +
          '<button type="button" class="wbps-search-btn" id="wbpsSearchBtn">검색</button></div>' +
        '<div class="wbps-list" id="wbpsList"><p class="wbps-state">검색어를 입력해 실제 등록된 장소를 찾아보세요.</p></div>' +
      '</div>';
    document.body.appendChild(backdrop);

    panel = backdrop.querySelector('.wbps-panel');
    titleEl = backdrop.querySelector('#wbpsTitle');
    input = backdrop.querySelector('#wbpsInput');
    searchBtn = backdrop.querySelector('#wbpsSearchBtn');
    closeBtn = backdrop.querySelector('#wbpsClose');
    listEl = backdrop.querySelector('#wbpsList');

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.classList.contains('is-open')) close();
    });
    searchBtn.addEventListener('click', function () { runSearch(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(input.value); } });
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var q = input.value.trim();
      if (q.length < 2) {
        listEl.innerHTML = '<p class="wbps-state">검색어를 2글자 이상 입력해 주세요.</p>';
        return;
      }
      debounceTimer = setTimeout(function () { runSearch(q); }, 400);
    });
  }

  async function runSearch(rawQuery) {
    var query = String(rawQuery || '').trim();
    if (!query) { listEl.innerHTML = '<p class="wbps-state">검색어를 입력해 주세요.</p>'; return; }
    if (!currentApiKey) {
      listEl.innerHTML = '<p class="wbps-state is-error">장소 검색 서비스를 사용할 수 없어요.</p>';
      return;
    }
    var seq = ++searchSeq;
    listEl.innerHTML = '<p class="wbps-state">검색 중…</p>';
    try {
      var res = await fetch('https://dapi.kakao.com/v2/local/search/keyword.json?size=15&query=' + encodeURIComponent(query), {
        headers: { Authorization: 'KakaoAK ' + currentApiKey }
      });
      if (seq !== searchSeq) return; // 그 사이 다른 검색어로 다시 검색함 — 이 응답은 버림
      if (!res.ok) throw new Error('kakao local api ' + res.status);
      var data = await res.json();
      renderResults(data.documents || []);
    } catch (e) {
      if (seq !== searchSeq) return;
      console.warn('[WBPlaceSearch] 장소 검색 실패:', e);
      listEl.innerHTML = '<p class="wbps-state is-error">검색에 실패했어요. 잠시 후 다시 시도해 주세요.</p>';
    }
  }

  function renderResults(docs) {
    if (!docs.length) {
      listEl.innerHTML = '<p class="wbps-state">검색 결과가 없습니다. 다른 이름으로 검색해 보세요.</p>';
      return;
    }
    listEl.innerHTML = '';
    docs.forEach(function (doc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wbps-item';
      var address = doc.road_address_name || doc.address_name || '';
      var category = String(doc.category_name || '').split('>').pop().trim();
      btn.innerHTML =
        '<span class="wbps-item-name">' + escapeHtml(doc.place_name || '') + '</span>' +
        (category ? '<span class="wbps-item-cat">' + escapeHtml(category) + '</span>' : '') +
        '<div class="wbps-item-addr">' + escapeHtml(address || '주소 정보 없음') + '</div>';
      btn.addEventListener('click', function () {
        var place = {
          name: doc.place_name || '',
          address: address,
          roadAddress: doc.road_address_name || '',
          jibunAddress: doc.address_name || '',
          phone: doc.phone || '',
          lat: doc.y ? Number(doc.y) : null,
          lng: doc.x ? Number(doc.x) : null
        };
        // close() 가 currentOnSelect 를 null 로 되돌리므로, close() 보다 먼저 지금 콜백을 변수로
        // 붙잡아 둬야 합니다 — 순서가 바뀌면(close() 를 먼저 부르면) 콜백이 이미 null 이 되어 있어
        // 선택한 장소가 부모 화면(입력란)에 전혀 전달되지 않는 채로 모달만 닫히는 버그가 됩니다.
        var onSelect = currentOnSelect;
        close();
        if (typeof onSelect === 'function') onSelect(place);
      });
      listEl.appendChild(btn);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function close() {
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
    currentOnSelect = null;
  }

  function open(options) {
    var opts = options || {};
    buildDom();
    currentApiKey = opts.apiKey || null;
    currentOnSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;
    titleEl.textContent = opts.title || '장소 검색';
    input.placeholder = opts.placeholder || '장소 이름으로 검색';
    input.value = '';
    listEl.innerHTML = '<p class="wbps-state">검색어를 입력해 실제 등록된 장소를 찾아보세요.</p>';
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { input.focus(); }, 0);
  }

  window.WBPlaceSearch = { open: open };
})();
