// POST /functions/v1/admin-refund-application
//
// 관리자 콘솔(admin.html) '취소된 신청 내역' 카드의 [환불 처리] 버튼이 호출합니다.
// 지금까지 이 카드는 PG 환불을 관리자가 PortOne 콘솔에서 직접 처리한 뒤 [환불 완료 처리]로 그 사실만
// 표시했는데(admin_mark_refund_completed), 이 함수는 그 대신 실제로 PortOne V2 결제 취소 API
// (POST /payments/{paymentId}/cancel)를 호출해 전액 또는 부분 환불을 바로 실행합니다.
//
// 요청 바디: { application_id, refund_type, amount, reason }
//   application_id : service_applications.id (paymentId 와 동일한 규칙 — issue-virtual-account 등 참고)
//   refund_type     : 'full' | 'partial'
//   amount          : refund_type === 'partial' 일 때만 필수 — 이번에 돌려줄 금액(원)
//   reason          : 환불 사유(필수) — PortOne 취소 사유 + DB 이력(service_application_refund_logs)에 저장
//
// 처리 순서(돈이 실제로 움직인 뒤에만 DB를 바꾸는 이 프로젝트 전체 원칙과 동일):
//   1) service_applications 에서 현재 결제 총액(final_amount)과 지금까지 누적 환불액(refund_amount)을
//      조회해 환불 가능 잔액을 계산하고, 요청 금액이 그 잔액을 넘지 않는지 먼저 검증합니다.
//   2) PortOne POST /payments/{application_id}/cancel 호출 — 전액 환불은 amount 를 생략해 "남은 전액"을
//      그대로 취소합니다(이미 부분 환불된 적이 있어도 PortOne이 남은 취소 가능액을 스스로 계산합니다).
//   3) 취소 성공 후에만 admin_apply_application_refund() RPC로 DB 반영(refund_amount 누적,
//      payment_status 를 REFUNDED/PARTIALLY_REFUNDED 로 전환).
//
// 인증: 로그인한 관리자만 호출 가능 — cancel-payment 와 동일한 패턴으로 (1) auth.getUser() 로 토큰을
// GoTrue에 직접 검증하고 (2) service-role 클라이언트로 profiles.role === 'admin' 을 확인합니다(fail closed).
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
  application_id?: string;
  refund_type?: "full" | "partial";
  amount?: number;
  reason?: string;
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

  const { application_id, refund_type, amount, reason } = payload;
  if (!application_id || (refund_type !== "full" && refund_type !== "partial") || !reason || !reason.trim()) {
    return json(400, {
      error: "INVALID_INPUT",
      message: "application_id, refund_type('full' 또는 'partial'), reason 은 모두 필수입니다.",
    });
  }
  if (refund_type === "partial" && (!amount || amount <= 0)) {
    return json(400, { error: "INVALID_INPUT", message: "부분 환불은 0보다 큰 amount 가 필요합니다." });
  }

  const userClient = createUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    console.error("[admin-refund-application] 호출자 인증 확인 실패(토큰 만료/무효 가능성):", userErr);
    return json(401, {
      error: "NOT_AUTHENTICATED",
      message: "로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.",
    });
  }

  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("[admin-refund-application] profiles 조회 실패 — user_id=" + userData.user.id + ":", profileErr);
    return json(500, { error: "PROFILE_LOOKUP_FAILED", message: profileErr.message });
  }
  const normalizedRole = String(profile?.role ?? "").trim().toLowerCase();
  if (normalizedRole !== "admin" && normalizedRole !== "super_admin") {
    console.error("[admin-refund-application] 관리자 권한 없음 — user_id=" + userData.user.id +
      ", email=" + userData.user.email + ", 조회된 role=" + JSON.stringify(profile?.role ?? null));
    return json(403, {
      error: "NOT_ADMIN",
      message: "관리자 권한이 없는 계정입니다 (user_id: " + userData.user.id + ", email: " + userData.user.email + ").",
    });
  }

  const { data: app, error: appErr } = await admin
    .from("service_applications")
    .select("id, status, payment_status, final_amount, refund_amount")
    .eq("id", application_id)
    .maybeSingle();
  if (appErr) return json(500, { error: "APPLICATION_LOOKUP_FAILED", message: appErr.message });
  if (!app) return json(404, { error: "APPLICATION_NOT_FOUND" });
  if (app.status !== "CANCELLED" && app.status !== "EXPIRED_CANCELLED") {
    return json(409, { error: "NOT_CANCELLED", message: "취소된 신청 건만 환불 처리할 수 있습니다." });
  }
  if (app.payment_status !== "PAID" && app.payment_status !== "PARTIALLY_REFUNDED") {
    return json(409, { error: "NOTHING_TO_REFUND", message: "환불할 결제 내역이 없습니다(미결제 또는 이미 환불 완료)." });
  }

  const total: number = app.final_amount ?? 0;
  const already: number = app.refund_amount ?? 0;
  const remaining = total - already;
  if (remaining <= 0) {
    return json(409, { error: "ALREADY_FULLY_REFUNDED", message: "이미 전액 환불이 완료된 건입니다." });
  }

  const requestedAmount = refund_type === "full" ? remaining : (amount as number);
  if (refund_type === "partial" && requestedAmount > remaining) {
    return json(409, {
      error: "REFUND_EXCEEDS_REMAINING",
      message: `환불 요청 금액(${requestedAmount}원)이 환불 가능 잔액(${remaining}원)보다 많습니다.`,
    });
  }

  // 전액 환불은 amount 를 생략합니다 — PortOne이 이 결제의 남은 취소 가능액 전부를 알아서 취소합니다
  // (이미 부분 환불된 적이 있어도 정확히 "남은 만큼"만 취소되므로, 우리가 remaining 을 다시 계산해
  // 넘기는 것과 결과가 같습니다).
  let cancellation: any;
  try {
    cancellation = await portoneFetch(`/payments/${encodeURIComponent(application_id)}/cancel`, {
      method: "POST",
      body: JSON.stringify(refund_type === "full" ? { reason } : { reason, amount: requestedAmount }),
    });
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[admin-refund-application] PortOne 환불 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_CANCEL_FAILED", detail: e.body });
    }
    console.error("[admin-refund-application] 예외:", e);
    return json(500, { error: "PORTONE_CANCEL_FAILED" });
  }

  const actualAmount: number =
    cancellation?.cancellation?.amount?.total ?? cancellation?.cancellation?.totalAmount ?? requestedAmount;
  const portoneRef: string | null = cancellation?.cancellation?.id ?? cancellation?.id ?? null;

  const { data: updated, error: rpcErr } = await admin.rpc("admin_apply_application_refund", {
    p_application_id: application_id,
    p_amount: actualAmount,
    p_reason: reason,
    p_portone_ref: portoneRef,
  });
  if (rpcErr) {
    // PortOne 환불은 이미 성공했는데 DB 반영이 실패한 경우 — 돈은 이미 돌아갔으므로 운영자가 로그를
    // 보고 DB만 다시 맞출 수 있도록 PortOne 응답을 함께 남깁니다.
    console.error("[admin-refund-application] PortOne 환불은 성공했지만 admin_apply_application_refund 실패:",
      rpcErr, "PortOne 응답:", JSON.stringify(cancellation));
    return json(500, {
      error: "DB_UPDATE_FAILED_AFTER_REFUND",
      message: rpcErr.message,
      portone_cancellation: cancellation?.cancellation ?? cancellation,
    });
  }

  return json(200, {
    ok: true,
    refunded_amount: actualAmount,
    application: updated,
  });
});
