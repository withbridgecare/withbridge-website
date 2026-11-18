/**
 * 사이트 공통 바닥글 (예전 js/site-footer.js 를 그대로 옮김).
 * 회사 정보가 바뀌면 이 파일만 고치면 됩니다 — 단, 아직 레거시 HTML 페이지가 남아 있는 동안에는
 * public/js/site-footer.js 도 같이 고쳐야 합니다.
 * (원칙 3에 따라 나중에 site_settings 테이블로 옮겨 관리자 화면에서 고치게 할 대상)
 */
import { isValidElement } from 'react';
import { ROUTES, SITE } from '@/lib/config';

const COMPANY: [string, React.ReactNode][] = [
  ['상호명', '위드브릿지'],
  ['대표자', '강승수'],
  ['사업자등록번호', '530-20-02322'],
  ['통신판매업 신고번호', '신고 예정'],
];

const CONTACT: [string, React.ReactNode][] = [
  ['주소', '인천광역시 남동구 인하로507번길 108, 1층 102호(구월동)'],
  [
    '전화번호',
    <a key="tel" href={'tel:' + SITE.phone.replace(/-/g, '')} style={{ color: '#ffffff', fontWeight: 500, textDecoration: 'none' }}>
      {SITE.phone}
    </a>,
  ],
  [
    '이메일',
    <a key="mail" href={'mailto:' + SITE.email} style={{ color: '#ffffff', fontWeight: 500, textDecoration: 'none' }}>
      {SITE.email}
    </a>,
  ],
  [
    '운영시간',
    <>
      평일 08:00 ~ 18:00 <span style={{ color: '#a1a1aa' }}>(주말·공휴일 휴무)</span>
    </>,
  ],
];

const SOCIAL = [
  { label: '인스타그램', href: '#instagram' },
  { label: '유튜브', href: '#youtube' },
  { label: '틱톡', href: '#tiktok' },
];

function InfoRows({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>{title}</h3>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 12, padding: '4px 0', fontSize: 14, overflowWrap: 'anywhere' }}>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>{label}</span>
          {/* 링크(전화·이메일)는 감싸지 않고 그대로 — 예전 마크업과 같은 구조 */}
          {isValidElement(value) && value.type === 'a' ? value : <span style={{ color: '#f4f4f5' }}>{value}</span>}
        </div>
      ))}
    </div>
  );
}

export function SiteFooter() {
  return (
    <div className="site-footer">
      <footer style={{ backgroundColor: '#1A1D21', color: '#E5E7EB', padding: '64px 32px 48px 32px', fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <strong style={{ fontSize: 20, fontWeight: 700, color: '#ffffff' }}>{SITE.name}</strong>
              <span style={{ fontSize: 14, color: '#a1a1aa' }}>{SITE.nameEn}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>
              <nav style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 14 }}>
                <a href={ROUTES.terms} target="_blank" rel="noopener" style={{ color: '#d4d4d8', textDecoration: 'underline', textUnderlineOffset: 4 }}>
                  이용약관
                </a>
                <span style={{ width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                <a href={ROUTES.privacy} target="_blank" rel="noopener" style={{ color: '#ffffff', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4 }}>
                  개인정보 처리방침
                </a>
              </nav>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {SOCIAL.map((s) => (
                  <a key={s.label} href={s.href} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 18px', borderRadius: 9999, backgroundColor: '#ffffff', color: '#18181b', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                    <span>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="wb-footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 48 }}>
            <InfoRows title="회사 정보" rows={COMPANY} />
            <InfoRows title="연락처 & 고객센터" rows={CONTACT} />
          </div>

          <div style={{ paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#e4e4e7' }}>© 2026 WithBridge. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
