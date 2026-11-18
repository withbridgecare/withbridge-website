import './notice.css';
import type { Metadata } from 'next';
import { NoticeBoard } from './NoticeBoard';

export const metadata: Metadata = {
  title: "공지사항",
  description: "위드브릿지의 주요 안내 및 업데이트 소식을 확인하세요.",
};

/** 공지사항 | 위드브릿지 — public/notice.html 에서 옮김 */
export default function NoticePage() {
  return (
    <main className="nt-main">
      <div className="nt-wrap">
        <div className="nt-head">
          <h1 className="nt-title">
            공지사항
          </h1>
          <p className="nt-sub">
            위드브릿지의 주요 안내 및 업데이트 소식을 확인하세요.
          </p>
        </div>
        <NoticeBoard />
      </div>
    </main>
  );
}
