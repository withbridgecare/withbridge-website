import '../admin-shared.css';
import '../../styles/mobile-nav.css';
import '../../styles/tailwind-preflight.css';
import './admin-tailwind-utilities.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { AdminBehaviors } from './AdminBehaviors';

export const metadata: Metadata = {
  title: { absolute: "위드브릿지 어드민 콘솔" },
  robots: { index: false, follow: false },
};

/** 위드브릿지 어드민 콘솔 — public/admin.html 에서 옮김. 동작은 AdminBehaviors.tsx */
export default function AdminPage() {
  return (
    <>
      <NotoSansKr weights="400;500;700;800" />
    <div className="admin-shell">
      {/* ==================================================================== */}
      {' '}
      {/* 00. 좌측 사이드바: 브랜드 + 섹션 바로가기 네비게이션 */}
      {' '}
      {/* ==================================================================== */}
      <aside className="admin-sidebar" id="adminSidebar">
        <div className="admin-sidebar-brand-row">
          <button type="button" className="admin-sidebar-collapse-btn" id="adminSidebarCollapseBtn" aria-label="메뉴 접기" aria-expanded="true" aria-controls="adminSidebar" title="사이드바 접기/펼치기">
            ☰
          </button>
          {' '}
          <span className="admin-sidebar-brand">
            위드브릿지 어드민
          </span>
        </div>
        <nav className="admin-sidebar-nav" id="adminSidebarNav">
          <div className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">
              운영 현황
            </p>
            <a href="#" data-view="dashboard" className="admin-sidebar-link is-active" title="대시보드">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.3"></rect>
                <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.3"></rect>
                <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.3"></rect>
                <rect x="11" y="11" width="6.5" height="6.5" rx="1.3"></rect>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                대시보드
              </span>
            </a>
            {' '}
            <a href="#" data-view="apps" className="admin-sidebar-link" title="오늘의 케어 신청·수동 배정">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <polyline points="2.5 8.5 2.5 16 17.5 16 17.5 8.5"></polyline>
                <polyline points="2.5 8.5 7 8.5 8.3 11 11.7 11 13 8.5 17.5 8.5"></polyline>
                <polyline points="2.5 8.5 6 3 14 3 17.5 8.5"></polyline>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                오늘의 케어 신청·수동 배정
              </span>
            </a>
            {' '}
            <a href="#" data-view="inprogress" className="admin-sidebar-link" title="배정 완료 케어 현황">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="7.3"></circle>
                <polyline points="6.5 10.2 8.8 12.5 13.5 7.3"></polyline>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                배정 완료 케어 현황
              </span>
            </a>
            {' '}
            <a href="#" data-view="careissues" className="admin-sidebar-link" title="현장 이슈 접수">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M10 2.8 18 16.5 2 16.5Z"></path>
                <line x1="10" y1="8" x2="10" y2="12"></line>
                <line x1="10" y1="14.2" x2="10" y2="14.3"></line>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                현장 이슈 접수
              </span>
            </a>
          </div>
          <div className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">
              인력 및 파트너
            </p>
            <a href="#" data-view="pendingmanagers" className="admin-sidebar-link" title="가입 승인 대기 매니저">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="7.5" cy="6.5" r="3"></circle>
                <polyline points="2.2 17 2.2 15.3 3.6 12.8 7.5 12 11.4 12.8 12.8 15.3 12.8 17"></polyline>
                <line x1="15.5" y1="6.5" x2="15.5" y2="11"></line>
                <line x1="13.3" y1="8.8" x2="17.8" y2="8.8"></line>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                가입 승인 대기 매니저
              </span>
            </a>
            {' '}
            <a href="#" data-view="activemanagers" className="admin-sidebar-link" title="활동 중인 케어 매니저">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="6.5" cy="6" r="2.6"></circle>
                <polyline points="2 16.5 2 14.8 3.3 12.6 6.5 11.8 9.7 12.6 11 14.8 11 16.5"></polyline>
                <circle cx="14.3" cy="7.3" r="2.1"></circle>
                <polyline points="12.6 16.5 12.6 15 13.6 13.2 16.2 13.2 17.2 15 17.2 16.5"></polyline>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                활동 중인 케어 매니저
              </span>
            </a>
            {' '}
            <a href="#" data-view="partner" className="admin-sidebar-link" title="B2B 파트너 제휴 문의">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="2.5" y="7" width="15" height="9.5" rx="1.5"></rect>
                <polyline points="7 7 7 5 8.5 3.6 11.5 3.6 13 5 13 7"></polyline>
                <line x1="2.5" y1="11.5" x2="17.5" y2="11.5"></line>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                B2B 파트너 제휴 문의
              </span>
            </a>
          </div>
          <div className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">
              정산 및 회원
            </p>
            <a href="#" data-view="settlement" className="admin-sidebar-link" title="매니저 정산">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="2.2" y="5" width="15.6" height="11" rx="1.8"></rect>
                <path d="M2.2 8.5h15.6"></path>
                <circle cx="14" cy="11.8" r="1" fill="currentColor" stroke="none"></circle>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                매니저 정산
              </span>
            </a>
            {' '}
            <a href="#" data-view="packages" className="admin-sidebar-link" title="패키지 구매 회원 관리">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <polygon points="10 2.3 17.3 6 17.3 14 10 17.7 2.7 14 2.7 6"></polygon>
                <polyline points="2.7 6 10 9.7 17.3 6"></polyline>
                <line x1="10" y1="9.7" x2="10" y2="17.7"></line>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                패키지 구매 회원 관리
              </span>
            </a>
            {' '}
            <a href="#" data-view="members" className="admin-sidebar-link" title="회원 관리">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="10" cy="6.3" r="3.3"></circle>
                <polyline points="3.3 17 3.3 15 5.3 12 10 11.2 14.7 12 16.7 15 16.7 17"></polyline>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                회원 관리
              </span>
            </a>
          </div>
          <div className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">
              시스템/콘텐츠
            </p>
            <a href="#" data-view="notices" className="admin-sidebar-link" title="공지사항 관리">
              <svg className="admin-sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <polyline points="2.3 8 2.3 12.5 5.5 12.5 13 16.3 13 4.2 5.5 8 2.3 8"></polyline>
                <line x1="16" y1="6.5" x2="16" y2="10"></line>
              </svg>
              {' '}
              <span className="admin-sidebar-link-text">
                공지사항 관리
              </span>
            </a>
          </div>
        </nav>
      </aside>
      <button type="button" className="admin-sidebar-overlay" id="adminSidebarOverlay" hidden aria-hidden="true" aria-label="메뉴 닫기"></button>
      <div className="admin-content">
        {/* ==================================================================== */}
        {' '}
        {/* 01. 상단 탑바: 모바일 메뉴 토글(좌측) + 관리자 프로필/로그아웃 유틸리티 바(우측). 브랜드 타이틀은 좌측 사이드바 맨 위("위드브릿지 어드민") 하나만 남기고 여기서는 중복 제거. */}
        {' '}
        {/* ==================================================================== */}
        <header className="admin-topbar">
          <div className="admin-header-inner">
            <button type="button" className="admin-sidebar-toggle" id="adminSidebarToggle" aria-label="메뉴 열기" aria-expanded="false" aria-controls="adminSidebar">
              ☰
            </button>
            <div className="admin-account" id="adminAccount" hidden>
              <div className="admin-account-info">
                <span className="admin-account-email" id="adminEmail"></span>
                {' '}
                <span className="admin-account-name" id="adminName">
                  관리자
                </span>
              </div>
              <span className="admin-account-divider" aria-hidden="true"></span>
              <div className="admin-account-actions">
                <a className="admin-refresh-btn" href="/super-admin" id="superAdminNavLink" hidden title="관리자 권한 부여/회수(최고 관리자 전용)">
                  최고 관리자
                </a>
                {' '}
                <a className="admin-refresh-btn" href="/admin-logs" title="관리자 활동 이력 조회(읽기 전용)">
                  관리자 로그
                </a>
                {' '}
                <button type="button" className="admin-refresh-btn" id="adminRefreshBtn" title="최신 상태 다시 불러오기">
                  새로고침
                </button>
                {' '}
                <button type="button" className="admin-logout-btn" id="logoutBtn">
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="admin-main">
          {/* ================================================================ */}
          {' '}
          {/* 00. 핵심 현황 요약 카드 */}
          {' '}
          {/* ================================================================ */}
          <div className="admin-summary-grid" id="summaryGrid" data-admin-view="dashboard">
            <button type="button" className="admin-summary-card is-clickable" id="summaryTodayCard" title="오늘의 케어 신청 · 수동 배정 목록으로 이동">
              <span className="admin-summary-label">
                오늘 신청
              </span>
              {' '}
              <span className="admin-summary-value" id="summaryTodayCount">
                –
              </span>
            </button>
            {' '}
            <button type="button" className="admin-summary-card is-clickable is-payment-pending" id="summaryPaymentPendingCard" title="입금 대기 목록으로 이동">
              <span className="admin-summary-label">
                입금 대기
              </span>
              {' '}
              <span className="admin-summary-value" id="summaryPaymentPendingCount">
                –
              </span>
            </button>
            {' '}
            <button type="button" className="admin-summary-card is-clickable is-matching-pending" id="summaryMatchingPendingCard" title="매칭 대기 목록으로 이동">
              <span className="admin-summary-label">
                매칭 대기
              </span>
              {' '}
              <span className="admin-summary-value" id="summaryMatchingPendingCount">
                –
              </span>
            </button>
            {' '}
            <button type="button" className="admin-summary-card is-clickable is-in-progress" id="summaryInProgressCard" title="배정 완료(진행 중) 케어 현황으로 이동">
              <span className="admin-summary-label">
                진행 중 케어
              </span>
              {' '}
              <span className="admin-summary-value" id="summaryInProgressCount">
                –
              </span>
            </button>
            {' '}
            <button type="button" className="admin-summary-card is-clickable is-cancelled" id="summaryCancelledCard" title="취소된 신청 내역 목록으로 이동">
              <span className="admin-summary-label">
                취소 건수
              </span>
              {' '}
              <span className="admin-summary-value" id="summaryCancelledCount">
                –
              </span>
            </button>
          </div>
          {/* ================================================================ */}
          {' '}
          {/* 01. 검색 · 상태 필터 — '오늘의 케어 신청·수동 배정' 카드와 '배정 완료 케어 현황' 카드 양쪽에 공통으로 적용되는 통합 필터입니다. 특정 카드 소속처럼 보이지 않도록 자체 타이틀을 가진 별도 카드로 감싸서, 개별 카드 전용 필터(활동 중인 매니저 검색 등)와 시각적으로 구분합니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card admin-global-filter-card" id="mainFilterCard" data-admin-view="dashboard apps inprogress">
            <div className="admin-card-head">
              <h2>
                전체 케어 통합 조회 및 필터
              </h2>
            </div>
            <p className="admin-card-desc">
              아래 검색어와 상태 필터는 '오늘의 케어 신청 · 수동 배정'과 '배정 완료 케어 현황' 두 카드 모두에 함께 적용됩니다.
            </p>
            <div className="admin-filter-bar" id="mainFilterBar">
              <input type="search" className="admin-search-input" id="adminSearchInput" placeholder="고객명 · 매니저명 · 연락처 검색" />
              <div className="admin-filter-chips" id="adminStatusFilter" role="group" aria-label="상태별 필터">
                <button type="button" className="admin-filter-chip is-active" data-status="all">
                  전체
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="payment_pending">
                  입금대기
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="matching_pending">
                  매칭대기
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="in_progress">
                  진행중
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="completed">
                  완료
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="cancelled">
                  취소
                </button>
              </div>
            </div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 02. 2열 카드 레이아웃 */}
          {' '}
          {/* ================================================================ */}
          <div className="admin-grid is-split" id="dashboardCardsGrid" data-admin-view="dashboard apps pendingmanagers">
            {/* 좌측: 가입 승인 대기 매니저 목록 */}
            <section className="admin-card" id="sectionPendingManagers" data-admin-view="dashboard pendingmanagers" aria-labelledby="pendingManagersTitle">
              <div className="admin-card-head">
                <h2 id="pendingManagersTitle">
                  가입 승인 대기 매니저
                </h2>
                <span className="admin-count" id="pendingManagersCount" hidden>
                  0건
                </span>
              </div>
              <div id="pendingManagersList" className="admin-list">
                <p className="admin-loading">
                  불러오는 중…
                </p>
              </div>
            </section>
            {/* 우측: 오늘의 케어 신청 및 수동 배정 현황 */}
            <section className="admin-card" id="sectionApplications" data-admin-view="dashboard apps" aria-labelledby="applicationsTitle">
              <div className="admin-card-head">
                <h2 id="applicationsTitle">
                  오늘의 케어 신청 · 수동 배정
                </h2>
                <span className="admin-count" id="applicationsCount" hidden>
                  0건
                </span>
              </div>
              <p className="admin-card-desc" id="applicationsDesc">
                아직 담당 매니저가 지정되지 않은 건만, 매니저 마이페이지의 '배정 신청 대기'와 정확히 같은 기준(접수 48시간 이내)으로 표시됩니다. 매니저가 수락하거나 여기서 배정하는 즉시 이 목록에서 빠집니다. (이미 배정되어 진행 중인 건은 아래 '배정 완료(진행 중) 케어 현황' 카드에서 확인하세요.)
              </p>
              <label className="admin-toggle-row">
                <input type="checkbox" id="showOverdueAppsToggle" />
                {' '}
                <span>
                  48시간 지난 신청도 보기 (테스트/오류로 등록된 건을 정리할 때만 켜세요 — 매니저 화면과 건수가 달라지고, 위 '입금 대기'·'매칭 대기' 요약 카드 숫자도 함께 늘어납니다)
                </span>
              </label>
              <div className="admin-toggle-row">
                <button type="button" className="admin-btn is-ghost btn-manual-expiry" id="runExpiryBatchBtn" title="pg_cron이 돌지 않는 환경(로컬 등)에서 48시간 미매칭 자동 취소/환불 배치를 지금 수동으로 실행합니다.">
                  지금 48시간 만료 배치 수동 실행
                </button>
                {' '}
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  pg_cron이 동작하지 않는 환경(로컬 테스트 등)에서 자동 취소/환불 로직을 바로 실행해 확인할 때 사용하세요.
                </span>
              </div>
              <div id="applicationsList" className="admin-list">
                <p className="admin-loading">
                  불러오는 중…
                </p>
              </div>
            </section>
          </div>
          {/* ================================================================ */}
          {' '}
          {/* 03. 배정 완료(진행 중) 케어 현황판 — manager_id 가 채워진(배정 완료) care_schedules 중 status != 'completed' 인 건(배정됨/출발/도착)만 모아서 보여줍니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionInProgress" data-admin-view="inprogress" hidden aria-labelledby="inProgressCareTitle">
            <div className="admin-card-head">
              <h2 id="inProgressCareTitle">
                배정 완료(진행 중) 케어 현황
              </h2>
              <span className="admin-count" id="inProgressCareCount" hidden>
                0건
              </span>
            </div>
            <p className="admin-card-desc" id="inProgressCareDesc">
              이미 매니저가 배정되어 진행 중인 건만 모아서 보여줍니다(완료된 건은 제외). 위 '오늘의 케어 신청 · 수동 배정'과는 반대로, 여기 나오는 건들은 전부 담당 매니저가 이미 정해져 있는 상태입니다.
            </p>
            <div className="admin-filter-bar">
              <div className="admin-filter-chips" id="inProgressCareDateFilter" role="group" aria-label="예정일 필터">
                <button type="button" className="admin-filter-chip is-active" data-date-filter="all">
                  전체 0건
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-date-filter="today">
                  오늘 케어 0건
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-date-filter="past">
                  지난 케어 0건
                </button>
              </div>
            </div>
            <div id="inProgressCareList" className="admin-list">
              <p className="admin-loading">
                불러오는 중…
              </p>
            </div>
            <button type="button" className="admin-showmore-btn" id="inProgressCareShowMoreBtn" hidden aria-expanded="false"></button>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 03-1. 현장 이슈 접수 — mypage-manager.html '오늘의 케어' 카드의 [이슈 보고] 버튼으로 케어 매니저가 접수한 건(sql/care_issue_reports_manager_reporting.sql). 예전엔 보호자 마이페이지에 있던 기능이었는데, 서류 미비/진료 거부 같은 문제는 현장에 있는 매니저가 먼저 알게 되므로 매니저 쪽으로 옮겼습니다 — care_issue_reports 테이블 자체는 그대로(sql/ care_interruption_refund_system.sql), 30초 폴링으로 이 화면에 즉시 노출됩니다. 서류 미비· 진료 거부 등으로 접수된 건을 확인한 뒤, 위 '배정 완료(진행 중) 케어 현황'의 [케어 중단 처리] 버튼으로 이어서 처리합니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionCareIssues" data-admin-view="careissues" hidden aria-labelledby="careIssueTitle">
            <div className="admin-card-head">
              <h2 id="careIssueTitle">
                현장 이슈 접수
              </h2>
              <span className="admin-count" id="careIssueCount" hidden>
                0건
              </span>
            </div>
            <p className="admin-card-desc">
              케어 매니저가 마이페이지에서 '현장 이슈 발생 / 긴급 문의'로 접수한 건입니다. 확인 후 전화로 먼저 연락하고, 중단 처리가 필요하면 위 진행 중인 케어 목록에서 [케어 중단 처리]를 눌러 주세요.
            </p>
            <div id="careIssueList" className="admin-list">
              <p className="admin-loading">
                불러오는 중…
              </p>
            </div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 04. 활동 중인 케어 매니저 관리 */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionActiveManagers" data-admin-view="activemanagers" hidden aria-labelledby="activeManagersTitle">
            <div className="admin-card-head">
              <h2 id="activeManagersTitle">
                활동 중인 케어 매니저
              </h2>
              <span className="admin-count" id="activeManagersCount" hidden>
                0건
              </span>
            </div>
            <div className="admin-filter-bar">
              <input type="search" className="admin-search-input" id="managerSearchInput" placeholder="매니저명 · 연락처 검색" />
              <div className="admin-filter-chips" id="managerDutyFilter" role="group" aria-label="근무 상태별 필터">
                <button type="button" className="admin-filter-chip is-active" data-duty="all">
                  전체
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-duty="online">
                  근무 중만
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-duty="break">
                  휴식 중만
                </button>
              </div>
            </div>
            <div id="activeManagersList" className="admin-list">
              <p className="admin-loading">
                불러오는 중…
              </p>
            </div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 05. 매니저 정산 (월별) — 매니저별 시급 × 수행 시간으로 매니저 정산금을 계산해, 완료된 건을 월 단위로 모아 [완료 건수 / 정산대상액 / 3.3% 원천세 / 실지급액]을 보여줍니다(sql/ manager_hourly_rate_settlement.sql 의 트리거가 care_schedules.manager_payout 을 계산하고, admin_manager_monthly_settlements() RPC 는 그 값을 그대로 집계합니다). 익월 10일 일괄 지급 전, 이 표로 지급 내역을 확인합니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionSettlement" data-admin-view="settlement" hidden aria-labelledby="settlementTitle">
            <div className="admin-card-head">
              <h2 id="settlementTitle">
                매니저 정산 (월별)
              </h2>
              <span className="admin-count" id="settlementCount" hidden>
                0명
              </span>
            </div>
            <p className="admin-card-desc">
              매니저별 설정된 시급과 서비스 수행 시간에 따라 정산금이 계산됩니다. 매월 말일 마감 후 익월 10일, 3.3% 원천징수 후 일괄 지급합니다.
            </p>
            <div className="admin-filter-bar">
              <label className="admin-field-label" htmlFor="settlementMonthInput" style={{ margin: "0" }}>
                정산 대상 월
              </label>
              {' '}
              <input type="month" className="admin-select" id="settlementMonthInput" style={{ maxWidth: "180px" }} />
            </div>
            <p className="admin-card-desc" style={{ marginTop: "-4px" }}>
              행의 [상세보기]를 누르면 그 달에 집계된 개별 완료 건(서비스 종류 · 이용 일시 · 결제 금액 · 매니저 정산금)을 하나씩 확인할 수 있습니다.
            </p>
            <div className="admin-settlement-table-wrap">
              <table className="admin-settlement-table" id="settlementTable">
                <thead>
                  <tr>
                    <th>
                      매니저
                    </th>
                    <th>
                      완료 건수
                    </th>
                    <th>
                      정산대상액
                    </th>
                    <th>
                      3.3% 원천세
                    </th>
                    <th>
                      실지급액
                    </th>
                    <th aria-label="상세보기"></th>
                  </tr>
                </thead>
                <tbody id="settlementTableBody">
                  <tr>
                    <td colSpan={6} className="admin-loading">
                      불러오는 중…
                    </td>
                  </tr>
                </tbody>
                <tfoot id="settlementTableFoot" hidden>
                  <tr>
                    <td>
                      합계
                    </td>
                    <td id="settlementTotalCount">
                      0건
                    </td>
                    <td id="settlementTotalPayout">
                      0원
                    </td>
                    <td id="settlementTotalTax">
                      0원
                    </td>
                    <td id="settlementTotalNet">
                      0원
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 06. 패키지 구매 회원 관리 — user_packages 전체를 조회해(sql/admin_package_management.sql 의 user_packages_select_admin 정책) 동일 보호자(연락처 기준, 없으면 user_id)가 보유한 패키지들을 한 카드(행)로 묶어 보여줍니다. 메인 표는 성함·연락처·보유 패키지 건수·총 잔여 회차 합산·대표 상태만 한 줄로 보여주고, [상세보기]를 눌러야 개별 패키지(구매일·만료일·종류별 잔여 회차·상태)와 그 각각의 [회차 조정]이 열립니다 — admin_adjust_user_package() RPC 로 잔여 회차를 수기 보정 합니다(사유 메모 필수 — admin_care_adjustments 에 이력 남음). */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionUserPackages" data-admin-view="packages" hidden aria-labelledby="userPackagesTitle">
            <div className="admin-card-head">
              <h2 id="userPackagesTitle">
                패키지 구매 회원 관리
              </h2>
              <span className="admin-count" id="userPackagesCount" hidden>
                0건
              </span>
            </div>
            <p className="admin-card-desc">
              보호자가 선결제한 회차 패키지(user_packages) 보유 현황입니다. 같은 연락처의 패키지는 한 행으로 모아 보여주며, [상세보기]에서 개별 패키지별로 [회차 조정]할 수 있습니다 — 사유 메모는 필수이며 이력이 남습니다.
            </p>
            <div className="admin-filter-bar">
              <input type="search" className="admin-search-input" id="userPackagesSearchInput" placeholder="고객명 · 연락처 검색" />
            </div>
            <div className="admin-settlement-table-wrap">
              <table className="admin-settlement-table" id="userPackagesTable">
                <thead>
                  <tr>
                    <th>
                      고객명
                    </th>
                    <th>
                      보유 패키지
                    </th>
                    <th>
                      총 잔여 회차
                    </th>
                    <th>
                      상태
                    </th>
                    <th aria-label="상세보기"></th>
                  </tr>
                </thead>
                <tbody id="userPackagesTableBody">
                  <tr>
                    <td colSpan={5} className="admin-loading">
                      불러오는 중…
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div id="userPackagesShowMoreWrap"></div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 07. 회원 관리 — profiles + auth.users(이메일/인증여부/가입수단)를 묶어 보여주는 전체 회원 목록입니다. 이메일·인증여부·가입수단은 PostgREST 에 노출되지 않는 auth.users 쪽 값이라 admin_list_members() RPC(sql/admin_user_management.sql, SECURITY DEFINER + is_admin() 체크)로 받아 옵니다. 검색/필터는 모두 그 RPC 파라미터로 서버에서 적용됩니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionMembers" data-admin-view="members" hidden aria-labelledby="membersTitle">
            <div className="admin-card-head">
              <h2 id="membersTitle">
                회원 관리
              </h2>
              <div className="admin-card-head-actions">
                <span className="admin-count" id="membersCount" hidden>
                  0명
                </span>
                {' '}
                <button type="button" className="admin-btn is-ghost" id="membersExportBtn">
                  엑셀 다운로드
                </button>
              </div>
            </div>
            <p className="admin-card-desc">
              가입된 전체 회원(보호자) 목록입니다. 이름·휴대폰 번호로 검색하거나 가입 수단/이메일 인증 상태로 걸러 볼 수 있고, [상세 보기]에서 기본 정보·주소지·CS 메모·예약/쿠폰/패키지 내역을 함께 확인할 수 있습니다. [엑셀 다운로드]는 지금 검색/필터 조건에 맞는 전체 목록을 CSV로 내려받습니다.
            </p>
            <div className="admin-filter-bar">
              <input type="search" className="admin-search-input" id="membersSearchInput" placeholder="이름 · 휴대폰 번호 검색" />
              <div className="admin-filter-chips" id="membersProviderFilter" role="group" aria-label="가입 수단별 필터">
                <button type="button" className="admin-filter-chip is-active" data-provider="all">
                  전체
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-provider="email">
                  이메일
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-provider="kakao">
                  카카오
                </button>
              </div>
              <div className="admin-filter-chips" id="membersVerifiedFilter" role="group" aria-label="이메일 인증 상태별 필터">
                <button type="button" className="admin-filter-chip is-active" data-verified="all">
                  전체
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-verified="verified">
                  인증
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-verified="unverified">
                  미인증
                </button>
              </div>
            </div>
            <div className="admin-settlement-table-wrap">
              <table className="admin-settlement-table" id="membersTable">
                <thead>
                  <tr>
                    <th>
                      이름
                    </th>
                    <th>
                      휴대폰 번호
                    </th>
                    <th>
                      이메일
                    </th>
                    <th>
                      가입 수단
                    </th>
                    <th>
                      이메일 인증
                    </th>
                    <th>
                      계정 상태
                    </th>
                    <th>
                      가입일자
                    </th>
                    <th aria-label="상세 보기"></th>
                  </tr>
                </thead>
                <tbody id="membersTableBody">
                  <tr>
                    <td colSpan={8} className="admin-loading">
                      불러오는 중…
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="admin-pagination" id="membersPaginationWrap" hidden></div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 08. B2B 파트너 제휴 문의 — partner.html 하단 폼으로 요양원·주야간보호센터·복지관· 의료기관 등이 제출한 제휴 문의 목록입니다(sql/partner_inquiries.sql 의 partner_inquiries 테이블). 처리 상태(접수/상담중/완료)는 행마다 드롭다운으로 바로 바꿀 수 있습니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionPartnerInquiries" data-admin-view="partner" hidden aria-labelledby="partnerInquiriesTitle">
            <div className="admin-card-head">
              <h2 id="partnerInquiriesTitle">
                B2B 파트너 제휴 문의
              </h2>
              <span className="admin-count" id="partnerInquiriesCount" hidden>
                0건
              </span>
            </div>
            <p className="admin-card-desc">
              partner.html 하단 폼으로 기관이 제출한 제휴 문의입니다. 처리 상태는 드롭다운으로 바로 변경할 수 있습니다.
            </p>
            <div className="admin-filter-bar admin-filter-bar--tabs">
              <div className="admin-filter-chips" id="partnerInquiriesStatusFilter" role="group" aria-label="처리 상태별 필터">
                <button type="button" className="admin-filter-chip is-active" data-status="all">
                  전체
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="new">
                  접수
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="contacted">
                  상담중
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-status="closed">
                  완료
                </button>
              </div>
            </div>
            <div className="admin-settlement-table-wrap">
              <table className="admin-settlement-table" id="partnerInquiriesTable">
                <thead>
                  <tr>
                    <th>
                      접수일시
                    </th>
                    <th>
                      기관명
                    </th>
                    <th>
                      제휴 유형
                    </th>
                    <th>
                      담당자명
                    </th>
                    <th>
                      연락처
                    </th>
                    <th>
                      이메일
                    </th>
                    <th>
                      문의 내용
                    </th>
                    <th>
                      처리 상태
                    </th>
                  </tr>
                </thead>
                <tbody id="partnerInquiriesTableBody">
                  <tr>
                    <td colSpan={8} className="admin-loading">
                      불러오는 중…
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          {/* ================================================================ */}
          {' '}
          {/* 09. 공지사항 관리 — notice.html(공개 공지사항 페이지)에 노출되는 공지를 등록/수정/삭제합니다 (sql/notices_management.sql 의 notices 테이블, js/admin-notices.js). [필독]/[중요] 뱃지, 상단 고정, 공개 여부를 설정할 수 있고, 저장 즉시 notice.html에 반영됩니다. */}
          {' '}
          {/* ================================================================ */}
          <section className="admin-card" id="sectionNotices" data-admin-view="notices" hidden aria-labelledby="noticesTitle">
            <div className="admin-card-head">
              <h2 id="noticesTitle">
                공지사항 관리
              </h2>
              <div className="admin-card-head-actions">
                <span className="admin-count" id="noticesCount" hidden>
                  0건
                </span>
                {' '}
                <button type="button" className="admin-btn is-primary" id="noticeCreateBtn">
                  + 공지 등록
                </button>
              </div>
            </div>
            <p className="admin-card-desc">
              notice.html에 노출되는 공지사항입니다. [필독]/[중요] 뱃지와 상단 고정, 공개 여부를 설정할 수 있고, 저장하면 바로 notice.html에 반영됩니다.
            </p>
            <div className="admin-filter-bar admin-filter-bar--tabs">
              <div className="admin-filter-chips" id="noticesCategoryFilter" role="group" aria-label="카테고리별 필터">
                <button type="button" className="admin-filter-chip is-active" data-category="all">
                  전체
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-category="service">
                  서비스 안내
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-category="maintenance">
                  시스템 점검
                </button>
                {' '}
                <button type="button" className="admin-filter-chip" data-category="event">
                  이벤트
                </button>
              </div>
            </div>
            <div id="noticesList" className="admin-list">
              <p className="admin-loading">
                불러오는 중…
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
    <div className="admin-toast" id="adminToast" hidden></div>
    {/* ================================================================ */}
    {' '}
    {/* 04-1. 매니저 정산 상세 내역 모달 ('매니저 정산 (월별)' 표의 [상세보기] 버튼 또는 행 클릭에서 열림) — 그 달에 집계된 개별 완료 건을 서비스 종류·이용 일시·결제 금액·매니저 정산금(시급 × 수행 시간) 단위로 펼쳐 보여줍니다(sql/admin_settlement_detail_rpc.sql 의 admin_manager_monthly_settlement_details() RPC). */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="settlementDetailModal" hidden>
      <div className="modal settlement-detail-modal" role="dialog" aria-modal="true" aria-labelledby="settlementDetailModalTitle">
        <div className="modal-head">
          <h3 id="settlementDetailModalTitle">
            정산 상세 내역
          </h3>
          <button type="button" className="modal-close-btn" id="settlementDetailCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="settlementDetailModalSub"></p>
        <div className="admin-settlement-table-wrap">
          <table className="admin-settlement-table settlement-detail-table">
            <thead>
              <tr>
                <th>
                  서비스 카테고리
                </th>
                <th>
                  이용 일시
                </th>
                <th>
                  결제 금액
                </th>
                <th>
                  매니저 정산금
                </th>
                <th>
                  고객 평가
                </th>
              </tr>
            </thead>
            <tbody id="settlementDetailTableBody">
              <tr>
                <td colSpan={5} className="admin-loading">
                  불러오는 중…
                </td>
              </tr>
            </tbody>
            <tfoot id="settlementDetailTableFoot" hidden>
              <tr>
                <td colSpan={2}>
                  합계
                </td>
                <td id="settlementDetailTotalPayment">
                  0원
                </td>
                <td id="settlementDetailTotalPayout">
                  0원
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="settlementDetailCloseBtn2">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 05. 신분증 사본 확인 모달 (가입 승인 대기 매니저 카드의 [신분증 보기] 버튼에서 열림) */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="idCardModal" hidden>
      <div className="modal idcard-modal" role="dialog" aria-modal="true" aria-labelledby="idCardModalTitle">
        <div className="modal-head">
          <h3 id="idCardModalTitle">
            신분증 사본 확인
          </h3>
          <button type="button" className="modal-close-btn" id="idCardModalCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="idCardModalSub"></p>
        <p className="idcard-mask-hint">
          주민등록번호 뒷자리는 지원자가 직접 가려서 제출한 이미지입니다. 뒷자리가 그대로 노출되어 있거나 본인 확인이 어려우면 반려 후 재제출을 요청하세요.
        </p>
        <div className="idcard-viewer" id="idCardViewer">
          <p className="admin-loading" id="idCardStatus">
            불러오는 중…
          </p>
          <img id="idCardImg" alt="신분증 사본" hidden />
        </div>
        <div className="idcard-zoom-row">
          <button type="button" className="admin-btn is-ghost" id="idCardZoomOutBtn">
            축소 −
          </button>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="idCardZoomResetBtn" disabled>
            100%
          </button>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="idCardZoomInBtn">
            확대 +
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="idCardRejectBtn">
            반려
          </button>
          {' '}
          <button type="button" className="admin-btn is-primary" id="idCardApproveBtn">
            승인
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 06. 매니저 수동 배정 모달 (오늘의 케어 신청 · 수동 배정 카드의 [수동 배정] 버튼에서 열림) */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="assignManagerModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="assignManagerModalTitle">
        <div className="modal-head">
          <h3 id="assignManagerModalTitle">
            매니저 배정
          </h3>
          <button type="button" className="modal-close-btn" id="assignManagerCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="assignManagerSub"></p>
        <label className="admin-field-label" htmlFor="assignManagerSelect">
          배정할 매니저
        </label>
        {' '}
        <select className="admin-select" id="assignManagerSelect"></select>
        <p className="admin-error" id="assignManagerError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="assignManagerCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="admin-btn is-primary" id="assignManagerConfirmBtn">
            배정하기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 06-1. 매니저 교체 모달 (배정 완료(진행 중) 케어 현황 카드의 [매니저 교체] 버튼에서 열림) */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="reassignManagerModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reassignManagerModalTitle">
        <div className="modal-head">
          <h3 id="reassignManagerModalTitle">
            매니저 교체
          </h3>
          <button type="button" className="modal-close-btn" id="reassignManagerCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="reassignManagerSub"></p>
        <label className="admin-field-label" htmlFor="reassignManagerSelect">
          새로 배정할 매니저
        </label>
        {' '}
        <select className="admin-select" id="reassignManagerSelect"></select>
        <p className="admin-error" id="reassignManagerError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="reassignManagerCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="admin-btn is-primary" id="reassignManagerConfirmBtn">
            교체하기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 06-2. 추가 요금 청구 모달 ('완료' 필터의 케어 행 [추가 요금 청구] 버튼에서 열림) — 기본 요금 선결제 + 초과 시 추가 요금 정산 구조의 2차 청구. 금액은 관리자가 직접 입력합니다 (자동 계산 아님). 확정되면 보호자가 mypage.html 에서 이 금액만 따로 결제합니다. */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="extraChargeModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="extraChargeModalTitle">
        <div className="modal-head">
          <h3 id="extraChargeModalTitle">
            추가 요금 청구
          </h3>
          <button type="button" className="modal-close-btn" id="extraChargeCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="extraChargeSub"></p>
        <label className="admin-field-label" htmlFor="extraChargeAmountInput">
          추가 요금(원)
        </label>
        {' '}
        <input type="number" className="admin-select" id="extraChargeAmountInput" min="1" step="1" inputMode="numeric" placeholder="예: 10000" />
        {' '}
        <label className="admin-field-label" htmlFor="extraChargeMemoInput">
          사유 메모(선택, 보호자에게 노출)
        </label>
        {' '}
        <input type="text" className="admin-select" id="extraChargeMemoInput" placeholder="예: 기본 2시간 초과 30분" />
        <p className="admin-error" id="extraChargeError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="extraChargeCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="admin-btn is-primary" id="extraChargeConfirmBtn">
            청구하기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 06-2b. 케어 중단 처리 모달 (배정 완료(진행 중) 케어 현황 카드의 [케어 중단 처리] 버튼에서 열림) — 서류 미비·진료 거부·보호자 사정 등으로 현장에서 케어가 중단됐을 때: 일반 결제 건은 출장비만 남기고 PortOne으로 부분 취소(cancel-payment Edge Function), 패키지 결제 건은 회차를 원복(+1회)하거나 0.5회만 부분 차감 처리합니다(sql/care_interruption_refund_system.sql). */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="careInterruptModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="careInterruptModalTitle">
        <div className="modal-head">
          <h3 id="careInterruptModalTitle">
            케어 중단 처리
          </h3>
          <button type="button" className="modal-close-btn" id="careInterruptCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="careInterruptSub"></p>
        {/* 일반 결제 건: 출장비 차감 후 부분 취소 */}
        <div id="careInterruptRefundSection">
          <label className="admin-field-label">
            현재 결제액
          </label>
          <p className="admin-info-text" id="careInterruptPaymentInfo">
            -
          </p>
          <label className="admin-field-label" htmlFor="careInterruptFeeInput">
            차감할 출장비/위약금(원)
          </label>
          {' '}
          <input type="number" className="admin-select" id="careInterruptFeeInput" min="0" step="1000" inputMode="numeric" placeholder="예: 15000" />
          {' '}
          <label className="admin-field-label">
            환불 예정 금액
          </label>
          <p className="admin-info-text" id="careInterruptRefundInfo">
            -
          </p>
        </div>
        {/* 패키지 결제 건: 회차 원복/부분 조정 (PortOne 결제가 없어 버튼을 누르는 즉시 처리됩니다) */}
        <div id="careInterruptPackageSection" hidden>
          <p className="admin-info-text">
            이 건은 패키지 회차로 접수된 건입니다. PortOne 결제가 없어 아래 버튼으로 회차만 바로 조정합니다.
          </p>
          <div className="modal-actions">
            <button type="button" className="admin-btn is-ghost" id="careInterruptRestoreFullBtn">
              패키지 횟수 원복 (+1회)
            </button>
            {' '}
            <button type="button" className="admin-btn is-ghost" id="careInterruptRestoreHalfBtn">
              0.5회 부분 차감 처리
            </button>
          </div>
        </div>
        <label className="admin-field-label" htmlFor="careInterruptMemoInput">
          처리 사유 메모 (필수, 이력에 저장됩니다)
        </label>
        {' '}
        <textarea className="admin-select" id="careInterruptMemoInput" rows={3} placeholder="예: 현장 서류 미비로 인한 최소 출장비 15,000원 제외 부분 환불"></textarea>
        <p className="admin-error" id="careInterruptError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="careInterruptCancelBtn">
            닫기
          </button>
          {' '}
          <button type="button" className="admin-btn is-danger" id="careInterruptConfirmBtn">
            부분 취소 처리하기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 07. 현장 인증 상세보기 모달 (배정 완료 케어 현황 카드의 [현장 인증 상세보기] 버튼에서 열림) care_checkpoints 테이블의 5단계(departure/hospital_arrival/treatment_complete/return_departure/ return_complete) 기록을 모두 보여줍니다. */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="careVerifyModal" hidden>
      <div className="modal verify-modal" role="dialog" aria-modal="true" aria-labelledby="careVerifyModalTitle">
        <div className="modal-head">
          <h3 id="careVerifyModalTitle">
            현장 인증 상세보기
          </h3>
          <button type="button" className="modal-close-btn" id="careVerifyCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="careVerifySub"></p>
        <div className="verify-section">
          <h4 className="verify-section-title">
            출발 (이동 중) 인증
          </h4>
          <div id="careVerifyDepartureBody"></div>
        </div>
        <div className="verify-section">
          <h4 className="verify-section-title">
            병원 도착 인증
          </h4>
          <div id="careVerifyArrivalBody"></div>
        </div>
        <div className="verify-section">
          <h4 className="verify-section-title">
            진료/대행 완료 인증
          </h4>
          <div id="careVerifyTreatmentBody"></div>
        </div>
        <div className="verify-section">
          <h4 className="verify-section-title">
            귀가 이동 인증
          </h4>
          <div id="careVerifyReturnDepartureBody"></div>
        </div>
        <div className="verify-section">
          <h4 className="verify-section-title">
            케어 완료 인증
          </h4>
          <div id="careVerifyReturnCompleteBody"></div>
        </div>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="careVerifyCloseBtn2">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* 인증 사진 원본 확대 라이트박스 (현장 인증 모달 위에 오버레이) */}
    <div className="verify-lightbox-backdrop" id="careVerifyLightbox" hidden>
      <div className="verify-lightbox">
        <button type="button" className="verify-lightbox-close" id="careVerifyLightboxCloseBtn" aria-label="닫기">
          ✕
        </button>
        {' '}
        <img id="careVerifyLightboxImg" alt="" />
        <p className="verify-lightbox-caption" id="careVerifyLightboxCaption"></p>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 06-0. 패키지 상세보기 모달 ('패키지 구매 회원 관리' 표의 [상세보기] 버튼에서 열림) — 같은 보호자(연락처 기준)가 보유한 개별 패키지를 전부 나열하고, 각 행의 [회차 조정]이 바로 아래 06-1 모달을 그 위에 띄웁니다(이 모달은 닫지 않고 그대로 뒤에 둠 — packageAdjustModal 이 z-index 로 항상 위에 뜨도록 admin.css 에서 고정). */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="packageGroupDetailModal" hidden>
      <div className="modal settlement-detail-modal" role="dialog" aria-modal="true" aria-labelledby="packageGroupDetailModalTitle">
        <div className="modal-head">
          <h3 id="packageGroupDetailModalTitle">
            패키지 상세 내역
          </h3>
          <button type="button" className="modal-close-btn" id="packageGroupDetailCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="packageGroupDetailModalSub"></p>
        <div className="admin-settlement-table-wrap">
          <table className="admin-settlement-table settlement-detail-table">
            <thead>
              <tr>
                <th>
                  패키지 종류
                </th>
                <th>
                  구매일
                </th>
                <th>
                  만료일
                </th>
                <th>
                  잔여 회차
                </th>
                <th>
                  상태
                </th>
                <th aria-label="회차 조정"></th>
              </tr>
            </thead>
            <tbody id="packageGroupDetailTableBody">
              <tr>
                <td colSpan={6} className="admin-loading">
                  불러오는 중…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="packageGroupDetailCloseBtn2">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 06-1. 패키지 회차 수동 조정 모달 ('패키지 상세보기' 표의 [회차 조정] 버튼에서 열림) — admin_adjust_user_package() RPC(sql/admin_package_management.sql)로 remaining_count 를 가감합니다. */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="packageAdjustModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="packageAdjustModalTitle">
        <div className="modal-head">
          <h3 id="packageAdjustModalTitle">
            패키지 회차 조정
          </h3>
          <button type="button" className="modal-close-btn" id="packageAdjustCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="packageAdjustModalSub"></p>
        <label className="admin-field-label" htmlFor="packageAdjustDeltaInput">
          조정할 회차 (+충전 / −차감)
        </label>
        {' '}
        <input type="number" className="admin-select" id="packageAdjustDeltaInput" step="0.5" placeholder="예: 1 또는 -0.5" />
        {' '}
        <label className="admin-field-label" htmlFor="packageAdjustMemoInput">
          사유 메모 (필수, 이력에 저장됨)
        </label>
        {' '}
        <input type="text" className="admin-select" id="packageAdjustMemoInput" placeholder="예: 고객 문의 확인 후 수기 보정" />
        <p className="admin-error" id="packageAdjustError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="packageAdjustCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="admin-btn is-primary" id="packageAdjustConfirmBtn">
            조정하기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 07-0. 회원 상세보기 모달 ('회원 관리' 표의 [상세 보기] 버튼에서 열림) — 기본 정보/주소지는 이미 admin_list_members() 로 받아 온 행 데이터를 그대로 보여주고, 예약 내역(service_applications) 만 모달을 열 때 그 회원의 user_id 로 추가 조회합니다(이미 service_applications_select_admin 정책으로 관리자 전체 조회가 열려 있어 별도 RPC 가 필요 없습니다). */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="memberDetailModal" hidden>
      <div className="modal settlement-detail-modal" role="dialog" aria-modal="true" aria-labelledby="memberDetailModalTitle">
        <div className="modal-head">
          <h3 id="memberDetailModalTitle">
            회원 상세 정보
          </h3>
          <button type="button" className="modal-close-btn" id="memberDetailCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="memberDetailModalSub"></p>
        <dl className="admin-detail-grid" id="memberDetailInfoGrid"></dl>
        {/* [회원 정보 수정] 클릭 시에만 열리는 인라인 수정 폼 — admin_update_member_profile() RPC (sql/admin_member_management.sql)로 저장합니다. 전화번호는 normalize_phone() 으로 포맷을 통일하고, 다른 회원과 중복되면 저장이 거부됩니다. */}
        <div className="admin-member-edit-form" id="memberEditForm" hidden>
          <label className="admin-field-label" htmlFor="memberEditName">
            이름
          </label>
          {' '}
          <input type="text" className="admin-select" id="memberEditName" maxLength={30} />
          {' '}
          <label className="admin-field-label" htmlFor="memberEditPhone">
            휴대폰 번호
          </label>
          {' '}
          <input type="tel" className="admin-select" id="memberEditPhone" placeholder="예: 010-1234-5678" />
          {' '}
          <label className="admin-field-label" htmlFor="memberEditAddress">
            주소
          </label>
          {' '}
          <input type="text" className="admin-select" id="memberEditAddress" />
          {' '}
          <label className="admin-field-label" htmlFor="memberEditAddressDetail">
            상세주소
          </label>
          {' '}
          <input type="text" className="admin-select" id="memberEditAddressDetail" />
          <p className="admin-success" id="memberEditSuccess" hidden></p>
          <p className="admin-error" id="memberEditError" hidden></p>
          <div className="modal-actions">
            <button type="button" className="admin-btn is-ghost" id="memberEditCancelBtn">
              취소
            </button>
            {' '}
            <button type="button" className="admin-btn is-primary" id="memberEditSaveBtn">
              저장하기
            </button>
          </div>
        </div>
        {/* CS 메모 — admin_member_notes(운영자 전용, 누적 로그). 수정/삭제 없이 쌓이기만 합니다. */}
        <h4 className="admin-detail-subtitle">
          CS 메모 (운영자 전용)
        </h4>
        <div className="admin-member-notes" id="memberNotesList">
          <p className="admin-loading">
            불러오는 중…
          </p>
        </div>
        <div className="admin-member-note-compose">
          <textarea className="admin-select" id="memberNoteInput" rows={2} placeholder="예: 10/30 전화 문의 — 결제 오류 안내, 재시도 요청함"></textarea>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="memberNoteSaveBtn">
            메모 저장
          </button>
        </div>
        {/* 등록된 어르신 프로필 (seniors) */}
        <h4 className="admin-detail-subtitle">
          등록된 어르신 프로필
        </h4>
        <div id="memberSeniorsList">
          <p className="admin-loading">
            불러오는 중…
          </p>
        </div>
        {/* 보유 쿠폰(user_coupons) / 패키지(user_packages) + 수동 지급·차감(sql/admin_member_benefit_grants.sql). 각 작업은 사유 메모 10자 이상을 반드시 입력해야 처리되고, 성공 시 admin_logs(admin-logs.html) 에 관리자/대상 회원/작업 구분/변경 내용/사유/처리 일시가 함께 기록됩니다. */}
        <h4 className="admin-detail-subtitle">
          보유 쿠폰 · 패키지
        </h4>
        <div id="memberBenefitsList">
          <p className="admin-loading">
            불러오는 중…
          </p>
        </div>
        <div className="admin-benefit-grant-actions">
          <button type="button" className="admin-btn is-ghost" id="memberGrantCouponToggleBtn">
            + 쿠폰 수동 지급
          </button>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="memberGrantPackageToggleBtn">
            + 회차 수동 지급
          </button>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="memberDeductPackageToggleBtn">
            − 회차 수동 차감
          </button>
        </div>
        {/* 쿠폰 수동 지급 */}
        <div className="admin-benefit-form" id="memberGrantCouponForm" hidden>
          <label className="admin-field-label" htmlFor="memberGrantCouponAmount">
            지급 금액(원)
          </label>
          {' '}
          <input type="number" className="admin-select" id="memberGrantCouponAmount" min="1" step="500" placeholder="예: 5000" />
          {' '}
          <label className="admin-field-label" htmlFor="memberGrantCouponMemo">
            지급 사유 (최소 10자, 이력에 저장됩니다)
          </label>
          {' '}
          <textarea className="admin-select" id="memberGrantCouponMemo" rows={2} placeholder="예: 서비스 이용 중 불편을 드린 점에 대한 보상으로 쿠폰 지급"></textarea>
          <p className="admin-error" id="memberGrantCouponError" hidden></p>
          <div className="modal-actions">
            <button type="button" className="admin-btn is-ghost" id="memberGrantCouponCancelBtn">
              취소
            </button>
            {' '}
            <button type="button" className="admin-btn is-primary" id="memberGrantCouponConfirmBtn">
              지급하기
            </button>
          </div>
        </div>
        {/* 회차 수동 지급 (패키지 구매 이력이 없어도 새 패키지로 바로 생성됩니다) — 회차 수는 더 이상 관리자가 직접 입력하지 않고, 선택한 패키지 종류에 따라 서버(admin_grant_member_package() RPC, sql/admin_member_benefit_grants.sql)가 package_session_count() 로 자동 산정합니다. package.html 에서 실제로 판매 중인 상품(10시간권/20시간권) 두 가지만 지급할 수 있습니다 — 5회권/10회권은 과거 판매분 보유자만 있고 신규 판매·신규 지급 대상이 아닙니다. */}
        <div className="admin-benefit-form" id="memberGrantPackageForm" hidden>
          <label className="admin-field-label" htmlFor="memberGrantPackageType">
            패키지 종류
          </label>
          {' '}
          <select className="admin-select" id="memberGrantPackageType">
            <option value="10_hours">
              10시간권
            </option>
            <option value="20_hours">
              20시간권
            </option>
          </select>
          <p className="admin-info-text" id="memberGrantPackageSessionHint">
            10시간권 선택 시 5회가 자동으로 지급됩니다.
          </p>
          <label className="admin-field-label" htmlFor="memberGrantPackageMemo">
            지급 사유 (최소 10자, 이력에 저장됩니다)
          </label>
          {' '}
          <textarea className="admin-select" id="memberGrantPackageMemo" rows={2} placeholder="예: 매니저 귀책으로 중단된 서비스에 대한 회차 보상 지급"></textarea>
          <p className="admin-error" id="memberGrantPackageError" hidden></p>
          <div className="modal-actions">
            <button type="button" className="admin-btn is-ghost" id="memberGrantPackageCancelBtn">
              취소
            </button>
            {' '}
            <button type="button" className="admin-btn is-primary" id="memberGrantPackageConfirmBtn">
              지급하기
            </button>
          </div>
        </div>
        {/* 회차 수동 차감 (기존 패키지 대상 — 보유한 패키지가 있어야 선택할 수 있습니다) */}
        <div className="admin-benefit-form" id="memberDeductPackageForm" hidden>
          <label className="admin-field-label" htmlFor="memberDeductPackageSelect">
            차감할 패키지
          </label>
          {' '}
          <select className="admin-select" id="memberDeductPackageSelect"></select>
          {' '}
          <label className="admin-field-label" htmlFor="memberDeductPackageCount">
            차감할 회차 수
          </label>
          {' '}
          <input type="number" className="admin-select" id="memberDeductPackageCount" min="0.5" step="0.5" placeholder="예: 1" />
          {' '}
          <label className="admin-field-label" htmlFor="memberDeductPackageMemo">
            차감 사유 (최소 10자, 이력에 저장됩니다)
          </label>
          {' '}
          <textarea className="admin-select" id="memberDeductPackageMemo" rows={2} placeholder="예: 중복 차감된 회차를 정정하기 위한 수동 차감"></textarea>
          <p className="admin-error" id="memberDeductPackageError" hidden></p>
          <div className="modal-actions">
            <button type="button" className="admin-btn is-ghost" id="memberDeductPackageCancelBtn">
              취소
            </button>
            {' '}
            <button type="button" className="admin-btn is-danger" id="memberDeductPackageConfirmBtn">
              차감하기
            </button>
          </div>
        </div>
        <h4 className="admin-detail-subtitle">
          예약 내역
        </h4>
        <div className="admin-settlement-table-wrap">
          <table className="admin-settlement-table settlement-detail-table">
            <thead>
              <tr>
                <th>
                  신청일
                </th>
                <th>
                  서비스
                </th>
                <th>
                  어르신
                </th>
                <th>
                  상태
                </th>
                <th>
                  결제 금액
                </th>
              </tr>
            </thead>
            <tbody id="memberDetailBookingsBody">
              <tr>
                <td colSpan={5} className="admin-loading">
                  불러오는 중…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="admin-success" id="memberActionSuccess" hidden></p>
        <p className="admin-error" id="memberActionError" hidden></p>
        <div className="modal-actions admin-member-detail-actions">
          <button type="button" className="admin-btn is-ghost" id="memberEditToggleBtn">
            회원 정보 수정
          </button>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="memberResetPasswordBtn">
            비밀번호 재설정 메일 발송
          </button>
          {' '}
          <button type="button" className="admin-btn is-danger" id="memberToggleStatusBtn">
            계정 정지
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="memberDetailCloseBtn2">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 08. 환불 처리 모달 ('취소된 신청 내역' 카드의 [환불 처리] 버튼에서 열림) — PortOne 환불 API를 전액 또는 부분 금액으로 바로 호출합니다(supabase/functions/admin-refund-application, sql/admin_application_refund_system.sql). 부분 환불은 여러 번에 걸쳐 나눠 처리할 수 있어, 열 때마다 "환불 가능 잔액"을 다시 계산해서 보여줍니다. */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="adminRefundModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="adminRefundModalTitle">
        <div className="modal-head">
          <h3 id="adminRefundModalTitle">
            환불 처리
          </h3>
          <button type="button" className="modal-close-btn" id="adminRefundCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="modal-sub" id="adminRefundSub"></p>
        <label className="admin-field-label">
          결제 총액 / 환불 가능 잔액
        </label>
        <p className="admin-info-text" id="adminRefundBalanceInfo">
          -
        </p>
        <label className="admin-field-label">
          환불 방식
        </label>
        <div className="admin-radio-row">
          <label className="admin-radio-opt">
            <input type="radio" name="adminRefundType" id="adminRefundTypeFull" defaultValue="full" defaultChecked />
            <span>
              전액 환불
            </span>
          </label>
          {' '}
          <label className="admin-radio-opt">
            <input type="radio" name="adminRefundType" id="adminRefundTypePartial" defaultValue="partial" />
            <span>
              부분 환불
            </span>
          </label>
        </div>
        <div id="adminRefundPartialSection" hidden>
          <label className="admin-field-label" htmlFor="adminRefundAmountInput">
            환불할 금액(원)
          </label>
          {' '}
          <input type="number" className="admin-select" id="adminRefundAmountInput" min="1" step="1" inputMode="numeric" placeholder="예: 10000" />
        </div>
        <label className="admin-field-label" htmlFor="adminRefundReasonInput">
          환불 사유 (필수, 이력에 저장됩니다)
        </label>
        {' '}
        <textarea className="admin-select" id="adminRefundReasonInput" rows={3} placeholder="예: 보호자 사정으로 신청 취소 후 결제금액 환불"></textarea>
        <p className="admin-error" id="adminRefundError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="adminRefundCancelBtn">
            닫기
          </button>
          {' '}
          <button type="button" className="admin-btn is-danger" id="adminRefundConfirmBtn">
            환불 처리하기
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 09. 공지 등록/수정 모달 ('공지사항 관리' 카드의 [+ 공지 등록]/[수정] 버튼에서 열림) — sql/notices_management.sql 의 notices 테이블을 js/admin-notices.js 가 바로 insert/update 합니다. */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="noticeFormModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="noticeFormModalTitle">
        <div className="modal-head">
          <h3 id="noticeFormModalTitle">
            공지 등록
          </h3>
          <button type="button" className="modal-close-btn" id="noticeFormCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <input type="hidden" id="noticeFormId" />
        {' '}
        <label className="admin-field-label" htmlFor="noticeFormTitle">
          제목
        </label>
        {' '}
        <input type="text" className="admin-select" id="noticeFormTitle" maxLength={100} placeholder="예: 정기 시스템 점검 안내" />
        {' '}
        <label className="admin-field-label" htmlFor="noticeFormCategory">
          카테고리
        </label>
        {' '}
        <select className="admin-select" id="noticeFormCategory">
          <option value="service">
            서비스 안내
          </option>
          <option value="maintenance">
            시스템 점검
          </option>
          <option value="event">
            이벤트
          </option>
        </select>
        {' '}
        <label className="admin-field-label" htmlFor="noticeFormBadge">
          뱃지
        </label>
        {' '}
        <select className="admin-select" id="noticeFormBadge">
          <option value="">
            없음
          </option>
          <option value="important">
            중요
          </option>
          <option value="must">
            필독
          </option>
        </select>
        {' '}
        <label className="admin-field-label" htmlFor="noticeFormBody">
          내용 (문단을 나누려면 빈 줄을 넣어 주세요)
        </label>
        {' '}
        <textarea className="admin-select" id="noticeFormBody" rows={6} placeholder="공지 내용을 입력하세요"></textarea>
        {' '}
        <label className="admin-toggle-row is-boxed">
          <input type="checkbox" id="noticeFormPinned" />
          {' '}
          <span>
            상단 고정 — notice.html 목록 맨 위에 고정됩니다
          </span>
        </label>
        {' '}
        <label className="admin-toggle-row is-boxed">
          <input type="checkbox" id="noticeFormPublished" defaultChecked />
          {' '}
          <span>
            공개 — 체크 해제하면 notice.html에는 보이지 않고 관리자 목록에만 남습니다(초안)
          </span>
        </label>
        <p className="admin-error" id="noticeFormError" hidden></p>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="noticeFormCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="admin-btn is-primary" id="noticeFormSaveBtn">
            저장하기
          </button>
        </div>
      </div>
    </div>
    {/* 계정 정지/활성화(admin-set-member-status) 호출용 — apply.html/profile-edit.html 과 같은 명시적 fetch 래퍼를 그대로 씁니다. */}
    {' '}
    {/* Supabase 접속 정보(window.WB_ENV). scripts/build-env.mjs 가 .env / Vercel 환경 변수로 생성 */}
      <AdminBehaviors />
    </>
  );
}
