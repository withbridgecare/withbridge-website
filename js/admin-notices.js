/* =========================================================
   위드브릿지 어드민 콘솔 — 공지사항 관리 (admin.html '공지사항 관리' 카드)
   - sql/notices_management.sql 의 notices 테이블을 직접 insert/update/delete 합니다.
   - admin.js(5,400여 줄의 핵심 파일)는 건드리지 않고 완전히 분리된 파일로 둡니다 — admin.js 와
     마찬가지로 자체 Supabase 클라이언트를 하나 더 만듭니다(두 파일이 클라이언트를 공유하지
     않아도, 둘 다 같은 anon key + RLS 로 동작하므로 문제 없습니다).
   - 별도의 관리자 권한 재확인은 하지 않습니다 — 실제 보안 경계는 notices 테이블의 RLS(is_admin())
     이고, admin.js 가 이미 비관리자를 '위드브릿지 어드민 콘솔' 진입 시점에 index.html 로 돌려보냅니다.
========================================================= */
(function () {
  'use strict';

  var WB_ENV = window.WB_ENV || {}; // js/env.js (scripts/build-env.mjs 가 .env 로 생성)
  var SUPABASE_URL = WB_ENV.SUPABASE_URL;
  var SUPABASE_ANON_KEY = WB_ENV.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.error('[설정] window.WB_ENV 가 없습니다. js/env.js 가 이 스크립트보다 먼저 로드되는지, node scripts/build-env.mjs 를 실행했는지 확인하세요.');

  var sdk = window.supabase;
  if (!sdk || !sdk.createClient) return; // admin.js 가 이미 같은 조건에서 alert 를 띄우므로 중복 경고하지 않음
  var supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var CATEGORY_LABEL = { service: '서비스 안내', maintenance: '시스템 점검', event: '이벤트' };
  var BADGE_LABEL = { must: '필독', important: '중요' };

  var currentCategoryFilter = 'all';
  var noticesCache = [];

  function $(id) { return document.getElementById(id); }

  var els = {
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

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDateOnly(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  var toastTimer = null;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }

  function renderNoticeRow(n) {
    var badges = '<span class="admin-badge is-' + n.category + '">' + CATEGORY_LABEL[n.category] + '</span>';
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
    var items = currentCategoryFilter === 'all'
      ? noticesCache
      : noticesCache.filter(function (n) { return n.category === currentCategoryFilter; });

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
    var res = await supabaseClient
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

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

  function openForm(notice) {
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
    var title = els.titleInput.value.trim();
    var body = els.bodyInput.value.trim();
    if (!title || !body) {
      els.error.hidden = false;
      els.error.textContent = '제목과 내용을 모두 입력해 주세요.';
      return;
    }

    var payload = {
      title: title,
      category: els.categoryInput.value,
      badge: els.badgeInput.value || null,
      body: body,
      pinned: els.pinnedInput.checked,
      is_published: els.publishedInput.checked,
      updated_at: new Date().toISOString()
    };

    els.saveBtn.disabled = true;
    var id = els.idInput.value;
    var res = id
      ? await supabaseClient.from('notices').update(payload).eq('id', id)
      : await supabaseClient.from('notices').insert(payload);
    els.saveBtn.disabled = false;

    if (res.error) {
      els.error.hidden = false;
      els.error.textContent = '저장에 실패했습니다: ' + res.error.message;
      return;
    }

    closeForm();
    showToast(id ? '공지를 수정했습니다.' : '공지를 등록했습니다.');
    loadNotices();
  }

  async function deleteNotice(id) {
    if (!window.confirm('이 공지를 삭제하시겠습니까? notice.html에서도 바로 사라집니다.')) return;
    var res = await supabaseClient.from('notices').delete().eq('id', id);
    if (res.error) {
      showToast('삭제에 실패했습니다: ' + res.error.message);
      return;
    }
    showToast('공지를 삭제했습니다.');
    loadNotices();
  }

  if (els.createBtn) els.createBtn.addEventListener('click', function () { openForm(null); });
  if (els.closeBtn) els.closeBtn.addEventListener('click', closeForm);
  if (els.cancelBtn) els.cancelBtn.addEventListener('click', closeForm);
  if (els.saveBtn) els.saveBtn.addEventListener('click', saveNotice);
  if (els.modal) {
    els.modal.addEventListener('mousedown', function (e) {
      if (e.target === els.modal) closeForm();
    });
  }

  els.list.addEventListener('click', function (e) {
    var editBtn = e.target.closest ? e.target.closest('[data-notice-edit]') : null;
    if (editBtn) {
      var notice = noticesCache.find(function (n) { return String(n.id) === editBtn.getAttribute('data-notice-edit'); });
      if (notice) openForm(notice);
      return;
    }
    var deleteBtn = e.target.closest ? e.target.closest('[data-notice-delete]') : null;
    if (deleteBtn) deleteNotice(deleteBtn.getAttribute('data-notice-delete'));
  });

  if (els.categoryFilter) {
    els.categoryFilter.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.admin-filter-chip') : null;
      if (!btn) return;
      currentCategoryFilter = btn.getAttribute('data-category');
      Array.prototype.forEach.call(els.categoryFilter.querySelectorAll('.admin-filter-chip'), function (chip) {
        chip.classList.toggle('is-active', chip === btn);
      });
      renderList();
    });
  }

  loadNotices();
})();
