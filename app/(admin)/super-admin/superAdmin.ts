// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 최고 관리자 화면 — 예전 public/super-admin.js 를 로직 그대로 옮긴 것입니다. DB 호출은 lib/api/super-admin.ts 를 거칩니다.
/* eslint-disable */
import { getSupabase } from '@/lib/supabase/client';
import * as api from '@/lib/api/super-admin';
import { createLegacyShims } from '@/lib/browser/legacy-shims';
import { showDoneNotice } from '../doneNotice';

let started = false;
/** 화면에 동작을 붙입니다 (개발 모드의 이중 실행은 무시). */
export function initSuperAdmin(): void {
  if (started) return;
  started = true;
  const { WBEdgeFn, WBPrivacy } = createLegacyShims();
  const $id = (id: string): any => document.getElementById(id);
/* =========================================================
   위드브릿지 어드민 콘솔 — 최고 관리자 전용 페이지 (super-admin.html)
   - admin.html/admin-logs.html 과 별개의 자체 Supabase 클라이언트를 만들고, 진입 시
     is_super_admin() RPC(sql/super_admin_management.sql)로 접근을 판정합니다.
     화면에서 profiles.role 을 직접 읽지 않고 DB 함수 하나로 판정해, 접근 판단(fail closed)을
     서버 쪽 한 곳에서 일관되게 유지합니다(role = 'super_admin' 일 때만 통과).
   - 관리자 권한 부여/회수는 전부 SECURITY DEFINER RPC(super_admin_grant_admin/
     super_admin_revoke_admin)를 통해서만 이뤄지고, 두 RPC 모두 내부에서 다시
     is_super_admin() 을 확인합니다(이 화면의 접근 차단이 뚫려도 2차 방어선).
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
    grantEmailInput: $('grantEmailInput'),
    grantAdminBtn: $('grantAdminBtn'),
    grantError: $('grantError'),
    adminListCount: $('adminListCount'),
    adminListTableBody: $('adminListTableBody'),
    roleTimelineList: $('roleTimelineList')
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
  function formatDateOnly(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  function formatDateTime(iso?: any) {
    let d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  let RPC_ERROR_LABEL = {
    NOT_SUPER_ADMIN: '최고 관리자 권한이 없습니다.',
    USER_NOT_FOUND: '해당 이메일로 가입한 계정을 찾을 수 없습니다.',
    ALREADY_ADMIN: '이미 관리자 권한을 가진 계정입니다.',
    ALREADY_SUPER_ADMIN: '이미 최고 관리자 계정입니다.',
    CANNOT_REVOKE_SELF: '본인 계정은 여기서 권한을 회수할 수 없습니다.',
    CANNOT_REVOKE_SUPER_ADMIN: '최고 관리자 계정은 이 화면에서 권한을 회수할 수 없습니다.',
    PROFILE_NOT_FOUND: '대상 계정을 찾을 수 없습니다.'
  };
  function describeRpcError(error?: any) {
    if (!error) return '알 수 없는 오류';
    let msg = String(error.message || '');
    for (let code in RPC_ERROR_LABEL) {
      if (msg.indexOf(code) !== -1) return RPC_ERROR_LABEL[code];
    }
    return msg;
  }
  let currentUserId: any = null;
  async function verifySuperAdminAccess() {
    let sessionRes = await supabaseClient.auth.getSession();
    let session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      alert('로그인이 필요합니다.');
      window.location.replace('index.html');
      return null;
    }
    let checkRes = await api.isSuperAdmin(supabaseClient);
    if (checkRes.error || checkRes.data !== true) {
      if (checkRes.error) {
        console.error('[SuperAdmin] is_super_admin() 호출 실패:', checkRes.error.code, checkRes.error.message,
          '→ sql/super_admin_management.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      }
      alert('최고 관리자 권한이 없습니다.');
      window.location.replace('admin.html');
      return null;
    }
    let profileRes = await api.getProfiles(supabaseClient, session);
    currentUserId = session.user.id;
    return { user: session.user, profile: profileRes.data || {} };
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
  async function handleGrantAdmin() {
    let email = (els.grantEmailInput && els.grantEmailInput.value || '').trim();
    if (els.grantError) els.grantError.hidden = true;
    if (!email) {
      if (els.grantError) { els.grantError.textContent = '이메일을 입력하세요.'; els.grantError.hidden = false; }
      return;
    }
    els.grantAdminBtn.disabled = true;
    let res = await api.superAdminGrantAdmin(supabaseClient, email);
    els.grantAdminBtn.disabled = false;
    if (res.error) {
      console.error('[SuperAdmin] 관리자 권한 부여 실패:', res.error.code, res.error.message);
      if (els.grantError) { els.grantError.textContent = describeRpcError(res.error); els.grantError.hidden = false; }
      return;
    }
    if (els.grantEmailInput) els.grantEmailInput.value = '';
    await showDoneNotice(email + ' 계정에 관리자 권한을 부여했습니다.');
    await Promise.all([loadAdminList(), loadRoleChangeTimeline()]);
  }
  if (els.grantAdminBtn) els.grantAdminBtn.addEventListener('click', handleGrantAdmin);
  function renderAdminRow(row?: any) {
    let isSuperAdmin = row.role === 'super_admin';
    let isSelf = row.id === currentUserId;
    let tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(row.name || '이름 미등록') + '</td>' +
      '<td>' + escapeHtml(row.email || '-') + '</td>' +
      '<td><span class="admin-badge ' + (isSuperAdmin ? 'is-package' : 'is-neutral') + '">' + (isSuperAdmin ? '최고 관리자' : '관리자') + '</span></td>' +
      '<td>' + escapeHtml(formatDateOnly(row.created_at)) + '</td>' +
      '<td></td>';
    let actionCell = tr.lastElementChild;
    let btn = document.createElement('button');
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
  async function handleRevokeAdmin(row?: any, btn?: any) {
    let ok = window.confirm((row.name || row.email) + ' 계정의 관리자 권한을 회수할까요?\n되돌리려면 다시 권한을 부여해야 합니다.');
    if (!ok) return;
    btn.disabled = true;
    let res = await api.superAdminRevokeAdmin(supabaseClient, row);
    if (res.error) {
      console.error('[SuperAdmin] 관리자 권한 회수 실패:', res.error.code, res.error.message);
      showToast('권한 회수에 실패했습니다: ' + describeRpcError(res.error));
      btn.disabled = false;
      return;
    }
    await showDoneNotice((row.name || row.email) + ' 계정의 관리자 권한을 회수했습니다.');
    await loadAdminList();
    await loadRoleChangeTimeline();
  }
  async function loadAdminList() {
    let body = els.adminListTableBody;
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="admin-loading">불러오는 중…</td></tr>';
    let res = await api.superAdminListAdmins(supabaseClient);
    if (res.error) {
      console.error('[SuperAdmin] 관리자 목록 조회 실패:', res.error.code, res.error.message,
        '→ sql/super_admin_management.sql 을 Supabase SQL Editor 에서 실행했는지 확인하세요.');
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">목록을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    let rows = res.data || [];
    if (els.adminListCount) { els.adminListCount.textContent = rows.length + '명'; els.adminListCount.hidden = false; }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty">관리자 계정이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = '';
    rows.forEach(function (row: any) { body.appendChild(renderAdminRow(row)); });
  }
  let ROLE_TIMELINE_ACTION_TYPES = ['super_admin_grant_admin', 'super_admin_revoke_admin'];
  function timelineItemText(log?: any) {
    let detail = log.detail || {};
    let targetLabel = (detail.target_name || '이름 미등록') + (detail.target_email ? ' (' + detail.target_email + ')' : '');
    if (log.action_type === 'super_admin_grant_admin') return targetLabel + ' 계정에 관리자 권한을 부여했습니다.';
    if (log.action_type === 'super_admin_revoke_admin') return targetLabel + ' 계정의 관리자 권한을 회수했습니다.';
    return log.action_type;
  }
  async function loadRoleChangeTimeline() {
    let list = els.roleTimelineList;
    if (!list) return;
    list.innerHTML = '<li class="admin-loading">불러오는 중…</li>';
    let res = await api.listAdminLogs(supabaseClient, ROLE_TIMELINE_ACTION_TYPES);
    if (res.error) {
      console.error('[SuperAdmin] 권한 변경 이력 조회 실패:', res.error.code, res.error.message);
      list.innerHTML = '<li class="admin-empty">이력을 불러오지 못했습니다: ' + escapeHtml(res.error.message) + '</li>';
      return;
    }
    let rows = res.data || [];
    if (!rows.length) {
      list.innerHTML = '<li class="admin-empty">아직 권한 변경 이력이 없습니다.</li>';
      return;
    }
    list.innerHTML = '';
    rows.forEach(function (log: any) {
      let li = document.createElement('li');
      li.className = 'sa-timeline-item';
      let isRevoke = log.action_type === 'super_admin_revoke_admin';
      li.innerHTML =
        '<span class="sa-timeline-dot' + (isRevoke ? ' is-revoke' : '') + '"></span>' +
        '<p class="sa-timeline-title">' + escapeHtml(timelineItemText(log)) + '</p>' +
        '<p class="sa-timeline-meta">' + escapeHtml(formatDateTime(log.created_at)) + ' · ' +
          escapeHtml(log.admin_name || '이름 미등록') + (log.admin_email ? ' (' + escapeHtml(log.admin_email) + ')' : '') + '</p>';
      list.appendChild(li);
    });
  }
  (async function init() {
    let access = await verifySuperAdminAccess();
    if (!access) return;
    if (els.name) els.name.textContent = (access.profile.name || access.user.email || '최고 관리자') + '님';
    if (els.account) els.account.hidden = false;
    bindLogout();
    await Promise.all([loadAdminList(), loadRoleChangeTimeline()]);
    supabaseClient.auth.onAuthStateChange(function (event: any) {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
  })();


}
