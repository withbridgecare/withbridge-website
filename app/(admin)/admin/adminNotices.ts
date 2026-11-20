// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 어드민 공지사항 관리 — 예전 public/js/admin-notices.js 를 로직 그대로 옮긴 것입니다. DB 호출은 lib/api/admin-notices.ts 를 거칩니다.
/* eslint-disable */
import { getSupabase } from '@/lib/supabase/client';
import * as api from '@/lib/api/admin-notices';
import { createLegacyShims } from '@/lib/browser/legacy-shims';
import { showDoneNotice } from '../doneNotice';

let started = false;
/** 화면에 동작을 붙입니다 (개발 모드의 이중 실행은 무시). */
export function initAdminNotices(): void {
  if (started) return;
  started = true;
  const { WBEdgeFn, WBPrivacy } = createLegacyShims();
  const $id = (id: string): any => document.getElementById(id);
/* =========================================================
   위드브릿지 어드민 콘솔 — 공지사항 관리 (admin.html '공지사항 관리' 카드)
   - sql/notices_management.sql 의 notices 테이블을 직접 insert/update/delete 합니다.
   - admin.js(5,400여 줄의 핵심 파일)는 건드리지 않고 완전히 분리된 파일로 둡니다 — admin.js 와
     마찬가지로 자체 Supabase 클라이언트를 하나 더 만듭니다(두 파일이 클라이언트를 공유하지
     않아도, 둘 다 같은 anon key + RLS 로 동작하므로 문제 없습니다).
   - 별도의 관리자 권한 재확인은 하지 않습니다 — 실제 보안 경계는 notices 테이블의 RLS(is_admin())
     이고, admin.js 가 이미 비관리자를 '위드브릿지 어드민 콘솔' 진입 시점에 index.html 로 돌려보냅니다.
========================================================= */
  let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let supabaseClient = getSupabase();
  let CATEGORY_LABEL = { service: '서비스 안내', maintenance: '시스템 점검', event: '이벤트' };
  let BADGE_LABEL = { must: '필독', important: '중요' };
  let currentCategoryFilter = 'all';
  let noticesCache: any[] = [];
  function $(id) { return $id(id); }
  let els = {
    list: $('noticesList'),
    count: $('noticesCount'),
    categoryFilter: $('noticesCategoryFilter'),
    createBtn: $('noticeCreateBtn'),
    toast: $('adminToast'),
    modal: $('noticeFormModal'),
    modalTitle: $('noticeFormModalTitle'),
    closeBtn: $('noticeFormCloseBtn'),
    cancelBtn: $('noticeFormCancelBtn'),
    saveBtn: $('noticeFormSaveBtn'),
    error: $('noticeFormError'),
    idInput: $('noticeFormId'),
    titleInput: $('noticeFormTitle'),
    categoryInput: $('noticeFormCategory'),
    badgeInput: $('noticeFormBadge'),
    bodyInput: $('noticeFormBody'),
    pinnedInput: $('noticeFormPinned'),
    publishedInput: $('noticeFormPublished')
  };
  if (!els.list) return; // 이 카드가 없는 페이지에서는 아무 것도 하지 않음
  function escapeHtml(value?: any) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c: any) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatDateOnly(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  let toastTimer: any = null;
  function showToast(message?: any) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }
  function renderNoticeRow(n?: any) {
    let badges = '<span class="admin-badge is-' + n.category + '">' + CATEGORY_LABEL[n.category] + '</span>';
    if (n.badge) badges += '<span class="admin-badge is-' + n.badge + '">' + BADGE_LABEL[n.badge] + '</span>';
    if (n.pinned) badges += '<span class="admin-badge is-pinned">상단 고정</span>';
    if (!n.is_published) badges += '<span class="admin-badge is-draft">비공개</span>';
    return (
      '<div class="admin-row" data-notice-id="' + n.id + '">' +
        '<div class="admin-row-head">' +
          '<div>' +
            '<p class="admin-row-name">' + escapeHtml(n.title) + '</p>' +
            '<p class="admin-row-sub">' + formatDateOnly(n.created_at) + '</p>' +
          '</div>' +
          '<div class="admin-badge-group">' + badges + '</div>' +
        '</div>' +
        '<div class="admin-row-actions">' +
          '<button type="button" class="admin-btn is-ghost" data-notice-edit="' + n.id + '">수정</button>' +
          '<button type="button" class="admin-btn is-danger" data-notice-delete="' + n.id + '">삭제</button>' +
        '</div>' +
      '</div>'
    );
  }
  function renderList() {
    let items = currentCategoryFilter === 'all'
      ? noticesCache
      : noticesCache.filter(function (n: any) { return n.category === currentCategoryFilter; });
    if (els.count) {
      els.count.hidden = false;
      els.count.textContent = items.length + '건';
    }
    els.list.innerHTML = items.length
      ? items.map(renderNoticeRow).join('')
      : '<p class="admin-empty">등록된 공지사항이 없습니다.</p>';
  }
  async function loadNotices() {
    els.list.innerHTML = '<p class="admin-loading">불러오는 중…</p>';
    let res = await api.listNotices(supabaseClient);
    if (res.error) {
      console.error('[AdminNotices] notices 조회 실패:', res.error.message,
        '→ sql/notices_management.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      els.list.innerHTML = '<p class="admin-empty">공지사항을 불러오지 못했습니다.</p>';
      return;
    }
    noticesCache = res.data || [];
    renderList();
  }
  function resetForm() {
    els.idInput.value = '';
    els.titleInput.value = '';
    els.categoryInput.value = 'service';
    els.badgeInput.value = '';
    els.bodyInput.value = '';
    els.pinnedInput.checked = false;
    els.publishedInput.checked = true;
    els.error.hidden = true;
    els.error.textContent = '';
  }
  function openForm(notice?: any) {
    resetForm();
    if (notice) {
      els.modalTitle.textContent = '공지 수정';
      els.idInput.value = notice.id;
      els.titleInput.value = notice.title;
      els.categoryInput.value = notice.category;
      els.badgeInput.value = notice.badge || '';
      els.bodyInput.value = notice.body;
      els.pinnedInput.checked = !!notice.pinned;
      els.publishedInput.checked = !!notice.is_published;
    } else {
      els.modalTitle.textContent = '공지 등록';
    }
    els.modal.hidden = false;
  }
  function closeForm() {
    els.modal.hidden = true;
  }
  async function saveNotice() {
    let title = els.titleInput.value.trim();
    let body = els.bodyInput.value.trim();
    if (!title || !body) {
      els.error.hidden = false;
      els.error.textContent = '제목과 내용을 모두 입력해 주세요.';
      return;
    }
    let payload = {
      title: title,
      category: els.categoryInput.value,
      badge: els.badgeInput.value || null,
      body: body,
      pinned: els.pinnedInput.checked,
      is_published: els.publishedInput.checked,
      updated_at: new Date().toISOString()
    };
    els.saveBtn.disabled = true;
    let id = els.idInput.value;
    let res = id
      ? await api.updateNotices(supabaseClient, payload, id)
      : await api.insertNotices(supabaseClient, payload);
    els.saveBtn.disabled = false;
    if (res.error) {
      els.error.hidden = false;
      els.error.textContent = '저장에 실패했습니다: ' + res.error.message;
      return;
    }
    closeForm();
    await showDoneNotice(id ? '공지를 수정했습니다.' : '공지를 등록했습니다.');
    loadNotices();
  }
  async function deleteNotice(id?: any) {
    if (!window.confirm('이 공지를 삭제하시겠습니까? notice.html에서도 바로 사라집니다.')) return;
    let res = await api.deleteNotices(supabaseClient, id);
    if (res.error) {
      showToast('삭제에 실패했습니다: ' + res.error.message);
      return;
    }
    await showDoneNotice('공지를 삭제했습니다.');
    loadNotices();
  }
  if (els.createBtn) els.createBtn.addEventListener('click', function () { openForm(null); });
  if (els.closeBtn) els.closeBtn.addEventListener('click', closeForm);
  if (els.cancelBtn) els.cancelBtn.addEventListener('click', closeForm);
  if (els.saveBtn) els.saveBtn.addEventListener('click', saveNotice);
  if (els.modal) {
    els.modal.addEventListener('mousedown', function (e: any) {
      if (e.target === els.modal) closeForm();
    });
  }
  els.list.addEventListener('click', function (e: any) {
    let editBtn = e.target.closest ? e.target.closest('[data-notice-edit]') : null;
    if (editBtn) {
      let notice = noticesCache.find(function (n: any) { return String(n.id) === editBtn.getAttribute('data-notice-edit'); });
      if (notice) openForm(notice);
      return;
    }
    let deleteBtn = e.target.closest ? e.target.closest('[data-notice-delete]') : null;
    if (deleteBtn) deleteNotice(deleteBtn.getAttribute('data-notice-delete'));
  });
  if (els.categoryFilter) {
    els.categoryFilter.addEventListener('click', function (e: any) {
      let btn = e.target.closest ? e.target.closest('.admin-filter-chip') : null;
      if (!btn) return;
      currentCategoryFilter = btn.getAttribute('data-category');
      Array.prototype.forEach.call(els.categoryFilter.querySelectorAll<any>('.admin-filter-chip'), function (chip: any) {
        chip.classList.toggle('is-active', chip === btn);
      });
      renderList();
    });
  }
  loadNotices();


}
