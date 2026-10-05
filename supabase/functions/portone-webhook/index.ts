// POST /functions/v1/portone-webhook
//
// PortOne V2가 결제 상태 변경 시(가상계좌 입금 완료·취소/만료 등) 호출하는 웹훅 수신 엔드포인트입니다.
// 받은 즉시 DB를 바꾸지 않고, 반드시 PortOne API(GET /payments/{paymentId})를 다시 조회해 실제 상태를
// 확인한 뒤에만 virtual_accounts.is_paid 와 service_applications.status 를 바꿉니다
// (웹훅 바디 자체는 위변조/재전송에 취약할 수 있으므로 신뢰하지 않습니다 — event.type 문자열로 분기하지
// 않고, 어떤 이벤트든 paymentId 만 뽑아 재조회한 실제 status 로 분기합니다).
//
// 인증: PortOne이 Supabase 로그인 토큰 없이 직접 호출하므로 verify_jwt = false 로 공개 엔드포인트입니다
// (config.toml 참고). 대신 PORTONE_WEBHOOK_SECRET 이 설정되어 있으면 Standard Webhooks 서명을 검증합니다.
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface PortOneWebhookEvent {
  type?: string;
  data?: { paymentId?: string; transactionId?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  // 서명 검증을 위해 body는 반드시 "가공 전 원문 문자열"로 읽어야 합니다(JSON.parse 후 재직렬화하면 깨짐).
  const rawBody = await req.text();

  let event: PortOneWebhookEvent;
  const webhookSecret = Deno.env.get("PORTONE_WEBHOOK_SECRET");
  if (webhookSecret) {
    try {
      const { Webhook } = await import("npm:@portone/server-sdk@0.9");
      event = (await Webhook.verify(webhookSecret, rawBody, Object.fromEntries(req.headers))) as PortOneWebhookEvent;
    } catch (e) {
      console.error("[portone-webhook] 웹훅 서명 검증 실패:", e);
      return json(400, { error: "INVALID_SIGNATURE" });
    }
  } else {
    // 지금 발급받은 3개 키(STORE_ID/API_SECRET/CHANNEL_KEY)에는 웹훅 시크릿이 없습니다.
    // PortOne 콘솔 > 결제 연동 > 연동 관리 > 결제알림(Webhook) 관리에서 발급 후 PORTONE_WEBHOOK_SECRET
    // 로 채워 넣으면 서명 검증이 자동으로 켜집니다. 그 전까지는 아래 PortOne 재조회만으로 신뢰성을 확보합니다.
    console.warn("[portone-webhook] PORTONE_WEBHOOK_SECRET 미설정 — 서명 검증 없이 처리합니다.");
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "INVALID_JSON" });
    }
  }

  const paymentId = event.data?.paymentId;
  if (!paymentId) {
    // 결제 상태 변경과 무관한 이벤트는 확인만 하고 종료 — 불필요한 재시도를 막기 위해 2xx로 응답합니다.
    return json(200, { ignored: event.type ?? null });
  }

  // 발급 시 paymentId = application_id(UUID) 로 맞춰 두었으므로 그대로 조회에 쓸 수 있습니다.
  let payment: any;
  try {
    payment = await portoneFetch(`/payments/${encodeURIComponent(paymentId)}`);
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[portone-webhook] PortOne 결제 조회 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_LOOKUP_FAILED" });
    }
    console.error("[portone-webhook] 예외:", e);
    return json(500, { error: "PORTONE_LOOKUP_FAILED" });
  }

  const status: string | undefined = payment?.status;
  const admin = createAdminClient();

  if (status === "PAID") {
    // 가상계좌 입금 완료(또는 그 외 방식의 승인 완료) — 요구사항 3
    const { error } = await admin.rpc("mark_payment_matching_pending", { p_application_id: paymentId });
    if (error) {
      console.error("[portone-webhook] mark_payment_matching_pending 실패:", error);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: error.message });
    }
    return json(200, { ok: true, status: "PAID" });
  }

  if (status === "CANCELLED" || status === "FAILED") {
    // 가상계좌 입금 기한 만료(자동 취소) 또는 결제 취소/실패 — 요구사항 4
    const { error } = await admin.rpc("cancel_unpaid_application", { p_application_id: paymentId });
    if (error) {
      console.error("[portone-webhook] cancel_unpaid_application 실패:", error);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: error.message });
    }
    return json(200, { ok: true, status });
  }

  // 그 외 상태(VIRTUAL_ACCOUNT_ISSUED, READY 등 아직 확정 전)는 지금은 처리할 것이 없습니다.
  return json(200, { skipped: true, status: status ?? null });
});
