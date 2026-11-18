#!/usr/bin/env node
// 로컬 미리보기 서버 — 배포(Vercel)와 같은 "확장자 없는 주소(cleanUrls)"로 동작합니다.
//
// python3 -m http.server 는 파일 이름 그대로만 찾기 때문에 /mypage, /story 같은 주소가 404 가 됩니다.
// 배포 환경은 vercel.json 의 "cleanUrls": true, "trailingSlash": false 로
//   /mypage        → mypage.html 내용을 보여 줌
//   /mypage.html   → /mypage 로 308 리다이렉트
//   /mypage/       → /mypage 로 308 리다이렉트
// 처럼 동작하므로, 로컬에서도 똑같이 맞춰 줍니다. 외부 패키지 없이 Node 기본 모듈만 씁니다.
//
//   실행: npm run dev            (기본 포트 5500)
//         node scripts/dev-server.mjs 8080
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 5500);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
};

// 요청 경로를 저장소 안의 실제 파일 경로로 바꿉니다(.. 등으로 저장소 밖을 가리키면 null).
function resolveInRoot(urlPath) {
  const p = normalize(join(root, decodeURIComponent(urlPath)));
  return p === root || p.startsWith(root + sep) ? p : null;
}
function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}
function redirect(res, location) {
  res.writeHead(308, { Location: location });
  res.end();
}

createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end(); return; }
  const path = url.pathname;
  const search = url.search;

  // 끝의 슬래시 제거(trailingSlash: false) — 루트(/)는 제외
  if (path.length > 1 && path.endsWith('/')) return redirect(res, path.replace(/\/+$/, '') + search);

  // /foo.html → /foo (cleanUrls), /index.html → /
  if (path.endsWith('.html')) {
    const clean = path.slice(0, -5);
    return redirect(res, (clean === '/index' ? '/' : clean) + search);
  }

  const target = resolveInRoot(path === '/' ? '/index.html' : path);
  if (!target) { res.writeHead(403).end('Forbidden'); return; }

  if (isFile(target)) return send(res, 200, target);                         // 실제 파일(css/js/이미지 등)
  if (!extname(target) && isFile(target + '.html')) return send(res, 200, target + '.html'); // /mypage → mypage.html
  if (isFile(join(target, 'index.html'))) return send(res, 200, join(target, 'index.html')); // 폴더 → index.html

  const notFound = join(root, '404.html');
  if (existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + path);
}).listen(port, () => {
  console.log(`위드브릿지 로컬 서버: http://127.0.0.1:${port}  (확장자 없는 주소 지원 — /mypage, /story …)`);
});
