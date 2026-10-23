// POST /functions/v1/confirm-extra-charge-payment
//
// 기본 요금 선결제 + 초과 시 추가 요금 정산 구조의 "2차 결제" 확인 엔드포인트입니다.
// admin.html에서 관리자가 admin_request_extra_charge()로 추가 요금을 청구하면
// care_schedules.extra_charge_status가 'REQUESTED'로 바뀌고 extra_charge_payment_id(uuid)가
// 발급됩니다. mypage.html은 그 값을 PortOne.requestPayment()의 paymentId로 그대로 써서 결제창을
// 띄우고, 결제창이 닫히면 이 함수를 호출합니다 — 여기서는 그 응답을 그대로 믿지 않고 PortOne
// API(GET /payments/{paymentId})를 서버에서 다시 조회해 실제 승인 금액을 확인한 뒤에만
// confirm_extra_charge_payment() RPC로 DB를 바꿉니다(issue-virtual-account와 같은 원칙).
//
// 요청 바디: { payment_id }  (= 결제창 호출 때 paymentId 로 쓴 값, care_schedules.extra_charge_payment_id 와 동일)
//
// 인증: 로그인한 보호자만 호출 가능(verify_jwt = true, config.toml 참고). care_schedules 의
// 기존 RLS(care_schedules_select_own / care_schedules_select_guardian /
// care_schedules_select_guardian_via_application)로 소유권을 확인합니다 — 조회가 되는 것 자체가
// "내 케어의 추가 청구"라는 뜻입니다. 기본 결제(issue-virtual-account)와 달리 비로그인 신청 경로는
// 지원하지 않습니다 — mypage.html 자체가 로그인 사용자만 접근 가능한 화면이라, 추가 요금은 항상
// 로그인 후에만 확인·결제할 수 있습니다.
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
  payment_id?: string;
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

  const { payment_id } = payload;
  if (!payment_id) {
    return json(400, { error: "INVALID_INPUT", message: "payment_id 는 필수입니다." });
  }

  const userClient = createUserClient(authHeader);

  // 소유권 확인 — RLS가 "내 케어"만 보여주므로, 이 조회가 성공하는 것 자체가 권한 확인입니다.
  const { data: schedule, error: scheduleErr } = await userClient
    .from("care_schedules")
    .select("id, extra_charge_status, extra_charge_amount")
    .eq("extra_charge_payment_id", payment_id)
    .maybeSingle();
  if (scheduleErr) return json(500, { error: "SCHEDULE_LOOKUP_FAILED", message: scheduleErr.message });
  if (!schedule) return json(404, { error: "EXTRA_CHARGE_NOT_FOUND" });

  // 이미 결제 완료 처리된 건의 재호출(새로고침, 중복 클릭 등)은 조용히 성공 처리 — 멱등.
  if (schedule.extra_charge_status === "PAID") {
    return json(200, { already_processed: true, status: "PAID" });
  }

  let payment: any;
  try {
    payment = await portoneFetch(`/payments/${encodeURIComponent(payment_id)}`);
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[confirm-extra-charge-payment] PortOne 결제 조회 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_LOOKUP_FAILED", detail: e.body });
    }
    console.error("[confirm-extra-charge-payment] 예외:", e);
    return json(500, { error: "PORTONE_LOOKUP_FAILED" });
  }

  const status: string | undefined = payment?.status;
  console.log("[confirm-extra-charge-payment] PortOne 조회 결과:", { payment_id, status });

  if (status !== "PAID") {
    // 가상계좌를 지원하지 않는 즉시결제 전용 흐름이라, PAID 가 아니면 전부 승인 실패로 간주합니다.
    return json(409, { error: "PAYMENT_NOT_APPROVED", status: status ?? null });
  }

  const paidAmount: number | null = payment?.amount?.total ?? payment?.totalAmount ?? null;
  const admin = createAdminClient();
  const { data: updated, error: rpcErr } = await admin.rpc("confirm_extra_charge_payment", {
    p_payment_id: payment_id,
    p_paid_amount: paidAmount,
  });
  if (rpcErr) {
    if (rpcErr.message?.includes("AMOUNT_MISMATCH")) {
      console.error("[confirm-extra-charge-payment] 입금 금액 불일치:", rpcErr.message);
      return json(409, { error: "AMOUNT_MISMATCH", message: rpcErr.message });
    }
    console.error("[confirm-extra-charge-payment] confirm_extra_charge_payment 실패:", rpcErr);
    return json(500, { error: "STATUS_UPDATE_FAILED", message: rpcErr.message });
  }

  return json(200, { status: "PAID", schedule: updated });
});
