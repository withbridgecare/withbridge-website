import './manager-landing.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { BodyClass } from '@/components/site/BodyClass';

export const metadata: Metadata = {
  title: "위드브릿지 케어 매니저 모집",
  description: "",
};

/** 위드브릿지 케어 매니저 모집 — public/manager-landing.html 에서 옮김 */
export default function ManagerLandingPage() {
  return (
    <>
      <NotoSansKr />
      {/* 모바일 하단 고정 CTA 가 바닥글을 가리지 않도록 본문 아래 여백(78px) */}
      <BodyClass name="has-mobile-sticky-cta" />
    <main className="ap-main">
      {/* ================================================================ 02. 히어로 — '초기 파트너 1기 모집' 한정 배지 + 신규 메인 카피 ================================================================= */}
      <section className="hero">
        <div className="hero-inner">
          <span className="hero-eyebrow hero-eyebrow--founding">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
            {' '}초기 파트너 1기 모집 · 우대 혜택
          </span>
          <h1 className="hero-title">
            내가 원하는 시간,
            <br />
            우리 동네에서 시작하는
            <br />
            따뜻한 케어 파트너
          </h1>
          <p className="hero-sub">
            건강한 성인이라면 누구나 지원할 수 있어요. 자격증과 경력이 없어도 괜찮습니다 — 활동 전부터 시간당 정산 기준을 명확히 확인할 수 있어요.
          </p>
          <div className="hero-cta-row">
            <a href="/manager-apply" target="_blank" rel="noopener noreferrer" className="btn-primary btn-lg">
              케어 매니저 지원하기{' '}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17 17 7"></path>
                <path d="M7 7h10v10"></path>
              </svg>
            </a>
          </div>
        </div>
        <div className="value-bar">
          <span className="item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="700" stroke="none" fill="currentColor" fontFamily="sans-serif">
                ₩
              </text>
            </svg>
            {' '}시간당 15,000원 투명 정산
          </span>
          {' '}
          <span className="sep" aria-hidden="true"></span>
          {' '}
          <span className="item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            {' '}100% 원하는 시간 선택
          </span>
          {' '}
          <span className="sep" aria-hidden="true"></span>
          {' '}
          <span className="item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            {' '}자격증·경력 무관 지원
          </span>
          {' '}
          <span className="sep" aria-hidden="true"></span>
          {' '}
          <span className="item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            {' '}GPS·사진 인증 안심 케어
          </span>
        </div>
      </section>
      <div className="page-band page-band--ivory">
        {/* ============== 매니저 3대 핵심 혜택 ============== */}
        <div className="section">
          <p className="section-label">
            Why WithBridge
          </p>
          <h2 className="section-title">
            매니저 3대 핵심 혜택
          </h2>
          <div className="perks">
            <div className="perk">
              <div className="perk-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <span className="perk-eyebrow">
                Work-Life Balance
              </span>
              <h3 className="perk-title">
                자율적인 일정 관리
              </h3>
              <p className="perk-desc">
                전용 웹에서 들어온 케어 요청을 확인하고, 가능한 일정이면 매니저님이 직접 수락해 자유롭게 활동해요.
              </p>
            </div>
            <div className="perk">
              <div className="perk-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
              </div>
              <span className="perk-eyebrow">
                Transparent Payout
              </span>
              <h3 className="perk-title">
                투명한 시급 정산 시스템
              </h3>
              <p className="perk-desc">
                결제 금액의 일부가 아니라 "수행한 시간 × 시급"으로 정산금이 정해져요. 얼마를 버는지 먼저 계산해 보고 시작할 수 있어요.
              </p>
            </div>
            <div className="perk">
              <div className="perk-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
              </div>
              <span className="perk-eyebrow">
                Onboarding Support
              </span>
              <h3 className="perk-title">
                체계적인 안심 지원 및 교육
              </h3>
              <p className="perk-desc">
                전담 안심 가이드북과 GPS·사진 인증 시스템으로 초보자도 안심하고 활동할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
        {/* ============== 수익 & 정산 투명성 ============== */}
        <div className="section" id="earnings">
          <p className="section-label">
            Earning &amp; Transparency
          </p>
          <h2 className="section-title section-title--with-desc">
            이용 요금과 매니저 정산금을 투명하게 구분합니다
          </h2>
          <p className="section-desc">
            매니저님의 정산금은 "결제 금액의 일부"가 아니라{' '}
            <b>
              수행한 시간 × 시급
            </b>
            으로 정해져요. 어떤 서비스를 맡든 시급은 동일합니다.
          </p>
          <div className="rate-highlight">
            <span className="rate-highlight-num">
              시간당 15,000원
            </span>
            {' '}
            <span className="rate-highlight-desc">
              기본 시급 · 서비스 종류 무관 · 수행 시간만큼 정확히 정산
            </span>
          </div>
          <div className="price-table-wrap">
            <table className="price-table">
              <thead>
                <tr>
                  <th>
                    서비스
                  </th>
                  <th>
                    이용 요금 (이용자 결제)
                  </th>
                  <th>
                    기준 시간
                  </th>
                  <th>
                    매니저 정산금 (기준 시간)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    1시간 라이트 케어
                  </td>
                  <td>
                    30,000원
                  </td>
                  <td>
                    1시간
                  </td>
                  <td className="pay">
                    15,000원
                  </td>
                </tr>
                <tr>
                  <td>
                    병원 동행 케어
                  </td>
                  <td>
                    50,000원
                  </td>
                  <td>
                    2시간
                  </td>
                  <td className="pay">
                    30,000원
                  </td>
                </tr>
                <tr>
                  <td>
                    생활 편의 대행
                  </td>
                  <td>
                    40,000원
                  </td>
                  <td>
                    2시간
                  </td>
                  <td className="pay">
                    30,000원
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="price-table-note">
            기준 시간을 초과하면 실제 수행한 시간만큼 30분 단위로 추가 정산돼요. 매월 집계된 정산금은{' '}
            <b>
              사업소득세 3.3%(소득세 3% + 지방소득세 0.3%)
            </b>
            를 뗀 금액이 등록하신 계좌로 입금됩니다.
          </p>
          <div className="sim-cards">
            <div className="sim-card">
              <span className="sim-tag">
                주 3일 · 가볍게 시작
              </span>
              <div className="sim-amount">
                약 39만원
                <span>
                  /월
                </span>
              </div>
              <p className="sim-detail">
                주 3일, 하루 2시간(병원 동행 1건 등) 기준 · 세전
              </p>
            </div>
            <div className="sim-card is-full">
              <span className="sim-tag">
                주 5일 · 활동 중심
              </span>
              <div className="sim-amount">
                약 130만원
                <span>
                  /월
                </span>
              </div>
              <p className="sim-detail">
                주 5일, 하루 4시간(2건) 기준 · 세전
              </p>
            </div>
          </div>
          <p className="sim-disclaimer">
            * 위 금액은 시급 15,000원을 기준으로 한 예시이며, 실제 수익은 배정받는 건수·활동 시간에 따라 달라져요. 입금액은 사업소득세 3.3%를 제외한 금액입니다.
          </p>
        </div>
      </div>
      {/* /.page-band--ivory */}
      <div className="page-band page-band--sand">
        {/* ============== 케어 매니저는 실제 어떤 일을 하나요? ============== */}
        <div className="section">
          <p className="section-label">
            Scope of Work
          </p>
          <h2 className="section-title">
            케어 매니저는 실제 어떤 일을 하나요?
          </h2>
          <div className="activities">
            <div className="activity">
              <div className="activity-head">
                <div className="activity-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                  </svg>
                </div>
                <div>
                  <h3 className="activity-title">
                    병원 동행 케어
                  </h3>
                  <span className="activity-price">
                    이용 요금 50,000원 · 2시간 기준
                  </span>
                </div>
              </div>
              <p className="activity-desc">
                어르신의 병원 진료를 처음부터 끝까지 1:1로 밀착 동행해요.
              </p>
              <ul className="activity-steps">
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  자택 픽업부터 병원까지 안전하게 이동
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  병원 접수 및 진료 대기·진료실 동행
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  진료 종료 후 약국 동행 및 처방약 수령
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  진료 내용을 들은 그대로 보호자에게 전달
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  진료 종료 후 자택까지 안전 귀가 확인
                </li>
              </ul>
            </div>
            <div className="activity">
              <div className="activity-head">
                <div className="activity-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                  </svg>
                </div>
                <div>
                  <h3 className="activity-title">
                    일상 생활 동행 · 1시간 라이트 케어
                  </h3>
                  <span className="activity-price">
                    이용 요금 40,000원(2시간) · 30,000원(1시간)
                  </span>
                </div>
              </div>
              <p className="activity-desc">
                어르신의 일상 속 소소한 외출과 말벗이 되어드려요.
              </p>
              <ul className="activity-steps">
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  관공서·은행 등 행정 업무 동행
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  생필품 장보기 대행
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  어르신과 함께하는 안심 산책 및 말벗
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  1시간 이내 가볍게 끝나는 단건 심부름(약국 서류 수령 보조 등)
                </li>
              </ul>
            </div>
          </div>
          <div className="scope-callout">
            <div className="scope-col do">
              <h4>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="16 10 11 15 8 12"></polyline>
                </svg>
                {' '}수행 업무
              </h4>
              <ul>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  병원 접수·진료·약 수령 동행
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  안심 산책 및 정서적 교감
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  장보기 대행 및 생활 편의 보조
                </li>
              </ul>
            </div>
            <div className="scope-col dont">
              <h4>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                {' '}제외 업무
              </h4>
              <ul>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  무거운 짐 운반, 전문 청소
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  주사·투약 등 모든 의료 행위
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  진단·처방 등 의료인만 할 수 있는 행위
                </li>
              </ul>
            </div>
          </div>
          <p className="scope-note">
            ※ 주사·투약 등 전문 의료 행위는 법적으로 엄격히 제외되고, 이동·접수·귀가를 돕는 안심 동행과 일상 생활 조력에만 집중해요. 의료·간호 자격을 가진 분도 서비스 중에는 동일하게 적용되며, 복잡한 의료 지식이나 경력 없이도 체계적인 가이드에 따라 안전하게 활동할 수 있어요.
          </p>
        </div>
        {/* ============== 안심 지원 & 1기 멤버 혜택 ============== */}
        <div className="section">
          <p className="section-label">
            Peace of Mind
          </p>
          <h2 className="section-title">
            초보자도 안심할 수 있는 지원 시스템
          </h2>
          <div className="info-grid">
            <div className="info-card">
              <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
                {' '}전담 안심 가이드북
              </h3>
              <p className="info-desc">
                현장 상황별 대응 방법을 정리한 가이드북을 제공해, 처음 활동하는 분도 당황하지 않고 대응할 수 있어요.
              </p>
            </div>
            <div className="info-card">
              <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                {' '}GPS·사진 인증 시스템
              </h3>
              <p className="info-desc">
                출발·도착마다 위치 또는 사진으로 인증 기록이 남아요. 매니저님과 어르신 모두를 보호하는 안전장치예요.
              </p>
            </div>
          </div>
          <div className="founding-grid">
            <div className="founding-card">
              <span className="founding-ribbon">
                1기 파트너 한정
              </span>
              <h4>
                활동 초기 시급 우대
              </h4>
              <p>
                초기 합류 파트너에게는 활동 초반 시급 우대 혜택을 적용해요. 자세한 조건은 지원 후 담당자가 안내드려요.
              </p>
            </div>
            <div className="founding-card">
              <span className="founding-ribbon">
                1기 파트너 한정
              </span>
              <h4>
                1:1 웰컴 온보딩
              </h4>
              <p>
                합류가 확정되면 전담 담당자가 1:1로 활동 시작을 도와드려요. 첫 케어까지 궁금한 점을 바로 물어볼 수 있어요.
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* /.page-band--sand */}
      <div className="page-band page-band--ivory">
        {/* ============== 주요 활동 지역 및 지원 자격 ============== */}
        <div className="section">
          <p className="section-label">
            Coverage
          </p>
          <h2 className="section-title">
            주요 활동 지역 및 지원 자격
          </h2>
          <div className="info-grid">
            <div className="info-card">
              <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                {' '}주요 활동 지역
              </h3>
              <p className="info-desc">
                인천 및 경기 주요 지역을 중심으로 활동할 매니저님을 우선 모집하고 있어요.
              </p>
              <ul className="info-tags">
                <li>
                  인천 남동구
                </li>
                <li>
                  인천 연수구
                </li>
                <li>
                  인천 미추홀구
                </li>
                <li>
                  인천 부평구·계양구
                </li>
                <li>
                  인천 서구(일부)
                </li>
                <li>
                  경기 시흥시
                </li>
                <li>
                  경기 부천시
                </li>
                <li>
                  경기 안산시(일부)
                </li>
              </ul>
            </div>
            <div className="info-card">
              <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="7"></circle>
                  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                </svg>
                {' '}지원 자격
              </h3>
              <p className="info-desc">
                경력과 자격증이 없어도 지원할 수 있어요. 건강한 성인이라면 누구나 지원 가능하며, 아래 자격증이 있다면 더욱 우대합니다.
              </p>
              <ul className="info-tags">
                <li>
                  요양보호사
                </li>
                <li>
                  사회복지사
                </li>
                <li>
                  간호사/간호조무사
                </li>
                <li>
                  운전면허증
                </li>
                <li className="muted">
                  경력·자격증 무관
                </li>
              </ul>
            </div>
          </div>
        </div>
        {/* ============== 케어 매니저 업무 프로세스 (에디토리얼 리스트) ============== */}
        <div className="section">
          <p className="section-label">
            How it works
          </p>
          <h2 className="section-title">
            케어 매니저 업무 프로세스
          </h2>
          <div className="process-list">
            <div className="process-row">
              <span className="process-index" aria-hidden="true">
                01
              </span>
              <div className="process-copy">
                <h3>
                  배정 신청 및 수락
                </h3>
                <p>
                  앱으로 들어온 케어 요청을 확인하고, 가능한 일정이면 매니저님이 직접 수락해요.
                </p>
              </div>
            </div>
            <div className="process-row">
              <span className="process-index" aria-hidden="true">
                02
              </span>
              <div className="process-copy">
                <h3>
                  케어 시작 및 출발 인증
                </h3>
                <p>
                  약속된 시간에 어르신 댁(또는 병원)으로 출발하며, 위치 또는 사진으로 출발·도착을 인증해요.
                </p>
              </div>
            </div>
            <div className="process-row">
              <span className="process-index" aria-hidden="true">
                03
              </span>
              <div className="process-copy">
                <h3>
                  밀착 케어 및 안심 공유
                </h3>
                <p>
                  병원 동행·일상 케어를 진행하며, 보호자가 안심할 수 있도록 중간중간 상황을 공유해요.
                </p>
              </div>
            </div>
            <div className="process-row">
              <span className="process-index" aria-hidden="true">
                04
              </span>
              <div className="process-copy">
                <h3>
                  케어 완료 및 리포트 작성
                </h3>
                <p>
                  케어를 마친 뒤 실제 수행 시간을 보고하면, 시간 × 시급 기준으로 정산 금액이 자동 집계돼요.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /.page-band--ivory */}
      <div className="page-band page-band--sand">
        {/* ============== FAQ ============== */}
        <div className="section">
          <p className="section-label">
            FAQ
          </p>
          <h2 className="section-title">
            자주 묻는 질문
          </h2>
          <div className="faq">
            <details className="faq-item">
              <summary>
                <span className="faq-q">
                  <span className="faq-q-mark" aria-hidden="true">
                    Q
                  </span>
                  자격증이 없는 초보자도 가능한가요?
                </span>
                {' '}
                <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <p className="faq-answer">
                네, 경력과 자격증이 없어도 지원할 수 있어요. 건강한 성인이라면 누구나 지원 가능하며, 의료 행위가 필요 없는 신체적·행정적 동행 중심의 업무라 처음 시작하는 분도 어렵지 않게 적응할 수 있어요.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span className="faq-q">
                  <span className="faq-q-mark" aria-hidden="true">
                    Q
                  </span>
                  활동 시간과 지역은 어떻게 정하나요?
                </span>
                {' '}
                <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <p className="faq-answer">
                인천(남동구·연수구 등) 및 경기 지역 내에서 본인이 원하는 시간대의 케어 요청을 직접 확인하고 수락하시면 됩니다.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span className="faq-q">
                  <span className="faq-q-mark" aria-hidden="true">
                    Q
                  </span>
                  정산은 어떻게 이루어지나요?
                </span>
                {' '}
                <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <p className="faq-answer">
                수행한 시간 × 시급(기본 15,000원/시간)으로 건별 정산 금액이 자동 집계돼요. 매월 집계된 금액에서 사업소득세 3.3%를 제외한 금액이 등록하신 계좌로 정확히 입금됩니다.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span className="faq-q">
                  <span className="faq-q-mark" aria-hidden="true">
                    Q
                  </span>
                  제가 할 수 없는 업무도 있나요?
                </span>
                {' '}
                <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <p className="faq-answer">
                네, 무거운 짐 운반이나 전문 청소, 그리고 주사·투약 등 전문 의료 행위는 법적으로 엄격히 서비스 범위에서 제외돼요. 위드브릿지 케어 매니저는 안심 동행과 일상 생활 조력에만 집중하기 때문에, 복잡한 의료 지식이나 경력이 없어도 체계적인 가이드에 따라 안전하게 활동할 수 있어요.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span className="faq-q">
                  <span className="faq-q-mark" aria-hidden="true">
                    Q
                  </span>
                  1기 파트너로 지원하면 어떤 점이 다른가요?
                </span>
                {' '}
                <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <p className="faq-answer">
                초기 합류 파트너에게는 활동 초반 시급 우대와 1:1 웰컴 온보딩 등 한정 혜택을 드려요. 자세한 조건은 지원 후 담당자가 개별 안내드립니다.
              </p>
            </details>
          </div>
        </div>
      </div>
      {/* /.page-band--sand */}
      {/* ============== 하단 클로징 CTA 배너 (푸터와 완전 밀착) ============== */}
      <div className="closing-banner">
        <div className="closing-inner">
          <h2>
            준비되셨나요? 위드브릿지와 함께 따뜻한 동행을 시작하세요
          </h2>
          <p>
            지원서 작성은 5분이면 충분해요. 지금 바로 시작해 보세요.
          </p>
          <a href="/manager-apply" target="_blank" rel="noopener noreferrer" className="btn-primary btn-lg btn-on-sage">
            바로 지원하러 가기{' '}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7"></path>
              <path d="M7 7h10v10"></path>
            </svg>
          </a>
        </div>
      </div>
    </main>
      {/* 모바일 하단 고정 CTA */}
      <div className="mobile-sticky-cta">
        <a href="/manager-apply" target="_blank" rel="noopener noreferrer">
          지금 지원하기
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
      </div>
    </>
  );
}
