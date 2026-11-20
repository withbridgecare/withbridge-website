/**
 * 최고 관리자 화면이 쓰는 DB·서버 함수 호출 — 예전 public/super-admin.js 의 쿼리를 그대로 옮겨 이름을 붙였습니다.
 * 관리자 권한은 DB 의 RLS·RPC(is_admin() 등)가 확인합니다 (원칙 4). 인자 이름은 원래 화면 코드의 변수 이름 그대로입니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** rpc 'is_super_admin' */
export function isSuperAdmin(client: any) {
  return client.rpc('is_super_admin');
}

/** from 'profiles' */
export function getProfiles(client: any, session: any) {
  return client
      .from('profiles')
      .select('id, role, name')
      .eq('id', session.user.id)
      .maybeSingle();
}

/** rpc 'super_admin_grant_admin' */
export function superAdminGrantAdmin(client: any, email: any) {
  return client.rpc('super_admin_grant_admin', { p_email: email });
}

/** rpc 'super_admin_revoke_admin' */
export function superAdminRevokeAdmin(client: any, row: any) {
  return client.rpc('super_admin_revoke_admin', { p_target_id: row.id });
}

/** rpc 'super_admin_list_admins' */
export function superAdminListAdmins(client: any) {
  return client.rpc('super_admin_list_admins');
}

/** from 'admin_logs' */
export function listAdminLogs(client: any, ROLE_TIMELINE_ACTION_TYPES: any) {
  return client
      .from('admin_logs')
      .select('*')
      .in('action_type', ROLE_TIMELINE_ACTION_TYPES)
      .order('created_at', { ascending: false })
      .limit(50);
}
