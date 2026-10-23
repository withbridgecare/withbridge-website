// 텔레그램 알림 발송 공용 모듈 — 신규 케어 신청이 결제 확인(MATCHING_PENDING 진입)되는 순간
// 매니저 운영 채널로 알림을 보냅니다(issue-virtual-account/portone-webhook 에서 호출).
//
// ⚠ 알림 발송 실패가 결제 확인 자체를 막으면 안 됩니다 — 이 시점은 이미 PortOne 결제가 승인되고
// DB 상태도 바뀐 뒤입니다. 그래서 sendTelegramMessage() 는 어떤 경우에도 예외를 던지지 않고
// (fetch 실패·HTTP 에러·환경변수 누락 전부) console.error/warn 으로만 남기고 false 를 돌려줍니다 —
// 호출부는 결과를 기다리되(await) 실패해도 응답 흐름을 바꾸지 않아야 합니다.
//
// 환경변수(Supabase Edge Function Secrets):
//   TELEGRAM_BOT_TOKEN — @BotFather 로 만든 봇의 토큰
//   TELEGRAM_CHAT_ID   — 알림을 받을 채팅방/채널 id (매니저 단체방에 봇을 초대한 뒤 확인)
//   SITE_URL           — 메시지 안 "매니저 마이페이지" 링크에 쓸 배포 도메인(예: https://withbridgecare.com).
//                         없으면 상대 경로("mypage-manager.html")로만 표시됩니다(클릭은 안 될 수 있음).
// 설정 방법은 이 파일과 같은 커밋의 가이드 주석(아래 buildNewApplicationMessage 윗부분) 참고.

const TELEGRAM_API_BASE = "https://api.telegram.org";

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
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] sendMessage 실패 (status ${res.status}):`, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] sendMessage 호출 중 예외:", e);
    return false;
  }
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
