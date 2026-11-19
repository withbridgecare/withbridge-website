/**
 * 어드민 공지사항 관리이 쓰는 DB·서버 함수 호출 — 예전 public/js/admin-notices.js 의 쿼리를 그대로 옮겨 이름을 붙였습니다.
 * 관리자 권한은 DB 의 RLS·RPC(is_admin() 등)가 확인합니다 (원칙 4). 인자 이름은 원래 화면 코드의 변수 이름 그대로입니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** from 'notices' */
export function listNotices(client: any) {
  return client
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
}

/** from 'notices' */
export function updateNotices(client: any, payload: any, id: any) {
  return client.from('notices').update(payload).eq('id', id);
}

/** from 'notices' */
export function insertNotices(client: any, payload: any) {
  return client.from('notices').insert(payload);
}

/** from 'notices' */
export function deleteNotices(client: any, id: any) {
  return client.from('notices').delete().eq('id', id);
}
