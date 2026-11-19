// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 관리자 로그 화면 — 예전 public/admin-logs.js 를 로직 그대로 옮긴 것입니다. DB 호출은 lib/api/admin-logs.ts 를 거칩니다.
/* eslint-disable */
import { getSupabase } from '@/lib/supabase/client';
import * as api from '@/lib/api/admin-logs';
import { createLegacyShims } from '@/lib/browser/legacy-shims';

let started = false;
/** 화면에 동작을 붙입니다 (개발 모드의 이중 실행은 무시). */
export function initAdminLogs(): void {
  if (started) return;
  started = true;
  const { WBEdgeFn, WBPrivacy } = createLegacyShims();
  const $id = (id: string): any => document.getElementById(id);
/* =========================================================
   위드브릿지 어드민 콘솔 — 관리자 로그 전용 페이지 (admin-logs.html)
   - admin.js 와 마찬가지로 이 페이지도 자체 Supabase 클라이언트를 만들고, 진입 시 다시
     profiles.role === 'admin' 을 확인합니다(다른 탭에서 바로 이 URL로 들어와도 fail closed).
   - admin_logs 테이블은 sql/admin_logs.sql 의 admin_logs_select_admin 정책으로 관리자만 읽을 수
     있고, UPDATE/DELETE 정책 자체가 없어 이 화면에서도(또한 어떤 API로도) 고치거나 지울 수 없습니다.
========================================================= */
  let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let supabaseClient = getSupabase();
  function $(id) { return $id(id); }
  let els = {
    account: $('adminAccount'),
    name: $('adminName'),
    logoutBtn: $('logoutBtn'),
    toast: $('adminToast'),
    count: $('logsCount'),
    exportBtn: $('logsExportBtn'),
    dateFrom: $('logsDateFrom'),
    dateTo: $('logsDateTo'),
    adminFilter: $('logsAdminFilter'),
    actionFilter: $('logsActionFilter'),
    resetFilterBtn: $('logsResetFilterBtn'),
    tableBody: $('logsTableBody'),
    paginationWrap: $('logsPaginationWrap'),
    detailModal: $('logDetailModal'),
    detailGrid: $('logDetailGrid'),
    detailCloseBtn: $('logDetailCloseBtn'),
    detailCloseBtn2: $('logDetailCloseBtn2')
  };
  let toastTimer: any = null;
  function showToast(message?: any) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }
  function escapeHtml(value?: any) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c: any) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatDateTime(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  let ACTION_TYPE_LABEL = {
    reveal_bank_account: '매니저 계좌번호 전체 조회',
    member_profile_update: '회원 정보 수정',
    member_note_add: 'CS 메모 작성',
    member_suspend: '계정 정지',
    member_activate: '계정 활성화',
    coupon_grant: '쿠폰 수동 지급',
    coupon_delete: '쿠폰 삭제',
    package_grant: '회차 수동 지급',
    package_adjust: '회차 수동 조정',
    super_admin_grant_admin: '관리자 권한 부여',
    super_admin_revoke_admin: '관리자 권한 회수'
  };
  function formatDetail(detail?: any) {
    if (!detail || typeof detail !== 'object') return '-';
    let keys = Object.keys(detail);
    if (!keys.length) return '-';
    return keys.map(function (k: any) { return k + ': ' + (detail[k] == null ? '-' : detail[k]); }).join(' · ');
  }
  function formatDetailMultiline(detail?: any) {
    if (!detail || typeof detail !== 'object') return '(세부 내용 없음)';
    let keys = Object.keys(detail);
    if (!keys.length) return '(세부 내용 없음)';
    return keys.map(function (k: any) { return k + ': ' + (detail[k] == null ? '-' : detail[k]); }).join('\n');
  }
  function formatTargetLabel(log?: any, memberMap?: any) {
    if (!log.target_type && !log.target_id) return '-';
    if (log.target_type === 'member' && log.target_id) {
      let member = memberMap && memberMap[log.target_id];
      if (member) return (member.name || '이름 미등록') + (member.phone ? ' (' + member.phone + ')' : '');
      return '알 수 없는 회원 (ID: ' + String(log.target_id).slice(0, 8) + '…)';
    }
    return [log.target_type, log.target_id].filter(Boolean).join(' · ');
  }
  async function verifyAdminAccess() {
    let sessionRes = await supabaseClient.auth.getSession();
    let session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      alert('로그인이 필요합니다.');
      window.location.replace('index.html');
      return null;
    }
    let profileRes = await api.getProfiles(supabaseClient, session);
    if (profileRes.error) {
      console.error('[AdminLogs] profiles 조회 실패:', profileRes.error.code, profileRes.error.message);
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }
    let profile = profileRes.data;
    let normalizedRole = String((profile && profile.role) || '').trim().toLowerCase();
    if (!profile || (normalizedRole !== 'admin' && normalizedRole !== 'super_admin')) {
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }
    return { user: session.user, profile: profile };
  }
  function bindLogout() {
    if (!els.logoutBtn) return;
    els.logoutBtn.addEventListener('click', async function () {
      els.logoutBtn.disabled = true;
      let res = await supabaseClient.auth.signOut();
      if (res.error) {
        alert('로그아웃 중 오류가 발생했습니다: ' + res.error.message);
        els.logoutBtn.disabled = false;
        return;
      }
      window.location.replace('index.html');
    });
  }
  let LOGS_PAGE_SIZE = 20;
  let logsPage = 1;
  let logsTotalCount = 0;
  let lastLogsRows: any[] = [];
  function currentFilters() {
    return {
      dateFrom: els.dateFrom && els.dateFrom.value ? els.dateFrom.value : '',
      dateTo: els.dateTo && els.dateTo.value ? els.dateTo.value : '',
      adminId: els.adminFilter && els.adminFilter.value ? els.adminFilter.value : '',
      actionType: els.actionFilter && els.actionFilter.value ? els.actionFilter.value : ''
    };
  }
  function applyDateRange(query?: any, filters?: any) {
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');
    return query;
  }
  async function fetchLogsPage(page?: any, filters?: any) {
    let from = (page - 1) * LOGS_PAGE_SIZE;
    let to = from + LOGS_PAGE_SIZE - 1;
    let query = api.countAdminLogs(supabaseClient, from, to);
    query = applyDateRange(query, filters);
    if (filters.adminId) query = query.eq('admin_id', filters.adminId);
    if (filters.actionType) query = query.eq('action_type', filters.actionType);
    let res = await query;
    if (res.error) {
      console.error('[AdminLogs] 목록 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_logs.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      return { rows: [], total: 0, error: res.error };
    }
    return { rows: res.data || [], total: res.count || 0, error: null };
  }
  async function loadMemberLookup(rows?: any) {
    let ids: any[] = [];
    let seen: any = {};
    rows.forEach(function (log: any) {
      if (log.target_type === 'member' && log.target_id && !seen[log.target_id]) {
        seen[log.target_id] = true;
        ids.push(log.target_id);
      }
    });
    if (!ids.length) return {};
    let res = await api.listProfiles(supabaseClient, ids);
    if (res.error) {
      console.error('[AdminLogs] 대상 회원 정보 조회 실패:', res.error.code, res.error.message);
      return {};
    }
    let map: any = {};
    (res.data || []).forEach(function (p: any) { map[p.id] = p; });
    return map;
  }
  function renderLogsTable(rows?: any, memberMap?: any) {
    let body = els.tableBody;
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">조건에 맞는 로그가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = '';
    rows.forEach(function (log: any) {
      let targetLabel = formatTargetLabel(log, memberMap);
      let detailText = formatDetail(log.detail);
      let tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatDateTime(log.created_at)) + '</td>' +
        '<td>' + escapeHtml(log.admin_name || '(이름 없음)') + '<span class="admin-logs-target-sub">' + escapeHtml(log.admin_email || '') + '</span></td>' +
        '<td><span class="admin-badge is-neutral">' + escapeHtml(ACTION_TYPE_LABEL[log.action_type] || log.action_type) + '</span></td>' +
        '<td>' + escapeHtml(targetLabel) + '</td>' +
        '<td></td>';
      let detailCell = tr.lastElementChild;
      let detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'admin-logs-detail-trunc';
      detailBtn.title = detailText; // 마우스를 올리면 브라우저 기본 툴팁으로 전체 내용을 보여줍니다
      detailBtn.textContent = detailText;
      detailBtn.addEventListener('click', function () { openLogDetailModal(log, targetLabel); });
      detailCell.appendChild(detailBtn);
      body.appendChild(tr);
    });
  }
  function openLogDetailModal(log?: any, targetLabel?: any) {
    if (!els.detailModal || !els.detailGrid) return;
    els.detailGrid.innerHTML =
      '<dt>일시</dt><dd>' + escapeHtml(formatDateTime(log.created_at)) + '</dd>' +
      '<dt>관리자</dt><dd>' + escapeHtml(log.admin_name || '(이름 없음)') + (log.admin_email ? ' (' + escapeHtml(log.admin_email) + ')' : '') + '</dd>' +
      '<dt>작업 종류</dt><dd>' + escapeHtml(ACTION_TYPE_LABEL[log.action_type] || log.action_type) + '</dd>' +
      '<dt>대상</dt><dd>' + escapeHtml(targetLabel) + '</dd>' +
      '<dt>세부 내용</dt><dd>' + escapeHtml(formatDetailMultiline(log.detail)) + '</dd>';
    els.detailModal.hidden = false;
  }
  function closeLogDetailModal() {
    if (els.detailModal) els.detailModal.hidden = true;
  }
  if (els.detailCloseBtn) els.detailCloseBtn.addEventListener('click', closeLogDetailModal);
  if (els.detailCloseBtn2) els.detailCloseBtn2.addEventListener('click', closeLogDetailModal);
  if (els.detailModal) {
    els.detailModal.addEventListener('click', function (e: any) { if (e.target === els.detailModal) closeLogDetailModal(); });
  }
  function renderPagination(totalPages?: any) {
    let wrap = els.paginationWrap;
    if (!wrap) return;
    if (totalPages <= 1) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = '';
    function addPageBtn(label?: any, page?: any, opts?: any) {
      opts = opts || {};
      let btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-page-btn' + (opts.active ? ' is-active' : '');
      btn.textContent = label;
      if (opts.disabled || opts.active) btn.disabled = true;
      if (!opts.disabled && !opts.active) btn.addEventListener('click', function () { goToPage(page); });
      wrap.appendChild(btn);
    }
    addPageBtn('‹ 이전', logsPage - 1, { disabled: logsPage <= 1 });
    let windowStart = Math.max(1, logsPage - 2);
    let windowEnd = Math.min(totalPages, logsPage + 2);
    if (windowStart > 1) {
      addPageBtn('1', 1, {});
      if (windowStart > 2) { let e1 = document.createElement('span'); e1.className = 'admin-page-ellipsis'; e1.textContent = '…'; wrap.appendChild(e1); }
    }
    for (let p = windowStart; p <= windowEnd; p++) addPageBtn(String(p), p, { active: p === logsPage });
    if (windowEnd < totalPages) {
      if (windowEnd < totalPages - 1) { let e2 = document.createElement('span'); e2.className = 'admin-page-ellipsis'; e2.textContent = '…'; wrap.appendChild(e2); }
      addPageBtn(String(totalPages), totalPages, {});
    }
    addPageBtn('다음 ›', logsPage + 1, { disabled: logsPage >= totalPages });
  }
  async function goToPage(page?: any) {
    if (page < 1) return;
    logsPage = page;
    await loadLogs();
    let table = $('logsTable');
    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function loadLogs() {
    let body = els.tableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';
    let result = await fetchLogsPage(logsPage, currentFilters());
    if (result.error) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(result.error.message) + '</td></tr>';
      if (els.paginationWrap) els.paginationWrap.hidden = true;
      return;
    }
    lastLogsRows = result.rows;
    logsTotalCount = result.total;
    if (els.count) { els.count.textContent = logsTotalCount + '건'; els.count.hidden = false; }
    let memberMap = await loadMemberLookup(lastLogsRows);
    renderLogsTable(lastLogsRows, memberMap);
    renderPagination(Math.max(1, Math.ceil(logsTotalCount / LOGS_PAGE_SIZE)));
  }
  function onFilterChanged() {
    logsPage = 1;
    loadLogs();
  }
  [els.dateFrom, els.dateTo, els.adminFilter, els.actionFilter].forEach(function (el: any) {
    if (el) el.addEventListener('change', onFilterChanged);
  });
  if (els.resetFilterBtn) {
    els.resetFilterBtn.addEventListener('click', function () {
      if (els.dateFrom) els.dateFrom.value = '';
      if (els.dateTo) els.dateTo.value = '';
      if (els.adminFilter) els.adminFilter.value = '';
      if (els.actionFilter) els.actionFilter.value = '';
      onFilterChanged();
    });
  }
  async function loadAdminFilterOptions() {
    if (!els.adminFilter) return;
    let res = await api.listProfiles2(supabaseClient);
    if (res.error) {
      console.error('[AdminLogs] 관리자 목록 조회 실패:', res.error.code, res.error.message);
      return;
    }
    (res.data || []).forEach(function (p: any) {
      let opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || '(이름 없음)';
      els.adminFilter.appendChild(opt);
    });
  }
  async function loadActionFilterOptions() {
    if (!els.actionFilter) return;
    let known = Object.keys(ACTION_TYPE_LABEL);
    let res = await api.listAdminLogs(supabaseClient);
    let seen: any = {};
    known.forEach(function (k: any) { seen[k] = true; });
    let extra: any[] = [];
    (res.data || []).forEach(function (row: any) {
      if (row.action_type && !seen[row.action_type]) { seen[row.action_type] = true; extra.push(row.action_type); }
    });
    known.concat(extra).forEach(function (actionType: any) {
      let opt = document.createElement('option');
      opt.value = actionType;
      opt.textContent = ACTION_TYPE_LABEL[actionType] || actionType;
      els.actionFilter.appendChild(opt);
    });
  }
  function csvEscape(value?: any) {
    let s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  async function exportLogsToCsv() {
    let btn = els.exportBtn;
    if (!btn) return;
    btn.disabled = true;
    let originalLabel = btn.textContent;
    btn.textContent = '다운로드 준비 중…';
    try {
      let filters = currentFilters();
      let allRows: any[] = [];
      let batchSize = 500;
      for (let offset = 0; ; offset += batchSize) {
        let query = api.listAdminLogs2(supabaseClient, offset, batchSize);
        query = applyDateRange(query, filters);
        if (filters.adminId) query = query.eq('admin_id', filters.adminId);
        if (filters.actionType) query = query.eq('action_type', filters.actionType);
        let res = await query;
        if (res.error) {
          console.error('[AdminLogs] CSV 조회 실패:', res.error.code, res.error.message);
          showToast('엑셀 다운로드에 실패했습니다: ' + res.error.message);
          return;
        }
        let batch = res.data || [];
        allRows = allRows.concat(batch);
        if (batch.length < batchSize) break;
      }
      if (!allRows.length) {
        showToast('다운로드할 로그가 없습니다(현재 필터 조건에 맞는 로그가 없음).');
        return;
      }
      let memberMap = await loadMemberLookup(allRows);
      let header = ['일시', '관리자', '관리자 이메일', '작업 종류', '대상 회원', '대상 ID', '세부 내용'];
      let lines = [header.map(csvEscape).join(',')];
      allRows.forEach(function (log: any) {
        lines.push([
          formatDateTime(log.created_at),
          log.admin_name || '(이름 없음)',
          log.admin_email || '',
          ACTION_TYPE_LABEL[log.action_type] || log.action_type,
          formatTargetLabel(log, memberMap),
          log.target_id || '',
          log.detail ? JSON.stringify(log.detail) : ''
        ].map(csvEscape).join(','));
      });
      let csvContent = '﻿' + lines.join('\r\n');
      let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url;
      a.download = '위드브릿지_관리자로그_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(allRows.length + '건의 로그를 내려받았습니다.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
  if (els.exportBtn) els.exportBtn.addEventListener('click', exportLogsToCsv);
  (async function init() {
    let access = await verifyAdminAccess();
    if (!access) return;
    if (els.name) els.name.textContent = (access.profile.name || access.user.email || '관리자') + '님';
    if (els.account) els.account.hidden = false;
    bindLogout();
    await Promise.all([loadAdminFilterOptions(), loadActionFilterOptions()]);
    await loadLogs();
    supabaseClient.auth.onAuthStateChange(function (event: any) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();


}
