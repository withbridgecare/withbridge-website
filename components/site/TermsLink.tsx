'use client';

/**
 * '이용약관' 링크 — 누르면 약관을 팝업(iframe: /terms?embed=1)으로 보여 줍니다. (예전 js/terms-modal.js)
 *  - onAgree 를 넘기면 팝업 아래 [동의하고 닫기] 버튼이 생기고, 누르면 onAgree() 를 부릅니다 (체크박스 체크 등).
 *  - 서버 컴포넌트 페이지에서는 함수를 넘길 수 없으므로 agreeSelector="#terms" 처럼 체크할 체크박스를 지정합니다.
 *  - article 을 넘기면 해당 조문(예: 6 → 제6조)으로 바로 이동합니다.
 *  - Ctrl/⌘/Shift/가운데 클릭은 막지 않고 약관 페이지를 새 탭으로 엽니다.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROUTES } from '@/lib/config';

type Props = { children: React.ReactNode; onAgree?: () => void; agreeSelector?: string; article?: number | string } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'onClick'
>;

export function TermsLink({ children, onAgree, agreeSelector, article, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const agree =
    onAgree ??
    (agreeSelector
      ? () => {
          const el = document.querySelector<HTMLInputElement>(agreeSelector);
          if (!el) return;
          el.checked = true;
          // 폼의 오류 표시 등도 함께 갱신되도록 이벤트를 보냄 (예전 terms-modal.js 와 동일)
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      : undefined);
  return (
    <>
      <a
        href={ROUTES.terms}
        {...rest}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      {open && <TermsModal article={article} onClose={() => setOpen(false)} onAgree={agree} />}
    </>
  );
}

function TermsModal({ article, onClose, onAgree }: { article?: number | string; onClose: () => void; onAgree?: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const anchor = article ? (/^\d+$/.test(String(article)) ? 'art-' + article : String(article).replace(/[^a-z0-9-]/gi, '')) : '';
  const src = ROUTES.terms + '?embed=1' + (anchor ? '#' + anchor : '');

  useEffect(() => {
    const lastFocus = document.activeElement as HTMLElement | null;
    document.documentElement.classList.add('wbt-lock');
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return; // 포커스를 팝업 안에 가둠
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, a[href]'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialogRef.current.contains(document.activeElement) || document.activeElement?.tagName === 'IFRAME') {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('wbt-lock');
      lastFocus?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="wbt-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wbt-dialog" role="dialog" aria-modal="true" aria-labelledby="wbtTitle" ref={dialogRef}>
        <div className="wbt-head">
          <h2 id="wbtTitle">이용약관</h2>
        </div>
        <div className="wbt-body">
          <iframe className="wbt-frame" title="위드브릿지 서비스 이용약관" src={src} />
        </div>
        <div className="wbt-foot">
          <a className="wbt-link" href={ROUTES.terms} target="_blank" rel="noopener">
            새 창에서 보기
          </a>
          <div className="wbt-foot-actions">
            <button type="button" className="wbt-btn wbt-plain" ref={closeRef} onClick={onClose}>
              닫기
            </button>
            {onAgree && (
              <button
                type="button"
                className="wbt-btn wbt-primary"
                onClick={() => {
                  onAgree();
                  onClose();
                }}
              >
                동의하고 닫기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
