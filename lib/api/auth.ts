/**
 * 로그인·권한 관련 Supabase 호출 (예전 js/auth-header.js 에서 옮김).
 *
 * 원칙 2: 화면 코드는 supabase.from(...) 을 직접 부르지 말고 이 함수들을 씁니다.
 * 원칙 4: 여기 결과는 "메뉴를 보여줄지" 판단용일 뿐입니다. 실제 데이터 보호는 DB 의 RLS·RPC 가 합니다.
 * 이 파일에는 next/* 와 브라우저 전용 코드(window, localStorage)를 넣지 않습니다 — 앱에서도 재사용.
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

/** 'yes' | 'no' | 'error'(조회 자체 실패 — 아직 모름). 실패를 'no' 로 굳히지 않고 재시도하기 위해 구분합니다. */
export type LookupState = 'yes' | 'no' | 'error';

/**
 * 매니저 자격: managers 에 내 행이 있고 certification_verified = true.
 * SQL 의 is_manager() 와 같은 기준입니다 (revoke_manager() 는 행을 지우지 않고 false 로만 내림).
 */
export async function lookupManager(client: WBSupabaseClient, userId: string): Promise<LookupState> {
  try {
    const { data, error } = await client
      .from('managers')
      .select('id, certification_verified')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] managers 조회 실패:', error.code, error.message);
      return 'error';
    }
    return data && data.certification_verified === true ? 'yes' : 'no';
  } catch (e) {
    console.warn('[auth] managers 조회 중 예외:', e);
    return 'error';
  }
}

/** 관리자: profiles.role 이 admin 또는 super_admin (공백·대소문자 무시). */
export async function lookupAdmin(client: WBSupabaseClient, userId: string): Promise<LookupState> {
  try {
    const { data, error } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (error) {
      console.error('[auth] profiles.role 조회 실패 → 관리자 아님으로 처리(fail closed):', error.code, error.message);
      return 'error';
    }
    const role = String(data?.role ?? '').trim().toLowerCase();
    return role === 'admin' || role === 'super_admin' ? 'yes' : 'no';
  } catch (e) {
    console.error('[auth] profiles.role 조회 중 예외:', e);
    return 'error';
  }
}

/**
 * 결제 대기 중인 추가 요금(care_schedules.extra_charge_status = 'REQUESTED')이 있는지.
 * 조회가 실패하면 막지 않고 false — 일시 오류로 정상 이용자의 예약을 막는 쪽이 더 나쁜 실패이기 때문입니다.
 */
export async function hasUnpaidExtraCharge(client: WBSupabaseClient, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { count, error } = await client
      .from('care_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('guardian_id', userId)
      .eq('extra_charge_status', 'REQUESTED');
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** 비로그인으로 낸 신청서들을 로그인한 내 계정에 연결. 연결된 신청 id 목록을 돌려줍니다. 실패 시 null(다음에 재시도). */
export async function claimServiceApplications(client: WBSupabaseClient, ids: string[]): Promise<string[] | null> {
  if (!ids.length) return [];
  const { data, error } = await client.rpc('claim_service_applications', { p_ids: ids });
  if (error) {
    console.warn('[신청 연결] claim_service_applications() 호출 실패 → 나중에 다시 시도:', error.code, error.message);
    return null;
  }
  return (data as string[] | null) ?? [];
}

/** 화면에 보여줄 이름·프로필 사진 (카카오/이메일 가입 메타데이터 기준) */
export function displayIdentity(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  let avatarUrl = meta.avatar_url || meta.picture || meta.profile_image || '';
  // 카카오가 http:// 이미지 주소를 주는 경우가 있어 https 로 보정 (mixed content 방지)
  if (avatarUrl) avatarUrl = avatarUrl.replace(/^http:\/\//i, 'https://');
  const name =
    meta.name || meta.full_name || meta.nickname || meta.preferred_username || (user.email ? user.email.split('@')[0] : '회원');
  return { avatarUrl, name };
}
