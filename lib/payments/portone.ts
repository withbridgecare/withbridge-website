/**
 * PortOne(포트원) V2 결제창 — 웹 전용 (원칙 7: 앱으로 확장할 때는 이 파일만 WebView 용으로 바꿉니다).
 *
 * - storeId / channelKey 는 브라우저에 공개돼도 되는 '식별자'입니다. 실제 결제 승인·금액 검증은 서버
 *   (Supabase Edge Function + PORTONE_API_SECRET)가 합니다 (원칙 1). 금액을 여기서 바꿔도 서버 검증에서 막힙니다.
 * - @portone/browser-sdk 는 예전 페이지가 쓰던 것과 같은 https://cdn.portone.io/v2/browser-sdk.js 를 불러옵니다.
 * - 요청 형식은 예전 페이지가 보내던 것과 똑같이 유지합니다(예: currency: 'CURRENCY_KRW').
 */
import * as PortOne from '@portone/browser-sdk/v2';

export const PORTONE_STORE_ID = 'store-d049e114-625d-4a7d-9202-b38f9072f3bc';
/** ⚠ 운영(실결제) 채널입니다. 테스트 결제는 PortOne 콘솔에서 테스트 채널 키를 받아 바꿔 끼우세요. */
export const PORTONE_CHANNEL_KEY = 'channel-key-9b483b99-d68d-4f49-99cf-76cdc0264dbb';

/** 결제창 응답. code 가 있으면 실패/취소, 없으면 결제창 단계 성공(최종 확정은 서버 확인 후) */
export type PaymentResult = { code?: string; message?: string; paymentId?: string; txId?: string; [key: string]: unknown } | null | undefined;

export async function requestPayment(request: Record<string, unknown>): Promise<PaymentResult> {
  return (await PortOne.requestPayment({ storeId: PORTONE_STORE_ID, channelKey: PORTONE_CHANNEL_KEY, ...request } as unknown as Parameters<
    typeof PortOne.requestPayment
  >[0])) as PaymentResult;
}

/** 사용자가 결제창을 닫았는지(취소) */
export function isPaymentCanceled(payment: PaymentResult): boolean {
  if (!payment) return false;
  const code = String(payment.code || '').toUpperCase();
  const message = String(payment.message || (payment as { error_msg?: string }).error_msg || '');
  return code.includes('CANCEL') || /CANCEL|취소/i.test(message);
}
