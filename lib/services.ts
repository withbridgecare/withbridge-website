/**
 * 서비스·옵션·패키지 가격 — 화면에 보이는 모든 금액의 '원본' (실제 값은 lib/catalog.json)
 *
 * 메인 요금 카드, 예상 요금 계산 페이지, 신청서(서비스 선택·옵션·결제 금액), 패키지 구매 페이지,
 * 매니저 모집 페이지의 이용 요금이 모두 이 파일을 읽습니다. 화면 쪽은 lib/catalog.json 한 곳만 고치면 됩니다.
 *
 * ⚠⚠ 가격을 바꿀 때 반드시 함께 바꿀 것 — 서버 결제 검증 (안 바꾸면 결제가 전부 막힙니다)
 *   결제가 끝나면 서버가 '받아야 할 금액'을 SQL 함수로 다시 계산해 실제 결제 금액과 비교합니다.
 *   다르면 고객 돈은 이미 결제됐는데 신청이 처리되지 않습니다(AMOUNT_MISMATCH → 운영자가 수동 환불).
 *     - 서비스 기본 요금        → sql/one_hour_light_care_service.sql 의 expected_service_price()
 *     - 초과 30분당 요금        → 같은 파일의 expected_overtime_rate_per_30min()
 *     - 추가 옵션(긴급 매칭)     → sql/user_coupons_checkout.sql 의 expected_addon_total()
 *     - 패키지 가격             → sql/user_packages_system.sql 의 expected_package_price()
 *   순서: ① SQL 파일 수정 → ② Supabase SQL Editor 에서 그 함수 부분 실행(실제 DB 반영) → ③ catalog.json 수정 → ④ 배포
 *   `npm run check:prices` 가 catalog.json 과 위 SQL 파일의 금액이 같은지 검사합니다(GitHub 자동 점검에도 포함).
 *   단, 이 검사는 저장소의 SQL 파일과 비교할 뿐 '실제 DB 에 실행했는지'는 알 수 없습니다 — ②를 잊지 마세요.
 *
 * 함께 확인할 글: 이용약관(app/(site)/terms)의 요금표는 법적 문서라 자동으로 바뀌지 않습니다 — 약관 개정 절차와 함께 직접 고치세요.
 * 서비스 이름(name)은 DB service_applications.service_type 값과 같아야 하므로 함부로 바꾸지 마세요.
 *
 * 이 파일에는 next/* · 브라우저 전용 코드를 넣지 않습니다 (앱에서도 재사용).
 */
import catalog from './catalog.json';

export type ServiceKey = 'light' | 'hospital' | 'life' | 'complex';

export type ServiceInfo = {
  key: ServiceKey;
  /** DB service_applications.service_type 값과 완전히 같은 문자열 */
  name: string;
  /** 카드·계산기에 보이는 짧은 이름 */
  shortName: string;
  /** 신청서 서비스 선택 목록에 보이는 이름 (금액·시간은 자동으로 붙음) */
  optionLabel: string;
  basePrice: number;
  /** 초과 30분당 요금 */
  extraPer30Min: number;
  baseMinutes: number;
  badge?: string;
  /** 신청서에서 서비스별로 바뀌는 안내 문구 */
  apply: { durationLabel: string; destLabel: string; destPlaceholder: string; routeHint: string; detailsPlaceholder: string };
};

export type AddonInfo = { code: string; amount: number; label: string };
export type PackageType = '10_hours' | '20_hours';
export type PackageInfo = { label: string; name: string; price: number; listPrice: number; hours: number; sessions: number };

/** 서비스 목록 (화면에 나오는 순서) */
export const SERVICES = catalog.services as ServiceInfo[];
/** 키로 바로 찾기: SERVICE.hospital.basePrice */
export const SERVICE = Object.fromEntries(SERVICES.map((s) => [s.key, s])) as Record<ServiceKey, ServiceInfo>;
/** 선택 옵션 (code 는 서버 expected_addon_total() 과 같은 문자열이어야 함) */
export const ADDONS = catalog.addons as Record<'urgent', AddonInfo>;
/** 시간 패키지 */
export const PACKAGES = catalog.packages as Record<PackageType, PackageInfo>;

/** 30000 → "30,000" (원 없이) */
export const won = (n: number) => n.toLocaleString('ko-KR');

/** 패키지 할인액·할인율(반올림 %)·시간당 금액 */
export function packageDeal(p: PackageInfo) {
  const discount = p.listPrice - p.price;
  return { discount, discountPercent: Math.round((discount / p.listPrice) * 100), perHour: Math.round(p.price / p.hours) };
}

/** 기본 이용 시간 문구: 60 → "1시간", 120 → "2시간" */
export const hoursLabel = (minutes: number) => (minutes % 60 === 0 ? minutes / 60 + '시간' : minutes + '분');
