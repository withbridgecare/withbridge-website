/**
 * 외부 스크립트(카카오 우편번호, 아직 React 로 옮기지 않은 공용 위젯 등)를 한 번만 불러옵니다.
 * 이미 불러왔거나 불러오는 중이면 같은 Promise 를 돌려줍니다.
 */
const pending = new Map<string, Promise<void>>();

export function loadScript(src: string, opts: { async?: boolean } = {}): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const already = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (already && already.dataset.loaded === '1') return resolve();
    const s = already ?? document.createElement('script');
    s.addEventListener('load', () => {
      s.dataset.loaded = '1';
      resolve();
    });
    s.addEventListener('error', () => {
      pending.delete(src);
      reject(new Error('스크립트를 불러오지 못했습니다: ' + src));
    });
    if (!already) {
      s.src = src;
      if (opts.async) s.async = true;
      document.head.appendChild(s);
    }
  });
  pending.set(src, p);
  return p;
}

export const SCRIPTS = {
  /** 카카오(다음) 우편번호 */
  postcode: 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js',
  /** 공용 날짜/시간 선택기 (레거시 마이페이지와 함께 쓰는 중 — 마이페이지 전환 후 React 컴포넌트로) */
  datepicker: '/js/wb-datepicker.js?v=1.6',
  /** 공용 장소 검색 (카카오 로컬) */
  placeSearch: '/js/wb-place-search.js?v=1.0',
} as const;
