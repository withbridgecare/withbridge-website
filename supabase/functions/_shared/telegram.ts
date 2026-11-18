// 텔레그램 알림 발송 공용 모듈 — 결제 확인(issue-virtual-account/portone-webhook: 결제 반영 실패 경보,
// 패키지/추가 요금 결제 완료), 매니저 지원 접수(submit-manager-application), 신규 케어 신청 하이브리드
// 알림+인라인 버튼 수락(notify-care-request/telegram-webhook) 이 전부 이 모듈을 통해 발송합니다.
// (신규 케어 신청의 "매니저 마이페이지에서 수락하기" 텍스트 전용 알림은 notify-care-request 의 개인
// DM+그룹 하이브리드 알림으로 완전히 대체되어 제거했습니다 — buildCareRequestTelegramMessage 참고.)
//
// ⚠ 알림 발송 실패가 결제 확인 자체를 막으면 안 됩니다 — 이 시점은 이미 PortOne 결제가 승인되고
// DB 상태도 바뀐 뒤입니다. 그래서 sendTelegramMessage() 는 어떤 경우에도 예외를 던지지 않고
// (fetch 실패·HTTP 에러·환경변수 누락 전부) console.error/warn 으로만 남기고 false 를 돌려줍니다 —
// 호출부는 결과를 기다리되(await) 실패해도 응답 흐름을 바꾸지 않아야 합니다.
//
// 환경변수(Supabase Edge Function Secrets):
//   TELEGRAM_BOT_TOKEN          — "케어 신청" 알림을 보내는 기존 봇의 토큰(@BotFather 발급).
//   TELEGRAM_CHAT_ID            — 신규 "케어 신청" 알림을 받을 채팅방/채널 id — 기존 위드브릿지 매니저
//                                  알림방을 그대로 씁니다.
//   TELEGRAM_MANAGER_BOT_TOKEN  — "케어 매니저 지원" 알림 전용으로 새로 만든 봇의 토큰(@BotFather 발급,
//                                  위 TELEGRAM_BOT_TOKEN과 다른 봇). submit-manager-application 함수 전용.
//   TELEGRAM_MANAGER_CHAT_ID    — 신규 "케어 매니저 지원" 알림을 받을 채팅방 id — "위드브릿지 매니저
//                                  지원 알림방"(위 TELEGRAM_CHAT_ID의 방과 다른 방)에 TELEGRAM_MANAGER_BOT_TOKEN
//                                  봇을 초대한 뒤 그 방의 chat_id를 넣습니다. submit-manager-application 함수 전용.
//   SITE_URL           — 메시지 안 "매니저 마이페이지" 링크에 쓸 배포 도메인(예: https://withbridgecare.com).
//                         없으면 상대 경로("mypage-manager.html")로만 표시됩니다(클릭은 안 될 수 있음).
// 설정 방법은 이 파일 아래 각 build*Message() 함수 바로 위 주석 참고.

const TELEGRAM_API_BASE = "https://api.telegram.org";

// 호출부(issue-virtual-account/portone-webhook/confirm-package-order-payment/confirm-extra-charge-payment)가 매번
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

// 케어 매니저 지원서(manager-apply.html) 접수 알림은 고객 신청 알림과 완전히 분리된 봇/방으로 보냅니다 —
// 봇 토큰(TELEGRAM_MANAGER_BOT_TOKEN)과 채팅방(TELEGRAM_MANAGER_CHAT_ID) 모두 "케어 신청" 알림이 쓰는
// TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID와 다른 값입니다 — 봇을 공유하지 않으므로 이 함수가 실패해도
// "케어 신청" 알림(sendTelegramMessage)에는 전혀 영향이 없습니다. 위 sendTelegramMessage()와 같은
// "실패해도 예외를 던지지 않는" 규칙을 지키는 별도 함수를 둡니다.
export async function sendManagerApplicationTelegramMessage(text: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_MANAGER_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_MANAGER_CHAT_ID");
  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_MANAGER_BOT_TOKEN/TELEGRAM_MANAGER_CHAT_ID 환경변수가 없어 매니저 지원 알림을 건너뜁니다. " +
        "supabase secrets set TELEGRAM_MANAGER_BOT_TOKEN=... TELEGRAM_MANAGER_CHAT_ID=... 로 설정하세요.",
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
// issue-virtual-account/portone-webhook/confirm-package-order-payment/confirm-extra-charge-payment 의
// AMOUNT_MISMATCH·STATUS_UPDATE_FAILED 분기에서 호출합니다.
export interface PaymentReconciliationFailureInput {
  applicationId: string;
  /** 'AMOUNT_MISMATCH' | 'STATUS_UPDATE_FAILED' 등 — 그대로 메시지에 노출해 원인 구분에 씁니다. */
  reason: string;
  /** Postgres 예외 메시지 전체(AMOUNT_MISMATCH 는 service_type/expected/paid 를 메시지 안에 담고 있음). */
  detail?: string | null;
  /** 어떤 Edge Function에서 보냈는지 — 로그/채널에서 바로 구분하기 위함. */
  source: "issue-virtual-account" | "portone-webhook" | "confirm-package-order-payment" | "confirm-extra-charge-payment";
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
};
function formatAddonLabels(addonCodes: string[] | null | undefined): string {
  const codes = Array.isArray(addonCodes) ? addonCodes : [];
  if (!codes.length) return "없음";
  return codes.map((code) => ADDON_LABELS[code] || code).join(", ");
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

// 추가 요금(초과 시간 2차 결제) 결제 확정 알림 — confirm-extra-charge-payment/portone-webhook
// (extra_charge 분기) 양쪽에서 호출합니다. 관리자가 admin.html에서 수기로 청구한 금액을 보호자가
// 실제로 결제했는지 운영팀이 바로 확인할 수 있어야 하므로, 다른 결제 확정 알림들과 동일하게
// 메인 운영 채널(TELEGRAM_CHAT_ID)로 보냅니다.
export interface ExtraChargePaidNotifyInput {
  scheduleId?: string | null;
  applicationId?: string | null;
  seniorName?: string | null;
  guardianName?: string | null;
  amount?: number | null;
  memo?: string | null;
}

export function buildExtraChargePaidMessage(input: ExtraChargePaidNotifyInput): string {
  const divider = "----------------------------------------";
  return [
    divider,
    "[💳 위드브릿지 추가 요금 결제 완료]",
    `- 어르신: ${input.seniorName || "-"}`,
    `- 보호자: ${input.guardianName || "-"}`,
    `- 추가 요금: ${input.amount != null ? input.amount.toLocaleString("ko-KR") + "원" : "-"}`,
    `- 사유: ${input.memo || "-"}`,
    `- 케어 일정 ID: ${input.scheduleId || "-"}`,
    divider,
  ].join("\n");
}

// ============================================================================
// 하이브리드 매칭 알림 + 인라인 버튼 수락 (notify-care-request / telegram-webhook 전용)
//
// 위 sendTelegramMessage()/sendManagerApplicationTelegramMessage() 는 "고정된 하나의 chat_id"에만 보내는
// 전용 함수였지만, 이 기능은 신청 1건마다 여러 개인 chat_id(매니저별 DM) + 그룹 chat_id(전체 알림방)에
// 같은 봇 토큰(TELEGRAM_BOT_TOKEN)으로 나눠 보내야 합니다 — 그래서 chat_id를 매번 인자로 받는 범용
// 저수준 함수(sendTelegramMessageTo/editTelegramMessageText/answerCallbackQuery)를 따로 둡니다.
// 기존 함수들은 그대로 두고(결제 알림 경로에 영향 없음) 여기서부터는 전부 새 함수입니다.
// ============================================================================

export interface InlineKeyboardMarkup {
  inline_keyboard: { text: string; callback_data?: string; url?: string }[][];
}

export function buildAcceptInlineKeyboard(applicationId: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "✅ 동행 수락하기", callback_data: `ACCEPT:${applicationId}` }]] };
}

export interface TelegramSendResult {
  ok: boolean;
  messageId?: number;
}

export async function sendTelegramMessageTo(
  token: string,
  chatId: string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) {
      console.error(`[telegram] sendMessage 실패 (chat_id=${maskId(chatId)}, HTTP=${res.status}):`, payload);
      return { ok: false };
    }
    return { ok: true, messageId: payload.result?.message_id };
  } catch (e) {
    console.error(`[telegram] sendMessage fetch 실패 (chat_id=${maskId(chatId)}):`, e);
    return { ok: false };
  }
}

// 48시간이 지난 메시지를 고치려 하거나, 이미 똑같은 본문으로 다시 고치려 하면 Telegram이 400을 돌려줍니다
// — 둘 다 "다른 매니저에게 마감 안내가 한 번 덜 갔다"는 수준의 실패라, 수락 처리(DB 반영)는 이미 끝난
// 뒤이므로 여기서 던지지 않고 경고만 남깁니다(notifySafely 와 같은 원칙).
export async function editTelegramMessageText(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        disable_web_page_preview: true,
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) {
      console.warn(`[telegram] editMessageText 실패(무시, chat_id=${maskId(chatId)}, message_id=${messageId}):`, payload);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[telegram] editMessageText fetch 실패(무시, chat_id=${maskId(chatId)}):`, e);
    return false;
  }
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
    });
  } catch (e) {
    console.warn("[telegram] answerCallbackQuery 실패(무시):", e);
  }
}

export interface NewCareRequestTelegramInput {
  serviceType?: string | null;
  address?: string | null;
  requestDetails?: string | null;
  userContact?: string | null;
  createdAt?: string | null;
  addonCodes?: string[] | null;
}

// variant='private' 는 지역/시간대가 맞는 매니저의 개인 DM, 'broadcast' 는 전체 공용 채널(그룹방) —
// 본문 헤더만 다르고 나머지 정보는 동일합니다(둘 다 같은 [동행 수락하기] 버튼이 붙습니다).
// 실제 수락 동작은 그 인라인 버튼(callback_data="ACCEPT:<id>")이 처리합니다(telegram-webhook) — 아래
// 마이페이지 링크는 버튼과는 별개로, 앱을 직접 열어 전체 목록/상세를 보고 싶을 때를 위한 보조 링크이며
// buildNewApplicationMessage() 와 같은 규칙으로 SITE_URL(Supabase Secrets)을 읽어 절대 URL로 만듭니다
// — SITE_URL이 없으면 상대 경로("mypage-manager.html")라 텔레그램에서 눌러도 열리지 않을 수 있습니다.
export function buildCareRequestTelegramMessage(
  input: NewCareRequestTelegramInput,
  variant: "private" | "broadcast",
): string {
  const serviceType = input.serviceType || "동행 서비스";
  const region = input.address || "주소 미입력";
  const when = extractDesiredDateTime(input.requestDetails) || fmtKoreanDateTime(input.createdAt) || "협의 필요";
  const applicant = extractApplicantName(input.userContact);
  const addons = formatAddonLabels(input.addonCodes);
  const header = variant === "private"
    ? "[🎯 내 활동 지역 맞춤 — 신규 케어 신청]"
    : "[🔔 위드브릿지 신규 케어 신청 접수 (전체)]";
  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  const managerLink = siteUrl ? `${siteUrl}/mypage-manager.html` : "mypage-manager.html";
  return [
    header,
    `• 서비스: ${serviceType}`,
    `• 지역: ${region}`,
    `• 일시: ${when}`,
    `• 신청자: ${applicant} 고객님`,
    `• 선택 옵션: ${addons}`,
    "아래 [동행 수락하기]를 누르면 즉시 배정됩니다 — 먼저 누른 매니저가 담당합니다.",
    `👉 매니저 마이페이지에서 전체 보기: ${managerLink}`,
  ].join("\n");
}

export function buildCareRequestAcceptedSuffix(managerName: string | null | undefined, scheduledAt: Date): string {
  return `\n\n✅ ${managerName || "매니저"}님이 수락해 배정 완료되었습니다 (예정 일시: ${fmtKoreanDateTime(scheduledAt.toISOString())}).`;
}

export function buildCareRequestClosedSuffix(managerName: string | null | undefined): string {
  return `\n\n⛔ 이미 다른 매니저(${managerName || "다른 매니저"})가 수락해 마감된 건입니다.`;
}

// 신청 지역(출발지/목적지 문자열)에서 인천/경기 관내 구·시 이름을 뽑습니다 — manager-apply.html 의
// "주요 활동 가능 지역" 칩 라벨(인천 남동구 등)과 반드시 같은 구분을 써야 매칭이 됩니다.
const CANONICAL_REGIONS: { label: string; keyword: string }[] = [
  { label: "인천 남동구", keyword: "남동구" },
  { label: "인천 연수구", keyword: "연수구" },
  { label: "인천 미추홀구", keyword: "미추홀구" },
  { label: "인천 부평구", keyword: "부평구" },
  { label: "인천 계양구", keyword: "계양구" },
  { label: "인천 서구", keyword: "서구" },
  { label: "경기 시흥시", keyword: "시흥시" },
  { label: "경기 부천시", keyword: "부천시" },
  { label: "경기 안산시", keyword: "안산시" },
];

export function detectAddressRegion(address: string | null | undefined): string | null {
  const text = address || "";
  for (const r of CANONICAL_REGIONS) {
    if (text.includes(r.keyword)) return r.label;
  }
  return null;
}

export function managerCoversRegion(activityAreas: string[] | null | undefined, region: string | null): boolean {
  if (!region) return false;
  return Array.isArray(activityAreas) && activityAreas.includes(region);
}

export type TimeSlotLabel = "평일 오전" | "평일 오후" | "주말 오전" | "주말 오후";

// '희망 일시' 문구("11월 20일 (목) 오후 2시 30분")에서 요일괄호와 오전/오후만 뽑아 매니저의
// activity_schedule(manager-apply.html STEP2) 라벨과 같은 네 구간으로 환산합니다. 요일/오전·오후 중
// 하나라도 못 읽으면 null — 이 경우 호출부가 "시간대 불명 — 지역만으로 매칭" 으로 처리합니다.
export function detectTimeSlot(requestDetails: string | null | undefined): TimeSlotLabel | null {
  const text = extractDesiredDateTime(requestDetails) || "";
  const weekday = /\(([일월화수목금토])\)/.exec(text)?.[1];
  const isPm = /오후|저녁|낮/.test(text);
  const isAm = /오전/.test(text);
  if (!weekday || (!isPm && !isAm)) return null;
  const isWeekend = weekday === "토" || weekday === "일";
  if (isWeekend) return isPm ? "주말 오후" : "주말 오전";
  return isPm ? "평일 오후" : "평일 오전";
}

export function managerCoversSchedule(activitySchedule: string[] | null | undefined, slot: TimeSlotLabel | null): boolean {
  const schedule = Array.isArray(activitySchedule) ? activitySchedule : [];
  if (schedule.includes("시간 조율 가능")) return true;
  if (!slot) return false;
  return schedule.includes(slot);
}

// 매니저 마이페이지(mypage-manager.html)의 guessDateTime() 과 완전히 같은 로직의 Deno 버전입니다 —
// 텔레그램 [동행 수락하기] 버튼은 그 화면의 '수락 모달'을 띄울 수 없어(채팅창 안이라), 같은 추정 규칙으로
// scheduled_at 을 바로 확정해 accept_service_application_as() 에 넘깁니다. 못 읽으면 그 화면과 동일하게
// "내일 오전 10시"로 잠정 확정하고, 매니저가 마이페이지에서 나중에 확인/수정할 수 있습니다. 한쪽을 고치면
// 다른 쪽도 반드시 같이 고치세요.
export function guessScheduledAt(requestDetails: string | null | undefined, createdAtIso: string | null | undefined): Date {
  const now = createdAtIso ? new Date(createdAtIso) : new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fallback = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 10, 0);
  const text = extractDesiredDateTime(requestDetails) || "";

  const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);
  if (!md) return fallback;
  let d = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]), 10, 0);
  if (isNaN(d.getTime())) return fallback;
  if (d < today) {
    const next = new Date(d);
    next.setFullYear(next.getFullYear() + 1);
    if (next.getTime() - today.getTime() > 120 * 86400000) return fallback;
    d = next;
  }

  const t = /(오전|오후|낮|저녁)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(text) || /()(\d{1,2}):(\d{2})/.exec(text);
  if (t) {
    let hour = Number(t[2]);
    if ((t[1] === "오후" || t[1] === "저녁" || t[1] === "낮") && hour < 12) hour += 12;
    if (t[1] === "오전" && hour === 12) hour = 0;
    if (hour <= 23) d.setHours(hour, t[4] === "반" ? 30 : Number(t[3] || 0));
  }
  return d;
}
