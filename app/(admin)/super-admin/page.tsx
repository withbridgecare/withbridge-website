import '../admin-shared.css';
import '../../styles/mobile-nav.css';
import './super-admin.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { SuperAdminBehaviors } from './SuperAdminBehaviors';

export const metadata: Metadata = {
  title: { absolute: "최고 관리자 콘솔 | 위드브릿지 어드민" },
  robots: { index: false, follow: false },
};

/** 최고 관리자 | 위드브릿지 어드민 — public/super-admin.html 에서 옮김. 동작은 SuperAdminBehaviors.tsx */
export default function SuperAdminPage() {
  return (
    <>
      <NotoSansKr weights="400;500;700;800" />
    {/* ==================================================================== */}
    {' '}
    {/* 01. 상단 헤더 — admin.html 과 같은 톤, 최고 관리자 전용 화면임을 분명히 하고 일반 콘솔로 돌아가는 링크를 둡니다. */}
    {' '}
    {/* ==================================================================== */}
    <header className="admin-header">
      <div className="admin-header-inner">
        <h1 className="admin-title">
          최고 관리자 콘솔
        </h1>
        <div className="admin-account" id="adminAccount" hidden>
          <span className="admin-account-name" id="adminName">
            최고 관리자
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
      {/* ================================================================ */}
      {' '}
      {/* 01. 시스템 관리자 계정 부여 — 이메일로 가입된 계정을 찾아 role 을 'admin' 으로 바꿉니다 (sql/super_admin_management.sql 의 super_admin_grant_admin() RPC). super_admin 계정은 이 화면으로 만들 수 없습니다(Supabase 대시보드에서 직접 role='super_admin' 으로 설정). */}
      {' '}
      {/* ================================================================ */}
      <section className="admin-card" aria-labelledby="grantTitle">
        <div className="admin-card-head">
          <h2 id="grantTitle">
            시스템 관리자 계정 부여
          </h2>
        </div>
        <p className="admin-card-desc">
          이미 위드브릿지에 가입된 계정의 이메일을 입력하면 해당 계정에 관리자(admin) 권한을 부여합니다. 가입되지 않은 이메일은 부여할 수 없습니다.
        </p>
        <div className="sa-grant-row">
          <input type="email" className="admin-search-input" id="grantEmailInput" placeholder="admin@example.com" autoComplete="off" />
          {' '}
          <button type="button" className="admin-btn is-primary" id="grantAdminBtn">
            관리자 권한 부여
          </button>
        </div>
        <p className="admin-error" id="grantError" hidden></p>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* 02. 현재 관리자 목록 — role 이 admin/super_admin 인 계정 전체(super_admin_list_admins() RPC). 본인 계정과 super_admin 계정은 [권한 회수] 버튼이 비활성화됩니다. */}
      {' '}
      {/* ================================================================ */}
      <section className="admin-card" aria-labelledby="adminListTitle">
        <div className="admin-card-head">
          <h2 id="adminListTitle">
            현재 관리자 목록
          </h2>
          <span className="admin-count" id="adminListCount" hidden>
            0명
          </span>
        </div>
        <p className="admin-card-desc">
          관리자(admin) · 최고 관리자(super_admin) 권한을 가진 전체 계정입니다. 본인 계정과 최고 관리자 계정은 이 화면에서 권한을 회수할 수 없습니다.
        </p>
        <div className="admin-settlement-table-wrap">
          <table className="admin-settlement-table" id="adminListTable">
            <thead>
              <tr>
                <th>
                  이름
                </th>
                <th>
                  이메일
                </th>
                <th>
                  권한
                </th>
                <th>
                  가입일
                </th>
                <th aria-label="권한 회수"></th>
              </tr>
            </thead>
            <tbody id="adminListTableBody">
              <tr>
                <td colSpan={5} className="admin-loading">
                  불러오는 중…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {/* ================================================================ */}
      {' '}
      {/* 03. 권한 변경 이력 — admin_logs 에서 super_admin_grant_admin / super_admin_revoke_admin 만 모아 타임라인으로 보여줍니다(읽기 전용, admin-logs.html 과 같은 테이블을 쓰되 이 화면은 그 중 권한 변경 이력만 추려 봅니다). */}
      {' '}
      {/* ================================================================ */}
      <section className="admin-card" aria-labelledby="roleTimelineTitle">
        <div className="admin-card-head">
          <h2 id="roleTimelineTitle">
            관리자 권한 변경 이력
          </h2>
        </div>
        <p className="admin-card-desc">
          관리자 권한을 부여하거나 회수한 모든 기록입니다(최근 순). 이 기록은 수정·삭제할 수 없습니다.
        </p>
        <ul className="sa-timeline" id="roleTimelineList">
          <li className="admin-loading">
            불러오는 중…
          </li>
        </ul>
      </section>
    </main>
    <div className="admin-toast" id="adminToast" hidden></div>
    {/* Supabase 접속 정보(window.WB_ENV). scripts/build-env.mjs 가 .env / Vercel 환경 변수로 생성 */}
      <SuperAdminBehaviors />
    </>
  );
}
