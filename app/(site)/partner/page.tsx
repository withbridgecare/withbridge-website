import './partner.css';
import type { Metadata } from 'next';
import { PartnerForm } from './PartnerForm';

export const metadata: Metadata = {
  title: "기관·기업 제휴",
  description: "요양원·주야간보호센터·복지관·의료기관을 위한 위드브릿지 동행 인력 연계 및 제휴 안내.",
};

/** 기관·기업 제휴 | 위드브릿지 — public/partner.html 에서 옮김 */
export default function PartnerPage() {
  return (
    <main>
      {/* ───────── 1. Hero ───────── */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <span className="badge">
                <span className="dot"></span>
                B2B · 기관 제휴 프로그램
              </span>
              <h1 id="hero-title">
                기관·기업을 위한
                <br />
                맞춤형{' '}
                <em>
                  시니어 병원 동행
                </em>
                <br />
                및 케어 솔루션
              </h1>
              <p className="lead">
                요양원·주야간보호센터·복지관·종합병원, 그리고 임직원 부모님 케어까지. 검증된 전문 동행 매니저와 투명한 진행 리포트로 기관의 돌봄 공백을 안전하게 채웁니다.
              </p>
              <div className="hero-cta">
                <a href="#inquiry" className="btn btn-primary">
                  제휴 문의하기{' '}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6"></path>
                  </svg>
                </a>
                {' '}
                <a href="#process" className="btn btn-ghost">
                  도입 절차 보기
                </a>
              </div>
            </div>
            {/* 실시간 케어 리포트 미리보기 */}
            <div className="report" role="img" aria-label="실시간 병원 동행 진행 리포트 예시: 7단계 중 4단계 진료 동행 진행 중">
              <div className="report-head">
                <div>
                  <small>
                    오늘의 동행 · 기관 대시보드 예시
                  </small>
                  <strong>
                    내과 정기 진료 동행
                  </strong>
                </div>
                <span className="live">
                  <i></i>
                  진행 중
                </span>
              </div>
              <ol className="steps" aria-hidden="true">
                <li className="done">
                  <span className="ic">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10"></path>
                    </svg>
                  </span>
                  매니저 배정 확정
                  <span className="t">
                    08:40
                  </span>
                </li>
                <li className="done">
                  <span className="ic">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10"></path>
                    </svg>
                  </span>
                  기관 출발 · 픽업
                  <span className="t">
                    09:05
                  </span>
                </li>
                <li className="done">
                  <span className="ic">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10"></path>
                    </svg>
                  </span>
                  병원 도착 · 접수
                  <span className="t">
                    09:38
                  </span>
                </li>
                <li className="now">
                  <span className="ic"></span>
                  진료 동행 · 의료진 소견 기록
                  <span className="t">
                    진행 중
                  </span>
                </li>
                <li className="todo">
                  <span className="ic"></span>
                  수납 · 약 처방 수령
                  <span className="t">
                    —
                  </span>
                </li>
                <li className="todo">
                  <span className="ic"></span>
                  기관 복귀 · 인계
                  <span className="t">
                    —
                  </span>
                </li>
                <li className="todo">
                  <span className="ic"></span>
                  케어 리포트 발송
                  <span className="t">
                    —
                  </span>
                </li>
              </ol>
            </div>
          </div>
          {/* 트러스트 프로미스: 초기 단계에 맞춘 약속형 카드 (통계가 쌓이면 수치 카드로 교체) */}
          <ul className="promises">
            <li className="promise featured">
              <div className="p-head">
                <span className="p-ic" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.4 7 18.2l1.2-5.6L4 8.8l5.6-.6z"></path>
                  </svg>
                </span>
                {' '}
                <span className="p-tag">
                  NOW OPEN
                </span>
              </div>
              <h3 className="p-title">
                얼리 파트너 모집
              </h3>
              <p className="p-desc">
                첫 제휴 기관과 운영 방식을{' '}
                <br />
                처음부터 함께 만들어 갑니다
              </p>
            </li>
            <li className="promise">
              <div className="p-head">
                <span className="p-ic" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path>
                  </svg>
                </span>
              </div>
              <h3 className="p-title">
                기관 맞춤 설계
              </h3>
              <p className="p-desc">
                규모·이용자 특성·지역에 맞춘{' '}
                <br />
                기관 전용 플랜을 제안합니다
              </p>
            </li>
            <li className="promise">
              <div className="p-head">
                <span className="p-ic" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7v5l3 2"></path>
                  </svg>
                </span>
              </div>
              <h3 className="p-title">
                7단계 실시간 공유
              </h3>
              <p className="p-desc">
                배정부터 케어 리포트까지{' '}
                <br />
                모든 과정을 투명하게 공유합니다
              </p>
            </li>
            <li className="promise">
              <div className="p-head">
                <span className="p-ic" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <path d="M8 9h8M8 13h5"></path>
                  </svg>
                </span>
              </div>
              <h3 className="p-title">
                대표 직접 상담
              </h3>
              <p className="p-desc">
                문의 후 1영업일 내{' '}
                <br />
                담당자가 직접 회신드립니다
              </p>
            </li>
          </ul>
        </div>
      </section>
      {/* ───────── 2. Core Value ───────── */}
      <section className="block" id="value" aria-labelledby="value-title">
        <div className="wrap">
          <div className="sec-head">
            <div className="eyebrow">
              WHY WITHBRIDGE
            </div>
            <h2 id="value-title">
              기관 담당자의 부담은 덜고,
              <br />
              이용자의 안심은 더합니다
            </h2>
            <p>
              인력 운영, 보호자 소통, 정산까지 — 병원 동행에 필요한 전 과정을 위드브릿지가 책임지고 운영합니다.
            </p>
          </div>
          <div className="values">
            <article className="card value">
              <div className="icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5F6B55" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"></path>
                  <path d="M9 11h6M12 8v6"></path>
                </svg>
              </div>
              <div className="num">
                01
              </div>
              <h3>
                전문 병원 동행 서비스
              </h3>
              <p>
                임직원 부모님과 기관 이용자를 위한 맞춤 동행. 접수부터 진료, 수납, 귀가까지 함께합니다.
              </p>
              <ul>
                <li>
                  정기 진료 · 검진 · 외래 동행
                </li>
                <li>
                  거동 불편 이용자 맞춤 케어
                </li>
              </ul>
            </article>
            <article className="card value">
              <div className="icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5F6B55" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="3" width="16" height="18" rx="3"></rect>
                  <path d="M8 8h8M8 12h8M8 16h5"></path>
                </svg>
              </div>
              <div className="num">
                02
              </div>
              <h3>
                7단계 실시간 공유 &amp; 케어 리포트
              </h3>
              <p>
                배정·픽업·도착·진료·수납·복귀·리포트 7단계를 실시간으로 공유하고, 진료 소견을 정리해 전달합니다.
              </p>
              <ul>
                <li>
                  기관 · 보호자 동시 알림
                </li>
                <li>
                  진료 내용 · 처방 요약 리포트
                </li>
              </ul>
            </article>
            <article className="card value">
              <div className="icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5F6B55" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="3"></rect>
                  <path d="M3 10h18M7 15h4"></path>
                </svg>
              </div>
              <div className="num">
                03
              </div>
              <h3>
                행정 · 정산 절차 간소화
              </h3>
              <p>
                건별 결제 대신 기관 단위 월 통합 정산. 증빙 서류와 이용 내역을 한 번에 받아보세요.
              </p>
              <ul>
                <li>
                  월간 통합 청구 · 세금계산서
                </li>
                <li>
                  이용 내역 · 증빙 자료 제공
                </li>
              </ul>
            </article>
            <article className="card value">
              <div className="icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5F6B55" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"></path>
                  <path d="M9 12l2 2 4-4"></path>
                </svg>
              </div>
              <div className="num">
                04
              </div>
              <h3>
                전담 매니저 배정 · 안전 보장
              </h3>
              <p>
                기관별 전담 운영 매니저가 배정되어 일정 조율부터 이슈 대응까지 하나의 창구로 관리합니다.
              </p>
              <ul>
                <li>
                  검증된 동행 매니저 배치
                </li>
                <li>
                  기관 전담 커뮤니케이션 창구
                </li>
              </ul>
            </article>
          </div>
          <div className="card audience">
            <strong>
              이런 기관과 함께합니다
            </strong>
            {' '}
            <span className="chip">
              요양원
            </span>
            <span className="chip">
              주야간보호센터
            </span>
            <span className="chip">
              노인복지관
            </span>
            <span className="chip">
              종합병원 · 의료기관
            </span>
            <span className="chip">
              기업 임직원 복지
            </span>
          </div>
        </div>
      </section>
      {/* ───────── 3. Process ───────── */}
      <section className="block alt" id="process" aria-labelledby="process-title">
        <div className="wrap">
          <div className="sec-head">
            <div className="eyebrow">
              HOW IT PARTNERED
            </div>
            <h2 id="process-title">
              문의부터 운영까지,
              <br />
              4단계로 간단하게
            </h2>
            <p>
              기관의 규모와 이용자 특성에 맞춰 플랜을 설계하고, 오픈 이후에도 매월 함께 점검합니다.
            </p>
          </div>
          <ol className="process" style={{ listStyle: "none", margin: "0", padding: "0" }}>
            <li className="card pstep">
              <div className="top">
                <span className="n">
                  1
                </span>
                <span className="dur">
                  1영업일 내 회신
                </span>
              </div>
              <h3>
                제휴 문의 접수
              </h3>
              <p>
                아래 양식으로 기관 정보와 필요한 서비스를 남겨주시면 담당 매니저가 연락드립니다.
              </p>
            </li>
            <li className="card pstep">
              <div className="top">
                <span className="n">
                  2
                </span>
                <span className="dur">
                  맞춤 설계
                </span>
              </div>
              <h3>
                맞춤형 협약 및 플랜 설계
              </h3>
              <p>
                이용 인원·빈도·지역을 바탕으로 기관 전용 요금제와 운영 방식을 제안하고 협약을 체결합니다.
              </p>
            </li>
            <li className="card pstep">
              <div className="top">
                <span className="n">
                  3
                </span>
                <span className="dur">
                  전담 매니저 배정
                </span>
              </div>
              <h3>
                서비스 오픈 및 운영
              </h3>
              <p>
                전담 매니저가 배정되고, 기관 담당자 또는 보호자가 바로 동행을 신청할 수 있습니다.
              </p>
            </li>
            <li className="card pstep last">
              <div className="top">
                <span className="n">
                  4
                </span>
                <span className="dur">
                  매월 정기
                </span>
              </div>
              <h3>
                월간 리포트 및 정산
              </h3>
              <p>
                월별 이용 현황 리포트와 통합 정산서를 제공하고, 운영 개선 사항을 함께 점검합니다.
              </p>
            </li>
          </ol>
        </div>
      </section>
      {/* ───────── 4. Inquiry ───────── */}
      <section className="block" id="inquiry" aria-labelledby="inq-title">
        <div className="wrap">
          <div className="card inquiry">
            <aside className="inq-side">
              <div className="eyebrow">
                PARTNERSHIP INQUIRY
              </div>
              <h2 id="inq-title">
                제휴 및 입점 문의
              </h2>
              <p>
                기관에 꼭 맞는 운영 방식을 함께 설계해 드립니다. 부담 없이 문의를 남겨주세요.
              </p>
              <ul className="next">
                <li>
                  <span className="k">
                    1
                  </span>
                  <div>
                    <b>
                      문의 확인
                    </b>
                    <span>
                      접수 즉시 담당 매니저에게 전달됩니다
                    </span>
                  </div>
                </li>
                <li>
                  <span className="k">
                    2
                  </span>
                  <div>
                    <b>
                      유선 상담
                    </b>
                    <span>
                      1영업일 내 기재하신 연락처로 연락드립니다
                    </span>
                  </div>
                </li>
                <li>
                  <span className="k">
                    3
                  </span>
                  <div>
                    <b>
                      제안서 전달
                    </b>
                    <span>
                      기관 맞춤 플랜과 견적을 보내드립니다
                    </span>
                  </div>
                </li>
              </ul>
              <div className="contact">
                <div>
                  <span>
                    고객센터
                  </span>
                  <a href="tel:01055305760">
                    010-5530-5760
                  </a>
                </div>
                <div>
                  <span>
                    이메일
                  </span>
                  <a href="mailto:withbridge.care@outlook.kr">
                    withbridge.care@outlook.kr
                  </a>
                </div>
                <div>
                  <span>
                    상담 시간
                  </span>
                  <span>
                    평일 08:00 – 18:00 (주말·공휴일 휴무)
                  </span>
                </div>
              </div>
            </aside>
            <PartnerForm />
          </div>
        </div>
      </section>
    </main>
  );
}
