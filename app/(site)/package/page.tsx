import './package.css';
import type { Metadata } from 'next';
import { PACKAGES, packageDeal, won } from '@/lib/services';

import { NotoSansKr } from '@/components/site/NotoSansKr';
import { PackageBehaviors } from './PackageBehaviors';

/** 패키지 가격·시간 — 원본은 lib/catalog.json */
const P10 = PACKAGES['10_hours'];
const P20 = PACKAGES['20_hours'];
const D10 = packageDeal(P10);
const D20 = packageDeal(P20);

export const metadata: Metadata = {
  title: "케어 패키지 안내",
  description: "위드브릿지 케어 패키지(10시간권·20시간권) — 매번 결제할 필요 없이 결제 한 번으로 꾸준하고 편안한 병원 동행을 예약하세요.",
};

/** 케어 패키지 안내 | 위드브릿지 — public/package.html 에서 옮김 */
export default function PackagePage() {
  return (
    <>
    <NotoSansKr weights="400;500;700;800" />
    <main>
      {/* ================================================================ */}
      {' '}
      {/* HERO */}
      {' '}
      {/* ================================================================ */}
      <section className="pkg-hero">
        <div className="pkg-hero-bg">
          <img src="/images/getty-images-3hyRdh15WL4-unsplash.webp" alt="위드브릿지 케어매니저와 함께하는 외출 동행" />
        </div>
        <div className="pkg-hero-content">
          <div className="pkg-hero-text">
            <span className="pkg-eyebrow is-on-dark fade-in-up" style={{ animationDelay: "0s" }}>
              WITHBRIDGE CARE PACKAGE
            </span>
            <h1 className="pkg-hero-title fade-in-up" style={{ animationDelay: ".15s" }}>
              {/* 줄바꿈 앞 공백: 휴대폰에서 <br> 을 숨겨도 단어가 붙지 않게 (package.css) */}
              매번 결제하는 번거로움 없이,{' '}
              <br />
              어르신의 병원 동행을 더 꾸준하고{' '}
              <br />
              편안하게
            </h1>
            <p className="pkg-hero-sub fade-in-up" style={{ animationDelay: ".3s" }}>
              위드브릿지 케어 패키지로 할인 혜택과 함께 스마트하고 빠른 예약을 경험해 보세요.
            </p>
            <div className="pkg-hero-cta fade-in-up" style={{ animationDelay: ".45s" }}>
              <a href="#pricing" className="pkg-btn is-primary">
                패키지 보러가기
              </a>
              {' '}
              <a href="#why" className="pkg-btn is-ghost is-on-dark">
                왜 패키지가 좋을까요?
              </a>
            </div>
          </div>
        </div>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* WHY PACKAGE */}
      {' '}
      {/* ================================================================ */}
      <section className="pkg-section" id="why">
        <div className="pkg-wrap">
          <div className="pkg-head">
            <span className="pkg-eyebrow">
              WHY PACKAGE?
            </span>
            <h2 className="pkg-h2">
              패키지를 선택하면 달라지는 것들
            </h2>
            <p className="pkg-lead">
              한 번의 결제로 꾸준한 동행을 준비해 두면, 매번 신청할 때마다 느꼈던 번거로움이 사라집니다.
            </p>
          </div>
          <div className="pkg-why-grid">
            <div className="pkg-why-card">
              <div className="pkg-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                  <line x1="2" y1="10" x2="22" y2="10"></line>
                  <line x1="7" y1="15" x2="7" y2="15"></line>
                </svg>
              </div>
              <h3>
                결제 번거로움 ZERO
              </h3>
              <p>
                신청서 작성 시 카드 입력 없이, 클릭 한 번으로 보유 회차가 즉시 차감되어 바로 접수됩니다. (유료 추가 옵션 선택 시에는 매칭 후 별도 결제 진행)
              </p>
            </div>
            <div className="pkg-why-card">
              <div className="pkg-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M9 12l2 2 4-4"></path>
                </svg>
              </div>
              <h3>
                합리적인 비용 혜택
              </h3>
              <p>
                단건 결제 대비 부담 없는 세션 패스 가격으로, 꾸준한 동행을 계획적으로 준비할 수 있어요.
              </p>
            </div>
            <div className="pkg-why-card">
              <div className="pkg-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"></circle>
                  <polyline points="12 7 12 12 15.5 14"></polyline>
                </svg>
              </div>
              <h3>
                유연한 이용 기한
              </h3>
              <p>
                구매일로부터 180일 동안 여유롭게, 필요한 날짜에 맞춰 회차를 사용할 수 있습니다.
              </p>
            </div>
            <div className="pkg-why-card">
              <div className="pkg-why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"></path>
                </svg>
              </div>
              <h3>
                전담 케어 연결 우선권
              </h3>
              <p>
                자주 이용하시는 어르신의 성향을 반영해, 더 잘 맞는 케어매니저로 최적 배정을 지원합니다.
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* PRICING */}
      {' '}
      {/* ================================================================ */}
      <section className="pkg-section is-beige" id="pricing">
        <div className="pkg-wrap">
          <div className="pkg-head">
            <span className="pkg-eyebrow">
              PRICING
            </span>
            <h2 className="pkg-h2">
              우리 가족에게 맞는 패키지를 선택하세요
            </h2>
            <p className="pkg-lead">
              모두 2시간 기준 정기 케어로 나눠 쓸 수 있는 시간제 패키지이며, 결제 후 바로 충전됩니다.
            </p>
          </div>
          <div className="pkg-price-grid">
            <div className="pkg-price-card">
              <h3 className="pkg-price-name">
                {P10.name}
              </h3>
              <div className="pkg-price-head">
                <span className="pkg-price-original">
                  {won(P10.listPrice)}원
                </span>
                {' '}
                <span className="pkg-price-off">
                  {won(D10.discount)}원 할인 · 약 {D10.discountPercent}% OFF
                </span>
              </div>
              <p className="pkg-price-amount">
                {won(P10.price)}
                <span>
                  원
                </span>
              </p>
              <p className="pkg-price-persession">
                시간당 {won(D10.perHour)}원 상당 · 전담 매니저 선점
              </p>
              <ul className="pkg-price-features">
                <li>
                  2시간 기준 정기 케어 {P10.sessions}회 (총 {P10.hours}시간)
                </li>
                <li>
                  유효기간 구매일로부터 180일
                </li>
                <li>
                  결제 없이 바로 차감 예약
                </li>
              </ul>
              <button type="button" className="pkg-btn is-ghost" id="buyPackage10hBtn" data-original-label={`${P10.label} 구매하기`}>
                {P10.label} 구매하기
              </button>
            </div>
            <div className="pkg-price-card is-featured">
              <span className="pkg-price-badge">
                인기
              </span>
              <h3 className="pkg-price-name">
                {P20.name}
              </h3>
              <div className="pkg-price-head">
                <span className="pkg-price-original">
                  {won(P20.listPrice)}원
                </span>
                {' '}
                <span className="pkg-price-off is-hot">
                  {won(D20.discount)}원 할인 · 약 {D20.discountPercent}% OFF
                </span>
              </div>
              <p className="pkg-price-amount">
                {won(P20.price)}
                <span>
                  원
                </span>
              </p>
              <p className="pkg-price-persession">
                시간당 {won(D20.perHour)}원 상당 · 지정 매니저 우선 배정
              </p>
              <ul className="pkg-price-features">
                <li>
                  2시간 기준 정기 케어 {P20.sessions}회 (총 {P20.hours}시간)
                </li>
                <li>
                  유효기간 구매일로부터 180일
                </li>
                <li>
                  결제 없이 바로 차감 예약
                </li>
                <li>
                  장기 이용 보호자님이 가장 많이 선택하는 패키지
                </li>
              </ul>
              <button type="button" className="pkg-btn is-primary" id="buyPackage20hBtn" data-original-label={`${P20.label} 구매하기`}>
                {P20.label} 구매하기
              </button>
            </div>
          </div>
          <p className="pkg-price-note">
            패키지는 로그인한 계정에 연결되어 보관되며, 구매 즉시 마이페이지의 '내 케어 패키지'에서 잔여 횟수를 확인할 수 있습니다. 로그인하지 않은 상태로 구매를 시도하면 로그인 화면으로 안내됩니다.
          </p>
        </div>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* HOW IT WORKS */}
      {' '}
      {/* ================================================================ */}
      <section className="pkg-section">
        <div className="pkg-wrap">
          <div className="pkg-head">
            <span className="pkg-eyebrow">
              HOW IT WORKS
            </span>
            <h2 className="pkg-h2">
              이용 방법은 세 단계로 충분해요
            </h2>
          </div>
          <div className="pkg-steps">
            <div className="pkg-step">
              <div className="pkg-step-num">
                1
              </div>
              <h3>
                패키지 구매
              </h3>
              <p>
                원하는 회차의 패키지를 선결제합니다.
              </p>
            </div>
            <div className="pkg-step">
              <div className="pkg-step-num">
                2
              </div>
              <h3>
                원클릭 예약
              </h3>
              <p>
                병원 동행 신청서 작성 시 '패키지 차감'을 선택하면 추가 결제 없이 바로 접수돼요.
              </p>
            </div>
            <div className="pkg-step">
              <div className="pkg-step-num">
                3
              </div>
              <h3>
                자동 관리
              </h3>
              <p>
                잔여 횟수와 이용 내역은 마이페이지에서 언제든 한눈에 확인할 수 있어요.
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* FAQ */}
      {' '}
      {/* ================================================================ */}
      <section className="pkg-section is-beige" id="faq">
        <div className="pkg-wrap">
          <div className="pkg-head">
            <span className="pkg-eyebrow">
              FAQ
            </span>
            <h2 className="pkg-h2">
              자주 묻는 질문
            </h2>
          </div>
          <div className="pkg-faq">
            <details>
              <summary>
                패키지 1회는 어떤 서비스에 쓸 수 있나요?
                <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <div className="pkg-faq-body">
                시니어 병원 동행 및 복합 매칭 서비스를 포함하여 원하시는 서비스를 선택해 1회씩 차감하실 수 있습니다. (병원 동행 및 복합 매칭 이용 시 패키지 할인 혜택이 가장 큽니다)
              </div>
            </details>
            <details>
              <summary>
                기본 2시간을 넘기면 어떻게 되나요?
                <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <div className="pkg-faq-body">
                패키지로 예약한 건도 단건 결제와 동일하게 기본 2시간 동행을 기준으로 하며, 현장에서 이를 초과하면 서비스 종류별 초과 요금(30분당 10,000~15,000원,{' '}
                <a href="/#services">
                  이용 요금 안내
                </a>
                {' '}참고)이 자동으로 산정되어 별도로 후불 청구됩니다. 패키지 회차는 기본 2시간 이용분에 대해서만 적용됩니다.
              </div>
            </details>
            <details>
              <summary>
                유효기간이 지나면 남은 회차는 어떻게 되나요?
                <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <div className="pkg-faq-body">
                패키지는 구매일로부터 180일간 사용할 수 있습니다. 유효기간이 지나면 남은 회차는 자동으로 만료 처리되니, 마이페이지에서 잔여 횟수와 만료일을 미리 확인해 주세요.
              </div>
            </details>
            <details>
              <summary>
                환불이 가능한가요?
                <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <div className="pkg-faq-body">
                아직 사용하지 않은 회차에 대해서는 고객센터(010-5530-5760)로 문의해 주시면 환불 절차를 안내드립니다. 이미 사용(차감)된 회차는 환불 대상에서 제외됩니다.
              </div>
            </details>
          </div>
        </div>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* 최종 CTA */}
      {' '}
      {/* ================================================================ */}
      <section className="pkg-cta-band">
        <div className="pkg-wrap">
          <h2>
            지금 패키지로 더 편안한 동행을 시작하세요
          </h2>
          <p>
            결제 한 번으로 준비해 두면, 다음 예약부터는 클릭 한 번이면 충분합니다.
          </p>
          <a href="#pricing" className="pkg-btn is-primary">
            패키지 선택하러 가기
          </a>
        </div>
      </section>
    </main>
    {/* 구매 완료 모달 — 버튼을 눌러야 닫히고 이동합니다 (PackageBehaviors 가 내용을 채움) */}
    <div className="pkg-modal-backdrop" id="pkgPurchaseModal" role="dialog" aria-modal="true" aria-labelledby="pkgPurchaseModalTitle" hidden>
      <div className="pkg-modal">
        <svg className="pkg-modal-icon" width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="28" cy="28" r="27" fill="#F1F6F0" stroke="#78866B" strokeWidth="2"></circle>
          {' '}
          <path d="M17.5 29L24.5 36L38.5 20" stroke="#3B4B3C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
        <h3 id="pkgPurchaseModalTitle">
          패키지 충전이 완료되었습니다!
        </h3>
        <p className="pkg-modal-pkgname" id="pkgPurchaseModalPkgName"></p>
        <p className="pkg-modal-charged" id="pkgPurchaseModalBody"></p>
        <div className="pkg-modal-actions">
          <button type="button" className="pkg-btn is-ghost" id="pkgPurchaseModalMypageBtn">
            마이페이지로 이동
          </button>
          {' '}
          <button type="button" className="pkg-btn is-primary" id="pkgPurchaseModalApplyBtn">
            케어 예약하러 가기
          </button>
        </div>
      </div>
    </div>
    <PackageBehaviors />
    </>
  );
}
