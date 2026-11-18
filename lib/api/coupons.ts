/**
 * 웰컴 쿠폰 (sql/welcome_coupons.sql, sql/welcome_coupon_notify_once.sql).
 * 발급·안내 여부의 최종 판단은 항상 서버(DB 함수)가 합니다 — 화면은 결과만 보여 줍니다 (원칙 1).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export const WELCOME_COUPON_CODE = 'WELCOME_2000';

type CouponRow = { amount?: number | null; status?: string | null } | null;
const firstRow = (data: unknown): CouponRow => (Array.isArray(data) ? (data[0] ?? null) : (data as CouponRow));

/**
 * 가입 축하 쿠폰을 '처음 한 번만' 안내하기 위한 호출. notified_at 을 null → now() 로 바꾼 그 1회에만 쿠폰 정보를 돌려줍니다.
 * 안내할 게 없으면(쿠폰 없음 / 이미 안내됨) null. 호출 실패 시 예외.
 */
export async function markWelcomeCouponNotified(client: WBSupabaseClient): Promise<{ amount: number | null } | null> {
  const { data, error } = await client.rpc('mark_welcome_coupon_notified');
  if (error) throw error;
  const row = firstRow(data);
  return row ? { amount: Number.isFinite(row.amount) ? Number(row.amount) : null } : null;
}

/** 웰컴 쿠폰 즉시 발급 (이미 있으면 서버가 중복 발급하지 않음). */
export async function claimWelcomeCoupon(client: WBSupabaseClient): Promise<{ issued: boolean; amount: number | null }> {
  const { data, error } = await client.rpc('claim_welcome_coupon');
  if (error) throw error;
  const row = firstRow(data);
  return { issued: row?.status === 'issued', amount: row && Number.isFinite(row.amount) ? Number(row.amount) : null };
}

/** 이 사용자에게 웰컴 쿠폰이 이미 있는지 */
export async function hasWelcomeCoupon(client: WBSupabaseClient, userId: string): Promise<boolean> {
  const { data } = await client
    .from('user_coupons')
    .select('id')
    .eq('user_id', userId)
    .eq('coupon_code', WELCOME_COUPON_CODE)
    .maybeSingle();
  return !!data;
}
