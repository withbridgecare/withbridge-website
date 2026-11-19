/**
 * 시간 패키지 구매 (예전 package.html). 금액 검증·충전은 confirm-package-order-payment Edge Function 이 합니다 (원칙 1).
 * ⚠ 가격은 서버 쪽 package 금액과 같아야 결제 확인이 통과합니다 (NEXTJS_MIGRATION_PLAN.md 6장 — DB 이전 대상).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';
import { invokeEdgeFunction } from './edge-functions';

export type PackageType = '10_hours' | '20_hours';
export const PACKAGE_CATALOG: Record<PackageType, { label: string; price: number; hours: number; sessions: number }> = {
  '10_hours': { label: '10시간권', price: 230000, hours: 10, sessions: 5 },
  '20_hours': { label: '20시간권', price: 440000, hours: 20, sessions: 10 },
};

/** 결제 전에 주문서를 만듭니다. 주문 id 가 PortOne paymentId 로 쓰입니다. */
export async function createPackageOrder(client: WBSupabaseClient, userId: string, packageType: PackageType) {
  return client
    .from('package_orders')
    .insert([{ user_id: userId, package_type: packageType, amount: PACKAGE_CATALOG[packageType].price }])
    .select('id')
    .single();
}

/** 결제창 성공 직후 서버에 결제 확인(금액 검증 + 패키지 충전) 요청 */
export async function confirmPackageOrderPayment(client: WBSupabaseClient, orderId: string) {
  return invokeEdgeFunction(client, 'confirm-package-order-payment', { order_id: orderId });
}

/** 저장된 휴대폰 번호 (알림톡용). 조회 실패 시 undefined */
export async function getMyPhone(client: WBSupabaseClient, userId: string): Promise<string | null | undefined> {
  const { data, error } = await client.from('profiles').select('phone').eq('id', userId).maybeSingle();
  if (error) {
    console.warn('[profiles.phone] 조회 실패:', error.code, error.message);
    return undefined;
  }
  return data?.phone ?? null;
}
