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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const { order_id } = payload;
  if (!order_id) {
    return json(400, { error: "INVALID_INPUT", message: "order_id 는 필수입니다." });
  }

  const userClient = createUserClient(authHeader);

  // 소유권 확인 — package_orders_select_own RLS가 "내 주문"만 보여주므로, 조회 성공 자체가 권한 확인입니다.
  const { data: order, error: orderErr } = await userClient
    .from("package_orders")
    .select("id, status, amount")
    .eq("id", order_id)
    .maybeSingle();
  if (orderErr) return json(500, { error: "ORDER_LOOKUP_FAILED", message: orderErr.message });
  if (!order) return json(404, { error: "PACKAGE_ORDER_NOT_FOUND" });

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
  const { data: pkg, error: rpcErr } = await admin.rpc("confirm_package_order_payment", {
    p_order_id: order_id,
    p_paid_amount: paidAmount,
    p_payment_key: paymentKey,
  });
  if (rpcErr) {
    if (rpcErr.message?.includes("AMOUNT_MISMATCH")) {
      console.error("[confirm-package-order-payment] 결제 금액 불일치:", rpcErr.message);
      return json(409, { error: "AMOUNT_MISMATCH", message: rpcErr.message });
    }
    console.error("[confirm-package-order-payment] confirm_package_order_payment 실패:", rpcErr);
    return json(500, { error: "STATUS_UPDATE_FAILED", message: rpcErr.message });
  }

  return json(200, { status: "PAID", package: pkg });
});
