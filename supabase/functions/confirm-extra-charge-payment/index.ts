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
//
// DB 반영(PAID 전환)에 처음 성공하면 issue-virtual-account/portone-webhook과 같은 패턴으로
// _shared/telegram.ts 를 통해 운영 채널에 결제 완료를 알리고, confirm_extra_charge_payment() RPC가
// AMOUNT_MISMATCH/그 외 오류로 실패하면(이미 PortOne 결제는 승인된 뒤이므로) 결제 반영 실패 경보도
// 보냅니다 — portone-webhook의 extra_charge 분기와 같은 알림 로직입니다.
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";
import { buildExtraChargePaidMessage, buildPaymentReconciliationFailureMessage, notifySafely, sendTelegramMessage } from "../_shared/telegram.ts";

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
    .select("id, application_id, extra_charge_status, extra_charge_amount, extra_charge_memo, senior_name, guardian_name")
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
      return json(502, { error: "PORTONE_LOOKUP_FAILED" }); // PortOne 원문 오류는 서버 로그에만 남기고 사용자에게는 보내지 않습니다
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

  // portone-webhook 이 같은 payment_id 에 대해 거의 동시에 호출될 수 있습니다 — confirm_extra_charge_payment()
  // 는 멱등이라 DB 상태는 안전하지만, 알림을 "항상" 보내면 이 함수와 webhook이 각자 한 번씩 보내 중복
  // 알림이 발송됩니다. RPC 호출 바로 전에 상태를 다시 읽어, 그 시점에도 여전히 REQUESTED 였을 때(= 이
  // 호출이 실제로 전환을 수행하는 경우에만) 알림을 보냅니다(portone-webhook 의 wasFirstTransition 과 같은 패턴).
  const { data: freshSchedule, error: freshErr } = await admin
    .from("care_schedules")
    .select("extra_charge_status")
    .eq("extra_charge_payment_id", payment_id)
    .maybeSingle();
  if (freshErr) return json(500, { error: "SCHEDULE_LOOKUP_FAILED", message: freshErr.message });
  const wasFirstTransition = freshSchedule?.extra_charge_status === "REQUESTED";

  const { data: updated, error: rpcErr } = await admin.rpc("confirm_extra_charge_payment", {
    p_payment_id: payment_id,
    p_paid_amount: paidAmount,
  });
  if (rpcErr) {
    // 이 지점은 PortOne 이 이미 'PAID' 를 돌려준 뒤입니다 — issue-virtual-account/portone-webhook 과
    // 같은 이유로, 추가 요금도 결제는 됐는데 DB 반영이 실패하면 보호자는 돈을 냈지만 관리자 화면에는
    // 여전히 '청구중'으로 보이는 불일치가 생기므로 운영자에게 즉시 알립니다. 알림 발송 실패는 응답에
    // 영향을 주지 않습니다.
    const reason = rpcErr.message?.includes("AMOUNT_MISMATCH") ? "AMOUNT_MISMATCH" : "STATUS_UPDATE_FAILED";
    const notified = await notifySafely("추가 요금 결제 반영 실패 경보", () => sendTelegramMessage(buildPaymentReconciliationFailureMessage({
      applicationId: schedule.application_id || payment_id,
      reason,
      detail: rpcErr.message,
      source: "confirm-extra-charge-payment",
    })));
    console.log("[confirm-extra-charge-payment] 결제 반영 실패 경보 발송 결과: " + notified);
    if (reason === "AMOUNT_MISMATCH") {
      console.error("[confirm-extra-charge-payment] 입금 금액 불일치:", rpcErr.message);
      return json(409, { error: "AMOUNT_MISMATCH", message: rpcErr.message });
    }
    console.error("[confirm-extra-charge-payment] confirm_extra_charge_payment 실패:", rpcErr);
    return json(500, { error: "STATUS_UPDATE_FAILED", message: rpcErr.message });
  }

  // 관리자가 수기로 청구한 추가 요금을 보호자가 실제로 결제했다는 사실을 바로 확인할 수 있도록
  // 운영 채널에 알립니다 — 이미 결제/DB 반영이 끝난 뒤라 알림 발송이 실패해도 응답에는 영향을 주지 않습니다.
  if (wasFirstTransition) {
    const notified = await notifySafely("추가 요금 결제 완료", () => sendTelegramMessage(buildExtraChargePaidMessage({
      scheduleId: schedule.id,
      applicationId: schedule.application_id,
      seniorName: schedule.senior_name,
      guardianName: schedule.guardian_name,
      amount: paidAmount,
      memo: schedule.extra_charge_memo,
    })));
    console.log("[confirm-extra-charge-payment] 추가 요금 결제 완료 텔레그램 알림 발송 결과: " + notified);
  } else {
    console.log("[confirm-extra-charge-payment] 텔레그램 알림을 건너뜁니다 — portone-webhook 이 먼저 전환을 수행함(중복 알림 방지).");
  }

  return json(200, { status: "PAID", schedule: updated });
});
