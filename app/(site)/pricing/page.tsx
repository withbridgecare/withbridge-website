import './pricing-shared.css';
import './pricing.css';
import type { Metadata } from 'next';
import { LoginGateLink } from '@/components/site/LoginGateLink';
import { PricingCalculator } from './PricingCalculator';

export const metadata: Metadata = {
  title: "예상 요금 계산",
  description: "위드브릿지 동행 서비스의 추가 옵션, 부가 요금·정산 기준을 확인하고 예상 이용 요금을 계산해 보세요.",
};

/** 예상 요금 계산 | 위드브릿지 — public/pricing.html 에서 옮김 */
export default function PricingPage() {
  return (
    <main>
      {/* 페이지 머리말 + 구역 바로가기 */}
      <section className="pp-hero">
        <span className="pp-eyebrow">
          이용 요금 · 정산 기준
        </span>
        <h1 className="pp-title">
          예상 요금 계산
        </h1>
        <p className="pp-sub">
          추가 옵션과 부가 요금 기준을 확인하고, 원하시는 조건으로 총 이용 요금을 미리 계산해 보세요.
        </p>
        <ul className="pp-jump" aria-label="이 페이지 바로가기">
          <li>
            <a href="#addon">
              추가 옵션
            </a>
          </li>
          <li>
            <a href="#rules">
              부가 요금·정산 기준
            </a>
          </li>
          <li>
            <a href="#calculator" className="is-primary">
              요금 계산기
            </a>
          </li>
          <li>
            <a href="#plans">
              서비스별 포함 내용
            </a>
          </li>
        </ul>
      </section>
      <div className="wb-price-page wb-price-page--detail">
        <div className="wb-price-container">
          {/* 1. 선택 추가 옵션 (Add-on) — 카드 1개뿐이라 중앙에 덩그러니 두지 않고, 가로 전체 너비의 세이지그린×샌드베이지 강조 배너로 구성합니다(좌: 아이콘+설명 / 우: 가격 배지). */}
          <div className="wb-section-block" id="addon">
            <div className="wb-sec-title">
              <span className="section-num">
                1
              </span>
              {' '}선택 추가 옵션{' '}
              <span style={{ fontSize: "15px", fontWeight: "normal", color: "#64748B" }}>
                (Add-on)
              </span>
            </div>
            <div className="wb-sec-sub">
              필요에 따라 기본 요금에 자유롭게 추가할 수 있는 선택 항목입니다. 진료 피드백 리포트는 모든 서비스에 기본 무료로 제공됩니다.
            </div>
            <div className="wb-addon-banner">
              <div className="wb-addon-banner-left">
                <span className="wb-addon-banner-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"></path>
                  </svg>
                </span>
                {' '}
                <span className="wb-addon-banner-text">
                  <span className="wb-addon-banner-name">
                    긴급 매칭 서비스
                  </span>
                  {' '}
                  <span className="wb-addon-banner-desc">
                    이용 24시간 이내 긴급 예약을 요청하실 때 적용됩니다.
                  </span>
                </span>
              </div>
              <span className="wb-addon-banner-price">
                +10,000원
              </span>
            </div>
          </div>
          {/* 2. 부가 요금 및 정산 기준 */}
          <div className="wb-section-block" id="rules">
            <div className="wb-sec-title">
              <span className="section-num">
                2
              </span>
              {' '}부가 요금 및 정산 기준{' '}
              <span style={{ fontSize: "15px", fontWeight: "normal", color: "#E56D6F" }}>
                (필독 사항)
              </span>
            </div>
            <div className="wb-notice-box">
              <ul className="wb-notice-list">
                <li className="wb-notice-item">
                  <span className="wb-notice-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 11l1.4-4.5A2 2 0 0 1 8.3 5h7.4a2 2 0 0 1 1.9 1.5L19 11"></path>
                      <rect x="3" y="11" width="18" height="6" rx="2"></rect>
                      <circle cx="7.5" cy="17.5" r="1.4"></circle>
                      <circle cx="16.5" cy="17.5" r="1.4"></circle>
                    </svg>
                  </span>
                  {' '}
                  <span>
                    <strong>
                      이동 교통비:
                    </strong>
                    {' '}서비스 중 발생하는 매니저와 어르신의 교통비(택시비, 버스비, 지하철 요금 등) 및 병원 주차비는{' '}
                    <strong>
                      이용자 본인 부담
                    </strong>
                    (실비 청구)입니다.
                  </span>
                </li>
                <li className="wb-notice-item">
                  <span className="wb-notice-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4 2.5 20h19L12 4Z"></path>
                      <line x1="12" y1="10" x2="12" y2="14.2"></line>
                      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"></circle>
                    </svg>
                  </span>
                  {' '}
                  <span>
                    <strong>
                      주말 / 야간 할증:
                    </strong>
                    {' '}평일 주간(09:00~18:00) 외 주말, 공휴일 및 야간(18:00 이후 ~ 익일 09:00 이전) 이용 시{' '}
                    <strong>
                      기본요금의 20% 할증
                    </strong>
                    이 적용됩니다.
                  </span>
                </li>
                <li className="wb-notice-item">
                  <span className="wb-notice-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9"></circle>
                      <path d="M12 7v5l3.5 2"></path>
                    </svg>
                  </span>
                  {' '}
                  <span>
                    <strong>
                      시간 산정 기준:
                    </strong>
                    {' '}동행 매니저가 어르신과 약속한 출발 장소(가정 등)에 도착하여 만난 시간부터, 모든 일과를 마치고{' '}
                    <strong>
                      다시 귀가 조치를 완료한 시간까지를 기준으로
                    </strong>
                    {' '}정산합니다.
                  </span>
                </li>
              </ul>
            </div>
          </div>
          {/* 3. 예상 요금 모의 계산기 — 둥근 모서리/은은한 테두리·그림자가 있는 독립된 위젯 박스 하나로 감쌉니다. 서비스 유형은 드롭다운 대신 선택형 카드 버튼(wb-service-card)으로, 추가 이용 시간은 [- 0시간 +] 스테퍼(wb-stepper)로 바꿔 한눈에 비교·조작할 수 있게 했습니다. */}
          <div className="wb-calc-box" id="calculator">
            <div className="wb-sec-title">
              <span className="section-num">
                3
              </span>
              {' '}서비스 예상 요금 계산기
            </div>
            <div className="wb-sec-sub">
              필요하신 옵션을 선택하시면 대략적인 총 이용 요금을 확인하실 수 있습니다.
            </div>
            <p className="pp-calc-links">
              긴급 매칭은{' '}
              <a href="#addon">
                1. 추가 옵션
              </a>
              , 주말·야간 할증과 교통비는{' '}
              <a href="#rules">
                2. 정산 기준
              </a>
              을 참고하세요.
            </p>
            <PricingCalculator />
          </div>
          {/* 서비스별 포함 내용 — 메인에서는 금액 카드만 보여 주고, 각 서비스에 포함된 세부 항목과 서비스별 바로 예약 버튼은 이 페이지 하단에서 확인합니다. */}
          <section className="pp-plans" id="plans" aria-labelledby="pp-plans-title">
            <div className="wb-sec-title" id="pp-plans-title">
              서비스별 포함 내용
            </div>
            <div className="wb-sec-sub">
              각 서비스에 기본으로 포함되는 케어 항목입니다. 원하시는 서비스로 바로 예약하실 수 있어요.
            </div>
            <div className="wb-pricing-section">
              <div className="wb-pricing-grid">
                {/* 카드 1: 1시간 콕집 라이트 케어 */}
                <div className="pricing-card">
                  <div className="card-top-glow"></div>
                  <div className="wb-plan-top">
                    <span className="wb-plan-badge is-new">
                      NEW
                    </span>
                    <h3 className="wb-plan-title">
                      1시간 콕집 라이트 케어
                    </h3>
                    <p className="wb-plan-desc">
                      수면내시경 귀가, 단지 내 산책 등 1시간 이내 단기 돌봄
                    </p>
                    <div className="wb-plan-price-wrap">
                      <div className="wb-plan-price-row">
                        <span className="wb-plan-price">
                          30,000원
                        </span>
                        {' '}
                        <span className="wb-plan-price-unit">
                          / 1시간 기준
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="wb-plan-bottom">
                    <LoginGateLink href={"/apply?service=" + encodeURIComponent("1시간 라이트 케어")} className="wb-plan-btn is-outline">
                      이 상품으로 예약하기
                    </LoginGateLink>
                    <div className="pricing-card-divider"></div>
                    <ul className="wb-plan-checklist">
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        수면내시경/검사 후 안전 귀가
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        아파트 단지 내 안심 산책 및 말벗
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        집 앞 마트 생필품 장보기 대행
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        기타 1시간 이내 단기 케어 (직접 작성)
                      </li>
                    </ul>
                  </div>
                </div>
                {/* 카드 2: 시니어 병원 동행 (메인 추천 플랜) */}
                <div className="pricing-card popular-card">
                  <div className="card-top-glow"></div>
                  <div className="wb-plan-top">
                    <span className="wb-plan-badge is-pro">
                      인기 · 병원 동행 베스트
                    </span>
                    <h3 className="wb-plan-title">
                      시니어 병원 동행
                    </h3>
                    <p className="wb-plan-desc">
                      접수부터 진료 동석, 약 수령 및 안전 귀가까지 원스톱 케어
                    </p>
                    <div className="wb-plan-price-wrap">
                      <div className="wb-plan-price-row">
                        <span className="wb-plan-price">
                          50,000원
                        </span>
                        {' '}
                        <span className="wb-plan-price-unit">
                          / 기본 2시간
                        </span>
                      </div>
                      <p className="wb-plan-price-note is-accent">
                        초과 30분당 12,500원
                      </p>
                    </div>
                  </div>
                  <div className="wb-plan-bottom">
                    <LoginGateLink href={"/apply?service=" + encodeURIComponent("시니어 병원 동행")} className="wb-plan-btn is-solid">
                      병원 동행 예약하기
                    </LoginGateLink>
                    <div className="pricing-card-divider"></div>
                    <ul className="wb-plan-checklist">
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        집 앞 픽업부터 병원 이동까지 동행
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        접수·수납·약국 수령까지 밀착 동행
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        진료 내용 보호자 실시간 피드백
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        안전 귀가까지 책임지는 원스톱 케어
                      </li>
                    </ul>
                  </div>
                </div>
                {/* 카드 3: 생활 편의 · 복합 동행 */}
                <div className="pricing-card">
                  <div className="card-top-glow"></div>
                  <div className="wb-plan-top">
                    <span className="wb-plan-badge is-neutral">
                      맞춤 복합
                    </span>
                    <h3 className="wb-plan-title">
                      생활 편의 · 복합 동행
                    </h3>
                    <p className="wb-plan-desc">
                      관공서·은행 업무 대행 또는 병원 진료 후 장보기 원스톱
                    </p>
                    <div className="wb-plan-price-wrap">
                      <div className="wb-plan-price-row">
                        <span className="wb-plan-price">
                          40,000원~
                        </span>
                        {' '}
                        <span className="wb-plan-price-unit">
                          / 기본 2시간
                        </span>
                      </div>
                      <p className="wb-plan-price-note is-muted">
                        복합 매칭 60,000원 / 초과 30분당 10,000원~
                      </p>
                    </div>
                  </div>
                  <div className="wb-plan-bottom">
                    <LoginGateLink href={"/apply?service=" + encodeURIComponent("생활 편의 대행")} className="wb-plan-btn is-outline">
                      생활·복합 예약하기
                    </LoginGateLink>
                    <div className="pricing-card-divider"></div>
                    <ul className="wb-plan-checklist">
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        관공서·은행 업무 대행/동행
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        필수 생필품 장보기 대행/동행
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        병원 진료 후 장보기 등 복합 매칭 가능
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        산책 및 말벗, 맞춤형 스마트폰 교육
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <p className="wb-pricing-note">
                ※ 일반 동행 서비스는 기본 2시간부터 이용 가능하며(1시간 라이트 케어 제외), 매니저 안심케어(배상책임) 혜택이 기본 포함됩니다.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
