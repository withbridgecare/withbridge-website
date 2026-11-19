/**
 * 개인정보 보호 도우미 (예전 public/js/privacy-guard.js).
 *  1) 운영 도메인에서 console.log/info/debug 끄기 — 디버그 로그에 이름·연락처·좌표가 찍히는 곳이 있어서.
 *     (화면을 그리기 전에 꺼야 해서 실제 코드는 app/layout.tsx 의 인라인 스크립트에 있습니다: PRIVACY_CONSOLE_SCRIPT)
 *     운영 도메인에서 잠깐 디버그가 필요하면 주소 뒤에 ?wb_debug=1
 *  2) 비공개 Storage 버킷(care-departure-photos) 사진 주소를 로그인 사용자 권한의 1시간짜리 서명 URL 로 자동 교체
 *  3) 예전 버전이 localStorage 에 남긴 체크포인트의 위치·사진 지우기
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export const PROD_HOSTNAMES = ['withbridgewebsite.vercel.app', 'www.withbridge.kr', 'withbridge.kr'];

/** app/layout.tsx 에서 <head> 에 그대로 넣는 스크립트 (문자열) */
export const PRIVACY_CONSOLE_SCRIPT = `(function(){try{var h=${JSON.stringify(PROD_HOSTNAMES)};if(h.indexOf(location.hostname)===-1)return;if(/[?&]wb_debug=1(&|$)/.test(location.search))sessionStorage.setItem('wb_debug','1');if(sessionStorage.getItem('wb_debug')==='1')return;var n=function(){};['log','info','debug','table','dir'].forEach(function(k){try{console[k]=n}catch(e){}})}catch(e){}})();`;

const PRIVATE_BUCKETS = ['care-departure-photos'];
const SIGNED_TTL_SEC = 3600;
const cache: Record<string, { url: string; exp: number }> = {};

export function parsePrivateRef(src: string | null): { bucket: string; path: string } | null {
  if (!src) return null;
  for (const b of PRIVATE_BUCKETS) {
    const marker = '/storage/v1/object/public/' + b + '/';
    const idx = src.indexOf(marker);
    if (idx !== -1) return { bucket: b, path: decodeURIComponent(src.slice(idx + marker.length).split('?')[0]) };
    const ref = 'storage:' + b + '/';
    if (src.indexOf(ref) === 0) return { bucket: b, path: src.slice(ref.length) };
  }
  return null;
}

async function signedUrlFor(client: WBSupabaseClient, ref: { bucket: string; path: string }) {
  const key = ref.bucket + '/' + ref.path;
  const hit = cache[key];
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await client.storage.from(ref.bucket).createSignedUrl(ref.path, SIGNED_TTL_SEC);
  if (error || !data?.signedUrl) throw error || new Error('SIGN_FAILED');
  cache[key] = { url: data.signedUrl, exp: Date.now() + (SIGNED_TTL_SEC - 300) * 1000 };
  return data.signedUrl;
}

function resolveImg(client: WBSupabaseClient, img: Element) {
  if (img.tagName !== 'IMG') return;
  const raw = img.getAttribute('src');
  const ref = parsePrivateRef(raw);
  if (!ref || !raw) return;
  img.setAttribute('data-wb-private-src', raw);
  img.removeAttribute('src'); // 막힌 원본 주소로 요청이 나가지 않게
  signedUrlFor(client, ref)
    .then((url) => {
      if (img.getAttribute('data-wb-private-src') === raw) img.setAttribute('src', url);
    })
    .catch(() => {
      const el = img as HTMLImageElement;
      el.alt = el.alt || '사진을 볼 권한이 없습니다';
    });
}

let attached = false;
/** 화면에 비공개 사진 <img> 가 생길 때마다 서명 URL 로 바꿉니다 (페이지당 한 번) */
export function attachPhotoResolver(client: WBSupabaseClient) {
  if (attached) return;
  attached = true;
  const scan = (root: Element) => {
    resolveImg(client, root);
    root.querySelectorAll('img[src]').forEach((img) => resolveImg(client, img));
  };
  scan(document.body);
  new MutationObserver((muts) =>
    muts.forEach((m) => {
      if (m.type === 'attributes') resolveImg(client, m.target as Element);
      else m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as Element));
    }),
  ).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}

/** 체크포인트 맵에서 위치·사진 항목을 뺀 사본 */
export function stripCheckpointPii(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCheckpointPii);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  Object.keys(value as Record<string, unknown>).forEach((k) => {
    if (/^(location|gps|coords|lat|lng|accuracy|photo|photo_url|photoUrl|image)$/.test(k)) return;
    if (/_(location|photo)$/.test(k)) return;
    out[k] = stripCheckpointPii((value as Record<string, unknown>)[k]);
  });
  return out;
}

/** 예전 버전이 localStorage 'wb_care_checkpoints' 에 남긴 GPS·사진 지우기 (시각만 유지) */
export function scrubLegacyCheckpoints() {
  try {
    const raw = localStorage.getItem('wb_care_checkpoints');
    if (!raw) return;
    localStorage.setItem('wb_care_checkpoints', JSON.stringify(stripCheckpointPii(JSON.parse(raw))));
  } catch {
    try {
      localStorage.removeItem('wb_care_checkpoints');
    } catch {
      /* 무시 */
    }
  }
}
