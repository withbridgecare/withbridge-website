import './mypage-manager.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { ManagerMypageBehaviors } from './ManagerMypageBehaviors';

export const metadata: Metadata = {
  title: '케어매니저 마이페이지',
  robots: { index: false, follow: false },
};

/**
 * 케어 매니저 마이페이지 — public/mypage-manager.html 에서 옮김.
 * 화면 마크업은 여기, 동작(요청 수락·일정·체크인 인증·케어 리포트·정산 등)은 managerMypageScript.ts 에 있습니다.
 */
export default function ManagerMypagePage() {
  return (
    <>
      <NotoSansKr />
    <main className="mp-main">
      <div className="mp-loading" id="loading" role="status">
        케어매니저 마이페이지를 불러오는 중입니다…
      </div>
      <div className="mp-stack" id="app" hidden>
        {/* ================================================================ */}
        {' '}
        {/* 01-1. 미인증 케어 경고 안내 바 — 오늘 이전 날짜인데 아직 완료(completed) 처리가 안 된 케어가 있으면 보여집니다(renderToday() 의 pastUnverified). 눌러서 「오늘의 케어」 탭의 미인증 목록으로 바로 이동합니다. */}
        {' '}
        {/* ================================================================ */}
        {' '}
        <button type="button" className="verify-alert-bar" id="verifyAlertBar" hidden>
          <span id="verifyAlertText"></span>
          {' '}
          <span className="verify-alert-cta">
            확인하기
          </span>
        </button>
        {' '}
        {/* ================================================================ */}
        {' '}
        {/* 02. 프로필 (이름 / 자격 / 활동 상태) */}
        {' '}
        {/* ================================================================ */}
        <section className="card profile" aria-labelledby="mgrName">
          <div className="profile-main">
            <div className="profile-avatar" id="mgrAvatar" aria-hidden="true"></div>
            <div style={{ minWidth: "0" }}>
              <p className="profile-role">
                매니저님, 안녕하세요{' '}
                <span className="badge is-demo" id="demoBadge" hidden>
                  샘플 데이터
                </span>
              </p>
              <h1 className="profile-name" id="mgrName"></h1>
              <div className="profile-tags" id="mgrTags"></div>
            </div>
          </div>
          {/* 매니저가 직접 출근(근무 가능)/휴식 상태를 전환하는 토글(renderDutyToggle/handleDutyToggleClick 참고). 진행 중이거나 배정 완료된 예약이 있으면 휴식으로 전환할 수 없습니다 — DB 트리거 (enforce_manager_break_guard, sql/manager_duty_status.sql)가 최종 방어선입니다. 아래 activityBadge 는 오늘 일정의 실제 진행 상태를 보고 자동으로 정해지는 별도의 표시 전용 배지입니다(renderActivity 참고) — 이 토글과는 독립적입니다. */}
          <div className="status-box">
            <div className="duty-toggle" id="dutyToggleBox" hidden>
              <span className="duty-switch-label" id="dutySwitchLabel"></span>
              {' '}
              <button type="button" className="duty-switch" id="dutySwitchBtn" role="switch" aria-checked="false" aria-label="근무 상태 전환">
                <span className="duty-switch-track">
                  <span className="duty-switch-thumb"></span>
                </span>
              </button>
            </div>
            <span className="status-tag" id="activityBadge">
              불러오는 중
            </span>
            <p className="status-hint" id="activityHint" hidden></p>
            {/* 신규 케어 신청을 텔레그램 개인 봇(DM)으로 받고 [동행 수락하기] 버튼으로 바로 수락하기 위한 연결 버튼(handleTelegramLinkClick/refreshTelegramLinkStatus 참고) — 클릭 가능한 액티브 글래스 버튼(is-interactive). 연결 전/후 문구만 바뀌고, 데모 모드(?demo=1)에서는 실제 계정이 없어 wrap 전체를 숨깁니다. */}
            <div className="glass-button-wrap is-interactive" id="telegramLinkWrap" hidden>
              <div className="glass-button-shadow"></div>
              <button type="button" className="glass-button" id="telegramLinkBtn">
                <span className="glass-button-text">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m22 2-7 20-4-9-9-4Z"></path>
                    <path d="M22 2 11 13"></path>
                  </svg>
                  {' '}
                  <span id="telegramLinkText">
                    텔레그램 알림 연결
                  </span>
                </span>
              </button>
            </div>
          </div>
        </section>
        {/* ================================================================ */}
        {' '}
        {/* 03. 수익 및 활동 요약 (MVP 후순위 개발 항목 — 화면 노출만 중지. 데이터 로딩(renderSummary)은 그대로 두어 나중에 is-hidden-mvp 클래스만 지우면 바로 복원됩니다) */}
        {' '}
        {/* ================================================================ */}
        <section className="card is-hidden-mvp" aria-labelledby="summaryTitle">
          <div className="card-head">
            <h2 className="card-title" id="summaryTitle">
              수익 · 활동 요약
            </h2>
            <span className="badge" id="summaryMonth"></span>
          </div>
          <div id="summaryBody"></div>
        </section>
        {/* ================================================================ */}
        {' '}
        {/* 04~07. 케어 업무 탭: [오늘의 케어] · [배정 신청 대기] · [리포트 작성 대기] · [지난 케어 기록] 4개 탭. '리포트 작성 대기'는 '지난 케어 기록'(월간 달력) 안에 묻혀 있으면 매니저가 놓치기 쉽다는 피드백에 따라 최상위 탭으로 독립시켰습니다 — 탭 배지 + 로그인 직후 자동 전환(초기 진입 시에만, init() 참고) 두 가지로 "작성할 리포트가 있다"는 걸 바로 알 수 있게 합니다. */}
        {' '}
        {/* ================================================================ */}
        <div className="mgr-tabs">
          <div className="mgr-tab-list" role="tablist" aria-label="케어 업무">
            <span className="mgr-tab-pill" id="mgrTabPill" aria-hidden="true"></span>
            {' '}
            <button type="button" className="mgr-tab is-active" id="tabBtnToday" role="tab" aria-selected="true" aria-controls="todaySection">
              <span className="mgr-tab-label" id="todayTabLabel">
                오늘 (0)
              </span>
            </button>
            {' '}
            <button type="button" className="mgr-tab" id="tabBtnRequests" role="tab" aria-selected="false" aria-controls="requestSection" tabIndex={-1}>
              <span className="mgr-tab-label" id="requestTabLabel">
                신청대기
              </span>
            </button>
            {' '}
            <button type="button" className="mgr-tab" id="tabBtnPendingReports" role="tab" aria-selected="false" aria-controls="pendingReportsSection" tabIndex={-1}>
              <span className="mgr-tab-label" id="pendingReportsTabLabel">
                리포트
              </span>
            </button>
            {' '}
            <button type="button" className="mgr-tab" id="tabBtnHistory" role="tab" aria-selected="false" aria-controls="reportCalendarSection" tabIndex={-1}>
              <span className="mgr-tab-label">
                지난기록
              </span>
            </button>
          </div>
          {/* 오늘의 케어: 오늘의 배정 케어 일정 (수락한 일정 + 진행 상태 업데이트) */}
          <section className="card mgr-tab-panel" id="todaySection" role="tabpanel" aria-labelledby="tabBtnToday" tabIndex={0}>
            <div className="card-head">
              <h2 className="card-title" id="todayTitle">
                오늘의 배정 케어 일정
              </h2>
              <span className="badge" id="todayBadge"></span>
            </div>
            <div id="todayList"></div>
          </section>
          {/* 배정 신청 대기: 신청 대기 목록 (매니저 직접 수락) */}
          <section className="card mgr-tab-panel" id="requestSection" role="tabpanel" aria-labelledby="tabBtnRequests" tabIndex={0} hidden>
            <div className="card-head">
              <div className="title-group">
                <h2 className="card-title" id="requestTitle">
                  신청 대기 목록
                </h2>
                <span className="badge" id="requestBadge" hidden></span>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" id="requestRefreshBtn">
                새로고침
              </button>
            </div>
            <p className="card-lead">
              아직 담당 매니저가 정해지지 않은 동행 신청이에요. 가능한 일정은{' '}
              <strong>
                수락하기
              </strong>
              를 눌러 바로 배정받으세요.
            </p>
            {/* 네이버 지도 스타일 정렬 탭 — 관련도순(기본: 내 활동 지역 + 마감 임박도) / 거리순(내 등록 주소 ↔ 신청 출발지) / 최신순(접수 시간 내림차순). requestSortBar 리스너/sortRequests() 참고. */}
            <div className="req-sort-bar">
              <div className="chip-group" id="requestSortBar" role="radiogroup" aria-label="정렬 기준">
                <button type="button" className="chip-btn is-selected" data-sort="relevance">
                  관련도순
                </button>
                {' '}
                <button type="button" className="chip-btn" data-sort="distance">
                  거리순
                </button>
                {' '}
                <button type="button" className="chip-btn" data-sort="latest">
                  최신순
                </button>
              </div>
            </div>
            <div className="req-region-filter">
              <div className="chip-group" id="requestRegionFilterBar" role="radiogroup" aria-label="지역 필터">
                <button type="button" className="chip-btn is-selected" data-group="all">
                  전체
                </button>
                {' '}
                <button type="button" className="chip-btn" data-group="incheon">
                  인천
                </button>
                {' '}
                <button type="button" className="chip-btn" data-group="gyeonggi">
                  경기
                </button>
              </div>
              <select className="req-region-district-select" id="requestDistrictSelect" aria-label="세부 지역" hidden></select>
            </div>
            <div id="requestList"></div>
          </section>
          {/* 리포트 작성 대기: 완료했지만 아직 care_reports 가 없는 건만 모아서 보여줍니다(data.completed 전체 로딩 범위와 동일). renderPendingReportsTab() 참고. */}
          <section className="card mgr-tab-panel" id="pendingReportsSection" role="tabpanel" aria-labelledby="tabBtnPendingReports" tabIndex={0} hidden>
            <div className="card-head">
              <h2 className="card-title" id="pendingReportsTitle">
                작성 대기 중인 케어 리포트
              </h2>
            </div>
            <p className="card-lead">
              완료된 케어인데 아직 리포트를 제출하지 않은 건이에요. 제출하면 보호자께 바로 공유됩니다.
            </p>
            <p className="card-note">
              최근에 완료된 케어부터 순서대로 보여드려요.
            </p>
            <div id="pendingReportsList"></div>
          </section>
          {/* 지난 케어 기록: 월간 캘린더 (완료된 케어 + 리포트 작성/보기) */}
          <section className="card mgr-tab-panel" id="reportCalendarSection" role="tabpanel" aria-labelledby="tabBtnHistory" tabIndex={0} hidden>
            <div className="card-head">
              <h2 className="card-title" id="reportCalendarTitle">
                케어 수행 내역
              </h2>
            </div>
            <div id="reportCalendar"></div>
          </section>
        </div>
      </div>
    </main>
    {/* ================================================================ */}
    {' '}
    {/* 07. 우측 하단 고정 비상 상황 대응 버튼 — 현재는 회사 고객센터(footer 연락처와 동일) 연결. */}
    {' '}
    {/* ================================================================ */}
    {' '}
    <button type="button" className="mgr-emergency-btn" id="emergencyReportBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      {' '}비상 상황 보고
    </button>
    {' '}
    {/* 비상 상황 보고 확인 모달 — window.confirm() 대신 화면 정중앙에 뜨는 전용 경고 모달 */}
    <div className="modal-backdrop emergency-modal-backdrop" id="emergencyReportModal" hidden>
      <div className="emergency-modal" role="alertdialog" aria-modal="true" aria-labelledby="emergencyModalTitle">
        <div className="emergency-modal-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3 className="emergency-modal-title" id="emergencyModalTitle">
          비상 상황 보고
        </h3>
        <p className="emergency-modal-body">
          본사 고객센터(
          <span className="emergency-modal-phone">
            010-5530-5760
          </span>
          )로 연결합니다.
          <br />
          실제 비상 상황이 맞나요?
        </p>
        <p className="emergency-modal-hint">
          (평일 08:00~18:00 외 시간에는 응답이 지연될 수 있습니다.)
        </p>
        <div className="emergency-modal-actions">
          <button type="button" className="emergency-modal-cancel" id="emergencyCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="emergency-modal-call" id="emergencyCallBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"></path>
            </svg>
            {' '}즉시 전화 연결
          </button>
        </div>
      </div>
    </div>
    {/* ================================================================ */}
    {' '}
    {/* 07-1. 현장 이슈 발생 / 긴급 문의 모달 — '오늘의 케어' 진행 중 카드의 [이슈 보고] 버튼에서 열림. 예전엔 보호자 마이페이지(mypage.html)에만 있었는데, "서류 미비·어르신 건강 상태/진료 거부" 같은 문제는 현장에 있는 매니저가 가장 먼저 알게 되므로 여기로 옮겼습니다. 접수는 care_issue_reports 에 쌓여 어드민 콘솔 '현장 이슈 접수' 큐(30초 폴링)에 바로 뜨고, 위 '비상 상황 보고' 버튼과 달리 통화가 아니라 "무슨 문제인지" 기록을 남기는 용도입니다 — 그래도 급하면 아래에서 바로 전화도 걸 수 있게 둡니다. (sql/care_issue_reports_manager_reporting.sql) */}
    {' '}
    {/* ================================================================ */}
    <div className="modal-backdrop" id="careIssueModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="careIssueModalTitle">
        <h3 id="careIssueModalTitle">
          현장 이슈 발생 / 긴급 문의
        </h3>
        <p className="modal-sub">
          진행 중인 케어에 문제가 생겼다면 바로 접수해 주세요. 운영진이 확인 후 빠르게 대응합니다.
        </p>
        <p className="target" id="careIssueTarget"></p>
        <div className="field">
          <label>
            어떤 문제가 있나요?{' '}
            <span style={{ color: "var(--danger)" }}>
              *
            </span>
          </label>
          <div className="issue-type-options" id="careIssueTypeOptions" role="radiogroup">
            <label className="issue-type-option">
              <input type="radio" name="careIssueType" defaultValue="documents_missing" />
              서류 미비
            </label>
            {' '}
            <label className="issue-type-option">
              <input type="radio" name="careIssueType" defaultValue="health_refusal" />
              어르신 건강 상태 / 진료 거부
            </label>
            {' '}
            <label className="issue-type-option">
              <input type="radio" name="careIssueType" defaultValue="other" />
              기타 현장 문제
            </label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="careIssueDetailInput">
            상세 내용{' '}
            <span style={{ fontWeight: "400", color: "var(--ink-sub)" }}>
              (선택)
            </span>
          </label>
          {' '}
          <textarea id="careIssueDetailInput" maxLength={500} placeholder="현장 상황을 간단히 적어 주시면 운영진이 더 빠르게 대응할 수 있어요."></textarea>
        </div>
        <p className="form-error" id="careIssueFormError" role="alert" hidden></p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="careIssueCancelBtn">
            닫기
          </button>
          {' '}
          <button type="button" className="btn" id="careIssueSubmitBtn">
            운영진에 접수하기
          </button>
        </div>
        <p style={{ margin: "16px 0 8px", fontSize: "13px", color: "var(--ink-sub)", textAlign: "center" }}>
          지금 바로 통화가 필요하신가요?
        </p>
        <div className="modal-actions">
          <a href="tel:01055305760" className="btn btn-ghost">
            📞 본사 고객센터 전화
          </a>
        </div>
      </div>
    </div>
    {/* 휴식 전환 차단 안내 모달 — window.alert() 대신 화면 정중앙에 뜨는 전용 안내 모달 (handleDutyToggleClick 참고: 진행 중/배정 완료 예약이 있으면 휴식 전환을 막습니다) */}
    <div className="modal-backdrop duty-blocked-backdrop" id="dutyBlockedModal" hidden>
      <div className="duty-blocked-modal" role="alertdialog" aria-modal="true" aria-labelledby="dutyBlockedTitle" aria-describedby="dutyBlockedBody">
        <div className="duty-blocked-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3 className="duty-blocked-title" id="dutyBlockedTitle">
          휴식 상태로 전환할 수 없습니다
        </h3>
        <p className="duty-blocked-body" id="dutyBlockedBody">
          현재 진행 중인 동행 예약 건이 있습니다. 일정을 완료한 후 상태를 변경해 주세요.
        </p>
        <div className="duty-blocked-actions">
          <button type="button" className="duty-blocked-confirm-btn" id="dutyBlockedCloseBtn">
            확인
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== 11. 하단 푸터 (Footer) ==================================================================== */}
    {' '}
    {/* ==================================================================== */}
    {' '}
    {/* 06. 케어 리포트 작성 모달 */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="reportModal" hidden>
      <form className="modal" id="reportForm" role="dialog" aria-modal="true" aria-labelledby="reportModalTitle" noValidate>
        <h3 id="reportModalTitle">
          케어 리포트 작성
        </h3>
        <p className="modal-sub">
          보호자님께 전달될 동행 기록입니다. 제출 후에는 수정할 수 없어요.
        </p>
        <div className="target" id="reportTarget"></div>
        <div className="field">
          <label id="reportCareTypeLabel">
            케어 대상 유형 *
          </label>
          <div className="chip-group" id="reportCareTypeGroup" role="radiogroup" aria-labelledby="reportCareTypeLabel">
            <button type="button" className="chip-btn" data-value="senior">
              어르신 케어
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="child">
              아동 케어
            </button>
          </div>
        </div>
        <div className="field">
          <label id="reportQuickTagLabel">
            빠른 선택 태그 (복수 선택 가능)
          </label>
          <div className="chip-group" id="reportQuickTagGroup" role="group" aria-labelledby="reportQuickTagLabel">
            <button type="button" className="chip-btn" data-value="진료 완료" data-for="senior">
              진료 완료
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="처방약 수령" data-for="senior">
              처방약 수령
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="하원 완료" data-for="child">
              하원 완료
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="식사 확인" data-for="child">
              식사 확인
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="안전 귀가" data-for="both">
              안전 귀가
            </button>
          </div>
        </div>
        {/* 어르신 컨디션/보행 상태 — 아동 케어에는 해당하지 않는 항목이라 케어 대상 유형이 '아동 케어'면 이 블록 전체를 숨깁니다(reportCareTypeGroup 클릭 핸들러 참고). 탭 한 번으로 끝나는 선택지라 타이핑 없이 핵심 데이터를 채우는 메인 흐름에 둡니다 — 더 이상 '상세 기록'에 숨어있지 않습니다. */}
        <div className="field" id="reportSeniorStatusFields">
          <label id="conditionChipLabel">
            어르신 컨디션
          </label>
          <div className="chip-group" id="conditionChipGroup" role="radiogroup" aria-labelledby="conditionChipLabel">
            <button type="button" className="chip-btn" data-value="양호">
              양호
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="보통">
              보통
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="피곤/기력저하">
              피곤/기력저하
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="불편/통증">
              불편/통증
            </button>
          </div>
          <label id="mobilityChipLabel" className="field-sub-label">
            보행 상태
          </label>
          <div className="chip-group" id="mobilityChipGroup" role="radiogroup" aria-labelledby="mobilityChipLabel">
            <button type="button" className="chip-btn" data-value="자립 보행">
              자립 보행
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="부축 보행">
              부축 보행
            </button>
            {' '}
            <button type="button" className="chip-btn" data-value="휠체어 사용">
              휠체어 사용
            </button>
          </div>
        </div>
        {/* 사진 한 장이면 태그만으로도 AI 초안이 훨씬 풍부해지므로(현장 사진 촬영 사실을 리포트에 반영), 타이핑이 필요한 '상세 기록'이 아니라 태그 선택과 같은 비중의 메인 입력으로 끌어올립니다. 가로 스크롤 갤러리(추가 슬롯 + 76px 썸네일) — createPhotoUploader() 가 내용을 채웁니다. */}
        <div className="field">
          <div className="photo-strip-head">
            <label htmlFor="photoInput">
              서류 · 현장 사진 (선택)
            </label>
            {' '}
            <span className="photo-count" id="photoCount">
              0/5
            </span>
          </div>
          <input type="file" id="photoInput" accept="image/*" multiple hidden />
          <div className="photo-strip" id="photoGrid"></div>
        </div>
        <div className="field">
          <label htmlFor="reportMemo">
            핵심 메모 (선택)
          </label>
          {' '}
          <textarea id="reportMemo" className="compact" maxLength={300} placeholder="한 줄로 충분해요. 비워 두고 위 선택만으로 AI 초안을 받아도 괜찮아요."></textarea>
        </div>
        <div className="field ai-draft-field">
          <div className="ai-draft-head">
            <label htmlFor="reportAiMessage">
              보호자에게 보낼 리포트
            </label>
            {' '}
            <button type="button" className="btn btn-ghost btn-sm" id="reportAiGenerateBtn">
              AI 리포트 초안 생성
            </button>
          </div>
          <textarea id="reportAiMessage" maxLength={2000} rows={8} placeholder="위 태그 · 사진만으로 [AI 리포트 초안 생성]을 눌러 초안을 받거나, 이 칸에 직접 작성해 주세요."></textarea>
          <p className="form-hint" id="reportAiHint" hidden>
            AI가 작성한 초안이에요. 보내기 전에 꼭 확인하고 필요한 부분을 고쳐 주세요.
          </p>
        </div>
        <details className="report-detail-fields">
          <summary>
            상세 기록 추가 (선택)
          </summary>
          <div className="field">
            <label htmlFor="physicianNotes" id="physicianNotesLabel">
              진료 소견 · 의사 안내사항
            </label>
            {' '}
            <textarea id="physicianNotes" maxLength={1500} placeholder="예: 혈압 132/84, 처방약 2주분 수령. 다음 진료는 10월 3일."></textarea>
          </div>
          <div className="field">
            <label htmlFor="nextVisitDate">
              다음 진료 예약일 (선택)
            </label>
            {' '}
            <input type="date" id="nextVisitDate" />
          </div>
          <div className="field">
            <label htmlFor="seniorCondition">
              특이사항 (선택)
            </label>
            {' '}
            <textarea id="seniorCondition" className="compact" maxLength={500} placeholder="위 선택만으로 부족한 내용이 있다면 짧게 적어주세요."></textarea>
          </div>
        </details>
        <p className="form-error" id="reportFormError" role="alert" hidden></p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="reportCancelBtn">
            취소
          </button>
          {' '}
          <button type="submit" className="btn" id="reportSaveBtn">
            보호자에게 전송
          </button>
        </div>
      </form>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 06-1. 제출한 케어 리포트 보기 모달 (읽기 전용) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="reportViewModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reportViewModalTitle">
        <h3 id="reportViewModalTitle">
          제출한 케어 리포트
        </h3>
        <p className="modal-sub">
          보호자님께 전달된 동행 기록이에요. 제출 후에는 수정할 수 없어요.
        </p>
        <div className="target" id="reportViewTarget"></div>
        {/* 동행/수행 타임라인 — mypage.html 보호자 리포트 모달과 같은 구조 (care_checkpoints 1~5단계) */}
        <div className="rv-section">
          <h4 className="rv-section-title">
            동행/수행 타임라인
          </h4>
          <ol className="rv-timeline" id="reportViewTimeline" aria-label="동행/수행 타임라인"></ol>
        </div>
        {/* AI 케어 리포트 — care_reports.ai_message 가 있는(새 UI로 작성한) 리포트만 보여줍니다 */}
        <div className="rv-section" id="reportViewAiSection" hidden>
          <h4 className="rv-section-title">
            AI 케어 리포트 (보호자 전달)
          </h4>
          <div className="rv-tags" id="reportViewQuickTags" hidden></div>
          <p className="rv-memo" id="reportViewMemo" hidden></p>
          <div className="rv-text-box" id="reportViewAiMessage"></div>
        </div>
        <div className="rv-next-visit" id="reportViewNextVisitBox" hidden>
          <span className="rv-next-visit-label">
            다음 병원 방문 예정일
          </span>
          {' '}
          <span className="rv-next-visit-badge" id="reportViewNextVisit"></span>
        </div>
        <div className="report-detail" id="reportViewLegacySection">
          <h4 id="reportViewPhysicianNotesTitle">
            진료 소견 · 의사 안내사항
          </h4>
          <p id="reportViewPhysicianNotes"></p>
          <h4>
            어르신 컨디션
          </h4>
          <div className="rv-tags" id="reportViewConditionTags" hidden></div>
          <p id="reportViewSeniorCondition"></p>
        </div>
        <div className="rv-section" id="reportViewPhotosSection" hidden>
          <h4 className="rv-section-title">
            증빙 사진
          </h4>
          <div className="rv-photo-grid" id="reportViewPhotoGrid"></div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" id="reportViewCloseBtn">
            닫기
          </button>
        </div>
      </div>
    </div>
    {/* 인증 사진 라이트박스 (제출한 케어 리포트 보기 모달 위에 오버레이) — mypage.html 의 rvPhotoLightbox 와 같은 구조 */}
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
    {/* 신청 숨기기 확인: window.confirm() 대신 위드브릿지 톤의 커스텀 모달 */}
    <div className="modal-backdrop" id="hideConfirmModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hideConfirmTitle">
        <h3 id="hideConfirmTitle">
          이 신청을 숨기시겠어요?
        </h3>
        <p className="modal-sub">
          내 목록에서만 숨겨지고, 다른 매니저는 계속 볼 수 있어요.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="hideConfirmCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="btn" id="hideConfirmOkBtn">
            숨기기
          </button>
        </div>
      </div>
    </div>
    {/* 웹 신청서 수락 (방식 B): 보호자 신청 일시를 그대로 신뢰하고, 일정 변경이 필요할 때만 별도로 '제안' 흐름을 탑니다 */}
    <div className="modal-backdrop" id="acceptModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="acceptModalTitle">
        <div className="accept-modal-head">
          <h3 id="acceptModalTitle">
            신청 수락
          </h3>
          <button type="button" className="dep-close" id="acceptCloseBtn" aria-label="닫기">
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <p className="modal-sub">
          보호자가 요청한 일시입니다. 일정 변경이 필요한 경우{' '}
          <strong>
            ‘일정 변경 제안’
          </strong>
          을 이용해 주세요.
        </p>
        <div className="target" id="acceptTarget"></div>
        {/* 보호자 신청 일시: 자유 입력을 없애고 읽기 전용 카드로 강조합니다 */}
        <div className="accept-when-card">
          <div className="accept-when-label">
            보호자 신청 일시
          </div>
          <div className="accept-when-value" id="acceptWhenDisplay"></div>
        </div>
        {/* 일정 변경 제안 폼: '일정 변경 제안' 버튼을 누르면 펼쳐집니다 */}
        <div className="accept-propose-panel" id="acceptProposePanel" hidden>
          <div className="field">
            <label htmlFor="acceptWhen">
              변경 희망 일시 *
            </label>
            {' '}
            <input type="datetime-local" id="acceptWhen" />
          </div>
          <p className="form-hint">
            보호자에게 변경 제안이 전달되고, 승인하면 이 일시로 배정이 확정돼요.
          </p>
          <div className="accept-propose-actions">
            <button type="button" className="btn btn-ghost" id="acceptProposeCancelBtn">
              닫기
            </button>
            {' '}
            <button type="button" className="btn" id="acceptProposeSaveBtn">
              변경 제안 보내기
            </button>
          </div>
        </div>
        <p className="form-error" id="acceptError" role="alert" hidden></p>
        {/* 기본 액션: [이대로 수락하기] 가 주, [일정 변경 제안] 이 부 */}
        <div className="accept-actions" id="acceptDefaultActions">
          <button type="button" className="btn" id="acceptAsIsBtn">
            이대로 수락하기
          </button>
          {' '}
          <button type="button" className="btn btn-ghost" id="acceptProposeToggleBtn">
            일정 변경 제안
          </button>
        </div>
        <p className="accept-footnote">
          * 일정 변경 제안 시, 보호자의 승인 후 배정이 최종 확정됩니다.
        </p>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 06-1b. 케어 완료 및 시간 입력 모달 (실제 종료 시각 · 초과 사유 · 증빙 자료 첨부 후 정산 요청) */}
    {' '}
    {/* ==================================================================== */}
    <div className="modal-backdrop" id="completeModal" hidden>
      <div className="modal complete-modal" role="dialog" aria-modal="true" aria-labelledby="completeModalTitle">
        <h3 id="completeModalTitle">
          케어 완료 및 시간 입력
        </h3>
        <p className="modal-sub">
          실제 종료 시각과 초과 사유를 입력하면 보호자에게 정산 요청이 전달돼요.
        </p>
        <div className="target" id="completeTarget"></div>
        <div className="complete-time-row">
          <div className="complete-time-box">
            <span className="complete-time-label">
              예정 종료 시각
            </span>
            <div className="complete-time-value">
              12:00
            </div>
          </div>
          <div className="field">
            <label id="completeActualEndLabel">
              실제 종료 시각 *
            </label>
            {' '}
            {/* 커스텀 플로팅 드롭다운: 실제 <select> 는 화면에서 숨겨 상태 저장 용도로만 씁니다 (cdrop 모듈 참고) */}
            {' '}
            <select id="completeActualEnd" className="cdrop-native-select" aria-hidden="true" tabIndex={-1}></select>
            <div className="cdrop">
              <button type="button" className="cdrop-trigger" id="completeActualEndTrigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="completeActualEndLabel">
                <span className="cdrop-trigger-main">
                  <span className="cdrop-trigger-text" id="completeActualEndText"></span>
                  {' '}
                  <span className="cdrop-pill" id="completeActualEndPill" hidden></span>
                </span>
                {' '}
                <svg className="cdrop-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <ul className="cdrop-menu" id="completeActualEndMenu" role="listbox" aria-labelledby="completeActualEndLabel"></ul>
            </div>
          </div>
        </div>
        {/* 조기 종료(음수 값) 선택 시에만 보이는 안내 — 초과 사유·증빙 사진 영역 대신 이 박스가 뜹니다 */}
        <div className="complete-early-info" id="completeEarlyInfoBox" hidden>
          기본 예약 시간 이내 종료 건으로, 별도 추가 정산금 없이 기본 요금으로 완료 처리됩니다.
        </div>
        <div className="field" id="completeOverReasonField" hidden>
          <label id="completeOverReasonLabel">
            초과 사유
          </label>
          {' '}
          <select id="completeOverReason" className="cdrop-native-select" aria-hidden="true" tabIndex={-1}></select>
          <div className="cdrop">
            <button type="button" className="cdrop-trigger" id="completeOverReasonTrigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="completeOverReasonLabel">
              <span className="cdrop-trigger-main">
                <span className="cdrop-trigger-text" id="completeOverReasonText"></span>
              </span>
              {' '}
              <svg className="cdrop-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <ul className="cdrop-menu" id="completeOverReasonMenu" role="listbox" aria-labelledby="completeOverReasonLabel"></ul>
          </div>
        </div>
        <div className="field" id="completeOverReasonEtcField" hidden>
          <label htmlFor="completeOverReasonEtc">
            기타 사유 직접 입력
          </label>
          {' '}
          <input type="text" id="completeOverReasonEtc" maxLength={80} placeholder="초과 사유를 입력해 주세요" />
        </div>
        <div className="complete-proof" id="completeProofBox" hidden>
          <label className="complete-proof-drop" htmlFor="completeProofInput">
            <span id="completeProofDropText">
              ＋ 병원 영수증 / 대기표 사진 첨부하기
            </span>
          </label>
          {' '}
          <input type="file" id="completeProofInput" accept="image/*" hidden />
          <p className="complete-proof-hint">
            30분 이상 초과 시 병원 영수증 또는 대기표 사진 첨부가 필수입니다.
          </p>
        </div>
        <div className="complete-report-section">
          <h4 className="complete-report-title">
            보호자 전달 케어 리포트
          </h4>
          <p className="complete-report-sub">
            보호자님께 그대로 전달돼요. 제출 후에는 수정할 수 없어요.
          </p>
          <div className="field">
            <label htmlFor="completePhysicianNotes">
              병원 진료 결과 및 의사 전달사항 *
            </label>
            {' '}
            <textarea id="completePhysicianNotes" maxLength={1500} required placeholder="예: 혈압 132/84, 처방약 2주분 수령. 다음 진료는 10월 3일."></textarea>
          </div>
          <div className="field">
            <label htmlFor="completeNextVisitDate">
              다음 진료 예약일 (선택)
            </label>
            {' '}
            <input type="date" id="completeNextVisitDate" />
          </div>
          <div className="field">
            <label id="completeConditionChipLabel">
              어르신 컨디션 *
            </label>
            <div className="chip-group" id="completeConditionChipGroup" role="radiogroup" aria-labelledby="completeConditionChipLabel">
              <button type="button" className="chip-btn" data-value="양호">
                양호
              </button>
              {' '}
              <button type="button" className="chip-btn" data-value="보통">
                보통
              </button>
              {' '}
              <button type="button" className="chip-btn" data-value="피곤/기력저하">
                피곤/기력저하
              </button>
              {' '}
              <button type="button" className="chip-btn" data-value="불편/통증">
                불편/통증
              </button>
            </div>
          </div>
          <div className="field">
            <label id="completeMobilityChipLabel">
              보행 상태 *
            </label>
            <div className="chip-group" id="completeMobilityChipGroup" role="radiogroup" aria-labelledby="completeMobilityChipLabel">
              <button type="button" className="chip-btn" data-value="자립 보행">
                자립 보행
              </button>
              {' '}
              <button type="button" className="chip-btn" data-value="부축 보행">
                부축 보행
              </button>
              {' '}
              <button type="button" className="chip-btn" data-value="휠체어 사용">
                휠체어 사용
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="completeSeniorCondition">
              특이사항 (선택)
            </label>
            {' '}
            <textarea id="completeSeniorCondition" className="compact" maxLength={500} placeholder="위 선택만으로 부족한 내용이 있다면 짧게 적어주세요."></textarea>
          </div>
          <div className="field">
            <div className="photo-strip-head">
              <label htmlFor="completePhotoInput">
                서류 · 현장 사진 (선택)
              </label>
              {' '}
              <span className="photo-count" id="completePhotoCount">
                0/5
              </span>
            </div>
            <input type="file" id="completePhotoInput" accept="image/*" multiple hidden />
            <div className="photo-strip" id="completePhotoGrid"></div>
          </div>
        </div>
        <p className="form-error" id="completeFormError" role="alert" hidden></p>
        <p className="complete-footnote">
          * 입력하신 위치 체크아웃 시간 및 증빙 자료를 바탕으로 보호자에게 정산 요청이 전달됩니다.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" id="completeCancelBtn">
            취소
          </button>
          {' '}
          <button type="button" className="btn" id="completeSubmitBtn">
            완료 및 정산 요청
          </button>
        </div>
      </div>
    </div>
    {/* ==================================================================== */}
    {' '}
    {/* 06-2. 출발 · 병원 도착 인증 모달 (GPS 또는 현장 사진으로 실제 이동을 인증) */}
    {' '}
    {/* ==================================================================== */}
    <div id="departure-modal" className="dep-backdrop hidden">
      <div className="dep-modal" role="dialog" aria-modal="true" aria-labelledby="departureModalTitle">
        {/* Header */}
        <div className="dep-head">
          <h3 id="departureModalTitle" className="dep-title">
            출발 인증
          </h3>
          <button type="button" id="btn-close-modal" className="dep-close" aria-label="닫기">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="dep-body">
          {/* 대상 일정 정보 */}
          <div className="dep-target">
            <div className="dep-target-row">
              <span>
                오늘의 케어 일정
              </span>
              {' '}
              <span id="depTargetTime" className="dep-target-time"></span>
            </div>
            <p className="dep-target-name" id="depTargetName"></p>
            <p className="dep-target-addr" id="depTargetAddrRow">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              {' '}
              <span>
                <strong id="depTargetAddrLabel" className="dep-addr-label"></strong>
                <span id="depTargetAddress"></span>
              </span>
            </p>
          </div>
          <p className="dep-hint">
            원활한 서비스 진행을 위해{' '}
            <strong>
              현재 위치
            </strong>
            를 확인해 주세요.
          </p>
          {/* 방법 1: GPS */}
          <div className="dep-section">
            <label className="dep-label">
              방법 1. GPS 위치 인증 (권장)
            </label>
            {' '}
            <button type="button" id="btn-get-gps" className="dep-gps-btn">
              <svg id="gps-icon" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              {' '}
              <span id="gps-btn-text">
                현재 위치 측정하기
              </span>
            </button>
            <div id="gps-success-box" className="dep-success hidden">
              <span id="gpsStatusIcon" className="dep-status-icon">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </span>
              {' '}
              <span id="gps-address-text"></span>
            </div>
            <p id="gps-error-text" className="dep-error hidden"></p>
          </div>
          {/* 구분선 */}
          <div className="dep-divider">
            <span>
              또는 GPS 수신이 안 될 경우
            </span>
          </div>
          {/* 방법 2: 사진 */}
          <div className="dep-section" id="dep-photo-section">
            <label className="dep-label">
              방법 2. 현장 사진 실시간 촬영
            </label>
            {' '}
            <label className="dep-photo-drop" id="dep-photo-drop">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h0.93a2 2 0 001.664-.89l0.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l0.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              <p id="photo-status-text">
                <strong>
                  터치하여 카메라로 촬영
                </strong>
                {' '}(실시간 촬영 전용)
              </p>
              <input type="file" id="input-camera" accept="image/*" capture="environment" className="hidden" />
            </label>
            <p className="dep-photo-guide" id="dep-photo-guide" hidden>
              * 병원 간판, 접수처 화면, 또는 원내 층수 안내판이 명확히 보이도록 촬영해 주세요.
            </p>
          </div>
        </div>
        {/* Footer */}
        <div className="dep-foot">
          <button type="button" id="btn-cancel-modal" className="dep-btn-cancel">
            취소
          </button>
          {' '}
          <button type="button" id="btn-submit-departure" className="dep-btn-submit" disabled>
            인증 완료
          </button>
        </div>
      </div>
    </div>
    <div className="toast" id="toast" role="status" hidden></div>
      <ManagerMypageBehaviors />
    </>
  );
}
