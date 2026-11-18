/* =========================================================
   위드브릿지 이용약관 팝업 (모든 페이지 공용)
   - 페이지 어디서든 data-open-terms 속성이 있는 링크/버튼을 누르면 이용약관이 팝업으로 열립니다.
       <a href="terms.html" data-open-terms>이용약관</a>                       → 그냥 열기
       <a href="terms.html" data-open-terms data-terms-agree="#termsAgree">…</a> → 팝업 아래에 '동의하고 닫기' 버튼이 생겨
                                                                                 해당 체크박스를 체크해 줍니다
       <a href="terms.html" data-open-terms data-terms-article="6">…</a>       → 제6조로 바로 이동
   - 팝업은 terms.html?embed=1 을 iframe 으로 보여 줍니다 → 약관 본문은 terms.html 한 곳에만 있습니다.
   - 자바스크립트가 꺼져 있거나 Ctrl/⌘/Shift 클릭, 가운데 클릭이면 링크가 그대로 terms.html 로 이동합니다.
   - 닫기(하단 닫기 버튼 / 바깥 클릭 / ESC) 지원. 열려 있는 동안 배경 스크롤을 잠급니다.
   - window.WBTerms: { VERSION, open(opts), close(), hasAgreed(), recordAgreement() }
========================================================= */
(function () {
  'use strict';

  var TERMS_URL = 'terms.html';
  var VERSION = '2026-10-26';              // terms.html 의 '약관 버전'과 같게 유지 (약관을 개정하면 함께 갱신)
  var STORAGE_KEY = 'wb_terms_agreed';

  // ---------- 동의 기록 (이 브라우저에 '어느 버전에 동의했는지'만 기억) ----------
  // 서버에 남는 기록이 아닙니다. 로그인 화면에서 같은 브라우저의 재방문 시 체크를 미리 채워 주는 용도입니다.
  function hasAgreed() {
    try {
      var v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return !!v && v.version === VERSION;
    } catch (e) { return false; }
  }
  function recordAgreement() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, at: new Date().toISOString() })); }
    catch (e) { /* 저장소 사용 불가(사생활 보호 모드 등)면 무시 */ }
  }

  var isTermsPage = /\/terms(\.html)?$/.test(location.pathname); // 이미 약관 페이지면 팝업을 띄우지 않음

  // ---------- 스타일 (한 번만 주입, 접두사 wbt- 로 다른 CSS 와 충돌 방지) ----------
  var CSS = [
    '.wbt-backdrop{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(30,35,32,.62);font-family:"Pretendard Variable",Pretendard,"Noto Sans KR",-apple-system,"Malgun Gothic",sans-serif}',
    '.wbt-backdrop[hidden]{display:none!important}',
    '.wbt-dialog{display:flex;flex-direction:column;width:100%;max-width:880px;height:min(88vh,900px);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,.4)}',
    '.wbt-head{display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid #EBE7E0}',
    '.wbt-head h2{margin:0;font-size:18px;font-weight:800;color:#1A1D21}',
    '.wbt-foot-actions{display:flex;align-items:center;gap:8px}',
    // 하단 컨트롤(왼쪽 링크 · 오른쪽 버튼)은 높이를 40px 로 똑같이 맞춰, 위·아래 여백과 가운데 줄이 정확히 일치하게 함
    '.wbt-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-height:40px;padding:0 18px;border:1.5px solid #2D6A4F;border-radius:9999px;background:#fff;color:#2D6A4F;font-family:inherit;font-size:14px;font-weight:700;line-height:1.2;cursor:pointer;transition:background .15s,color .15s}',
    '.wbt-btn[hidden]{display:none!important}', // display:inline-flex 가 hidden 속성을 덮어쓰지 않도록 ('동의하고 닫기'는 동의 대상이 있을 때만 표시)
    '.wbt-btn:hover{background:#2D6A4F;color:#fff}',
    '.wbt-btn.wbt-plain{border-color:#9AA3AF;color:#374151}',
    '.wbt-btn.wbt-plain:hover{background:#374151;border-color:#374151;color:#fff}',
    '.wbt-btn.wbt-primary{background:#2D6A4F;color:#fff}',
    '.wbt-btn.wbt-primary:hover{background:#1B4332;border-color:#1B4332}',
    '.wbt-btn:focus-visible,.wbt-link:focus-visible{outline:3px solid rgba(45,106,79,.5);outline-offset:2px}',
    '.wbt-body{flex:1;min-height:0;background:#fff}',
    '.wbt-frame{display:block;width:100%;height:100%;border:0}',
    '.wbt-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-top:1px solid #EBE7E0;background:#FBFCFA}',
    '.wbt-link{display:inline-flex;align-items:center;box-sizing:border-box;min-height:40px;font-size:14px;font-weight:700;line-height:1.2;color:#455822;text-decoration:underline;text-underline-offset:3px}',
    'html.wbt-lock,html.wbt-lock body{overflow:hidden}',
    '@media (max-width:640px){.wbt-backdrop{padding:0}.wbt-dialog{height:100%;max-width:none;border-radius:0}.wbt-head{padding:14px}.wbt-foot{padding:12px 14px}.wbt-btn{padding:0 14px}}'
  ].join('');

  var modal = null, frame = null, agreeBtn = null, closeBtn = null, lastFocus = null, agreeTarget = null;

  function build() {
    if (modal) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 정적 마크업만 사용 (사용자 입력이 들어가지 않음)
    modal = document.createElement('div');
    modal.className = 'wbt-backdrop';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="wbt-dialog" role="dialog" aria-modal="true" aria-labelledby="wbtTitle">' +
        '<div class="wbt-head">' +
          '<h2 id="wbtTitle">이용약관</h2>' +
        '</div>' +
        '<div class="wbt-body"><iframe class="wbt-frame" title="위드브릿지 서비스 이용약관"></iframe></div>' +
        '<div class="wbt-foot">' +
          '<a class="wbt-link" href="' + TERMS_URL + '" target="_blank" rel="noopener">새 창에서 보기</a>' +
          '<div class="wbt-foot-actions">' +
            '<button type="button" class="wbt-btn wbt-plain" data-wbt="close">닫기</button>' +
            '<button type="button" class="wbt-btn wbt-primary" data-wbt="agree" hidden>동의하고 닫기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    frame = modal.querySelector('iframe');
    agreeBtn = modal.querySelector('[data-wbt="agree"]');
    closeBtn = modal.querySelector('.wbt-foot [data-wbt="close"]'); // 닫기 버튼은 하단에 하나만 (열릴 때 여기로 포커스)

    modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); }); // 바깥(어두운 배경) 클릭
    modal.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-wbt]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-wbt');
      if (act === 'close') close();
      else if (act === 'agree') agree();
    });
    document.addEventListener('keydown', onKeydown);
  }

  function open(opts) {
    opts = opts || {};
    build();
    lastFocus = document.activeElement;

    // 조문 번호(6) 또는 앵커(art-6)로 바로 이동
    var article = opts.article ? String(opts.article).replace(/[^a-z0-9-]/gi, '') : '';
    if (/^\d+$/.test(article)) article = 'art-' + article;
    var src = TERMS_URL + '?embed=1' + (article ? '#' + article : '');
    if (frame.getAttribute('data-src') !== src) { frame.setAttribute('data-src', src); frame.src = src; } // 처음(또는 이동 대상이 바뀔 때)만 로드
    else if (article) {
      // 이미 같은 조문으로 열려 있던 팝업을 다시 열 때: 그 사이 스크롤했을 수 있으니 해당 조문으로 다시 이동
      try { var w = frame.contentWindow; w.location.hash = ''; w.location.hash = article; } catch (e) { /* 접근 불가면 그대로 둠 */ }
    }

    agreeTarget = opts.agree || null;
    agreeBtn.hidden = !agreeTarget;

    modal.hidden = false;
    document.documentElement.classList.add('wbt-lock');
    closeBtn.focus();
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.documentElement.classList.remove('wbt-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus(); // 열기 전 위치로 포커스 복귀
  }

  // '동의하고 닫기': 연결된 체크박스를 체크하고 change 이벤트를 보내 폼의 오류 표시 등도 함께 갱신
  function agree() {
    if (agreeTarget) {
      var el = document.querySelector(agreeTarget);
      if (el) {
        el.checked = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    close();
  }

  // Esc 로 닫기 + Tab 이 팝업 밖으로 나가지 않게 (포커스 가두기)
  function onKeydown(e) {
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(modal.querySelectorAll('button, a[href]'), function (el) { return !el.hidden && el.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (!modal.contains(document.activeElement) || document.activeElement === frame) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // data-open-terms 링크 클릭 → 팝업 (동적으로 추가된 링크도 동작하도록 이벤트 위임)
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || isTermsPage) return;
    var a = e.target.closest ? e.target.closest('[data-open-terms]') : null;
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // 새 탭/새 창으로 열기는 그대로 허용
    e.preventDefault();
    open({ agree: a.getAttribute('data-terms-agree'), article: a.getAttribute('data-terms-article') });
  });

  window.WBTerms = { VERSION: VERSION, open: open, close: close, hasAgreed: hasAgreed, recordAgreement: recordAgreement };
})();
