/* =========================================================
   위드브릿지 어드민 콘솔 — 최고 관리자 전용 페이지 (super-admin.html)
   - admin.html/admin-logs.html 과 별개의 자체 Supabase 클라이언트를 만들고, 진입 시
     is_super_admin() RPC(sql/super_admin_management.sql)로 접근을 판정합니다.
     profiles.role 을 클라이언트에서 직접 읽어 판단하지 않는 이유: is_super_admin() 은
     role = 'super_admin' 외에 failsafe 이메일(대표님 계정)도 함께 인정하므로, role 값만
     보면 그 경우를 놓칩니다 — fail closed 를 DB 쪽 함수 하나로 일관되게 유지합니다.
   - 관리자 권한 부여/회수는 전부 SECURITY DEFINER RPC(super_admin_grant_admin/
     super_admin_revoke_admin)를 통해서만 이뤄지고, 두 RPC 모두 내부에서 다시
     is_super_admin() 을 확인합니다(이 화면의 접근 차단이 뚫려도 2차 방어선).
========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://layvjisfeivkzowopkco.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_M7wpIAR7-aXvG78Xv-WBoQ_q1wj_FcR';

  var sdk = window.supabase;
  if (!sdk || !sdk.createClient) {
    alert('Supabase 연결에 실패했습니다. 새로고침해 주세요.');
    throw new Error('[SuperAdmin] Supabase SDK 가 로드되지 않았습니다.');
  }
  var supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function $(id) { return document.getElementById(id); }
  var els = {
    account: $('adminAccount'),
    name: $('adminName'),
    logoutBtn: $('logoutBtn'),
    toast: $('adminToast'),

    grantEmailInput: $('grantEmailInput'),
    grantAdminBtn: $('grantAdminBtn'),
    grantError: $('grantError'),

    adminListCount: $('adminListCount'),
    adminListTableBody: $('adminListTableBody'),

    roleTimelineList: $('roleTimelineList')
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

  function formatDateOnly(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  function formatDateTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // 서버가 raise exception 으로 던진 에러코드 문자열을 사람이 읽을 메시지로 바꿉니다.
  var RPC_ERROR_LABEL = {
    NOT_SUPER_ADMIN: '최고 관리자 권한이 없습니다.',
    USER_NOT_FOUND: '해당 이메일로 가입한 계정을 찾을 수 없습니다.',
    ALREADY_ADMIN: '이미 관리자 권한을 가진 계정입니다.',
    ALREADY_SUPER_ADMIN: '이미 최고 관리자 계정입니다.',
    CANNOT_REVOKE_SELF: '본인 계정은 여기서 권한을 회수할 수 없습니다.',
    CANNOT_REVOKE_SUPER_ADMIN: '최고 관리자 계정은 이 화면에서 권한을 회수할 수 없습니다.',
    PROFILE_NOT_FOUND: '대상 계정을 찾을 수 없습니다.'
  };
  function describeRpcError(error) {
    if (!error) return '알 수 없는 오류';
    var msg = String(error.message || '');
    for (var code in RPC_ERROR_LABEL) {
      if (msg.indexOf(code) !== -1) return RPC_ERROR_LABEL[code];
    }
    return msg;
  }

  // ============================================================
  // 01. 최고 관리자 접근 권한 검증
  //     (1) 로그인 세션이 없으면 로그인 유도 후 index.html 로 돌려보냄
  //     (2) 로그인은 했지만 is_super_admin() 이 false 면 admin.html 로 돌려보냄(로그아웃시키지
  //         않음 — 일반 관리자가 실수로 이 URL에 들어온 경우일 수 있어, 본인 콘솔로만 돌려보냅니다)
  // ============================================================
  var currentUserId = null;

  async function verifySuperAdminAccess() {
    var sessionRes = await supabaseClient.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      alert('로그인이 필요합니다.');
      window.location.replace('index.html');
      return null;
    }

    var checkRes = await supabaseClient.rpc('is_super_admin');
    if (checkRes.error || checkRes.data !== true) {
      if (checkRes.error) {
        console.error('[SuperAdmin] is_super_admin() 호출 실패:', checkRes.error.code, checkRes.error.message,
          '→ sql/super_admin_management.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      }
      alert('최고 관리자 권한이 없습니다.');
      window.location.replace('admin.html');
      return null;
    }

    var profileRes = await supabaseClient
      .from('profiles')
      .select('id, role, name')
      .eq('id', session.user.id)
      .maybeSingle();

    currentUserId = session.user.id;
    return { user: session.user, profile: profileRes.data || {} };
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
  // 02. 시스템 관리자 계정 부여
  // ============================================================
  async function handleGrantAdmin() {
    var email = (els.grantEmailInput && els.grantEmailInput.value || '').trim();
    if (els.grantError) els.grantError.hidden = true;
    if (!email) {
      if (els.grantError) { els.grantError.textContent = '이메일을 입력하세요.'; els.grantError.hidden = false; }
      return;
    }

    els.grantAdminBtn.disabled = true;
    var res = await supabaseClient.rpc('super_admin_grant_admin', { p_email: email });
    els.grantAdminBtn.disabled = false;

    if (res.error) {
      console.error('[SuperAdmin] 관리자 권한 부여 실패:', res.error.code, res.error.message);
      if (els.grantError) { els.grantError.textContent = describeRpcError(res.error); els.grantError.hidden = false; }
      return;
    }

    showToast(email + ' 계정에 관리자 권한을 부여했습니다.');
    if (els.grantEmailInput) els.grantEmailInput.value = '';
    await Promise.all([loadAdminList(), loadRoleChangeTimeline()]);
  }
  if (els.grantAdminBtn) els.grantAdminBtn.addEventListener('click', handleGrantAdmin);

  // ============================================================
  // 03. 현재 관리자 목록 + 권한 회수
  // ============================================================
  function renderAdminRow(row) {
    var isSuperAdmin = row.role === 'super_admin';
    var isSelf = row.id === currentUserId;
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(row.name || '이름 미등록') + '</td>' +
      '<td>' + escapeHtml(row.email || '-') + '</td>' +
      '<td><span class="admin-badge ' + (isSuperAdmin ? 'is-package' : 'is-neutral') + '">' + (isSuperAdmin ? '최고 관리자' : '관리자') + '</span></td>' +
      '<td>' + escapeHtml(formatDateOnly(row.created_at)) + '</td>' +
      '<td></td>';

    var actionCell = tr.lastElementChild;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-btn is-ghost';
    btn.textContent = '권한 회수';
    if (isSuperAdmin) {
      btn.disabled = true;
      btn.title = '최고 관리자 계정은 이 화면에서 권한을 회수할 수 없습니다.';
    } else if (isSelf) {
      btn.disabled = true;
      btn.title = '본인 계정은 여기서 권한을 회수할 수 없습니다.';
    } else {
      btn.addEventListener('click', function () { handleRevokeAdmin(row, btn); });
    }
    actionCell.appendChild(btn);
    return tr;
  }

  async function handleRevokeAdmin(row, btn) {
    var ok = window.confirm((row.name || row.email) + ' 계정의 관리자 권한을 회수할까요?\n되돌리려면 다시 권한을 부여해야 합니다.');
    if (!ok) return;

    btn.disabled = true;
    var res = await supabaseClient.rpc('super_admin_revoke_admin', { p_target_id: row.id });
    if (res.error) {
      console.error('[SuperAdmin] 관리자 권한 회수 실패:', res.error.code, res.error.message);
      showToast('권한 회수에 실패했습니다: ' + describeRpcError(res.error));
      btn.disabled = false;
      return;
    }

    showToast((row.name || row.email) + ' 계정의 관리자 권한을 회수했습니다.');
    // 목록에 role 이 바뀐 결과가 바로 보이도록 토스트만 띄우고 끝내지 않고 두 목록을 즉시 다시
    // 불러옵니다 — loadAdminList() 는 super_admin_list_admins() 를 다시 호출하므로, role 이
    // 실제로 admin/super_admin 에서 벗어난 계정은 이 재조회에서 자연스럽게 빠집니다.
    await loadAdminList();
    await loadRoleChangeTimeline();
  }

  async function loadAdminList() {
    var body = els.adminListTableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';

    var res = await supabaseClient.rpc('super_admin_list_admins');
    if (res.error) {
      console.error('[SuperAdmin] 관리자 목록 조회 실패:', res.error.code, res.error.message,
        '→ sql/super_admin_management.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }

    var rows = res.data || [];
    if (els.adminListCount) { els.adminListCount.textContent = rows.length + '명'; els.adminListCount.hidden = false; }

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">관리자 계정이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = '';
    rows.forEach(function (row) { body.appendChild(renderAdminRow(row)); });
  }

  // ============================================================
  // 04. 권한 변경 이력 타임라인 — admin_logs 에서 이 화면이 남긴 두 action_type 만 모읍니다.
  // ============================================================
  var ROLE_TIMELINE_ACTION_TYPES = ['super_admin_grant_admin', 'super_admin_revoke_admin'];

  function timelineItemText(log) {
    var detail = log.detail || {};
    var targetLabel = (detail.target_name || '이름 미등록') + (detail.target_email ? ' (' + detail.target_email + ')' : '');
    if (log.action_type === 'super_admin_grant_admin') return targetLabel + ' 계정에 관리자 권한을 부여했습니다.';
    if (log.action_type === 'super_admin_revoke_admin') return targetLabel + ' 계정의 관리자 권한을 회수했습니다.';
    return log.action_type;
  }

  async function loadRoleChangeTimeline() {
    var list = els.roleTimelineList;
    if (!list) return;
    list.innerHTML = '<li class="admin-loading">불러오는 중…</li>';

    var res = await supabaseClient
      .from('admin_logs')
      .select('*')
      .in('action_type', ROLE_TIMELINE_ACTION_TYPES)
      .order('created_at', { ascending: false })
      .limit(50);

    if (res.error) {
      console.error('[SuperAdmin] 권한 변경 이력 조회 실패:', res.error.code, res.error.message);
      list.innerHTML = '<li class="admin-empty">이력을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</li>';
      return;
    }

    var rows = res.data || [];
    if (!rows.length) {
      list.innerHTML = '<li class="admin-empty">아직 권한 변경 이력이 없습니다.</li>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(function (log) {
      var li = document.createElement('li');
      li.className = 'sa-timeline-item';
      var isRevoke = log.action_type === 'super_admin_revoke_admin';
      li.innerHTML =
        '<span class="sa-timeline-dot' + (isRevoke ? ' is-revoke' : '') + '"></span>' +
        '<p class="sa-timeline-title">' + escapeHtml(timelineItemText(log)) + '</p>' +
        '<p class="sa-timeline-meta">' + escapeHtml(formatDateTime(log.created_at)) + ' · ' +
          escapeHtml(log.admin_name || '이름 미등록') + (log.admin_email ? ' (' + escapeHtml(log.admin_email) + ')' : '') + '</p>';
      list.appendChild(li);
    });
  }

  // ---------- 진입 ----------
  (async function init() {
    var access = await verifySuperAdminAccess();
    if (!access) return;

    if (els.name) els.name.textContent = (access.profile.name || access.user.email || '최고 관리자') + '님';
    if (els.account) els.account.hidden = false;
    bindLogout();

    await Promise.all([loadAdminList(), loadRoleChangeTimeline()]);

    supabaseClient.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();
})();
