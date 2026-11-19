/**
 * 케어 신청서 (예전 apply.html). service_applications 저장 → 결제 → issue-virtual-account 로 서버 결제 확인.
 * 금액은 화면이 계산해 보내지만, 결제 승인 시 서버(expected_service_price 등)가 다시 계산해 검증합니다 (원칙 1).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';
import { invokeEdgeFunction } from './edge-functions';

/** 신청서 저장 (id 는 화면에서 만든 UUID — PortOne paymentId 로도 쓰임) */
export async function insertServiceApplication(client: WBSupabaseClient, row: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 컬럼이 많고 DB 버전에 따라 일부가 없을 수 있어 느슨하게 둡니다
  return client.from('service_applications' as any).insert([row as any]);
}

/** 이전 신청에서 쓴 신청자 이름·연락처 (계정에 이름/번호가 없을 때 보조로 채움) */
export async function getLatestApplicantContact(client: WBSupabaseClient, userId: string) {
  return client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('service_applications' as any)
    .select('applicant_name, applicant_phone')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as Promise<{ data: { applicant_name?: string; applicant_phone?: string } | null; error: { code: string; message: string } | null }>;
}

/** 결제 화면용 내 정보 (적립금·이름·연락처) */
export async function getCheckoutProfile(client: WBSupabaseClient, userId: string) {
  return client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('profiles' as any)
    .select('points_balance, name, phone')
    .eq('id', userId)
    .maybeSingle() as unknown as Promise<{ data: { points_balance?: number | null; name?: string | null; phone?: string | null } | null; error: { code: string; message: string } | null }>;
}

/** 사용 가능한(활성·미만료) 쿠폰 */
export async function listActiveCoupons(client: WBSupabaseClient, userId: string) {
  return client
    .from('user_coupons')
    .select('id, coupon_code, amount, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString()) as unknown as Promise<{
    data: { id: string; coupon_code: string; amount: number; expires_at: string | null }[] | null;
    error: { code: string; message: string } | null;
  }>;
}

/** 잔여 횟수가 있는 활성 패키지 (만료 임박 순) */
export async function listActivePackages(client: WBSupabaseClient, userId: string) {
  return client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('user_packages' as any)
    .select('id, package_type, remaining_count, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('remaining_count', 0)
    .order('expires_at', { ascending: true }) as unknown as Promise<{
    data: { id: string; package_type: string; remaining_count: number; expires_at: string | null }[] | null;
    error: { code: string; message: string } | null;
  }>;
}

/**
 * 결제창 성공 직후 서버 결제 확인. PortOne 승인 반영이 늦으면 PAYMENT_NOT_APPROVED 가 올 수 있어
 * 호출하는 쪽에서 몇 번 재시도합니다.
 */
export async function issueVirtualAccount(client: WBSupabaseClient, applicationId: string) {
  return invokeEdgeFunction<{ status?: string }>(client, 'issue-virtual-account', { application_id: applicationId });
}
