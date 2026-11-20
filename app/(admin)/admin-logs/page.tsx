import '../admin-shared.css';
import '../../styles/mobile-nav.css';
import './admin-logs.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { AdminLogsBehaviors } from './AdminLogsBehaviors';

export const metadata: Metadata = {
  title: { absolute: "관리자 로그 | 위드브릿지 어드민 콘솔" },
  robots: { index: false, follow: false },
};

/** 관리자 로그 | 위드브릿지 어드민 — public/admin-logs.html 에서 옮김. 동작은 AdminLogsBehaviors.tsx */
export default function AdminLogsPage() {
  return (
    <>
      <NotoSansKr weights="400;500;700;800" />
    {/* ==================================================================== */}
    {' '}
    {/* 01. 상단 헤더 — admin.html 과 같은 톤, 로그 페이지임을 분명히 하고 콘솔로 돌아가는 링크를 둡니다 */}
    {' '}
    {/* ==================================================================== */}
    <header className="admin-header">
      <div className="admin-header-inner">
        <h1 className="admin-title">
          관리자 로그
        </h1>
        <div className="admin-account" id="adminAccount" hidden>
          <span className="admin-account-name" id="adminName">
            관리자
          </span>
          {' '}
          <a className="admin-refresh-btn" href="/admin">
            ← 어드민 콘솔로
          </a>
          {' '}
          <button type="button" className="admin-logout-btn" id="logoutBtn">
            로그아웃
          </button>
        </div>
      </div>
    </header>
    <main className="admin-main">
      <section className="admin-card" aria-labelledby="logsTitle">
        <div className="admin-card-head">
          <h2 id="logsTitle">
            관리자 활동 이력
          </h2>
          <div className="admin-card-head-actions">
            <span className="admin-count" id="logsCount" hidden>
              0건
            </span>
            {' '}
            <button type="button" className="admin-btn is-ghost" id="logsExportBtn">
              엑셀 다운로드
            </button>
          </div>
        </div>
        <p className="admin-card-desc">
          회원 정보 수정 · CS 메모 작성 · 계정 정지/활성화 등 관리자가 수행한 민감한 조작을 모두 기록합니다. 이 화면은 조회만 가능한 Read-Only 감사 화면입니다 — 수정·삭제 기능이 없고, DB 쪽에도 이 로그를 고치거나 지울 수 있는 경로가 아예 없습니다.
        </p>
        <p className="admin-readonly-notice">
          읽기 전용(Read-Only) — 이 화면과 연결된 admin_logs 테이블은 어떤 경로로도 수정·삭제할 수 없습니다.
        </p>
        <div className="admin-filter-bar">
          <div className="admin-date-range">
            <span>
              기간
            </span>
            {' '}
            <input type="date" id="logsDateFrom" />
            {' '}
            <span>
              ~
            </span>
            {' '}
            <input type="date" id="logsDateTo" />
          </div>
          <select className="admin-logs-select" id="logsAdminFilter">
            <option value="">
              관리자 전체
            </option>
          </select>
          {' '}
          <select className="admin-logs-select" id="logsActionFilter">
            <option value="">
              작업 종류 전체
            </option>
          </select>
          {' '}
          <button type="button" className="admin-btn is-ghost" id="logsResetFilterBtn" style={{ flex: "none" }}>
            필터 초기화
          </button>
        </div>
        <div className="admin-settlement-table-wrap">
          <table className="admin-settlement-table admin-logs-table" id="logsTable">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "34%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  일시
                </th>
                <th>
                  관리자
                </th>
                <th>
                  작업 종류
                </th>
                <th>
                  대상
                </th>
                <th>
                  세부 내용
                </th>
              </tr>
            </thead>
            <tbody id="logsTableBody">
              <tr>
                <td colSpan={5} className="admin-loading">
                  불러오는 중…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="admin-pagination" id="logsPaginationWrap" hidden></div>
      </section>
    </main>
    {/* 세부 내용 전체보기 모달 — "세부 내용" 칸을 클릭하면 열립니다(말줄임표로 잘린 내용을 전부 보여줌) */}
    <div className="modal-backdrop" id="logDetailModal" hidden>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="logDetailModalTitle">
        <div className="modal-head">
          <h3 id="logDetailModalTitle">
            로그 상세
          </h3>
          <button type="button" className="modal-close-btn" id="logDetailCloseBtn" aria-label="닫기">
            ✕
          </button>
        </div>
        <dl className="admin-detail-grid" id="logDetailGrid"></dl>
        <div className="modal-actions">
          <button type="button" className="admin-btn is-ghost" id="logDetailCloseBtn2">
            닫기
          </button>
        </div>
      </div>
    </div>
    <div className="admin-toast" id="adminToast" hidden></div>
    {/* Supabase 접속 정보(window.WB_ENV). scripts/build-env.mjs 가 .env / Vercel 환경 변수로 생성 */}
      <AdminLogsBehaviors />
    </>
  );
}
