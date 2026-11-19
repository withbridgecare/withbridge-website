/**
 * 관리자 로그 화면이 쓰는 DB·서버 함수 호출 — 예전 public/admin-logs.js 의 쿼리를 그대로 옮겨 이름을 붙였습니다.
 * 관리자 권한은 DB 의 RLS·RPC(is_admin() 등)가 확인합니다 (원칙 4). 인자 이름은 원래 화면 코드의 변수 이름 그대로입니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** from 'profiles' */
export function getProfiles(client: any, session: any) {
  return client
      .from('profiles')
      .select('id, role, name')
      .eq('id', session.user.id)
      .maybeSingle();
}

/** from 'admin_logs' */
export function countAdminLogs(client: any, from: any, to: any) {
  return client
      .from('admin_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
}

/** from 'profiles' */
export function listProfiles(client: any, ids: any) {
  return client.from('profiles').select('id, name, phone').in('id', ids);
}

/** from 'profiles' */
export function listProfiles2(client: any) {
  return client.from('profiles').select('id, name').in('role', ['admin', 'super_admin']).order('name');
}

/** from 'admin_logs' */
export function listAdminLogs(client: any) {
  return client.from('admin_logs').select('action_type');
}

/** from 'admin_logs' */
export function listAdminLogs2(client: any, offset: any, batchSize: any) {
  return client
          .from('admin_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);
}
