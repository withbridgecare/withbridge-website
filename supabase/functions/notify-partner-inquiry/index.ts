// POST /functions/v1/notify-partner-inquiry
//
// partner.html 제휴 문의 폼이 partner_inquiries 에 직접 insert(anon 키)되면,
// sql/partner_inquiry_notify_webhook.sql 의 DB 트리거가 pg_net.http_post() 로 "방금 새 문의가
// 들어왔다"는 사실만 알려주고, 이 함수가 해당 행을 직접 조회해 대표님 메일로 알림을 보냅니다 —
// send-status-alimtalk/sql/care_status_alimtalk_webhook.sql 과 같은 "DB 트리거는 얕게, 조회/가공은
// Edge Function에" 패턴을 그대로 따릅니다.
//
// 인증: verify_jwt = false로 배포하세요(DB 트리거는 로그인 세션이 없습니다). 대신 트리거가 보내는
// x-webhook-secret 헤더를 PARTNER_INQUIRY_WEBHOOK_SECRET 환경변수와 대조해 아무나 이 URL을 호출해
// 알림을 마구 보내는 것을 막습니다.
//
// 요청 바디: { inquiry_id: '<uuid>' }
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { sendEmail, ResendApiError } from "../_shared/resend.ts";
import { buildPartnerInquiryEmail } from "../_shared/partnerInquiryEmailTemplate.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface RequestBody {
  inquiry_id?: string;
}

// 대표님 메일 주소 — 운영 중 수신처를 바꿔야 할 수 있으니 환경변수로도 덮어쓸 수 있게 하되,
// 기본값을 둬서 PARTNER_INQUIRY_NOTIFY_EMAIL 을 아직 등록하지 않아도 바로 동작합니다.
const DEFAULT_NOTIFY_EMAIL = "withbridge.care@gmail.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const expectedSecret = Deno.env.get("PARTNER_INQUIRY_WEBHOOK_SECRET");
  const givenSecret = req.headers.get("x-webhook-secret");
  if (!expectedSecret) {
    console.error("[notify-partner-inquiry] PARTNER_INQUIRY_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다 — 이 함수를 아무나 호출할 수 있는 상태라 요청을 전부 거부합니다.");
    return json(500, { error: "SERVER_MISCONFIGURED" });
  }
  if (!givenSecret || givenSecret !== expectedSecret) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  if (!payload.inquiry_id) return json(400, { error: "MISSING_INQUIRY_ID" });

  const supabase = createAdminClient();
  const { data: inquiry, error } = await supabase
    .from("partner_inquiries")
    .select("org_name, contact_name, phone, email, org_type, message, created_at")
    .eq("id", payload.inquiry_id)
    .maybeSingle();

  if (error || !inquiry) {
    console.error("[notify-partner-inquiry] partner_inquiries 조회 실패:", error, payload.inquiry_id);
    return json(404, { error: "INQUIRY_NOT_FOUND" });
  }

  const { subject, html, text } = buildPartnerInquiryEmail({
    orgName: inquiry.org_name,
    contactName: inquiry.contact_name,
    phone: inquiry.phone,
    email: inquiry.email,
    orgType: inquiry.org_type,
    message: inquiry.message,
    createdAt: inquiry.created_at,
  });

  const to = Deno.env.get("PARTNER_INQUIRY_NOTIFY_EMAIL") || DEFAULT_NOTIFY_EMAIL;

  try {
    await sendEmail({ to, subject, html, text });
  } catch (e) {
    console.error(
      `[notify-partner-inquiry] ${payload.inquiry_id} 알림 메일 발송 실패:`,
      e instanceof ResendApiError ? e.body : e,
    );
    return json(502, { error: "EMAIL_SEND_FAILED" });
  }

  return json(200, { ok: true });
});
