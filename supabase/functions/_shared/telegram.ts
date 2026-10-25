// 텔레그램 알림 발송 공용 모듈 — 신규 케어 신청이 결제 확인(MATCHING_PENDING 진입)되는 순간
// 매니저 운영 채널로 알림을 보냅니다(issue-virtual-account/portone-webhook 에서 호출).
//
// ⚠ 알림 발송 실패가 결제 확인 자체를 막으면 안 됩니다 — 이 시점은 이미 PortOne 결제가 승인되고
// DB 상태도 바뀐 뒤입니다. 그래서 sendTelegramMessage() 는 어떤 경우에도 예외를 던지지 않고
// (fetch 실패·HTTP 에러·환경변수 누락 전부) console.error/warn 으로만 남기고 false 를 돌려줍니다 —
// 호출부는 결과를 기다리되(await) 실패해도 응답 흐름을 바꾸지 않아야 합니다.
//
// 환경변수(Supabase Edge Function Secrets):
//   TELEGRAM_BOT_TOKEN        — @BotFather 로 만든 봇의 토큰 (아래 두 알림이 공유)
//   TELEGRAM_CHAT_ID          — 신규 "케어 신청" 알림을 받을 채팅방/채널 id
//   TELEGRAM_MANAGER_CHAT_ID  — 신규 "케어 매니저 지원" 알림을 받을 채팅방 id (submit-manager-application 함수 전용)
//   SITE_URL           — 메시지 안 "매니저 마이페이지" 링크에 쓸 배포 도메인(예: https://withbridgecare.com).
//                         없으면 상대 경로("mypage-manager.html")로만 표시됩니다(클릭은 안 될 수 있음).
// 설정 방법은 이 파일과 같은 커밋의 가이드 주석(아래 buildNewApplicationMessage 윗부분) 참고.

const TELEGRAM_API_BASE = "https://api.telegram.org";

// 호출부(issue-virtual-account/portone-webhook/confirm-package-order-payment)가 매번
// try/catch 를 따로 쓰지 않도록 — "메시지 빌더 호출 + 발송"을 한 번에 감싸는 공용 래퍼입니다.
// sendTelegramMessage() 자신은 이미 예외를 던지지 않지만, buildXxxMessage() 쪽은 파라미터가
// 누락되면(지금은 전부 방어적으로 짜여 있어 그럴 일이 없지만, 나중에 누군가 수정하다가 생길 수
// 있는 실수까지 막기 위해) 이론적으로 throw 할 수 있습니다 — 그 경우에도 "결제는 이미 끝난 뒤"라
// 응답 자체가 깨지면 안 되므로, 여기서 한 번 더 잡아 label 과 함께 로그를 남기고 false 를 돌려줍니다.
export async function notifySafely(label: string, fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[telegram] ${label} 알림 생성/발송 중 예상치 못한 예외(결제/DB 반영에는 영향 없음):`, e);
    return false;
  }
}

// chat_id 끝 몇 자리만 남겨 로그에 남깁니다 — 토큰은 절대 로그에 남기지 않습니다(Supabase Edge
// Function 로그는 콘솔에서 누구나 볼 수 있어, 전체 토큰/chat_id를 그대로 찍으면 그 자체로 유출입니다).
function maskId(id: string): string {
  if (id.length <= 4) return "***";
  return "***" + id.slice(-4);
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 환경변수가 없어 알림을 건너뜁니다. " +
        "supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... 로 설정하세요.",
    );
    return false;
  }
  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    // fetch 자체가 실패 — DNS/네트워크 문제로 Telegram API에 요청이 도달하지도 못한 경우입니다.
    console.error(`[telegram] sendMessage fetch 자체가 실패했습니다(chat_id=${maskId(chatId)}):`, e);
    return false;
  }

  // 응답 바디는 성공/실패 모두 읽어서 로그에 남깁니다 — Telegram이 HTTP 200을 주면서도 바디에
  // { ok: false, description: "..." } 를 돌려주는 경우(드물지만 실제로 있음)까지 놓치지 않기 위함입니다.
  let payload: any = null;
  const rawText = await res.text().catch(() => "");
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { /* JSON 이 아님 — rawText 로만 남음 */ }

  if (!res.ok || !payload || payload.ok !== true) {
    console.error(
      `[telegram] sendMessage 실패 (chat_id=${maskId(chatId)}, HTTP status=${res.status}` +
        `${payload ? ", telegram error_code=" + payload.error_code + ", description=" + payload.description : ""}):`,
      payload || rawText,
    );
    return false;
  }

  console.log(`[telegram] sendMessage 성공 (chat_id=${maskId(chatId)}, message_id=${payload.result?.message_id})`);
  return true;
}

// 케어 매니저 지원서(manager-apply.html) 접수 알림은 고객 신청 알림과 다른 그룹방(TELEGRAM_MANAGER_CHAT_ID)
// 으로 보내야 하므로, 위 sendTelegramMessage()와 같은 "실패해도 예외를 던지지 않는" 규칙을 지키는 별도
// 함수를 둡니다(봇 토큰은 TELEGRAM_BOT_TOKEN 을 그대로 재사용).
export async function sendManagerApplicationTelegramMessage(text: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_MANAGER_CHAT_ID");
  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_MANAGER_CHAT_ID 환경변수가 없어 매니저 지원 알림을 건너뜁니다. " +
        "supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_MANAGER_CHAT_ID=... 로 설정하세요.",
    );
    return false;
  }
  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error(`[telegram] 매니저 지원 알림 sendMessage fetch 자체가 실패했습니다(chat_id=${maskId(chatId)}):`, e);
    return false;
  }

  let payload: any = null;
  const rawText = await res.text().catch(() => "");
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { /* JSON 이 아님 — rawText 로만 남음 */ }

  if (!res.ok || !payload || payload.ok !== true) {
    console.error(
      `[telegram] 매니저 지원 알림 sendMessage 실패 (chat_id=${maskId(chatId)}, HTTP status=${res.status}` +
        `${payload ? ", telegram error_code=" + payload.error_code + ", description=" + payload.description : ""}):`,
      payload || rawText,
    );
    return false;
  }

  console.log(`[telegram] 매니저 지원 알림 sendMessage 성공 (chat_id=${maskId(chatId)}, message_id=${payload.result?.message_id})`);
  return true;
}

// 결제는 PortOne 에서 실제로 승인됐는데(고객에게 결제 완료 메일/영수증이 갔는데도), DB 반영
// (mark_payment_matching_pending)이 실패해 service_applications.status 가 PAYMENT_PENDING 에
// 멈춰 있는 사고를 운영자가 즉시 알아야 합니다 — 이 상태는 "매니저 알림이 안 간다"가 아니라
// "고객은 결제했는데 매니저 배정 자체가 영원히 시작되지 않는다"는 더 심각한 문제라, 실패를
// console.error 로만 남기고 조용히 끝나면 안 됩니다(요금표 변경 후 expected_service_price() 를
// DB에 재배포하지 않아 AMOUNT_MISMATCH 로 결제 확인이 막혔던 사고가 실제로 있었습니다).
// issue-virtual-account/portone-webhook 양쪽의 AMOUNT_MISMATCH·STATUS_UPDATE_FAILED 분기에서 호출합니다.
export interface PaymentReconciliationFailureInput {
  applicationId: string;
  /** 'AMOUNT_MISMATCH' | 'STATUS_UPDATE_FAILED' 등 — 그대로 메시지에 노출해 원인 구분에 씁니다. */
  reason: string;
  /** Postgres 예외 메시지 전체(AMOUNT_MISMATCH 는 service_type/expected/paid 를 메시지 안에 담고 있음). */
  detail?: string | null;
  /** 어떤 Edge Function에서 보냈는지 — 로그/채널에서 바로 구분하기 위함. */
  source: "issue-virtual-account" | "portone-webhook" | "confirm-package-order-payment";
}

export function buildPaymentReconciliationFailureMessage(input: PaymentReconciliationFailureInput): string {
  const divider = "----------------------------------------";
  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  const adminLink = siteUrl ? `${siteUrl}/admin.html` : "admin.html";
  return [
    divider,
    "[🚨 결제는 승인됐는데 DB 상태 전환 실패]",
    `- 신청 ID: ${input.applicationId}`,
    `- 원인: ${input.reason}`,
    `- 상세: ${input.detail || "-"}`,
    `- 발생 지점: ${input.source}`,
    "고객은 결제를 완료했지만 매니저에게 배정되지 않습니다 — 어드민 콘솔의 [수동 입금 확인]으로",
    "지금 바로 처리해 주세요.",
    `👉 ${adminLink}`,
    divider,
  ].join("\n");
}

export interface NewManagerApplicationNotifyInput {
  name: string;
  phone: string;
  birthDate?: string | null;
  address?: string | null;
  /** manager_applications.created_at (ISO) — 접수일시 표시용. */
  createdAt?: string | null;
}

export function buildNewManagerApplicationMessage(input: NewManagerApplicationNotifyInput): string {
  const divider = "----------------------------------------";
  return [
    divider,
    "[📋 위드브릿지 신규 케어 매니저 지원 접수]",
    `- 지원자: ${input.name}`,
    `- 연락처: ${input.phone}`,
    `- 생년월일: ${input.birthDate || "미입력"}`,
    `- 거주지: ${input.address || "미입력"}`,
    `- 접수일시: ${fmtKoreanDateTime(input.createdAt) || "-"}`,
    divider,
  ].join("\n");
}

function fmtKoreanDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // 사이트 전역이 KST 고정 표기를 쓰므로(mypage.html toKst() 등) 서버 타임존과 무관하게 +9시간으로 맞춥니다.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}-${p2(kst.getUTCDate())} ${p2(kst.getUTCHours())}:${p2(kst.getUTCMinutes())}`;
}

// apply.html 의 request_details 는 "희망 일시: …\n어르신 거동 상태: …\n요청 상세: …" 형식의 자유
// 텍스트입니다(구조화된 scheduled_at 컬럼은 매니저가 수락해 care_schedules 행이 생길 때만 생기므로,
// 이 결제 확인 시점에는 아직 없습니다) — 그 중 "희망 일시:" 줄만 뽑아 씁니다.
function extractDesiredDateTime(requestDetails: string | null | undefined): string | null {
  if (!requestDetails) return null;
  const m = /희망\s*일시:\s*([^\n]+)/.exec(requestDetails);
  return m ? m[1].trim() : null;
}

// apply.html 의 user_contact 는 "이름 / 전화번호" 결합 문자열입니다 — 이름만 뽑습니다.
function extractApplicantName(userContact: string | null | undefined): string {
  if (!userContact) return "고객";
  const name = userContact.split("/")[0]?.trim();
  return name || "고객";
}

// 선택 추가 옵션(Add-on) 코드 → 사람이 읽는 이름. apply.html 의 ADDONS, sql/user_coupons_checkout.sql
// 의 expected_addon_total() 과 반드시 같은 코드 문자열을 써야 합니다(admin.js/mypage-manager.html 에도
// 같은 맵이 있습니다 — 함께 고쳐 주세요).
const ADDON_LABELS: Record<string, string> = {
  URGENT_MATCHING: "긴급 매칭 서비스",
  VEHICLE_SUPPORT: "차량 이동 지원",
};
function formatAddonLabels(addonCodes: string[] | null | undefined): string {
  const codes = Array.isArray(addonCodes) ? addonCodes : [];
  if (!codes.length) return "없음";
  return codes.map((code) => ADDON_LABELS[code] || code).join(", ");
}

export interface NewApplicationNotifyInput {
  serviceType?: string | null;
  /** apply.html toDbRow() 의 address — "출발지 / 목적지" 결합 문자열. */
  address?: string | null;
  requestDetails?: string | null;
  userContact?: string | null;
  /** request_details 에서 희망 일시를 못 찾았을 때 대신 보여줄 신청 접수 시각(ISO). */
  createdAt?: string | null;
  /** service_applications.addon_codes — 긴급 매칭/차량 이동 지원 등 선택한 추가 옵션 코드 배열. */
  addonCodes?: string[] | null;
}

export function buildNewApplicationMessage(input: NewApplicationNotifyInput): string {
  const serviceType = input.serviceType || "동행 서비스";
  const region = input.address || "주소 미입력";
  const when = extractDesiredDateTime(input.requestDetails) || fmtKoreanDateTime(input.createdAt) || "협의 필요";
  const applicant = extractApplicantName(input.userContact);
  const addons = formatAddonLabels(input.addonCodes);
  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  const managerLink = siteUrl ? `${siteUrl}/mypage-manager.html` : "mypage-manager.html";

  return [
    "[🔔 위드브릿지 신규 케어 신청 접수]",
    `• 서비스: ${serviceType}`,
    `• 지역: ${region}`,
    `• 일시: ${when}`,
    `• 신청자: ${applicant} 고객님`,
    `• 선택 옵션: ${addons}`,
    `👉 매니저 마이페이지에서 수락하기: ${managerLink}`,
  ].join("\n");
}

// 패키지(5회권/10회권/10시간권/20시간권) 구매 확정 알림 — confirm-package-order-payment/portone-webhook
// (package_order 분기) 양쪽에서 호출합니다. 패키지는 매칭 대기 없이 바로 회차가 충전되므로 "수락하기"
// 링크는 필요 없고, 운영팀이 결제가 실제로 들어왔는지 확인하는 용도입니다. 메인 운영 채널
// (TELEGRAM_CHAT_ID)로 보내므로 sendTelegramMessage() 를 그대로 씁니다.
const PACKAGE_TYPE_LABEL: Record<string, string> = {
  "5_sessions": "5회권",
  "10_sessions": "10회권",
  "10_hours": "10시간권",
  "20_hours": "20시간권",
};

export interface NewPackageOrderNotifyInput {
  packageType?: string | null;
  amount?: number | null;
  userId?: string | null;
}

export function buildNewPackageOrderMessage(input: NewPackageOrderNotifyInput): string {
  const divider = "----------------------------------------";
  const label = (input.packageType && PACKAGE_TYPE_LABEL[input.packageType]) || input.packageType || "패키지";
  return [
    divider,
    "[💳 위드브릿지 패키지 구매 확정]",
    `- 패키지: ${label}`,
    `- 결제 금액: ${input.amount != null ? input.amount.toLocaleString("ko-KR") + "원" : "-"}`,
    `- 구매자 user_id: ${input.userId || "-"}`,
    divider,
  ].join("\n");
}
