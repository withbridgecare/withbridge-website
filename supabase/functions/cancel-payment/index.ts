// POST /functions/v1/cancel-payment
//
// 관리자 콘솔(admin.html) '케어 중단 처리' 모달의 [부분 취소 / 출장비 차감 환불] 버튼이 호출합니다.
// 현장에서 서류 미비·어르신 진료 거부·보호자 사정 등으로 케어가 중단됐을 때, 기본 출장비(위약금)만
// 남기고 나머지를 PortOne V2 결제 취소 API로 실제 부분 취소합니다.
//
// 요청 바디: { schedule_id, refund_amount, reason }
//   schedule_id   : care_schedules.id (관리자 화면에서 '케어 중단 처리'를 누른 그 건)
//   refund_amount : 보호자에게 실제로 돌려줄 금액(PortOne 취소 금액) — 0보다 커야 합니다.
//   reason        : 관리자가 입력한 처리 사유 메모. PortOne 취소 사유 + DB 이력(admin_care_adjustments)에
//                    그대로 저장됩니다.
//
// 처리 순서(이 프로젝트 전체에 깔린 원칙과 동일 — 돈이 실제로 움직인 뒤에만 DB를 바꿈):
//   1) schedule_id 로 care_schedules → application_id 를 찾고, 그 신청서의 현재 결제액(payment_amount)을 확인
//   2) PortOne POST /payments/{application_id}/cancel 호출(amount=refund_amount, 부분 취소)
//   3) 취소 성공 후에만 admin_apply_partial_refund() RPC로 DB 반영
//      (retained_amount = payment_amount - refund_amount, care_schedules 를 'completed' 로 닫고
//       70:30 정산 트리거가 retained_amount 기준으로 다시 계산되도록 함)
//
// 인증: 로그인한 관리자만 호출 가능 — verify_jwt=true(config.toml) 로 게이트웨이가 1차 검증한 뒤,
// 이 함수 안에서 (1) auth.getUser() 로 토큰을 GoTrue에 직접 검증하고 (2) service-role 클라이언트로
// profiles.role === 'admin' 을 확인합니다(fail closed). 실패 단계별로 사유를 console.error 에 남겨
// "토큰 만료" 와 "관리자 아님"을 구분할 수 있게 합니다.
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
  schedule_id?: string;
  refund_amount?: number;
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

  const { schedule_id, refund_amount, reason } = payload;
  if (!schedule_id || !refund_amount || refund_amount <= 0 || !reason || !reason.trim()) {
    return json(400, {
      error: "INVALID_INPUT",
      message: "schedule_id, refund_amount(0보다 큰 수), reason 은 모두 필수입니다.",
    });
  }

  // 관리자 권한 확인 — 예전엔 userClient.rpc("is_admin")(PostgREST를 한 번 더 거쳐 RLS 컨텍스트에서
  // SQL 함수를 실행) 한 줄로 끝냈는데, 토큰이 만료됐거나 PostgREST 쪽에서 JWT 검증이 실패하는 경우도
  // adminCheckErr 하나로 뭉쳐져 전부 "NOT_ADMIN" 으로만 보였습니다 — 실제로는 관리자 권한이 있는
  // 계정인데도(profiles.role='admin') 그 과정의 다른 단계가 실패해서 이 에러가 났을 수 있는데, 그걸
  // 구분할 방법이 없었습니다. issue-virtual-account 가 이미 쓰고 있는 더 직접적인 방식으로 바꿉니다:
  //   1) userClient.auth.getUser() 로 Authorization 토큰 자체를 GoTrue에 바로 검증 → 진짜 "로그인
  //      세션이 무효/만료"인 경우를 여기서 먼저 걸러내고 401로 명확히 구분합니다.
  //   2) 그 뒤에는 RLS를 타지 않는 service-role 클라이언트로 profiles.role 을 직접 조회합니다 — "그
  //      계정이 실제로 admin 이 아님"과 "조회 자체가 실패함"을 분리해서 각각 로그로 남깁니다.
  const userClient = createUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    console.error("[cancel-payment] 호출자 인증 확인 실패(토큰 만료/무효 가능성):", userErr);
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
    console.error("[cancel-payment] profiles 조회 실패 — user_id=" + userData.user.id + ":", profileErr);
    return json(500, { error: "PROFILE_LOOKUP_FAILED", message: profileErr.message });
  }
  const normalizedRole = String(profile?.role ?? "").trim().toLowerCase();
  if (normalizedRole !== "admin" && normalizedRole !== "super_admin") {
    console.error("[cancel-payment] 관리자 권한 없음 — user_id=" + userData.user.id +
      ", email=" + userData.user.email + ", 조회된 role=" + JSON.stringify(profile?.role ?? null));
    return json(403, {
      error: "NOT_ADMIN",
      message: "관리자 권한이 없는 계정입니다 (user_id: " + userData.user.id + ", email: " + userData.user.email + ").",
    });
  }

  const { data: schedule, error: scheduleErr } = await admin
    .from("care_schedules")
    .select("id, application_id, payment_amount, status")
    .eq("id", schedule_id)
    .maybeSingle();
  if (scheduleErr) return json(500, { error: "SCHEDULE_LOOKUP_FAILED", message: scheduleErr.message });
  if (!schedule) return json(404, { error: "SCHEDULE_NOT_FOUND" });
  if (!schedule.application_id) {
    return json(409, { error: "NO_APPLICATION_LINKED", message: "이 일정에는 연결된 신청서(결제 건)가 없습니다." });
  }
  if (schedule.status === "completed") {
    return json(409, { error: "SCHEDULE_ALREADY_COMPLETED" });
  }

  const currentAmount: number = schedule.payment_amount ?? 0;
  if (refund_amount > currentAmount) {
    return json(409, {
      error: "REFUND_EXCEEDS_PAYMENT",
      message: `환불 요청 금액(${refund_amount}원)이 현재 결제액(${currentAmount}원)보다 많습니다.`,
    });
  }
  const retainedAmount = currentAmount - refund_amount;

  // paymentId = application_id 규칙(issue-virtual-account 등과 동일). amount 를 함께 보내면 부분 취소입니다.
  let cancellation: any;
  try {
    cancellation = await portoneFetch(`/payments/${encodeURIComponent(schedule.application_id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, amount: refund_amount }),
    });
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[cancel-payment] PortOne 부분 취소 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_CANCEL_FAILED" }); // PortOne 원문 오류는 서버 로그에만 남기고 사용자에게는 보내지 않습니다
    }
    console.error("[cancel-payment] 예외:", e);
    return json(500, { error: "PORTONE_CANCEL_FAILED" });
  }

  const { data: updated, error: rpcErr } = await admin.rpc("admin_apply_partial_refund", {
    p_schedule_id: schedule_id,
    p_refund_amount: refund_amount,
    p_retained_amount: retainedAmount,
    p_memo: reason,
  });
  if (rpcErr) {
    // PortOne 환불은 이미 성공했는데 DB 반영이 실패한 경우 — 돈은 이미 돌아갔으므로 운영자가
    // 로그를 보고 DB만 다시 맞출 수 있도록 PortOne 응답을 함께 남깁니다.
    console.error("[cancel-payment] PortOne 취소는 성공했지만 admin_apply_partial_refund 실패:", rpcErr,
      "PortOne 응답:", JSON.stringify(cancellation));
    return json(500, {
      error: "DB_UPDATE_FAILED_AFTER_REFUND",
      message: rpcErr.message,
      portone_cancellation: cancellation?.cancellation ?? cancellation,
    });
  }

  return json(200, {
    ok: true,
    refunded_amount: refund_amount,
    retained_amount: retainedAmount,
    schedule: updated,
  });
});
