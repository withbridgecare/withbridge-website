#!/usr/bin/env node
// 브라우저에서 쓰는 설정값을 .env(로컬) 또는 Vercel 환경 변수(배포)에서 읽어 public/js/env.js 로 만들어 줍니다 (일부러 남겨 둔 옛 HTML — public/about_old.html, public/test/ — 전용. 그 페이지들을 지우면 이 스크립트도 삭제).
// 이 사이트는 빌드 도구 없는 정적 HTML 이라 브라우저가 .env 를 직접 읽을 수 없어서, 이 스크립트가
// 그 값을 window.WB_ENV 로 옮겨 적은 작은 JS 파일을 생성합니다. public/js/env.js 는 생성물이라 커밋하지 않습니다.
//
//   로컬:  node scripts/build-env.mjs   (.env 를 읽음)
//   배포:  Vercel 이 빌드할 때 자동 실행 (vercel.json 의 buildCommand, Vercel 환경 변수를 읽음)
//
// 우선순위: 이미 설정된 환경 변수(Vercel 등) > .env 파일
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 브라우저로 내보낼 값만 여기 적습니다. 비밀 키(결제·알림 API 키 등)는 절대 넣지 마세요 —
// js/env.js 는 누구나 내려받을 수 있는 공개 파일입니다.
const PUBLIC_KEYS = ['WB_ENV_NAME', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function parseDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, ''); // 따옴표 없는 값 뒤의 "  # 설명" 주석 제거
    out[key] = val;
  }
  return out;
}

const fileEnv = parseDotEnv(join(root, '.env'));
const env = {};
for (const key of PUBLIC_KEYS) {
  const val = process.env[key] || fileEnv[key];
  if (val) env[key] = val;
}
if (!env.WB_ENV_NAME) env.WB_ENV_NAME = 'production';

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error('[build-env] 필수 설정값이 없습니다: ' + missing.join(', '));
  console.error('  로컬: .env.example 을 참고해 .env 에 값을 넣으세요.');
  console.error('  배포: Vercel → Project Settings → Environment Variables 에 등록하세요.');
  process.exit(1);
}

const body =
  '/* 자동 생성 파일 — 직접 고치지 마세요. scripts/build-env.mjs 가 .env / Vercel 환경 변수로 만듭니다. */\n' +
  'window.WB_ENV = Object.freeze(' + JSON.stringify(env, null, 2) + ');\n';
writeFileSync(join(root, 'public', 'js', 'env.js'), body);
console.log('[build-env] js/env.js → public/js/env.js 생성 완료 (환경: ' + env.WB_ENV_NAME + ', Supabase: ' + env.SUPABASE_URL + ')');
