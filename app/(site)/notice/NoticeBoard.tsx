'use client';

/**
 * 공지사항 검색·카테고리 탭·펼침 목록 (예전 notice.html 의 인라인 <script> 를 React 로 옮김)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import {
  listPublishedNotices,
  NOTICE_BADGE_LABEL,
  NOTICE_CATEGORY_LABEL,
  type Notice,
  type NoticeCategory,
} from '@/lib/api/notices';

type Tab = 'all' | NoticeCategory;
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'service', label: '서비스 안내' },
  { key: 'maintenance', label: '시스템 점검' },
  { key: 'event', label: '이벤트' },
];

function NoticeItem({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string>('0px');

  // 펼침/접힘 높이 애니메이션 (내용 높이 → auto)
  const toggle = () => {
    const body = bodyRef.current;
    if (!body) return;
    if (open) {
      setHeight(body.scrollHeight + 'px');
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight('0px')));
    } else {
      setHeight(body.scrollHeight + 'px');
    }
    setOpen(!open);
  };

  return (
    <div className={'nt-item' + (notice.pinned ? ' is-pinned' : '') + (open ? ' is-open' : '')} data-id={notice.id}>
      <button type="button" className="nt-item-head" aria-expanded={open} onClick={toggle}>
        <span className="nt-badges">
          {notice.badge && <span className={'nt-badge ' + notice.badge}>{NOTICE_BADGE_LABEL[notice.badge]}</span>}
          <span className="nt-badge category">{NOTICE_CATEGORY_LABEL[notice.category]}</span>
        </span>
        <span className="nt-item-title-wrap">
          <span className="nt-item-title">{notice.title}</span>
          <span className="nt-item-date">{notice.date}</span>
        </span>
        <svg className="nt-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        className="nt-item-body"
        ref={bodyRef}
        style={{ height }}
        onTransitionEnd={() => {
          if (open) setHeight('auto');
        }}
      >
        <div className="nt-item-body-inner">
          {notice.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NoticeBoard() {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    listPublishedNotices(getSupabase())
      .then(setNotices)
      .catch((e) => {
        console.error('[notice] 공지사항 불러오기 실패:', e);
        setFailed(true);
      });
  }, []);

  const items = useMemo(() => {
    if (!notices) return [];
    const q = query.trim().toLowerCase();
    const sorted = [...notices.filter((n) => n.pinned), ...notices.filter((n) => !n.pinned)];
    return sorted.filter((n) => {
      if (tab !== 'all' && n.category !== tab) return false;
      if (!q) return true;
      return (n.title + ' ' + n.paragraphs.join(' ')).toLowerCase().includes(q);
    });
  }, [notices, tab, query]);

  return (
    <>
      <div className="nt-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="제목이나 내용으로 검색해 보세요"
          aria-label="공지사항 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="nt-tabs" role="tablist" aria-label="공지사항 카테고리">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'nt-tab' + (tab === t.key ? ' is-active' : '')}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="nt-list">
        {notices === null && !failed && <p className="nt-empty is-visible">공지사항을 불러오는 중…</p>}
        {items.map((n) => (
          <NoticeItem key={n.id} notice={n} />
        ))}
      </div>
      <p className={'nt-empty' + (failed || (notices !== null && items.length === 0) ? ' is-visible' : '')}>
        {failed ? '공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '검색 결과가 없습니다. 다른 검색어나 카테고리를 선택해 보세요.'}
      </p>
    </>
  );
}
