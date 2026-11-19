import './mypage.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { MypageBehaviors } from './MypageBehaviors';

export const metadata: Metadata = {
  title: '마이페이지',
  robots: { index: false, follow: false },
};

/**
 * 보호자 마이페이지 — public/mypage.html 에서 옮김.
 * 화면 마크업은 여기, 동작(예약 목록·결제·케어 리포트·어르신 프로필 등)은 mypageScript.ts 에 있습니다.
 */
export default function MypagePage() {
  return (
    <>
      <NotoSansKr />
    <main className="mp-main">
      <div className="mp-loading" id="loading" role="status">
        마이페이지를 불러오는 중입니다…
      </div>
      <div className="mp-stack" id="app" hidden>
        {/* ================================================================ */}
        {' '}
        {/* 02. 보호자(고객) 화면 (#guardianView) */}
        {' '}
        {/* ================================================================ */}
        <div className="mp-stack" id="guardianView">
          {/* 패키지 구매 완료 안내 배너 — package.html 결제 완료 후 돌아오면 checkPackagePurchaseBanner() 가 채우고 보여줍니다. 평소엔 hidden. */}
          <div className="package-purchase-banner" id="packagePurchaseBanner" role="status" hidden>
            <span className="package-purchase-banner-icon" aria-hidden="true">
              ✓
            </span>
            <p className="package-purchase-banner-text" id="packagePurchaseBannerText"></p>
            <button type="button" className="package-purchase-banner-close" id="packagePurchaseBannerClose" aria-label="닫기">
              ✕
            </button>
          </div>
          {/* 1순위: 프로필 & 내 혜택 통합 카드 — 기존에 분리돼 있던 '프로필'과 '내 혜택 정보'를 하나의 대형 카드로 합쳤습니다. 좌측 아바타/이름/상태, 우측 쿠폰·적립금 요약(flex-row). 쿠폰 칸을 누르면 카드 아래로 뜨는 레이어(.benefit-coupon-list)에 상세 목록이 펼쳐집니다(loadBenefitSummary 참고). */}
          <section className="card mp-header" aria-labelledby="welcomeTitle">
            <div className="profile-main">
              <div className="profile-avatar" id="guardianAvatar" aria-hidden="true"></div>
              <div style={{ minWidth: "0" }}>
                <p className="profile-role">
                  보호자님, 안녕하세요
                </p>
                <div className="profile-id-row">
                  <h1 className="profile-name" id="welcomeTitle"></h1>
                  {/* 지금 진행 중인 케어가 있는지에 따라 자동으로 채워지는 표시 전용 상태 배지 (updateGuardianStatusBadge 참고) */}
                  {' '}
                  <span className="status-tag" id="guardianStatusBadge" hidden></span>
                </div>
                <p className="profile-email" id="welcomeEmail"></p>
              </div>
            </div>
            {/* 내 혜택 정보: 지금 사용 가능한 쿠폰 수(user_coupons, status='active' & 미만료) · 보유 적립금(profiles.points_balance). 칸을 펼치면 미사용/사용 완료/기간 만료를 포함한 쿠폰 전체 내역이 뜹니다(loadBenefitSummary 참고). */}
            <div className="mp-header-benefits" id="benefitSection" hidden>
              <div className="benefit-stats">
                <button type="button" className="benefit-stat is-toggle" id="benefitCouponStat" aria-expanded="false" aria-controls="benefitCouponList">
                  <span className="benefit-stat-top">
                    <span className="benefit-stat-label">
                      보유 쿠폰
                    </span>
                    {' '}
                    <span className="benefit-stat-chevron" id="benefitCouponChevron"></span>
                  </span>
                  {' '}
                  <span className="benefit-stat-value" id="benefitCouponCount">
                    -
                  </span>
                </button>
                <div className="benefit-stat">
                  <span className="benefit-stat-top">
                    <span className="benefit-stat-label">
                      적립금
                    </span>
                  </span>
                  {' '}
                  <span className="benefit-stat-value" id="benefitPointsBalance">
                    -
                  </span>
                </div>
              </div>
              <div className="benefit-coupon-list" id="benefitCouponList" hidden></div>
            </div>
          </section>
          {/* 2순위: 추가 요금 결제 안내 (기본 요금 선결제 + 초과 시 추가 요금 정산) — 관리자가 admin.html 에서 청구하면 나타납니다. '진행 중인 케어' 카드는 완료 후 일정 시간이 지나면 목록에서 빠지지만 (careReportBuffer), 추가 요금은 결제 전까지 그와 무관하게 항상 여기 보여야 해서 별도 섹션으로 둡니다. 신청 목록을 다시 안 불러와도 되도록 loadExtraCharges() 가 독립적으로 조회합니다. */}
          <section className="card extra-charge-card" id="extraChargeSection" aria-labelledby="extraChargeTitle" hidden>
            <div className="card-head">
              <h2 className="card-title" id="extraChargeTitle">
                추가 요금 결제 안내
              </h2>
              <div className="head-right">
                <span className="badge is-warn" id="extraChargeCount" hidden></span>
              </div>
            </div>
            <div id="extraChargeList"></div>
          </section>
          {/* 3순위: 내 케어 패키지 (5회권/10회권 선결제, sql/user_packages_system.sql) — 구매/상세 안내는 전용 랜딩 페이지(package.html)로 옮겼습니다. 여기서는 보유 잔여 횟수 요약과 그 페이지로 가는 링크만 보여줍니다. */}
          <section className="card" id="packageSection" aria-labelledby="packageTitle" hidden>
            <div className="card-head">
              <h2 className="card-title" id="packageTitle">
                내 케어 패키지
              </h2>
              <div className="head-right">
                <a href="/package" className="btn btn-sm package-cta-btn">
                  케어 패키지 안내 및 구매하기 ➔
                </a>
              </div>
            </div>
            <p className="package-remaining-line">
              현재 보유 잔여 시간
              <b id="packageRemainingTotal">
                0시간 (0회분)
              </b>
            </p>
            <p className="package-hint">
              패키지 구매 시 신청서 작성 시 결제 없이 바로 예약 가능합니다.
            </p>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 4순위: 업무 탭 — [진행 중인 케어](케어 현황 메인 영역) · [어르신 프로필 관리] · [지난 이용 내역] */}
          {' '}
          {/* mypage-manager.html 의 .mgr-tabs 와 동일한 세그먼트 탭 UI 로 통합했습니다. */}
          {' '}
          {/* ================================================================ */}
          <div className="mgr-tabs">
            <div className="mgr-tab-list" role="tablist" aria-label="보호자 업무">
              <span className="mgr-tab-pill" id="mpTabPill" aria-hidden="true"></span>
              {' '}
              <button type="button" className="mgr-tab is-active" id="tabBtnCare" role="tab" aria-selected="true" aria-controls="careSection">
                <span className="mgr-tab-label">
                  진행 중인 케어
                </span>
              </button>
              {' '}
              <button type="button" className="mgr-tab" id="tabBtnSeniors" role="tab" aria-selected="false" aria-controls="seniorSection" tabIndex={-1}>
                <span className="mgr-tab-label">
                  어르신 프로필 관리
                </span>
              </button>
              {' '}
              <button type="button" className="mgr-tab" id="tabBtnHistory" role="tab" aria-selected="false" aria-controls="careCalendarSection" tabIndex={-1}>
                <span className="mgr-tab-label">
                  지난 이용 내역
                </span>
              </button>
            </div>
            {/* 진행 중인 케어: 실시간 / 예정 케어 현황 */}
            <div className="mgr-tab-panel" id="careSection" role="tabpanel" aria-labelledby="tabBtnCare" tabIndex={0}>
              <section className="card" aria-labelledby="careTitle">
                <div className="card-head">
                  <h2 className="card-title" id="careTitle">
                    케어 현황
                  </h2>
                  <div className="head-right">
                    <span className="badge" id="careBadge">
                      예정된 케어 없음
                    </span>
                    {' '}
                    {/* 신청 내역이 있을 때만 표시 (없으면 아래 빈 상태 카드의 '동행 서비스 신청하기' 버튼을 사용) */}
                    {' '}
                    <a className="btn btn-sm card-head-btn" id="applyMoreBtn" href="/apply" hidden>
                      + 추가 신청
                    </a>
                  </div>
                </div>
                <div id="careBody"></div>
              </section>
            </div>
            {/* 어르신 프로필 관리 */}
            <div className="mgr-tab-panel" id="seniorSection" role="tabpanel" aria-labelledby="tabBtnSeniors" tabIndex={0} hidden>
              <section className="card" aria-labelledby="seniorTitle">
                <div className="card-head">
                  <h2 className="card-title" id="seniorTitle">
                    어르신 프로필 관리
                  </h2>
                  {/* 등록된 어르신이 1명 이상일 때만 표시 (없으면 아래 빈 상태 카드의 '+ 어르신 등록하기' 버튼을 사용) */}
                  {' '}
                  <button type="button" className="btn btn-sm card-head-btn" id="addSeniorBtn" hidden>
                    + 어르신 추가 등록
                  </button>
                </div>
                <div id="seniorList"></div>
              </section>
            </div>
            {/* 지난 이용 내역: 월간 캘린더 (mypage-manager.html 의 달력 모듈을 보호자용으로 이식) */}
            <div className="mgr-tab-panel" id="careCalendarSection" role="tabpanel" aria-labelledby="tabBtnHistory" tabIndex={0} hidden>
              <section className="card" aria-labelledby="careCalendarTitle">
                <div className="card-head">
                  <h2 className="card-title" id="careCalendarTitle">
                    이용 내역 & 케어 리포트
                  </h2>
                </div>
                <div className="cal-filter-bar" id="careHistoryFilterBar" role="group" aria-label="이용 내역 필터">
                  <button type="button" className="cal-filter-chip is-active" data-filter="all">
                    전체
                  </button>
                  {' '}
                  <button type="button" className="cal-filter-chip" data-filter="done">
                    이용 완료
                  </button>
                  {' '}
                  <button type="button" className="cal-filter-chip" data-filter="cancel">
                    취소/환불
                  </button>
                </div>
                <div id="careCalendar"></div>
              </section>
            </div>
          </div>
        </div>
        {/* /#guardianView */}
      </div>
    </main>
    {/* 케어 매니저 지원 배너 — index.html 'B2B 제휴 전환 배너'(.wb-b2b-*)와 같은 구조로 통일: <main> 밖 (.mp-main 의 max-width 제한과 무관)에 둬서 화면 전체 너비를 채우는 풀블리드 섹션이고, 안쪽 카드만 max-width 로 다시 중앙 정렬합니다. 케어 현황/내역 다음, FAQ·푸터 이전 순서는 그대로 유지합니다. */}
    <section className="mgr-recruit-full">
      <div className="mgr-recruit-inner">
        <div className="mgr-recruit-card" aria-labelledby="managerRecruitTitle">
          <div className="mgr-recruit-copy">
            <span className="mgr-recruit-eyebrow">
              <i aria-hidden="true"></i>
              케어 매니저 모집
            </span>
            <h2 className="mgr-recruit-title" id="managerRecruitTitle">
              어르신에게 안심을 선물하고, 자율적으로 일하세요
            </h2>
            <p className="mgr-recruit-desc">
              위드브릿지 케어 매니저로 함께할 분을 찾습니다.
            </p>
            <ul className="mgr-recruit-chips" aria-label="케어 매니저 혜택">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {' '}자율 스케줄
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1" y="4" width="22" height="16" rx="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                {' '}투명한 정산
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
                {' '}실시간 비상 대응 및 안전 매뉴얼 지원
              </li>
            </ul>
          </div>
          <div className="mgr-recruit-actions">
            <a href="manager-landing" className="mgr-recruit-btn">
              케어 매니저 혜택 보고 지원하기{' '}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6"></path>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
    {/* 자주 묻는 질문 & 1:1 고객센터 문의 안내 — <main> 밖(.mp-main 의 max-width 제한과 무관)에 둬서 화면 전체 너비를 채우는 풀블리드 섹션입니다. 카드 박스 없이, 안쪽 .guardian-support-banner-inner 가 위 케어 매니저 모집 배너(.mgr-recruit-inner)와 같은 max-width/좌우 패딩으로 정렬을 맞추고, 섹션 세로 패딩(96px)·제목/본문/버튼/체크리스트 폰트 크기도 그 배너와 체급을 맞춰 하단 패밀리 컴포넌트로 자연스럽게 이어지게 합니다. 예전엔 이 자리가 '케어 매니저 지원하기(구직용)' 배너였지만, 보호자 마이페이지를 보는 사람은 구직 희망자가 아니라 이미 서비스를 쓰는 보호자라 맥락이 맞지 않았습니다 — 모든 콘텐츠가 끝난 뒤 바로 아래 푸터로 이어지는 이 자리는, 보호자가 결제·일정 등을 보다가 궁금한 점이 생겼을 때 바로 쓸 수 있는 FAQ·상담 연결로 바꿨습니다. */}
    <section className="guardian-support-banner-full">
      <div className="guardian-support-banner-inner">
        <div className="guardian-support-banner" aria-labelledby="guardianSupportBannerTitle">
          <div>
            <h2 className="guardian-support-banner-title" id="guardianSupportBannerTitle">
              자주 묻는 질문 &amp; 1:1 고객센터 문의
            </h2>
            <p className="guardian-support-banner-text">
              결제·환불, 일정 변경, 매니저 배정 등 궁금한 점이 있다면 FAQ를 먼저 확인하거나 운영팀에 편하게 물어보세요.
            </p>
            <div className="guardian-support-banner-ctas">
              <a href="/#faq" className="guardian-support-banner-cta">
                자주 묻는 질문 보기{' '}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7"></path>
                </svg>
              </a>
              {' '}
              <a href="http://pf.kakao.com/_PKxemX" target="_blank" rel="noopener noreferrer" className="guardian-support-banner-cta guardian-support-banner-cta-ghost">
                카카오톡 1:1 상담
              </a>
            </div>
          </div>
          <ul className="guardian-support-banner-checks">
            <li>
              <span className="guardian-support-check-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
              {' '}결제/환불 관련 안내
            </li>
            <li>
              <span className="guardian-support-check-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
              {' '}케어 일정 변경·취소 문의
            </li>
            <li>
              <span className="guardian-support-check-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
              {' '}평일 08:00~18:00 상담 가능
            </li>
          </ul>
        </div>
      </div>
    </section>
    {/* ==================================================================== 11. 하단 푸터 (Footer) ==================================================================== */}
    {' '}
    {/* ==================================================================== */}
    {' '}
    {/* 05. 어르신 추가 등록 모달 */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="seniorModal" hidden>
      <form className="modal modal-senior" id="seniorForm" role="dialog" aria-modal="true" aria-labelledby="seniorModalTitle" noValidate>
        <div className="modal-senior-header">
          <div>
            <h3 id="seniorModalTitle">
              어르신 추가 등록
            </h3>
            <p className="modal-sub">
              원활한 병원 동행을 위해 필수 정보를 입력해 주세요.
            </p>
          </div>
          <button type="button" className="modal-senior-close" id="seniorModalCloseBtn" aria-label="닫기"></button>
        </div>
        <div className="modal-senior-body">
          <div className="form-section">
            <h4 className="form-section-title">
              기본 정보
            </h4>
            <div className="field">
              <label htmlFor="seniorName">
                어르신 성함 *
              </label>
              {' '}
              <input type="text" id="seniorName" placeholder="예: 홍길동" autoComplete="off" maxLength={30} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>
                  성별 (선택)
                </label>
                <div className="chip-group" role="radiogroup" aria-label="성별">
                  <label className="chip-option">
                    <input type="radio" name="seniorGender" defaultValue="남" />
                    <span>
                      남
                    </span>
                  </label>
                  {' '}
                  <label className="chip-option">
                    <input type="radio" name="seniorGender" defaultValue="여" />
                    <span>
                      여
                    </span>
                  </label>
                </div>
              </div>
              <div className="field">
                <label htmlFor="seniorBirth">
                  생년월일
                </label>
                {' '}
                <input type="date" id="seniorBirth" />
              </div>
            </div>
            <div className="field-pair">
              <div className="field">
                <label htmlFor="seniorAddress">
                  거주지 주소 *
                </label>
                <div className="field-search-row">
                  <input type="text" id="seniorAddress" readOnly autoComplete="off" maxLength={120} placeholder="주소 검색 버튼을 눌러 주소를 선택해 주세요" />
                  {' '}
                  <button type="button" className="field-search-btn" id="seniorAddressSearchBtn">
                    주소 검색
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="seniorAddressDetail">
                  상세 주소 (동/호수 등) (선택)
                </label>
                {' '}
                <input type="text" id="seniorAddressDetail" placeholder="예: 101동 1502호" autoComplete="off" maxLength={60} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="seniorPhone">
                어르신 연락처 (선택)
              </label>
              {' '}
              <input type="tel" id="seniorPhone" placeholder="예: 010-1234-5678" autoComplete="off" inputMode="numeric" maxLength={13} />
              <div className="field-checkbox-row">
                <input type="checkbox" id="seniorPhoneSameAsGuardian" />
                {' '}
                <label htmlFor="seniorPhoneSameAsGuardian">
                  보호자 연락처와 동일
                </label>
              </div>
            </div>
          </div>
          <div className="form-section">
            <h4 className="form-section-title">
              건강 / 동행 정보
            </h4>
            <div className="field">
              <label>
                거동 상태 상세 (선택)
              </label>
              {' '}
              {/* value 는 apply.html '어르신 거동 상태' 라디오와 같은 네 값을 그대로 씁니다(저장은 이 값으로, 화면 표시 문구만 여기서 조금 더 구체적으로 풀어 씀) — loadSeniorProfiles() 가 이 값으로 apply.html 의 라디오를 그대로 선택해 줍니다. */}
              <div className="chip-group" role="radiogroup" aria-label="거동 상태 상세">
                <label className="chip-option">
                  <input type="radio" name="seniorMobility" defaultValue="혼자 걸음 가능" />
                  <span>
                    독립 보행 가능
                  </span>
                </label>
                {' '}
                <label className="chip-option">
                  <input type="radio" name="seniorMobility" defaultValue="지팡이·보행기 사용" />
                  <span>
                    지팡이 이용
                  </span>
                </label>
                {' '}
                <label className="chip-option">
                  <input type="radio" name="seniorMobility" defaultValue="휠체어 사용" />
                  <span>
                    휠체어 이용
                  </span>
                </label>
                {' '}
                <label className="chip-option">
                  <input type="radio" name="seniorMobility" defaultValue="매니저 부축 필수" />
                  <span>
                    매니저 부축 필수
                  </span>
                </label>
              </div>
            </div>
            <div className="field-pair">
              <div className="field">
                <label htmlFor="frequentHospital">
                  자주 가는 병원 (선택)
                </label>
                <div className="field-search-row">
                  <input type="text" id="frequentHospital" readOnly autoComplete="off" maxLength={60} placeholder="병원 검색 버튼을 눌러 병원을 선택해 주세요" />
                  {' '}
                  <button type="button" className="field-search-btn" id="frequentHospitalSearchBtn">
                    병원 검색
                  </button>
                </div>
                {/* 검색 모달에서 고른 결과의 실제 주소 확인용 — DB에는 저장하지 않고 화면 안내로만 씁니다 */}
                <p className="field-addr-note" id="frequentHospitalAddrNote" hidden></p>
              </div>
              <div className="field">
                <label htmlFor="frequentHospitalDetail">
                  상세 위치 (진료과, 층수 등) (선택)
                </label>
                {' '}
                <input type="text" id="frequentHospitalDetail" placeholder="예: 2층 내과" autoComplete="off" maxLength={60} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="healthNote">
                특이사항 (선택)
              </label>
              {' '}
              <textarea id="healthNote" placeholder="예: 지팡이 사용, 화장실 보조 필요 등" maxLength={300}></textarea>
            </div>
          </div>
          <p className="form-error" id="seniorFormError" role="alert" hidden></p>
        </div>
        <div className="modal-actions modal-senior-footer">
          <button type="button" className="btn btn-ghost" id="seniorCancelBtn">
            취소
          </button>
          {' '}
          <button type="submit" className="btn" id="seniorSaveBtn">
            저장하기
          </button>
        </div>
      </form>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-1. 이동 인증 내역 보기 모달 (매니저가 남긴 GPS/사진 인증) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="verifyViewModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="verifyViewTitle">
        <h3 id="verifyViewTitle">
          인증 내역
        </h3>
        <p className="modal-sub" id="verifyViewSub"></p>
        <div className="field" id="verifyViewLocationBox" hidden>
          <label>
            GPS 위치 인증
          </label>
          <p className="form-hint" id="verifyViewLocationText" style={{ margin: "0 0 10px" }}></p>
          <a className="btn btn-sm btn-ghost" id="verifyViewMapLink" target="_blank" rel="noopener noreferrer">
            지도에서 보기
          </a>
        </div>
        <div className="field" id="verifyViewPhotoBox" hidden>
          <label>
            인증 사진
          </label>
          {' '}
          <img id="verifyViewPhoto" alt="매니저가 남긴 인증 사진" style={{ width: "100%", borderRadius: "12px", display: "block", border: "1px solid var(--brand-line)" }} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" id="verifyViewCloseBtn">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-1c. 담당 매니저 정보 모달 (카드의 [매니저 정보 확인하기] 버튼으로 엶 — 이름·자격·연락처를 텍스트로만 보여주는 정보 확인용이라 [닫기] 외 버튼은 없음. 실제 운영팀 문의는 별도의 '운영팀 문의하기' 모달이 담당) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="managerInfoModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="managerInfoTitle">
        <h3 id="managerInfoTitle">
          담당 매니저 정보
        </h3>
        <p className="modal-sub" id="managerInfoSub"></p>
        <dl className="kv" id="managerInfoBody" style={{ marginBottom: "18px" }}></dl>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="managerInfoCloseBtn">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-1b. 이용 내역 요약 모달 ("결제 영수증 보기" — 실제 결제/영수증 연동 전까지, 신청 정보를 요약해 보여주는 자리표시자입니다. 실제 세금계산서/영수증이 아님을 본문에 명확히 안내합니다.) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="receiptModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="receiptModalTitle">
        <h3 id="receiptModalTitle">
          이용 내역 요약
        </h3>
        <p className="modal-sub">
          실제 결제 영수증이 아닌 이용 내역 요약이에요. 정식 영수증이 필요하시면 고객센터로 문의해 주세요.
        </p>
        <dl className="kv receipt-kv" id="receiptSummaryBody"></dl>
        <div className="modal-actions">
          <button type="button" className="btn" id="receiptModalCloseBtn">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-2. 케어 리포트 보기 모달 (읽기 전용 — 전문 시니어 케어 리포트 양식) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="careReportViewModal" hidden>
      <div className="modal rv-modal" role="dialog" aria-modal="true" aria-labelledby="careReportViewTitle">
        <h3 id="careReportViewTitle">
          케어 리포트
        </h3>
        <p className="modal-sub">
          담당 매니저가 작성한 동행 기록이에요.
        </p>
        {/* 1. 헤더 및 동행 정보 카드: 서비스명·장소 / 담당 매니저 / 제출 일시 */}
        <div className="rv-meta-card">
          <div className="rv-meta-row">
            <span className="rv-meta-label">
              서비스명 및 장소
            </span>
            {' '}
            <span className="rv-meta-value" id="careReportViewServicePlace"></span>
          </div>
          <div className="rv-meta-row">
            <span className="rv-meta-label">
              담당 매니저
            </span>
            {' '}
            <span className="rv-meta-value" id="careReportViewManager"></span>
          </div>
          <div className="rv-meta-row">
            <span className="rv-meta-label">
              제출 일시
            </span>
            {' '}
            <span className="rv-meta-value" id="careReportViewSubmitted"></span>
          </div>
        </div>
        {/* 2. 동행 타임라인: 출발 → 병원 도착 → 진료 완료 → 귀가 완료 */}
        <div className="rv-section">
          <h4 className="rv-section-title">
            동행 타임라인
          </h4>
          <ol className="rv-timeline" id="careReportViewTimeline" aria-label="동행 타임라인"></ol>
        </div>
        {/* AI 케어 리포트 — care_reports.ai_message 가 있는(매니저가 새 리포트 작성 모달로 작성한) 건만 보여줍니다 */}
        <div className="rv-section" id="careReportViewAiSection" hidden>
          <h4 className="rv-section-title">
            케어 리포트
          </h4>
          <div className="rv-tags" id="careReportViewQuickTags" hidden></div>
          <p className="rv-memo" id="careReportViewMemo" hidden></p>
          <div className="rv-text-box" id="careReportViewAiMessage"></div>
        </div>
        {/* 3. 진료 및 약제 핵심 정보 (생활 편의 대행이면 '대행 업무 수행 내용 및 특이사항'으로 제목만 바뀜) */}
        <div className="rv-section" id="careReportViewLegacySection">
          <h4 className="rv-section-title" id="careReportViewPhysicianNotesTitle">
            진료 소견 · 의사 안내사항
          </h4>
          <div className="rv-text-box" id="careReportViewPhysicianNotes"></div>
        </div>
        <div className="rv-next-visit" id="careReportViewNextVisitBox" hidden>
          <div className="rv-next-visit-row">
            <span className="rv-next-visit-label">
              다음 병원 방문 예정일
            </span>
            {' '}
            <span className="rv-next-visit-badge" id="careReportViewNextVisit"></span>
          </div>
          <button type="button" className="rv-rebook-btn" id="careReportViewRebookBtn">
            다음 진료 동행 간편 예약하기
          </button>
        </div>
        <div className="rv-section" id="careReportViewMedicationSection" hidden>
          <h4 className="rv-section-title">
            처방약 안내 및 복용법
          </h4>
          <div className="rv-text-box" id="careReportViewMedication"></div>
        </div>
        {/* 4. 어르신 컨디션 & 체크리스트 */}
        <div className="rv-section" id="careReportViewConditionSection">
          <h4 className="rv-section-title">
            어르신 컨디션
          </h4>
          <div className="rv-tags" id="careReportViewConditionTags" hidden></div>
          <div className="rv-text-box" id="careReportViewSeniorCondition"></div>
        </div>
        {/* 5. 증빙 사진 라이트박스 갤러리 */}
        <div className="rv-section" id="careReportViewPhotosSection" hidden>
          <h4 className="rv-section-title">
            증빙 사진
          </h4>
          <div className="rv-photo-grid" id="careReportViewPhotoGrid"></div>
        </div>
        {/* 이미 [확인 및 이용 완료] 처리된 건(tone === 'confirmed')의 리포트를 다시 열어 봤을 때만 보입니다 — 아래 [확인 및 이용 완료] 버튼 대신 이 안내문이 뜹니다 (openCareReportViewModal() 참고) */}
        <p className="app-hint" id="careReportViewConfirmedBadge" hidden>
          이미 이용 완료 처리된 서비스예요.
        </p>
        {/* 6. 만족도 평가 패널: [⭐ 만족도 평가] 버튼을 누르면 액션 줄 위에 펼쳐짐 */}
        <div className="rv-rate-panel" id="careReportViewRatePanel" hidden>
          <p className="rv-rate-question">
            이번 케어는 어떠셨나요?
          </p>
          <div className="rv-rate-stars" id="careReportViewStars">
            <button type="button" className="rv-star" data-value="1" aria-label="별점 1점">
              ★
            </button>
            {' '}
            <button type="button" className="rv-star" data-value="2" aria-label="별점 2점">
              ★
            </button>
            {' '}
            <button type="button" className="rv-star" data-value="3" aria-label="별점 3점">
              ★
            </button>
            {' '}
            <button type="button" className="rv-star" data-value="4" aria-label="별점 4점">
              ★
            </button>
            {' '}
            <button type="button" className="rv-star" data-value="5" aria-label="별점 5점">
              ★
            </button>
          </div>
          <p className="rv-rate-score" id="careReportViewRateScore" hidden></p>
          <textarea className="rv-rate-textarea" id="careReportViewRateText" maxLength={500} rows={3} placeholder="케어는 어떠셨나요? 남겨주신 후기는 매니저와 관리자가 확인합니다 (선택)"></textarea>
          {' '}
          <button type="button" className="btn btn-sm" id="careReportViewRateSubmitBtn">
            평가 제출
          </button>
          <p className="rv-rate-error" id="careReportViewRateError" hidden></p>
          <p className="rv-rate-done" id="careReportViewRateDone" hidden></p>
        </div>
        {/* 하단 액션 버튼: 닫기 / 만족도 평가. 이 모달은 리포트를 '읽기'만 하는 용도라 이용 완료 확정 버튼은 없습니다 — 확정은 카드의 [케어 이용 완료 확정] 버튼에서만 할 수 있습니다 (applicationCard() 의 tone === 'done' 분기 참고). */}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="careReportViewCloseBtn">
            닫기
          </button>
          {' '}
          <button type="button" className="btn btn-ghost rv-rate-btn" id="careReportViewRateToggleBtn">
            만족도 평가
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-2b. 증빙 사진 라이트박스 (케어 리포트 모달 위에 오버레이) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop rv-lightbox-backdrop" id="rvPhotoLightbox" hidden>
      <div className="rv-lightbox">
        <button type="button" className="rv-lightbox-close" id="rvPhotoLightboxCloseBtn" aria-label="닫기">
          ✕
        </button>
        {' '}
        <img id="rvPhotoLightboxImg" alt="" />
        <p className="rv-lightbox-caption" id="rvPhotoLightboxCaption"></p>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-3. 이용 완료 확인 모달 (브라우저 기본 confirm() 대신 — [확인 및 이용 완료] 버튼용) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="confirmCompletionModal" hidden>
      <div className="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirmCompletionTitle" aria-describedby="confirmCompletionBody">
        <h3 id="confirmCompletionTitle">
          케어 이용 완료 확정
        </h3>
        <p className="modal-sub" id="confirmCompletionBody" style={{ marginBottom: "24px" }}>
          이 케어를 확인하고 이용 완료 처리하시겠어요? 확인 후에는 "진행 중인 신청" 목록에서 사라지고, 이용 내역에서 확인하실 수 있어요.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="confirmCompletionCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="btn btn-confirm" id="confirmCompletionOkBtn">
            확인 완료
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 05-4. 신청 취소 확인 모달 (브라우저 기본 confirm() 대신 — [신청 취소하기] 버튼용) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="cancelApplicationModal" hidden>
      <div className="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby="cancelApplicationTitle" aria-describedby="cancelApplicationBody">
        <h3 id="cancelApplicationTitle">
          신청을 취소하시겠어요?
        </h3>
        <p className="modal-sub" id="cancelApplicationBody" style={{ marginBottom: "24px" }}>
          정말 신청을 취소하시겠습니까? 취소 후에는 되돌릴 수 없고, 같은 신청을 다시 접수해야 해요.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="cancelApplicationCancelBtn">
            아니요
          </button>
          {' '}
          <button type="button" className="btn btn-confirm" id="cancelApplicationOkBtn">
            신청 취소하기
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 운영팀 문의하기 / 1:1 상담 연결 모달 — 진행 중인 케어 카드의 [운영팀 문의하기] 버튼에서 열림. '현장 이슈 발생' 접수(서류 미비·어르신 건강 상태/진료 거부 등)는 현장에 있는 케어 매니저가 가장 먼저 알게 되는 문제라 케어 매니저 마이페이지(mypage-manager.html, openCareIssueModal)로 옮겼습니다 — 보호자는 대신 여기서 바로 전화/카카오톡으로 운영팀과 연결됩니다. */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="opsContactModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="opsContactModalTitle">
        <h3 id="opsContactModalTitle">
          운영팀 문의하기
        </h3>
        <p className="modal-sub">
          진행 중인 케어에 궁금한 점이나 문제가 있으신가요? 아래로 연락하시면 운영팀이 바로 도와드립니다.
        </p>
        <div className="target" id="opsContactTarget"></div>
        <div className="modal-actions">
          <a href="tel:01055305760" className="btn btn-confirm">
            📞 고객센터 전화
          </a>
          {' '}
          <a href="http://pf.kakao.com/_PKxemX" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            카카오톡 1:1 상담
          </a>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="opsContactCloseBtn">
            닫기
          </button>
        </div>
      </div>
    </div>
    <div className="toast" id="toast" role="status" hidden></div>
    {/* 추가 요금 결제 완료 전용 알림: 화면 완전 정중앙에 떠서 사용자가 '확인'을 누르기 전까지 계속 유지됩니다. 다른 확인 모달과 같은 .modal-backdrop/.modal/.btn-confirm 컴포넌트를 재사용합니다. */}
    <div className="modal-backdrop extra-charge-paid-overlay" id="extraChargePaidOverlay" hidden>
      <div className="modal modal-sm extra-charge-paid-modal" role="dialog" aria-modal="true" aria-labelledby="extraChargePaidModalTitle">
        <div className="extra-charge-paid-icon" aria-hidden="true">
          ✓
        </div>
        <h3 id="extraChargePaidModalTitle">
          결제가 완료되었습니다!
        </h3>
        <p className="modal-sub">
          추가 요금이 정상적으로 결제 처리되었습니다.
        </p>
        <button type="button" className="btn btn-confirm extra-charge-paid-confirm" id="extraChargePaidConfirmBtn">
          확인
        </button>
      </div>
    </div>
    {/* 추가 요금 미납 예약 제한(Lock) 안내: '예약하기'/'+추가 신청' 클릭을 가로채서(guardBooking() 참고) 결제 대기 중인 추가 요금이 있으면 새 예약 진행 대신 이 모달을 띄웁니다. 배경 클릭/Esc 로는 닫히지 않고(다른 확인형 모달과 달리 별도 핸들러를 달지 않음), [확인]을 눌러야만 아래 '추가 요금 결제 안내' 섹션(#extraChargeSection)으로 스크롤·포커스 이동합니다. */}
    <div className="modal-backdrop extra-charge-lock-overlay" id="extraChargeLockOverlay" hidden>
      <div className="modal modal-sm extra-charge-lock-modal" role="dialog" aria-modal="true" aria-labelledby="extraChargeLockModalTitle">
        <div className="extra-charge-lock-icon" aria-hidden="true">
          !
        </div>
        <h3 id="extraChargeLockModalTitle">
          새 예약을 진행할 수 없습니다
        </h3>
        <p className="modal-sub">
          결제 대기 중인 추가 요금이 있습니다. 추가 요금을 결제하신 후 새로운 예약을 신청하실 수 있습니다.
        </p>
        <button type="button" className="btn btn-confirm extra-charge-lock-confirm" id="extraChargeLockConfirmBtn">
          확인
        </button>
      </div>
    </div>
    {/* 팝업 뒤 배경 스크롤 잠금 — 이 페이지의 모든 팝업(.modal-backdrop: 어르신 등록, 케어 리포트, 영수증 등)이 hidden 속성으로 열고 닫히므로, 그 속성 변화를 지켜보다가 하나라도 열려 있으면 뒤 페이지를 현재 위치에 고정합니다. 팝업 안에서 스크롤을 끝까지 내려도 뒤 페이지가 같이 밀려 움직이던 문제를 막습니다. overflow:hidden 만으로는 iPhone 사파리에서 배경이 계속 스크롤되므로 body 를 position:fixed 로 고정하고 (top 에 현재 스크롤 위치를 음수로 넣어 화면이 튀지 않게), 닫을 때 원래 위치로 되돌립니다. 팝업 열고 닫는 코드는 그대로 두고 이 블록만으로 동작합니다. */}
      <MypageBehaviors />
    </>
  );
}
