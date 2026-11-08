// Solapi(https://solapi.com) 카카오 알림톡 발송 공용 모듈 — care_schedules/service_applications 의
// 상태 전환 7단계(접수 완료/배정 완료/출발/병원 도착/진료 완료/귀가 이동/케어 완료)마다
// send-status-alimtalk Edge Function이 호출합니다.
//
// ⚠ 다른 _shared/telegram.ts 와 같은 규칙: sendAlimtalk() 은 어떤 경우에도 예외를 던지지 않고
// (fetch 실패·HTTP 에러·환경변수 누락 전부) console.error/warn 으로만 남기고 false 를 돌려줍니다 —
// 알림 발송 실패가 이미 끝난 상태 전환(케어 진행)을 막거나 되돌리면 안 됩니다.
//
// 환경변수(Supabase Edge Function Secrets — supabase secrets set 으로 등록):
//   SOLAPI_API_KEY      — Solapi 콘솔 > API Key 관리에서 발급받은 API Key.
//   SOLAPI_API_SECRET   — 위 API Key 와 짝을 이루는 Secret Key(서명 생성용, 평문 노출 금지).
//   SOLAPI_SENDER_PHONE — Solapi에 등록·인증한 발신번호(카카오 알림톡 발송 실패 시 Solapi가 자동으로
//                          SMS/LMS 로 대체 발송할 때 "발신번호"로 쓰입니다. 등록 안 된 번호면 발송 자체가
//                          거부됩니다).
//   SOLAPI_PF_ID        — 카카오 비즈니스 채널(발신프로필) ID. Solapi 콘솔 > 카카오톡 채널 연동에서 확인.
//   SOLAPI_TEMPLATE_<STAGE> — 7개 stage 마다 하나씩, Solapi(카카오)에 사전 승인받은 템플릿 코드.
//                          <STAGE> 는 ORDER_RECEIVED / MANAGER_ASSIGNED / DEPARTED / ARRIVED_HOSPITAL /
//                          TREATMENT_COMPLETED / RETURNING / CARE_FINISHED 7개.
//
// ⚠ templateId 가 가리키는 실제 카카오 템플릿의 변수 플레이스홀더(#{고객명} 등) 이름이 아래
//   buildVariables() 가 만드는 키와 정확히 일치해야 발송이 성공합니다 — Solapi 콘솔에서 승인받은
//   템플릿의 변수명을 그대로 확인하고, 다르면 이 파일의 변수 키만 맞춰 고치면 됩니다(발송 로직은
//   그대로 두어도 됩니다).

const SOLAPI_API_BASE = "https://api.solapi.com";

function maskId(id: string): string {
  if (id.length <= 4) return "***";
  return "***" + id.slice(-4);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Solapi 인증 헤더 — https://docs.solapi.com 의 "HMAC 방식 인증" 스펙:
//   Authorization: HMAC-SHA256 apiKey={API_KEY}, date={ISO8601}, salt={random}, signature={hex(HMAC_SHA256(date+salt, API_SECRET))}
async function buildSolapiAuthHeader(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID();
  const signature = await hmacSha256Hex(apiSecret, date + salt);
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export interface SendAlimtalkInput {
  /** 수신자 휴대폰 번호 — 숫자만("01012345678") 또는 하이픈 포함 모두 허용(Solapi가 정규화). */
  to: string;
  /** 7단계 중 하나 — SOLAPI_TEMPLATE_<stage> 환경변수를 읽는 키로도 그대로 씁니다. */
  stage: string;
  /** 카카오 템플릿 변수. 키는 템플릿에 등록된 "#{고객명}" 형태 그대로. */
  variables: Record<string, string>;
  /** 로그 식별용(실패해도 결과엔 영향 없음) — "schedule:<uuid>" 또는 "application:<uuid>" 권장. */
  logRef?: string;
}

export async function sendAlimtalk(input: SendAlimtalkInput): Promise<boolean> {
  const apiKey = Deno.env.get("SOLAPI_API_KEY");
  const apiSecret = Deno.env.get("SOLAPI_API_SECRET");
  const senderPhone = Deno.env.get("SOLAPI_SENDER_PHONE");
  const pfId = Deno.env.get("SOLAPI_PF_ID");
  const templateId = Deno.env.get(`SOLAPI_TEMPLATE_${input.stage}`);

  if (!apiKey || !apiSecret || !senderPhone || !pfId) {
    console.warn(
      "[solapi] SOLAPI_API_KEY/SOLAPI_API_SECRET/SOLAPI_SENDER_PHONE/SOLAPI_PF_ID 중 누락된 값이 있어 " +
        `알림톡 발송을 건너뜁니다 (stage=${input.stage}, ref=${input.logRef || "-"}). ` +
        "supabase secrets set SOLAPI_API_KEY=... SOLAPI_API_SECRET=... SOLAPI_SENDER_PHONE=... SOLAPI_PF_ID=... 로 설정하세요.",
    );
    return false;
  }
  if (!templateId) {
    console.warn(
      `[solapi] SOLAPI_TEMPLATE_${input.stage} 환경변수가 없어 알림톡 발송을 건너뜁니다 (ref=${input.logRef || "-"}). ` +
        `supabase secrets set SOLAPI_TEMPLATE_${input.stage}=<승인된 템플릿 코드> 로 설정하세요.`,
    );
    return false;
  }
  const to = (input.to || "").replace(/[^0-9]/g, "");
  if (to.length < 9) {
    console.warn(`[solapi] 수신자 번호가 비어 있거나 올바르지 않아 알림톡 발송을 건너뜁니다 (stage=${input.stage}, ref=${input.logRef || "-"}).`);
    return false;
  }

  let authHeader: string;
  try {
    authHeader = await buildSolapiAuthHeader(apiKey, apiSecret);
  } catch (e) {
    console.error(`[solapi] 인증 헤더 생성 실패 (stage=${input.stage}, ref=${input.logRef || "-"}):`, e);
    return false;
  }

  const body = {
    message: {
      to,
      from: senderPhone.replace(/[^0-9]/g, ""),
      kakaoOptions: {
        pfId,
        templateId,
        variables: input.variables,
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${SOLAPI_API_BASE}/messages/v4/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`[solapi] fetch 자체가 실패했습니다 (stage=${input.stage}, to=${maskId(to)}, ref=${input.logRef || "-"}):`, e);
    return false;
  }

  const rawText = await res.text().catch(() => "");
  let payload: any = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    /* JSON 이 아님 — rawText 로만 남음 */
  }

  if (!res.ok) {
    console.error(
      `[solapi] 알림톡 발송 실패 (stage=${input.stage}, to=${maskId(to)}, ref=${input.logRef || "-"}, HTTP status=${res.status}` +
        `${payload ? ", errorCode=" + payload.errorCode + ", errorMessage=" + payload.errorMessage : ""}):`,
      payload || rawText,
    );
    return false;
  }

  console.log(`[solapi] 알림톡 발송 성공 (stage=${input.stage}, to=${maskId(to)}, ref=${input.logRef || "-"}, groupId=${payload?.groupId || "-"})`);
  return true;
}

export function fmtKoreanDateTime(iso: string | null | undefined): string {
  if (!iso) return "협의 필요";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "협의 필요";
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}-${p2(kst.getUTCDate())} ${p2(kst.getUTCHours())}:${p2(kst.getUTCMinutes())}`;
}

// apply.html 의 user_contact 는 "이름 / 전화번호" 결합 문자열입니다(_shared/telegram.ts 의
// extractApplicantName/전화번호 정규식과 동일한 패턴 — admin_manual_assignment.sql 의 v_phone_re 참고).
const PHONE_RE = /01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}/;

export function extractNameFromContact(userContact: string | null | undefined): string {
  if (!userContact) return "고객";
  const withoutPhone = userContact.replace(PHONE_RE, "").trim().replace(/^[/,·\-\s]+|[/,·\-\s]+$/g, "");
  return withoutPhone || "고객";
}

export function extractPhoneFromContact(userContact: string | null | undefined): string {
  const m = userContact ? PHONE_RE.exec(userContact) : null;
  return m ? m[0] : "";
}
