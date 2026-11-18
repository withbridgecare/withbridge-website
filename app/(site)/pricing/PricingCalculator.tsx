'use client';

/**
 * 예상 요금 계산기 + 모바일 하단 고정 요약 바 (예전 js/price-calculator.js 를 React 로 옮김).
 * 금액·서비스 목록은 lib/pricing.ts 한 곳에서 가져옵니다.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/site/AuthProvider';
import { estimatePrice, formatExtraDuration, formatWon, MAX_EXTRA_UNITS, NIGHT_SURCHARGE_RATE, SERVICES, URGENT_MATCHING_FEE } from '@/lib/pricing';
import { ROUTES } from '@/lib/config';

export function PricingCalculator() {
  const { goIfLoggedIn } = useAuth();
  const [serviceIdx, setServiceIdx] = useState(0);
  const [extraUnits, setExtraUnits] = useState(0);
  const [urgent, setUrgent] = useState(false);
  const [night, setNight] = useState(false);
  const [stickyHidden, setStickyHidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const resultBarRef = useRef<HTMLDivElement>(null);

  const service = SERVICES[serviceIdx];
  const est = estimatePrice({ service, extraUnits, urgent, night });
  const totalH = Math.floor(est.totalMinutes / 60);
  const totalM = est.totalMinutes % 60;

  // 신청서로 넘길 주소: 서비스 유형 + 긴급 매칭 여부 (추가 시간·할증은 신청서에 입력란이 없어 넘기지 않음)
  const params = new URLSearchParams({ service: service.name });
  if (urgent) params.set('urgent', '1');
  const bookHref = ROUTES.apply + '?' + params.toString();

  // 계산 결과 바가 보이는 동안에는 모바일 하단 고정 바를 숨김
  useEffect(() => {
    const el = resultBarRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => setStickyHidden(entries[0].isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className="wb-calc-widget">
        <div className="wb-calc-widget-body">
          <div className="wb-calc-field">
            <label>1. 서비스 유형 선택</label>
            <div className="wb-service-cards" id="wb-service-cards">
              {SERVICES.map((s, i) => (
                <span key={s.name} style={{ display: 'contents' }}>
                  {i > 0 && ' '}
                  <button
                    type="button"
                    className={'wb-service-card' + (i === serviceIdx ? ' is-selected' : '')}
                    onClick={() => {
                      setServiceIdx(i);
                      if (s.baseMinutes === 60) setExtraUnits(0);
                    }}
                  >
                    {s.badge && <span className="wb-service-card-badge">{s.badge}</span>}
                    {s.badge && ' '}
                    <span className="wb-service-card-name">{s.shortName}</span>{' '}
                    <span className="wb-service-card-price">{formatWon(s.basePrice)}</span>
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="wb-calc-row-2">
            <div className="wb-calc-field">
              <label id="wb-extra-time-label">{est.isOneHour ? '2. 추가 이용 시간' : '2. 추가 이용 시간 (기본 2시간 외)'}</label>
              <div className="wb-stepper">
                <button
                  type="button"
                  className="wb-stepper-btn"
                  aria-label="추가 시간 줄이기"
                  disabled={est.isOneHour || est.units <= 0}
                  onClick={() => setExtraUnits((u) => Math.max(0, u - 1))}
                >
                  &minus;
                </button>{' '}
                <span className="wb-stepper-value-wrap">
                  <span className="wb-stepper-value">{formatExtraDuration(est.units)}</span>{' '}
                  <span className="wb-stepper-total">총 {totalH}시간{totalM ? ' ' + totalM + '분' : ''}</span>
                </span>{' '}
                <button
                  type="button"
                  className="wb-stepper-btn"
                  aria-label="추가 시간 늘리기"
                  disabled={est.isOneHour || est.units >= MAX_EXTRA_UNITS}
                  onClick={() => setExtraUnits((u) => Math.min(MAX_EXTRA_UNITS, u + 1))}
                >
                  +
                </button>
              </div>
              <p className="wb-stepper-hint" hidden={!est.isOneHour}>
                1시간 상품은 시간 추가가 불가합니다.
              </p>
            </div>
            <div className="wb-calc-field">
              <label>3. 선택 옵션 및 할증 적용</label>
              <div className="wb-checkbox-group">
                <label className="wb-checkbox-label">
                  <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />{' '}
                  <span className="wb-checkbox-text">긴급 매칭 서비스 (+{URGENT_MATCHING_FEE.toLocaleString('ko-KR')}원)</span>
                </label>{' '}
                <label className="wb-checkbox-label">
                  <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} />{' '}
                  <span className="wb-checkbox-text">주말 / 야간 / 공휴일 이용 (기본금 {NIGHT_SURCHARGE_RATE * 100}% 할증)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="wb-calc-total-bar" ref={resultBarRef}>
          <div>
            <span className="wb-calc-total-label">총 예상 서비스 요금</span>{' '}
            <span className="wb-calc-total-price">{formatWon(est.total)}</span>{' '}
            <small className="wb-calc-total-note">
              * 실비(교통비, 주차비 등)는 별도로 부과될 수 있습니다. 첫 이용 웰컴 쿠폰(5,000원)은 결제 단계에서 별도로 적용됩니다.
            </small>
          </div>
          <a href={bookHref} className="wb-calc-cta" onClick={(e) => goIfLoggedIn(e, bookHref)}>
            이 조건으로 바로 예약하기 →
          </a>
        </div>
      </div>

      {/* 모바일 하단 고정 요약 바 — 예전처럼 <main> 바깥(body 바로 아래)에 둬야 글자 스타일이 같습니다 */}
      {mounted && createPortal(
      <div className={'pp-sticky' + (stickyHidden ? ' is-hidden' : '')}>
        <button
          type="button"
          className="pp-sticky-sum"
          aria-label="요금 계산기로 이동"
          onClick={() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span className="pp-sticky-label">총 예상 요금 · 계산기 보기</span>
          <span className="pp-sticky-price">{formatWon(est.total)}</span>
        </button>
        <a href={bookHref} className="pp-sticky-btn" onClick={(e) => goIfLoggedIn(e, bookHref)}>
          예약하기
        </a>
      </div>,
      document.body,
      )}
    </>
  );
}
