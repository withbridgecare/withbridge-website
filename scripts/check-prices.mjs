#!/usr/bin/env node
// 가격 일치 검사 — lib/catalog.json(화면 금액)과 서버 결제 검증 SQL 함수의 금액이 같은지 확인합니다.
// 다르면 결제가 끝난 뒤 서버가 AMOUNT_MISMATCH 로 신청을 막으므로, 배포 전에 반드시 통과해야 합니다.
//   실행: npm run check:prices   (GitHub 자동 점검에도 포함)
// ⚠ 저장소의 SQL '파일'과 비교합니다. 파일을 고친 뒤 Supabase SQL Editor 에서 실제로 실행했는지는 따로 확인하세요.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'lib/catalog.json'), 'utf8'));

/** sql 파일에서 함수 정의 본문을 꺼내 `when '키' then 숫자` 를 { 키: 숫자 } 로 */
function caseTable(file, fn) {
  const sql = readFileSync(join(root, file), 'utf8');
  const start = sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i'));
  if (start < 0) throw new Error(`${file} 에서 ${fn}() 정의를 찾지 못했습니다`);
  const end = sql.indexOf('$$;', start);
  const body = sql.slice(start, end);
  const out = {};
  for (const m of body.matchAll(/when\s+'([^']+)'\s+then\s+(\d+)/gi)) out[m[1]] = Number(m[2]);
  return out;
}

const problems = [];
const check = (label, screen, server) => {
  if (server === undefined) problems.push(`- ${label}: 서버 SQL 에 항목이 없음 (화면 ${screen})`);
  else if (screen !== server) problems.push(`- ${label}: 화면 ${screen.toLocaleString()} ≠ 서버 ${server.toLocaleString()}`);
};

const svcFile = 'sql/one_hour_light_care_service.sql';
const base = caseTable(svcFile, 'expected_service_price');
const over = caseTable(svcFile, 'expected_overtime_rate_per_30min');
for (const s of catalog.services) {
  check(`서비스 기본 요금 '${s.name}'  [${svcFile} expected_service_price]`, s.basePrice, base[s.name]);
  check(`초과 30분 요금 '${s.name}'  [${svcFile} expected_overtime_rate_per_30min]`, s.extraPer30Min, over[s.name]);
}

const addonFile = 'sql/user_coupons_checkout.sql';
const addons = caseTable(addonFile, 'expected_addon_total');
for (const a of Object.values(catalog.addons)) check(`옵션 '${a.label}' (${a.code})  [${addonFile} expected_addon_total]`, a.amount, addons[a.code]);

const pkgFile = 'sql/user_packages_system.sql';
const pkgs = caseTable(pkgFile, 'expected_package_price');
for (const [type, p] of Object.entries(catalog.packages)) check(`패키지 '${p.label}' (${type})  [${pkgFile} expected_package_price]`, p.price, pkgs[type]);

if (problems.length) {
  console.error('✗ 화면 가격(lib/catalog.json)과 서버 결제 검증 SQL 의 금액이 다릅니다:\n' + problems.join('\n'));
  console.error('\n  두 곳을 같은 값으로 맞추고, 바꾼 SQL 함수는 Supabase SQL Editor 에서 실행해 실제 DB 에도 반영하세요 (lib/services.ts 설명 참고).');
  process.exit(1);
}
console.log(`✓ 가격 일치: 서비스 ${catalog.services.length}개 · 옵션 ${Object.keys(catalog.addons).length}개 · 패키지 ${Object.keys(catalog.packages).length}개가 서버 SQL 과 같습니다.`);
