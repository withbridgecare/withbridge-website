/**
 * '예상 요금' 계산 (예전 js/price-calculator.js). 금액 자체는 lib/catalog.json(lib/services.ts) 에서 가져옵니다.
 * 이 계산은 화면에 보여 주는 '예상' 금액일 뿐이고, 실제 결제 금액은 서버가 다시 검증합니다 (원칙 1).
 * next/* · 브라우저 전용 코드를 넣지 않습니다 (앱에서도 재사용).
 */
import { ADDONS, SERVICES, type ServiceInfo } from './services';

export { SERVICES, type ServiceInfo };

export const URGENT_MATCHING_FEE = ADDONS.urgent.amount;
/** 주말·야간·공휴일 할증: 기본요금의 20% */
export const NIGHT_SURCHARGE_RATE = 0.2;
/** 추가 시간은 30분 단위로 최대 4단위(2시간) */
export const MAX_EXTRA_UNITS = 4;

export type EstimateInput = { service: ServiceInfo; extraUnits: number; urgent: boolean; night: boolean };

export function estimatePrice({ service, extraUnits, urgent, night }: EstimateInput) {
  const isOneHour = service.baseMinutes === 60; // 1시간 상품은 시간 추가 불가
  const units = isOneHour ? 0 : Math.max(0, Math.min(MAX_EXTRA_UNITS, extraUnits));
  const total =
    service.basePrice +
    units * service.extraPer30Min +
    (urgent ? URGENT_MATCHING_FEE : 0) +
    (night ? service.basePrice * NIGHT_SURCHARGE_RATE : 0);
  return { isOneHour, units, totalMinutes: service.baseMinutes + units * 30, total };
}

export function formatWon(n: number) {
  return n.toLocaleString('ko-KR') + '원';
}

/** 30분 단위 → "0시간 / 30분 / 1시간 30분" */
export function formatExtraDuration(units: number) {
  const totalMin = units * 30;
  if (totalMin === 0) return '0시간';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return m + '분';
  return m === 0 ? h + '시간' : h + '시간 ' + m + '분';
}
