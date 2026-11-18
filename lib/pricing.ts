/**
 * 서비스 요금표와 '예상 요금' 계산 (예전 js/price-calculator.js + pricing.html 카드 data-* 값).
 *
 * ⚠️ 같은 금액이 아직 다음 곳에도 따로 적혀 있습니다 (NEXTJS_MIGRATION_PLAN.md 6장):
 *   - public/apply.html 의 SERVICES (신청서)
 *   - app/(site)/(home)/page.tsx 메인 요금 카드 (금액이 마크업에 직접 적혀 있음)
 *   - sql/one_hour_light_care_service.sql 의 expected_service_price() / expected_overtime_rate_per_30min()
 *     → 서버가 결제 금액을 이 값으로 다시 검증합니다. 여기만 바꾸면 결제가 AMOUNT_MISMATCH 로 막힙니다.
 * 최종 목표는 services 테이블 한 곳에서 읽는 것입니다.
 *
 * 이 파일의 계산은 화면에 보여 주는 '예상' 금액일 뿐이고, 실제 결제 금액은 서버가 정합니다 (원칙 1).
 * next/* · 브라우저 전용 코드를 넣지 않습니다 (앱에서도 재사용).
 */

export type ServiceInfo = {
  /** DB service_applications.service_type 값과 완전히 같은 문자열 */
  name: string;
  /** 카드에 보이는 짧은 이름 */
  shortName: string;
  basePrice: number;
  /** 초과 30분당 요금 */
  extraPer30Min: number;
  baseMinutes: number;
  badge?: string;
};

export const SERVICES: ServiceInfo[] = [
  { name: '1시간 라이트 케어', shortName: '1시간 라이트 케어', basePrice: 30000, extraPer30Min: 15000, baseMinutes: 60, badge: 'NEW' },
  { name: '시니어 병원 동행', shortName: '시니어 병원 동행', basePrice: 50000, extraPer30Min: 12500, baseMinutes: 120 },
  { name: '생활 편의 대행', shortName: '생활 편의 대행', basePrice: 40000, extraPer30Min: 10000, baseMinutes: 120 },
  { name: '복합 매칭 서비스 (동행 + 생활편의)', shortName: '복합 매칭 서비스', basePrice: 60000, extraPer30Min: 15000, baseMinutes: 120 },
];

export const URGENT_MATCHING_FEE = 10000;
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
