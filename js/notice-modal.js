/* =========================================================
   위드브릿지 '공지사항 준비 중' 안내 팝업 (모든 페이지 공용)
   - 공지사항 페이지가 아직 없어서, 헤더/드로어의 '공지사항' 링크가 지금까지는 존재하지 않는
     #notice 앵커로 이동해 "엉뚱한 곳(메인 홈 맨 위)으로 튕기는" 것처럼 보였습니다. 이 스크립트는
     그 링크의 클릭을 가로채 "공지사항 페이지는 현재 준비 중입니다." 안내 팝업을 띄웁니다.
   - 사용법: 링크에 data-open-notice 속성만 추가하면 됩니다.
       <a href="index.html#notice" data-open-notice>공지사항</a>
   - 자바스크립트가 꺼져 있거나 Ctrl/⌘/Shift/가운데 클릭이면 막지 않고 원래 링크 동작(새 탭 등)을 그대로 둡니다.
   - 닫기: 하단 '확인' 버튼 / 바깥(어두운 배경) 클릭 / ESC. 열려 있는 동안 배경 스크롤을 잠급니다.
   - window.WBNotice: { open(), close() }
========================================================= */
(function () {
  'use strict';

  // ---------- 스타일 (한 번만 주입, 접두사 wbn- 로 다른 CSS 와 충돌 방지) ----------
  var CSS = [
    '.wbn-backdrop{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
      'padding:16px;background:rgba(30,35,32,.62);font-family:"Pretendard Variable",Pretendard,"Noto Sans KR",' +
      '-apple-system,"Malgun Gothic",sans-serif;opacity:0;transition:opacity .18s ease;}',
    '.wbn-backdrop[hidden]{display:none!important;}',
    '.wbn-backdrop.wbn-open{opacity:1;}',
    // '부드럽게 뜨도록' — 살짝 아래·작게 시작해서 제자리로 떠오르는 느낌만 주고, 과하지 않게 짧은 시간만 사용
    '.wbn-dialog{width:100%;max-width:360px;background:#fff;border-radius:20px;padding:28px 24px 24px;' +
      'text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.4);' +
      'transform:translateY(10px) scale(.97);opacity:0;transition:transform .2s ease,opacity .2s ease;}',
    '.wbn-backdrop.wbn-open .wbn-dialog{transform:translateY(0) scale(1);opacity:1;}',
    '.wbn-icon{display:flex;align-items:center;justify-content:center;width:52px;height:52px;margin:0 auto 14px;' +
      'border-radius:50%;background:#F1F2F4;color:#6B7280;font-size:22px;font-weight:800;}',
    '.wbn-dialog h2{margin:0 0 8px;font-size:17px;font-weight:800;color:#1A1D21;}',
    '.wbn-dialog p{margin:0 0 20px;font-size:14px;line-height:1.6;color:#6B7280;word-break:keep-all;}',
    '.wbn-btn{display:block;width:100%;box-sizing:border-box;padding:12px 18px;border:none;border-radius:9999px;' +
      'background:#2D6A4F;color:#fff;font-family:inherit;font-size:14.5px;font-weight:700;cursor:pointer;' +
      'transition:background .15s ease;}',
    '.wbn-btn:hover{background:#1B4332;}',
    '.wbn-btn:focus-visible{outline:3px solid rgba(45,106,79,.5);outline-offset:2px;}',
    'html.wbn-lock,html.wbn-lock body{overflow:hidden;}'
  ].join('');

  var modal = null, closeBtn = null, lastFocus = null;

  function build() {
    if (modal) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 정적 마크업만 사용 (사용자 입력이 들어가지 않음)
    modal = document.createElement('div');
    modal.className = 'wbn-backdrop';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="wbn-dialog" role="alertdialog" aria-modal="true" aria-labelledby="wbnTitle" aria-describedby="wbnDesc">' +
        '<div class="wbn-icon" aria-hidden="true">!</div>' +
        '<h2 id="wbnTitle">공지사항 준비 중</h2>' +
        '<p id="wbnDesc">공지사항 페이지는 현재 준비 중입니다.<br>빠르게 준비해서 찾아뵙겠습니다.</p>' +
        '<button type="button" class="wbn-btn" data-wbn="close">확인</button>' +
      '</div>';
    document.body.appendChild(modal);

    closeBtn = modal.querySelector('[data-wbn="close"]');

    modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); }); // 바깥(어두운 배경) 클릭
    modal.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-wbn="close"]')) close();
    });
    document.addEventListener('keydown', onKeydown);
  }

  function open() {
    build();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.classList.add('wbn-lock');
    // hidden 을 지운 바로 다음 틱에 is-open 클래스를 붙여야 transition 이 "즉시 끝남"이 아니라 실제로 애니메이션됨
    requestAnimationFrame(function () { modal.classList.add('wbn-open'); });
    closeBtn.focus();
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('wbn-open');
    modal.hidden = true;
    document.documentElement.classList.remove('wbn-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus(); // 열기 전 위치로 포커스 복귀
  }

  // Esc 로 닫기 + Tab 이 팝업 밖으로 나가지 않게(버튼이 하나뿐이라 그 버튼에 포커스를 고정)
  function onKeydown(e) {
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
  }

  // data-open-notice 링크 클릭 → 팝업 (동적으로 추가된 링크도 동작하도록 이벤트 위임)
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target.closest ? e.target.closest('[data-open-notice]') : null;
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // 새 탭/새 창으로 열기는 그대로 허용
    e.preventDefault();
    open();
  });

  window.WBNotice = { open: open, close: close };
})();
