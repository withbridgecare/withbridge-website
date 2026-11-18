/* =========================================================
   위드브릿지 어드민 콘솔 — 좌측 사이드바 동작 (admin.html 전용)
   - Supabase 호출 없음, 순수 UI: 모바일 오프캔버스 토글 + 데스크톱 접기/펼치기 + 뷰 전환(View Switching)
   - 대상 id: #adminSidebar, #adminSidebarToggle, #adminSidebarOverlay, #adminSidebarNav
   - [data-admin-view="a b c"] 가 달린 모든 요소는 현재 활성 뷰가 a/b/c 중 하나일 때만 보이고,
     그 외에는 hidden 처리됩니다. 사이드바 메뉴([data-view="x"])를 누르면 활성 뷰가 x 로 바뀝니다.
     '대시보드' 뷰는 요약 카드 + 가입 승인 대기 매니저 + 오늘의 케어 신청 두 카드를 한 번에 보여주므로
     그 둘을 감싸는 #dashboardCardsGrid 만 2열(.is-split)로 유지하고, 단일 카드만 보일 때는 1열로
     되돌립니다. 다른 화면(admin.js)이 특정 카드로 바로 이동하고 싶을 때 쓸 수 있도록
     window.adminSwitchView(viewId) 를 전역으로 노출합니다.
========================================================= */
(function () {
  'use strict';

  var DEFAULT_VIEW = 'dashboard';
  var COLLAPSE_STORAGE_KEY = 'adminSidebarCollapsed';

  function init() {
    var shell = document.querySelector('.admin-shell');
    var sidebar = document.getElementById('adminSidebar');
    var toggle = document.getElementById('adminSidebarToggle');
    var overlay = document.getElementById('adminSidebarOverlay');
    var nav = document.getElementById('adminSidebarNav');
    var dashboardGrid = document.getElementById('dashboardCardsGrid');
    var collapseBtn = document.getElementById('adminSidebarCollapseBtn');
    if (!sidebar || !nav) return;

    // 데스크톱 전용 사이드바 접기/펼치기 — 브랜드 옆 햄버거 버튼 하나로 양방향 토글합니다.
    // 접으면 사이드바가 완전히 사라지는 게 아니라 64px 아이콘 전용 슬림 바로 줄어들고
    // (admin.css 의 .is-sidebar-collapsed), 이 버튼 자체는 접힌 상태에서도 계속 보이므로
    // 다시 펼 수 있는 진입점이 따로 필요 없습니다. 선택값은 localStorage 에 저장해 새로고침 후에도
    // 유지됩니다(모바일 폭에서는 CSS 가 이 상태 클래스를 무시하고 항상 드로어 방식으로만 동작).
    function setCollapsed(collapsed) {
      if (shell) shell.classList.toggle('is-sidebar-collapsed', collapsed);
      if (collapseBtn) {
        collapseBtn.setAttribute('aria-expanded', String(!collapsed));
        collapseBtn.setAttribute('aria-label', collapsed ? '메뉴 펼치기' : '메뉴 접기');
      }
      try { window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0'); } catch (e) { /* 저장 공간이 없어도 토글 자체는 계속 동작 */ }
    }
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        setCollapsed(!(shell && shell.classList.contains('is-sidebar-collapsed')));
      });
    }
    var collapsedByDefault = false;
    try { collapsedByDefault = window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'; } catch (e) { /* 기본값(펼침) 유지 */ }
    setCollapsed(collapsedByDefault);

    var links = Array.prototype.slice.call(nav.querySelectorAll('.admin-sidebar-link[data-view]'));
    var viewTargets = Array.prototype.slice.call(document.querySelectorAll('[data-admin-view]'));
    var currentView = DEFAULT_VIEW;

    function openSidebar() {
      sidebar.classList.add('is-open');
      if (overlay) overlay.hidden = false;
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
    function closeSidebar() {
      sidebar.classList.remove('is-open');
      if (overlay) overlay.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        if (sidebar.classList.contains('is-open')) closeSidebar(); else openSidebar();
      });
    }
    if (overlay) overlay.addEventListener('click', closeSidebar);

    function switchView(viewId) {
      if (!viewId) return;
      currentView = viewId;

      viewTargets.forEach(function (el) {
        var allowed = (el.getAttribute('data-admin-view') || '').split(/\s+/);
        el.hidden = allowed.indexOf(viewId) === -1;
      });
      if (dashboardGrid) dashboardGrid.classList.toggle('is-split', viewId === 'dashboard');

      links.forEach(function (l) {
        l.classList.toggle('is-active', l.getAttribute('data-view') === viewId);
      });

      var content = document.querySelector('.admin-content');
      if (content) content.scrollTop = 0;
      window.scrollTo(0, 0);
    }

    // 메뉴 클릭 시 스크롤 대신 뷰만 전환(모바일에서는 전환 후 드로어 닫음)
    nav.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('.admin-sidebar-link[data-view]') : null;
      if (!link) return;
      e.preventDefault();
      switchView(link.getAttribute('data-view'));
      if (window.innerWidth <= 900) closeSidebar();
    });

    switchView(DEFAULT_VIEW);

    // admin.js(요약 카드 클릭 등)에서 특정 카드가 속한 뷰로 바로 전환하고 싶을 때 사용
    window.adminSwitchView = switchView;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
