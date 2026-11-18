/* =========================================================
   위드브릿지 공통 모바일 헤더 햄버거 드로어 동작 (사이트 전역 공용)
   - 대상: index.html, about.html, apply.html, login.html, manager-apply.html,
           mypage.html, mypage-manager.html, terms.html
   - 각 페이지는 동일한 id 를 가진 마크업(#wbMenuToggle, #wbMobileDrawer,
     #wbDrawerOverlay, #wbDrawerClose, #wbMenuIconOpen, #wbMenuIconClose)을 두고,
     이 스크립트가 열기/닫기/스크롤 잠금/바깥 클릭·ESC·리사이즈 닫기를 공용으로 처리합니다.
   - 사용법: <script src="/js/mobile-nav.js?v=1.0" defer></script>
========================================================= */
(function () {
  'use strict';

  function init() {
    var toggle = document.getElementById('wbMenuToggle');
    var drawer = document.getElementById('wbMobileDrawer');
    var overlay = document.getElementById('wbDrawerOverlay');
    var closeBtn = document.getElementById('wbDrawerClose');
    var iconOpen = document.getElementById('wbMenuIconOpen');
    var iconClose = document.getElementById('wbMenuIconClose');
    if (!toggle || !drawer || !overlay) return;

    // 닫기 애니메이션(0.3s)이 끝난 뒤에만 visibility:hidden 으로 완전히 닫습니다 — display:none 을
    // 바로 쓰면 opacity/transform 트랜지션이 재생되지 않고 즉시 사라져 버리기 때문입니다.
    var closeTimer = null;

    function openDrawer() {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      drawer.style.visibility = ''; // 닫는 중(타이머 대기 중)에 다시 열렸을 수 있으므로 즉시 원복
      drawer.classList.add('is-open');
      overlay.classList.add('is-open');
      document.body.classList.add('wb-drawer-open');
      drawer.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      if (iconOpen) iconOpen.style.display = 'none';
      if (iconClose) iconClose.style.display = 'block';
    }
    function closeDrawer() {
      drawer.classList.remove('is-open'); // opacity/transform 페이드아웃·슬라이드 시작
      overlay.classList.remove('is-open');
      document.body.classList.remove('wb-drawer-open');
      drawer.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      if (iconOpen) iconOpen.style.display = 'block';
      if (iconClose) iconClose.style.display = 'none';

      // 애니메이션이 재생되는 동안은 그대로 두고, 끝난 뒤(300ms)에만 visibility:hidden 을 적용해
      // 투명해진 메뉴 안으로 키보드 탭 포커스가 들어가지 않도록 접근성 트리에서도 완전히 제외합니다.
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(function () {
        if (!drawer.classList.contains('is-open')) drawer.style.visibility = 'hidden';
        closeTimer = null;
      }, 300);
    }
    toggle.addEventListener('click', function () {
      if (drawer.classList.contains('is-open')) closeDrawer(); else openDrawer();
    });
    overlay.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    // 드로어 안의 링크(<a>) 클릭 시 드로어를 닫습니다. 이벤트 위임으로 처리해, 로그인 상태에 따라
    // auth-header.js 가 나중에 동적으로 끼워 넣는 링크(마이페이지·어드민 콘솔 등)도 똑같이 닫힙니다.
    drawer.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link) closeDrawer();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 768) closeDrawer(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
