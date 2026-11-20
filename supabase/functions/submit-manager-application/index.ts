// POST /functions/v1/submit-manager-application
//
// manager-apply.html 의 케어 매니저 지원서 제출 창구입니다. 예전에는 브라우저가 manager_applications
// 에 직접 insert 했지만(sql/manager_applications.sql), 그 경로로는 아래를 막을 수 없어 이 함수로
// 옮겼습니다(브라우저 직접 insert 는 sql/manager_application_anti_abuse.sql 에서 권한을 회수해 막았습니다):
//
//   1) 연락처(phone) 중복 지원 — "이미 지원 접수된 연락처입니다." (요구사항 1)
//   1-1) 이미 활동 중인 매니저 계정의 연락처 — "이미 케어 매니저로 등록된 연락처입니다."
//        profiles.phone 을 managers(certification_verified=true) 와 대조합니다. profiles/managers
//        모두 RLS가 "본인 행만 조회"라 브라우저에서는 이 대조를 할 수 없고, service_role 인 이 함수에서만
//        가능합니다.
//   2) IP 기준 요청 횟수 제한 — 같은 IP가 짧은 시간에 과도하게 두드리면 차단 (요구사항 3)
//   3) Cloudflare Turnstile 사람 확인 — 토큰을 Cloudflare에 서버에서 재검증 (요구사항 4)
//
// 프런트엔드의 제출 버튼 즉시 비활성화는 중복 클릭을 막는 보조 장치이며,
// 이 함수는 서버 쪽에서 IP 제한과 Turnstile 검증을 다시 수행합니다.
//
// 요청 바디: 기존 manager_applications insert 행과 동일한 필드 + turnstile_token.
// 인증: Authorization 헤더 필수(verify_jwt = true) — 로그인한 지원자 본인 세션 토큰.
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";
import { buildNewManagerApplicationMessage, sendManagerApplicationTelegramMessage } from "../_shared/telegram.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface SubmitRequestBody {
  name?: string;
  phone?: string;
  birth_date?: string;
  gender?: string | null;
  address?: string;
  id_image_path?: string | null;
  activity_areas?: string[];
  activity_schedule?: string[];
  certifications?: string[];
  career_experience?: string;
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
  agree_safety?: boolean;
  agree_no_direct_deal?: boolean;
  agree_privacy?: boolean;
  turnstile_token?: string;
}

// Supabase Edge Functions는 Deno Deploy 위에서 Cloudflare 를 거쳐 들어오므로 cf-connecting-ip 가 가장
// 신뢰할 수 있는 접속 IP 입니다 — 없으면 x-forwarded-for 의 첫 번째 값으로 대체합니다.
function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return null;
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;
function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip);
}

type TurnstileCheck = { ok: boolean; errorCodes: string[]; configurationError?: boolean; serviceError?: boolean };

async function verifyTurnstile(token: string, remoteIp: string | null): Promise<TurnstileCheck> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.error("[submit-manager-application] TURNSTILE_SECRET_KEY 환경변수가 없습니다. supabase secrets set TURNSTILE_SECRET_KEY=... 로 설정하세요.");
    return { ok: false, errorCodes: ["missing-input-secret"], configurationError: true };
  }
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (remoteIp) form.set("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[submit-manager-application] Turnstile siteverify HTTP 오류:", res.status, result["error-codes"]);
      return { ok: false, errorCodes: Array.isArray(result["error-codes"]) ? result["error-codes"] : [], serviceError: true };
    }
    if (!result.success) {
      console.warn("[submit-manager-application] Turnstile 검증 실패:", result["error-codes"]);
    }
    return { ok: !!result.success, errorCodes: Array.isArray(result["error-codes"]) ? result["error-codes"] : [] };
  } catch (e) {
    console.error("[submit-manager-application] Turnstile siteverify 호출 중 예외:", e);
    return { ok: false, errorCodes: [], serviceError: true };
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim().length > 0);
}

function validatePayload(body: SubmitRequestBody): string | null {
  if (!isNonEmptyString(body.name)) return "이름을 입력해 주세요.";
  if (!isNonEmptyString(body.phone)) return "연락처를 입력해 주세요.";
  if (!isNonEmptyString(body.birth_date)) return "생년월일을 선택해 주세요.";
  if (!isNonEmptyString(body.address)) return "거주지 주소를 입력해 주세요.";
  // 신분증 사본은 현재 지원 단계에서 받지 않습니다(manager-apply.html ID_UPLOAD_ENABLED = false) — 값이 오면
  // 문자열이어야 하고, 없으면(null/생략) 그대로 통과합니다.
  if (body.id_image_path != null && typeof body.id_image_path !== "string") return "신분증 사본 정보가 올바르지 않습니다.";
  // 성별: 새 지원서는 필수로 보내지만(manager-apply.html), 배포 직후 예전 화면(캐시)에서 온 요청이 막히지 않도록
  // 서버에서는 생략을 허용하고, 값이 있으면 '남'/'여' 만 받습니다(DB check 제약과 동일).
  if (body.gender != null && body.gender !== "" && body.gender !== "남" && body.gender !== "여") return "성별을 다시 선택해 주세요.";
  if (!isNonEmptyStringArray(body.activity_areas)) return "활동 가능 지역을 선택해 주세요.";
  if (!isNonEmptyStringArray(body.activity_schedule)) return "활동 가능 요일/시간대를 선택해 주세요.";
  if (!isNonEmptyStringArray(body.certifications)) return "보유 자격증을 선택해 주세요.";
  if (!isNonEmptyString(body.career_experience)) return "관련 경력을 입력해 주세요.";
  if (!isNonEmptyString(body.bank_name)) return "정산 은행명을 입력해 주세요.";
  if (!isNonEmptyString(body.account_number)) return "계좌번호를 입력해 주세요.";
  // 숫자(와 하이픈·공백)만 허용 — DB 트리거가 숫자만 뽑아 암호화하므로, 그 밖의 문자가 섞인 값은 미리 거절합니다.
  if (!/^[\d\s-]{6,30}$/.test(body.account_number.trim())) return "계좌번호는 숫자만 입력해 주세요.";
  if (!isNonEmptyString(body.account_holder)) return "예금주명을 입력해 주세요.";
  if (body.agree_safety !== true || body.agree_no_direct_deal !== true || body.agree_privacy !== true) {
    return "모든 서약 및 약관에 동의해야 지원할 수 있습니다.";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  const userClient = createUserClient(authHeader);
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { error: "NOT_AUTHENTICATED" });

  let body: SubmitRequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  // ---- 3) IP 레이트리밋 — Turnstile/DB 조회보다 먼저 확인해, 과도한 요청이 뒤쪽(외부 API 호출 등)
  // 까지 가지 않게 가장 앞에서 막습니다. ----
  const clientIp = extractClientIp(req);
  const admin = createAdminClient();
  if (clientIp && isValidIp(clientIp)) {
    const { data: allowed, error: rlError } = await admin.rpc("check_manager_application_rate_limit", {
      p_ip: clientIp,
      p_max_attempts: 5,
      p_window_minutes: 10,
    });
    if (rlError) {
      console.error("[submit-manager-application] 레이트리밋 확인 실패(허용 처리):", rlError.message);
    } else if (allowed === false) {
      return json(429, { error: "TOO_MANY_REQUESTS", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });
    }
  } else {
    console.warn("[submit-manager-application] 클라이언트 IP를 확인하지 못해 레이트리밋을 건너뜁니다.");
  }

  // ---- 4) 봇 탐지(Cloudflare Turnstile) ----
  if (!isNonEmptyString(body.turnstile_token)) {
    return json(400, { error: "BOT_VERIFICATION_REQUIRED", message: "자동 입력 방지 인증을 완료해 주세요." });
  }
  const turnstileCheck = await verifyTurnstile(body.turnstile_token, clientIp);
  if (!turnstileCheck.ok) {
    if (turnstileCheck.configurationError) {
      return json(500, { error: "BOT_VERIFICATION_NOT_CONFIGURED", message: "자동 입력 방지 서버 설정이 완료되지 않았습니다. 지원팀에 문의해 주세요." });
    }
    if (turnstileCheck.serviceError) {
      return json(502, { error: "BOT_VERIFICATION_UNAVAILABLE", message: "자동 입력 방지 서비스 연결에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return json(400, {
      error: "BOT_VERIFICATION_FAILED",
      message: "자동 입력 방지 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      turnstile_error_codes: turnstileCheck.errorCodes,
    });
  }

  // ---- 입력값 검증(방어적 — manager-apply.html 이 이미 4단계에 걸쳐 검증하지만 서버에서도 한 번 더) ----
  const validationError = validatePayload(body);
  if (validationError) {
    return json(400, { error: "INVALID_INPUT", message: validationError });
  }

  const phone = body.phone!.trim();

  // ---- 이미 인증된 매니저인지 ----
  const { data: existingManager, error: managerErr } = await admin
    .from("managers")
    .select("id")
    .eq("id", user.id)
    .eq("certification_verified", true)
    .maybeSingle();
  if (managerErr) return json(500, { error: "LOOKUP_FAILED", message: managerErr.message });
  if (existingManager) {
    return json(409, { error: "ALREADY_MANAGER", message: "이미 케어 매니저로 등록되어 있습니다." });
  }

  // ---- 본인 명의로 심사 중인 지원이 이미 있는지 ----
  const { data: ownPending, error: ownPendingErr } = await admin
    .from("manager_applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (ownPendingErr) return json(500, { error: "LOOKUP_FAILED", message: ownPendingErr.message });
  if (ownPending) {
    return json(409, { error: "PENDING_EXISTS", message: "이미 심사 중인 지원서가 있습니다." });
  }

  // ---- 1-1) 이미 활동 중인 매니저 계정의 연락처인지 — profiles.phone 을 모아 managers
  // (certification_verified=true) 에 그 id가 있는지 봅니다. phone 은 profiles 에만 있고 managers 에는
  // 없어서(managers.id 가 profiles.id 를 그대로 참조) 두 단계로 조회합니다. ----
  const { data: phoneProfiles, error: phoneProfileErr } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone);
  if (phoneProfileErr) return json(500, { error: "LOOKUP_FAILED", message: phoneProfileErr.message });
  if (phoneProfiles && phoneProfiles.length > 0) {
    const { data: activeManagerByPhone, error: activeManagerErr } = await admin
      .from("managers")
      .select("id")
      .in("id", phoneProfiles.map((p) => p.id))
      .eq("certification_verified", true)
      .maybeSingle();
    if (activeManagerErr) return json(500, { error: "LOOKUP_FAILED", message: activeManagerErr.message });
    if (activeManagerByPhone) {
      return json(409, { error: "PHONE_ALREADY_MANAGER", message: "이미 케어 매니저로 등록된 연락처입니다." });
    }
  }

  // ---- 1) 연락처 중복 지원 ----
  const { data: phoneTaken, error: phoneErr } = await admin
    .from("manager_applications")
    .select("id")
    .eq("phone", phone)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (phoneErr) return json(500, { error: "LOOKUP_FAILED", message: phoneErr.message });
  if (phoneTaken) {
    return json(409, { error: "PHONE_ALREADY_APPLIED", message: "이미 지원 접수된 연락처입니다." });
  }

  const row = {
    user_id: user.id,
    name: body.name!.trim(),
    phone,
    birth_date: body.birth_date,
    gender: body.gender === "남" || body.gender === "여" ? body.gender : null,
    address: body.address!.trim(),
    id_image_path: isNonEmptyString(body.id_image_path) ? body.id_image_path : null,
    activity_areas: body.activity_areas,
    activity_schedule: body.activity_schedule,
    certifications: body.certifications,
    career_experience: body.career_experience!.trim(),
    bank_name: body.bank_name!.trim(),
    account_number: body.account_number,
    account_holder: body.account_holder!.trim(),
    agree_safety: true,
    agree_no_direct_deal: true,
    agree_privacy: true,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("manager_applications")
    .insert([row])
    .select("id, name, phone, birth_date, address, created_at")
    .single();

  if (insertErr) {
    // sql/manager_application_anti_abuse.sql 의 유니크 인덱스가 동시 요청(TOCTOU) 사이에도 막아주는
    // 최종 방어선입니다 — 위 사전 조회를 통과했더라도 여기서 걸릴 수 있습니다.
    if (insertErr.code === "23505") {
      if (insertErr.message?.includes("phone_active_unique")) {
        return json(409, { error: "PHONE_ALREADY_APPLIED", message: "이미 지원 접수된 연락처입니다." });
      }
      if (insertErr.message?.includes("one_pending_per_user")) {
        return json(409, { error: "PENDING_EXISTS", message: "이미 심사 중인 지원서가 있습니다." });
      }
    }
    console.error("[submit-manager-application] insert 실패:", insertErr.code, insertErr.message);
    return json(500, { error: "SUBMISSION_FAILED", message: "제출 중 오류가 발생했습니다." });
  }

  // 텔레그램 알림 — 실패해도 이미 접수(insert)는 끝난 뒤이므로 응답에는 영향을 주지 않습니다
  // (sendManagerApplicationTelegramMessage 는 예외를 던지지 않고 false 만 돌려줍니다).
  try {
    await sendManagerApplicationTelegramMessage(buildNewManagerApplicationMessage({
      name: inserted.name,
      phone: inserted.phone,
      birthDate: inserted.birth_date,
      address: inserted.address,
      createdAt: inserted.created_at,
    }));
  } catch (e) {
    console.error("[submit-manager-application] 텔레그램 알림 발송 중 예외(접수는 이미 완료됨):", e);
  }

  return json(200, { application: inserted });
});
