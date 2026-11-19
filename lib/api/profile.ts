/**
 * 내 정보(프로필) 조회·수정·탈퇴 (예전 profile-edit.html).
 * 수정은 sql/profile_self_update.sql 의 update_user_profile() RPC 로만 합니다 (RLS: 본인만).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';
import { invokeEdgeFunction } from './edge-functions';

export type MyProfile = {
  name: string | null;
  phone: string | null;
  address: string | null;
  address_detail: string | null;
  notify_care: boolean | null;
  notify_marketing: boolean | null;
};

export async function getMyProfile(client: WBSupabaseClient, userId: string): Promise<MyProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('name, phone, address, address_detail, notify_care, notify_marketing')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile | null) ?? null;
}

export async function updateMyProfile(
  client: WBSupabaseClient,
  input: { name: string; address: string | null; addressDetail: string | null; notifyCare: boolean; notifyMarketing: boolean },
) {
  const { error } = await client.rpc('update_user_profile', {
    p_name: input.name,
    p_address: input.address,
    p_address_detail: input.addressDetail,
    p_notify_care: input.notifyCare,
    p_notify_marketing: input.notifyMarketing,
  });
  if (error) throw error;
  // 헤더 이름 표시가 따라가도록 auth 메타데이터도 맞춤 (실패해도 저장 자체는 완료)
  try {
    await client.auth.updateUser({ data: { name: input.name } });
  } catch (e) {
    console.warn('[profile] user_metadata.name 동기화 실패(저장은 완료):', e);
  }
}

/** 이메일 변경 요청 → 새 주소로 확인 메일 발송 (이메일 가입 계정만) */
export async function requestEmailChange(client: WBSupabaseClient, newEmail: string) {
  return client.auth.updateUser({ email: newEmail });
}

/**
 * 회원 탈퇴: ① DB 에서 개인정보 비식별화(deactivate_own_account) → ② delete-account Edge Function 이
 * 로그인 계정 삭제. 어느 단계에서 실패했는지 돌려줍니다.
 */
export async function withdrawAccount(client: WBSupabaseClient): Promise<'ok' | 'db_failed' | 'function_failed'> {
  const db = await client.rpc('deactivate_own_account');
  if (db.error) {
    console.error('[profile] deactivate_own_account 실패:', db.error);
    return 'db_failed';
  }
  const fn = await invokeEdgeFunction(client, 'delete-account', {});
  if (fn.error) return 'function_failed';
  await client.auth.signOut();
  return 'ok';
}
