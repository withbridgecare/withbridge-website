// POST /functions/v1/confirm-package-order-payment
//
// 5회권/10회권 패키지 선결제 확인 엔드포인트입니다. mypage.html에서 보호자가 패키지를 고르면
// package_orders에 PENDING 행을 먼저 만들고, 그 id를 PortOne.requestPayment()의 paymentId로 그대로
// 써서 결제창을 띄웁니다 — 결제창이 닫히면 이 함수를 호출합니다. 여기서는 그 응답을 그대로 믿지 않고
// PortOne API(GET /payments/{paymentId})를 서버에서 다시 조회해 실제 승인 금액을 확인한 뒤에만
// confirm_package_order_payment() RPC로 DB를 바꿉니다(issue-virtual-account/confirm-extra-charge-payment
// 와 같은 원칙).
//
// 요청 바디: { order_id }  (= 결제창 호출 때 paymentId 로 쓴 값, package_orders.id 와 동일)
//
// 인증: 로그인한 보호자만 호출 가능(verify_jwt = true, config.toml 참고). package_orders_select_own RLS로
// 소유권을 확인합니다(조회가 되는 것 자체가 "내 주문"이라는 뜻).
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";
import { buildNewPackageOrderMessage, buildPaymentReconciliationFailureMessage, notifySafely, sendTelegramMessage } from "../_shared/telegram.ts";

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

interface RequestBody {
  order_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  // 아래 로직 중 하나라도 예상치 못하게 throw 하면(예: createAdminClient()/createUserClient() 가
  // SUPABASE_SERVICE_ROLE_KEY 등 환경변수 누락으로 던지는 에러) Deno.serve 가 이걸 안 잡고 그대로
  // 올리면 CORS_HEADERS 가 안 붙은 응답이 나갑니다 — 브라우저는 이걸 실제 원인(500/환경변수 누락)이
  // 아니라 그냥 "CORS 오류"/"네트워크 오류"로만 보여줘서 디버깅이 훨씬 어려워집니다. 그래서 전체를
  // 한 번 더 감싸, 무슨 예외든 CORS 헤더가 붙은 JSON 500 응답으로 바뀌어 나가게 합니다.
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[confirm-package-order-payment] 처리 중 예상치 못한 예외(환경변수 누락 등 가능):", e);
    return json(500, { error: "UNEXPECTED_ERROR", message: e instanceof Error ? e.message : String(e) });
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const { order_id } = payload;
  console.log("[confirm-package-order-payment] 요청 수신 — order_id=" + order_id + ", Authorization 헤더 유무=" + !!authHeader);
  if (!order_id) {
    return json(400, { error: "INVALID_INPUT", message: "order_id 는 필수입니다." });
  }

  const userClient = createUserClient(authHeader);

  // 소유권 확인 — package_orders_select_own RLS가 "내 주문"만 보여주므로, 조회 성공 자체가 권한 확인입니다.
  // RLS 때문에 "존재하긴 하지만 내 것이 아닌" 주문도 !order(null)로 똑같이 404 가 나므로, 이 로그에
  // order_id 를 같이 남겨 둬야 "진짜 없는 주문"과 "남의 주문을 잘못된 토큰으로 조회"를 구분할 수 있습니다.
  const { data: order, error: orderErr } = await userClient
    .from("package_orders")
    .select("id, status, amount")
    .eq("id", order_id)
    .maybeSingle();
  if (orderErr) {
    console.error("[confirm-package-order-payment] package_orders 조회 실패 — order_id=" + order_id + ":", orderErr.code, orderErr.message);
    return json(500, { error: "ORDER_LOOKUP_FAILED", message: orderErr.message });
  }
  if (!order) {
    console.warn("[confirm-package-order-payment] order_id=" + order_id + " 를 찾지 못했습니다(존재하지 않거나, 이 Authorization 토큰 소유가 아님 — package_orders_select_own RLS).");
    return json(404, { error: "PACKAGE_ORDER_NOT_FOUND" });
  }

  // 이미 처리된 주문의 재호출(새로고침, 중복 클릭 등)은 조용히 성공 처리 — 멱등.
  if (order.status === "PAID") {
    return json(200, { already_processed: true, status: "PAID" });
  }

  let payment: any;
  try {
    payment = await portoneFetch(`/payments/${encodeURIComponent(order_id)}`);
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[confirm-package-order-payment] PortOne 결제 조회 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_LOOKUP_FAILED", detail: e.body });
    }
    console.error("[confirm-package-order-payment] 예외:", e);
    return json(500, { error: "PORTONE_LOOKUP_FAILED" });
  }

  const status: string | undefined = payment?.status;
  console.log("[confirm-package-order-payment] PortOne 조회 결과:", { order_id, status });

  if (status !== "PAID") {
    // 패키지는 가상계좌 없이 즉시결제만 지원합니다 — PAID 가 아니면 승인 실패로 간주합니다.
    return json(409, { error: "PAYMENT_NOT_APPROVED", status: status ?? null });
  }

  const paidAmount: number | null = payment?.amount?.total ?? payment?.totalAmount ?? null;
  const paymentKey: string | null = payment?.transactionId ?? payment?.id ?? null;
  const admin = createAdminClient();
  // 패키지 구매 자체는 아직 "신청(service_applications)"이 아니라 user_packages 회차 충전일 뿐이라
  // insurance_applied 를 여기서 찍지 않습니다 — 실제 적용 시각은 이 회차를 소진해 동행이 확정되는
  // 순간(consume_package_on_application(), sql/manager_insurance_tracking.sql)에 기록됩니다.
  const { data: pkg, error: rpcErr } = await admin.rpc("confirm_package_order_payment", {
    p_order_id: order_id,
    p_paid_amount: paidAmount,
    p_payment_key: paymentKey,
  });
  if (rpcErr) {
    // 이 지점은 PortOne 이 이미 'PAID' 를 돌려준 뒤입니다 — issue-virtual-account/portone-webhook 과
    // 같은 이유로 운영자에게 즉시 알립니다(결제는 됐는데 패키지 회차가 충전되지 않는 사고를 조용히
    // 넘기지 않음).
    const reason = rpcErr.message?.includes("AMOUNT_MISMATCH") ? "AMOUNT_MISMATCH" : "STATUS_UPDATE_FAILED";
    const notified = await notifySafely("결제 반영 실패 경보", () => sendTelegramMessage(buildPaymentReconciliationFailureMessage({
      applicationId: order_id,
      reason,
      detail: rpcErr.message,
      source: "confirm-package-order-payment",
    })));
    console.log("[confirm-package-order-payment] 결제 반영 실패 경보 발송 결과: " + notified);
    if (reason === "AMOUNT_MISMATCH") {
      console.error("[confirm-package-order-payment] 결제 금액 불일치:", rpcErr.message);
      return json(409, { error: "AMOUNT_MISMATCH", message: rpcErr.message });
    }
    console.error("[confirm-package-order-payment] confirm_package_order_payment 실패:", rpcErr);
    return json(500, { error: "STATUS_UPDATE_FAILED", message: rpcErr.message });
  }

  // 패키지 구매 확정 알림 — 수동 입금 확인(admin_confirm_manual_payment)이 보내는 "결제 확인" 알림과
  // 같은 취지로, 자동 승인 경로(여기)에서도 운영 채널에 알립니다. 실패해도(토큰 미설정 등)
  // 이미 끝난 결제 반영에는 영향이 없도록 예외를 던지지 않고 await 만 하되, 결과는 반드시 로그로
  // 남겨 "응답은 200인데 알림이 안 왔다"는 보고가 오면 이 로그 한 줄로 원인을 바로 구분합니다.
  const notified = await notifySafely(
    "패키지 구매 확정",
    () => sendTelegramMessage(buildNewPackageOrderMessage({
      packageType: pkg?.package_type,
      amount: paidAmount,
      userId: pkg?.user_id,
    })),
  );
  console.log("[confirm-package-order-payment] 패키지 구매 확정 알림 발송 결과: " + notified +
    " (package_type=" + pkg?.package_type + ", amount=" + paidAmount + ")");

  return json(200, { status: "PAID", package: pkg });
}
