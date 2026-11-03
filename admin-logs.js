/* =========================================================
   위드브릿지 어드민 콘솔 — 관리자 로그 전용 페이지 (admin-logs.html)
   - admin.js 와 마찬가지로 이 페이지도 자체 Supabase 클라이언트를 만들고, 진입 시 다시
     profiles.role === 'admin' 을 확인합니다(다른 탭에서 바로 이 URL로 들어와도 fail closed).
   - admin_logs 테이블은 sql/admin_logs.sql 의 admin_logs_select_admin 정책으로 관리자만 읽을 수
     있고, UPDATE/DELETE 정책 자체가 없어 이 화면에서도(또한 어떤 API로도) 고치거나 지울 수 없습니다.
========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://layvjisfeivkzowopkco.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_M7wpIAR7-aXvG78Xv-WBoQ_q1wj_FcR';

  var sdk = window.supabase;
  if (!sdk || !sdk.createClient) {
    alert('Supabase 연결에 실패했습니다. 새로고침해 주세요.');
    throw new Error('[AdminLogs] Supabase SDK 가 로드되지 않았습니다.');
  }
  var supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function $(id) { return document.getElementById(id); }
  var els = {
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

  var toastTimer = null;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDateTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // 알려진 작업 종류의 한글 라벨 — 새 종류가 생겨도(아직 여기 없는 action_type) 원래 문자열을
  // 그대로 보여주므로 화면이 깨지지는 않습니다(아래 ACTION_TYPE_LABEL[x] || x 패턴).
  var ACTION_TYPE_LABEL = {
    member_profile_update: '회원 정보 수정',
    member_note_add: 'CS 메모 작성',
    member_suspend: '계정 정지',
    member_activate: '계정 활성화',
    coupon_grant: '쿠폰 수동 지급',
    coupon_delete: '쿠폰 삭제',
    package_grant: '회차 수동 지급',
    package_adjust: '회차 수동 조정'
  };

  // 표의 한 줄짜리 요약("세부 내용" 칸, CSS 말줄임표로 잘림 + title 로 호버 시 전체 노출)에 씁니다.
  function formatDetail(detail) {
    if (!detail || typeof detail !== 'object') return '-';
    var keys = Object.keys(detail);
    if (!keys.length) return '-';
    return keys.map(function (k) { return k + ': ' + (detail[k] == null ? '-' : detail[k]); }).join(' · ');
  }

  // 상세 모달에 쓰는 여러 줄 버전 — 줄바꿈으로 나열해 긴 메모도 읽기 편하게 보여줍니다
  // (#logDetailGrid dd 에 white-space: pre-wrap 이 걸려 있어 \n 이 그대로 줄바꿈으로 보입니다).
  function formatDetailMultiline(detail) {
    if (!detail || typeof detail !== 'object') return '(세부 내용 없음)';
    var keys = Object.keys(detail);
    if (!keys.length) return '(세부 내용 없음)';
    return keys.map(function (k) { return k + ': ' + (detail[k] == null ? '-' : detail[k]); }).join('\n');
  }

  // "대상" 칸 — target_type 이 'member' 면 profiles 조회 결과(memberMap)로 "이름 (전화번호)" 형태로
  // 바꿔 보여주고, 조회가 안 되면(탈퇴 등) 짧게 줄인 ID 를 대신 보여 줍니다. member 가 아니거나
  // target 자체가 없으면 기존처럼 target_type/target_id 를 그대로 보여줍니다.
  function formatTargetLabel(log, memberMap) {
    if (!log.target_type && !log.target_id) return '-';
    if (log.target_type === 'member' && log.target_id) {
      var member = memberMap && memberMap[log.target_id];
      if (member) return (member.name || '이름 미등록') + (member.phone ? ' (' + member.phone + ')' : '');
      return '알 수 없는 회원 (ID: ' + String(log.target_id).slice(0, 8) + '…)';
    }
    return [log.target_type, log.target_id].filter(Boolean).join(' · ');
  }

  // ============================================================
  // 01. 관리자 접근 권한 검증 (admin.js verifyAdminAccess() 와 동일한 패턴)
  // ============================================================
  async function verifyAdminAccess() {
    var sessionRes = await supabaseClient.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      alert('로그인이 필요합니다.');
      window.location.replace('index.html');
      return null;
    }

    var profileRes = await supabaseClient
      .from('profiles')
      .select('id, role, name')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileRes.error) {
      console.error('[AdminLogs] profiles 조회 실패:', profileRes.error.code, profileRes.error.message);
      alert('관리자 권한이 없습니다.');
      window.location.replace('index.html');
      return null;
    }

    var profile = profileRes.data;
    var normalizedRole = String((profile && profile.role) || '').trim().toLowerCase();
    if (!profile || normalizedRole !== 'admin') {
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
      var res = await supabaseClient.auth.signOut();
      if (res.error) {
        alert('로그아웃 중 오류가 발생했습니다: ' + res.error.message);
        els.logoutBtn.disabled = false;
        return;
      }
      window.location.replace('index.html');
    });
  }

  // ============================================================
  // 02. 관리자 로그 목록 — admin_logs 테이블을 직접 조회합니다(별도 RPC 불필요 — 관리자 전용
  //     select 정책(admin_logs_select_admin)만으로 충분하고, supabase-js 의 count:'exact' 옵션으로
  //     페이지네이션에 필요한 전체 건수도 같은 호출에서 함께 받습니다).
  // ============================================================
  var LOGS_PAGE_SIZE = 20;
  var logsPage = 1;
  var logsTotalCount = 0;
  var lastLogsRows = [];

  function currentFilters() {
    return {
      dateFrom: els.dateFrom && els.dateFrom.value ? els.dateFrom.value : '',
      dateTo: els.dateTo && els.dateTo.value ? els.dateTo.value : '',
      adminId: els.adminFilter && els.adminFilter.value ? els.adminFilter.value : '',
      actionType: els.actionFilter && els.actionFilter.value ? els.actionFilter.value : ''
    };
  }

  // 날짜 입력(YYYY-MM-DD)을 그대로 'T00:00:00'/'T23:59:59' 를 붙여 보냅니다 — Postgres 가 이를
  // 서버(UTC) 기준으로 해석하므로 자정 근처 몇 시간은 KST 기준 경계와 살짜 어긋날 수 있습니다.
  // 이 콘솔의 다른 날짜 필터(정산 월 선택 등)도 같은 수준의 근사치로 다루고 있어, 여기서도 맞춥니다.
  function applyDateRange(query, filters) {
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');
    return query;
  }

  async function fetchLogsPage(page, filters) {
    var from = (page - 1) * LOGS_PAGE_SIZE;
    var to = from + LOGS_PAGE_SIZE - 1;
    var query = supabaseClient
      .from('admin_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    query = applyDateRange(query, filters);
    if (filters.adminId) query = query.eq('admin_id', filters.adminId);
    if (filters.actionType) query = query.eq('action_type', filters.actionType);

    var res = await query;
    if (res.error) {
      console.error('[AdminLogs] 목록 조회 실패:', res.error.code, res.error.message,
        '→ sql/admin_logs.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      return { rows: [], total: 0, error: res.error };
    }
    return { rows: res.data || [], total: res.count || 0, error: null };
  }

  // target_type === 'member' 인 행들의 target_id(=profiles.id) 를 모아 한 번에 조회합니다 — 행마다
  // 따로 조회하면 페이지당(최대 20건) 쿼리가 20번 날아가므로, 페이지 하나당 딱 한 번만 조회합니다.
  async function loadMemberLookup(rows) {
    var ids = [];
    var seen = {};
    rows.forEach(function (log) {
      if (log.target_type === 'member' && log.target_id && !seen[log.target_id]) {
        seen[log.target_id] = true;
        ids.push(log.target_id);
      }
    });
    if (!ids.length) return {};

    var res = await supabaseClient.from('profiles').select('id, name, phone').in('id', ids);
    if (res.error) {
      console.error('[AdminLogs] 대상 회원 정보 조회 실패:', res.error.code, res.error.message);
      return {};
    }
    var map = {};
    (res.data || []).forEach(function (p) { map[p.id] = p; });
    return map;
  }

  function renderLogsTable(rows, memberMap) {
    var body = els.tableBody;
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">조건에 맞는 로그가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = '';
    rows.forEach(function (log) {
      var targetLabel = formatTargetLabel(log, memberMap);
      var detailText = formatDetail(log.detail);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatDateTime(log.created_at)) + '</td>' +
        '<td>' + escapeHtml(log.admin_name || '(이름 없음)') + '<span class="admin-logs-target-sub">' + escapeHtml(log.admin_email || '') + '</span></td>' +
        '<td><span class="admin-badge is-neutral">' + escapeHtml(ACTION_TYPE_LABEL[log.action_type] || log.action_type) + '</span></td>' +
        '<td>' + escapeHtml(targetLabel) + '</td>' +
        '<td></td>';
      var detailCell = tr.lastElementChild;
      var detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'admin-logs-detail-trunc';
      detailBtn.title = detailText; // 마우스를 올리면 브라우저 기본 툴팁으로 전체 내용을 보여줍니다
      detailBtn.textContent = detailText;
      detailBtn.addEventListener('click', function () { openLogDetailModal(log, targetLabel); });
      detailCell.appendChild(detailBtn);
      body.appendChild(tr);
    });
  }

  // ---------- 세부 내용 전체보기 모달 ----------
  function openLogDetailModal(log, targetLabel) {
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
    els.detailModal.addEventListener('click', function (e) { if (e.target === els.detailModal) closeLogDetailModal(); });
  }

  function renderPagination(totalPages) {
    var wrap = els.paginationWrap;
    if (!wrap) return;
    if (totalPages <= 1) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = '';

    function addPageBtn(label, page, opts) {
      opts = opts || {};
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-page-btn' + (opts.active ? ' is-active' : '');
      btn.textContent = label;
      if (opts.disabled || opts.active) btn.disabled = true;
      if (!opts.disabled && !opts.active) btn.addEventListener('click', function () { goToPage(page); });
      wrap.appendChild(btn);
    }

    addPageBtn('‹ 이전', logsPage - 1, { disabled: logsPage <= 1 });
    var windowStart = Math.max(1, logsPage - 2);
    var windowEnd = Math.min(totalPages, logsPage + 2);
    if (windowStart > 1) {
      addPageBtn('1', 1, {});
      if (windowStart > 2) { var e1 = document.createElement('span'); e1.className = 'admin-page-ellipsis'; e1.textContent = '…'; wrap.appendChild(e1); }
    }
    for (var p = windowStart; p <= windowEnd; p++) addPageBtn(String(p), p, { active: p === logsPage });
    if (windowEnd < totalPages) {
      if (windowEnd < totalPages - 1) { var e2 = document.createElement('span'); e2.className = 'admin-page-ellipsis'; e2.textContent = '…'; wrap.appendChild(e2); }
      addPageBtn(String(totalPages), totalPages, {});
    }
    addPageBtn('다음 ›', logsPage + 1, { disabled: logsPage >= totalPages });
  }

  async function goToPage(page) {
    if (page < 1) return;
    logsPage = page;
    await loadLogs();
    var table = $('logsTable');
    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadLogs() {
    var body = els.tableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';

    var result = await fetchLogsPage(logsPage, currentFilters());
    if (result.error) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(result.error.message) + '</td></tr>';
      if (els.paginationWrap) els.paginationWrap.hidden = true;
      return;
    }

    lastLogsRows = result.rows;
    logsTotalCount = result.total;
    if (els.count) { els.count.textContent = logsTotalCount + '건'; els.count.hidden = false; }
    var memberMap = await loadMemberLookup(lastLogsRows);
    renderLogsTable(lastLogsRows, memberMap);
    renderPagination(Math.max(1, Math.ceil(logsTotalCount / LOGS_PAGE_SIZE)));
  }

  // ---------- 필터 바인딩 ----------
  function onFilterChanged() {
    logsPage = 1;
    loadLogs();
  }
  [els.dateFrom, els.dateTo, els.adminFilter, els.actionFilter].forEach(function (el) {
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

  // 관리자 선택 드롭다운 — profiles.role = 'admin' 전체를 옵션으로 채웁니다(아직 로그가 없는
  // 관리자도 목록에 보이게 하려는 목적 — admin_logs 에 실제로 찍힌 admin_id만 모으면 "아직 아무
  // 활동도 안 한 관리자"가 드롭다운에서 빠지게 됩니다).
  async function loadAdminFilterOptions() {
    if (!els.adminFilter) return;
    var res = await supabaseClient.from('profiles').select('id, name').eq('role', 'admin').order('name');
    if (res.error) {
      console.error('[AdminLogs] 관리자 목록 조회 실패:', res.error.code, res.error.message);
      return;
    }
    (res.data || []).forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || '(이름 없음)';
      els.adminFilter.appendChild(opt);
    });
  }

  // 작업 종류 드롭다운 — 알려진 라벨(ACTION_TYPE_LABEL)을 기본으로 깔고, 실제 테이블에 그 외의
  // action_type 이 있으면(향후 다른 RPC가 새 종류를 기록하기 시작한 경우) 그 값도 추가합니다.
  async function loadActionFilterOptions() {
    if (!els.actionFilter) return;
    var known = Object.keys(ACTION_TYPE_LABEL);
    var res = await supabaseClient.from('admin_logs').select('action_type');
    var seen = {};
    known.forEach(function (k) { seen[k] = true; });
    var extra = [];
    (res.data || []).forEach(function (row) {
      if (row.action_type && !seen[row.action_type]) { seen[row.action_type] = true; extra.push(row.action_type); }
    });
    known.concat(extra).forEach(function (actionType) {
      var opt = document.createElement('option');
      opt.value = actionType;
      opt.textContent = ACTION_TYPE_LABEL[actionType] || actionType;
      els.actionFilter.appendChild(opt);
    });
  }

  // ---------- 엑셀(CSV) 다운로드 — 지금 필터 조건에 맞는 전체 목록(현재 페이지만이 아님) ----------
  function csvEscape(value) {
    var s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  async function exportLogsToCsv() {
    var btn = els.exportBtn;
    if (!btn) return;
    btn.disabled = true;
    var originalLabel = btn.textContent;
    btn.textContent = '다운로드 준비 중…';
    try {
      var filters = currentFilters();
      var allRows = [];
      var batchSize = 500;
      for (var offset = 0; ; offset += batchSize) {
        var query = supabaseClient
          .from('admin_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);
        query = applyDateRange(query, filters);
        if (filters.adminId) query = query.eq('admin_id', filters.adminId);
        if (filters.actionType) query = query.eq('action_type', filters.actionType);
        var res = await query;
        if (res.error) {
          console.error('[AdminLogs] CSV 조회 실패:', res.error.code, res.error.message);
          showToast('엑셀 다운로드에 실패했습니다: ' + res.error.message);
          return;
        }
        var batch = res.data || [];
        allRows = allRows.concat(batch);
        if (batch.length < batchSize) break;
      }

      if (!allRows.length) {
        showToast('다운로드할 로그가 없습니다(현재 필터 조건에 맞는 로그가 없음).');
        return;
      }

      var memberMap = await loadMemberLookup(allRows);
      var header = ['일시', '관리자', '관리자 이메일', '작업 종류', '대상 회원', '대상 ID', '세부 내용'];
      var lines = [header.map(csvEscape).join(',')];
      allRows.forEach(function (log) {
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

      // Excel(Windows)에서 한글이 깨지지 않도록 UTF-8 BOM을 맨 앞에 붙입니다.
      var csvContent = '﻿' + lines.join('\r\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
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

  // ---------- 진입 ----------
  (async function init() {
    var access = await verifyAdminAccess();
    if (!access) return;

    if (els.name) els.name.textContent = (access.profile.name || access.user.email || '관리자') + '님';
    if (els.account) els.account.hidden = false;
    bindLogout();

    await Promise.all([loadAdminFilterOptions(), loadActionFilterOptions()]);
    await loadLogs();

    supabaseClient.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();
})();
