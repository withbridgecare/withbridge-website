// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 어드민 사이드바 — 예전 public/js/admin-sidebar.js 를 로직 그대로 옮긴 것입니다. DB 호출은 lib/api/-.ts 를 거칩니다.
/* eslint-disable */
import { getSupabase } from '@/lib/supabase/client';
import { createLegacyShims } from '@/lib/browser/legacy-shims';

let started = false;
/** 화면에 동작을 붙입니다 (개발 모드의 이중 실행은 무시). */
export function initAdminSidebar(): void {
  if (started) return;
  started = true;
  const { WBEdgeFn, WBPrivacy } = createLegacyShims();
  const $id = (id: string): any => document.getElementById(id);
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
  let DEFAULT_VIEW = 'dashboard';
  let COLLAPSE_STORAGE_KEY = 'adminSidebarCollapsed';
  function init() {
    let shell = document.querySelector<any>('.admin-shell');
    let sidebar = $id('adminSidebar');
    let toggle = $id('adminSidebarToggle');
    let overlay = $id('adminSidebarOverlay');
    let nav = $id('adminSidebarNav');
    let dashboardGrid = $id('dashboardCardsGrid');
    let collapseBtn = $id('adminSidebarCollapseBtn');
    if (!sidebar || !nav) return;
    function setCollapsed(collapsed?: any) {
      if (shell) shell.classList.toggle('is-sidebar-collapsed', collapsed);
      if (collapseBtn) {
        collapseBtn.setAttribute('aria-expanded', String(!collapsed));
        collapseBtn.setAttribute('aria-label', collapsed ? '메뉴 펼치기' : '메뉴 접기');
      }
      try { window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0'); } catch (e: any) { /* 저장 공간이 없어도 토글 자체는 계속 동작 */ }
    }
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        setCollapsed(!(shell && shell.classList.contains('is-sidebar-collapsed')));
      });
    }
    let collapsedByDefault = false;
    try { collapsedByDefault = window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'; } catch (e: any) { /* 기본값(펼침) 유지 */ }
    setCollapsed(collapsedByDefault);
    let links = Array.prototype.slice.call(nav.querySelectorAll<any>('.admin-sidebar-link[data-view]'));
    let viewTargets = Array.prototype.slice.call(document.querySelectorAll<any>('[data-admin-view]'));
    let currentView = DEFAULT_VIEW;
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
    function switchView(viewId?: any) {
      if (!viewId) return;
      currentView = viewId;
      viewTargets.forEach(function (el: any) {
        let allowed = (el.getAttribute('data-admin-view') || '').split(/\s+/);
        el.hidden = allowed.indexOf(viewId) === -1;
      });
      if (dashboardGrid) dashboardGrid.classList.toggle('is-split', viewId === 'dashboard');
      links.forEach(function (l: any) {
        l.classList.toggle('is-active', l.getAttribute('data-view') === viewId);
      });
      let content = document.querySelector<any>('.admin-content');
      if (content) content.scrollTop = 0;
      window.scrollTo(0, 0);
    }
    nav.addEventListener('click', function (e: any) {
      let link = e.target.closest ? e.target.closest('.admin-sidebar-link[data-view]') : null;
      if (!link) return;
      e.preventDefault();
      switchView(link.getAttribute('data-view'));
      if (window.innerWidth <= 900) closeSidebar();
    });
    switchView(DEFAULT_VIEW);
    window.adminSwitchView = switchView;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();


}
