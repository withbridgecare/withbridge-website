// POST /functions/v1/issue-virtual-account
//
// apply.html 이 신청서(service_applications)를 저장한 직후, 브라우저에서 PortOne.requestPayment() 로
// 결제창을 띄웁니다. 그 결제창이 "성공"으로 닫히면 이 함수를 호출하는데, 여기서는 그 성공 응답을 그대로
// 믿지 않고 반드시 PortOne API(GET /payments/{paymentId})를 서버에서 다시 조회해 실제 승인 상태를
// 확인한 뒤에만 DB를 바꿉니다.
//
// 요청 바디: { application_id }  (= 결제창 호출 때 paymentId 로 쓴 값, service_applications.id 와 동일)
//
// 인증: Authorization 헤더 필수(verify_jwt = true, config.toml 참고) — 로그인 사용자의 세션 토큰이거나,
// apply.html 은 비로그인 신청도 지원하므로 Supabase anon key 가 올 수도 있습니다. anon key 도 이 프로젝트
// 기준으로는 유효하게 서명된 JWT라 게이트웨이의 verify_jwt 를 통과하지만, 거기엔 로그인한 사용자가 없어
// auth.getUser() 가 null 을 돌려줍니다 — 그 경우는 아래에서 별도로 처리합니다(비로그인 신청 분기).
//
// PortOne 응답 status 에 따라:
//   - 'PAID'                   : 즉시 승인 완료(카드/간편결제/계좌이체, 또는 드물게 조회 시점에 이미
//                                입금된 가상계좌) → service_applications.status 를 바로 'MATCHING_PENDING'
//                                으로 전환합니다 (요구사항 2).
//   - 'VIRTUAL_ACCOUNT_ISSUED' : 가상계좌 발급 완료, 아직 입금 전 → virtual_accounts 에 계좌 정보만
//                                저장하고 상태는 'PAYMENT_PENDING' 유지 — 실제 입금 완료는 portone-webhook
//                                이 처리합니다(요구사항 3).
//   - 그 외                    : 승인 실패로 간주하고 에러를 돌려줍니다.
//
// MATCHING_PENDING 전환(매니저 알림) 자체는 이 함수가 직접 보내지 않습니다 — DB 트리거
// (service_applications_notify_care_request, sql/telegram_care_request_webhook_trigger.sql)가
// status 컬럼 변경을 그대로 감지해 notify-care-request Edge Function(개인 DM + 그룹 하이브리드
// 알림 + [동행 수락하기] 인라인 버튼)을 깨웁니다. 가상계좌/무통장도 같은 매커니즘이라 별도 분기가
// 필요 없습니다 — 그쪽은 애초에 이 함수가 아니라 어드민 콘솔의 [수동 입금 확인] 클릭
// (admin_confirm_manual_payment() RPC)이 status 를 바꿀 때라야 트리거가 울리므로, 관리자가 실제
// 입금을 확인하기 전에는 여전히 알림이 가지 않습니다.
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";
import { buildPaymentReconciliationFailureMessage, notifySafely, sendTelegramMessage } from "../_shared/telegram.ts";

const CORS_HEADERS: Record<string, string> = {
  // 운영 환경에서는 "*" 대신 실제 서비스 도메인으로 좁히는 것을 권장합니다.
  "Access-Control-Allow-Origin": "*",
  // x-client-info: @supabase/supabase-js 가 모든 요청(Functions invoke 포함)에 클라이언트 버전 식별용으로
  // 자동으로 붙이는 헤더입니다. 여기 허용 목록에 없으면 브라우저가 CORS preflight 에서 실제 요청을 보내기도
  // 전에 막아버려 — 서버 로그엔 아무것도 안 남고, 브라우저 쪽에선 "FunctionsFetchError: Failed to send a
  // request to the Edge Function" 라는 뜻만 알기 어려운 메시지만 뜹니다(curl 은 CORS 를 안 거치므로 이 문제를
  // 재현하지 못합니다 — 그래서 서버가 배포·정상 동작하는 걸 curl 로 확인해도 브라우저에서는 계속 실패했던 원인).
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface IssueRequestBody {
  application_id?: string;
}

interface ApplicationRow {
  id: string;
  status: string;
  user_id?: string | null;
  service_type?: string | null;
  address?: string | null;
  request_details?: string | null;
  user_contact?: string | null;
  created_at?: string | null;
  addon_codes?: string[] | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  let payload: IssueRequestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const { application_id } = payload;
  if (!application_id) {
    return json(400, { error: "INVALID_INPUT", message: "application_id 는 필수입니다." });
  }

  const userClient = createUserClient(authHeader);
  const admin = createAdminClient();

  const { data: userData } = await userClient.auth.getUser();

  let application: ApplicationRow | null = null;
  if (userData?.user) {
    // 로그인 사용자 — service_applications_select_own RLS 정책이 본인 신청서만 보이도록 걸러주므로,
    // 조회가 되는 것 자체가 소유권 검증입니다.
    const { data, error } = await userClient
      .from("service_applications")
      .select("id, status, service_type, address, request_details, user_contact, created_at, addon_codes")
      .eq("id", application_id)
      .maybeSingle();
    if (error) return json(500, { error: "APPLICATION_LOOKUP_FAILED", message: error.message });
    application = data;
  } else {
    // 비로그인 신청 — apply.html 이 명시적으로 지원하는 경로입니다. anon 역할은 service_applications 에
    // SELECT 권한이 아예 없어(sql/supabase_schema_latest.sql) RLS로 소유권을 확인할 방법이 없으므로,
    // application_id 자체(브라우저가 crypto.randomUUID() 로 만든 128비트 난수라 추측이 사실상 불가능)를
    // 신뢰 경계로 삼아 admin 권한으로 조회합니다. 단, user_id 가 있는(=로그인 계정에 속한) 신청이라면
    // 비로그인 토큰으로 그 id를 추측해 조회를 시도하는 상황이므로 거부합니다.
    const { data, error } = await admin
      .from("service_applications")
      .select("id, status, user_id, service_type, address, request_details, user_contact, created_at, addon_codes")
      .eq("id", application_id)
      .maybeSingle();
    if (error) return json(500, { error: "APPLICATION_LOOKUP_FAILED", message: error.message });
    application = data && !data.user_id ? data : null;
  }

  if (!application) return json(404, { error: "APPLICATION_NOT_FOUND" });

  // 이미 결제가 끝난 건에 대한 재호출(사용자가 완료 화면에서 새로고침, webhook 과 거의 동시에 들어온 경우
  // 등)은 에러로 막지 않고 "이미 처리됨"으로 조용히 성공 처리합니다 — 멱등 처리.
  if (application.status !== "PAYMENT_PENDING") {
    return json(200, { already_processed: true, status: application.status });
  }

  // 이미 저장된 가상계좌가 있으면 재조회하지 않고 그대로 돌려줍니다 (중복 호출/재시도 대비).
  const { data: existing, error: existingErr } = await admin
    .from("virtual_accounts")
    .select("application_id, bank_name, account_number, amount, expired_at, is_paid")
    .eq("application_id", application_id)
    .maybeSingle();
  if (existingErr) return json(500, { error: "VIRTUAL_ACCOUNT_LOOKUP_FAILED", message: existingErr.message });
  if (existing) return json(200, { status: "VIRTUAL_ACCOUNT_ISSUED", virtual_account: existing });

  // 결제창 호출 때 paymentId = application_id 로 맞춰 뒀으므로 그대로 조회합니다.
  let payment: any;
  try {
    payment = await portoneFetch(`/payments/${encodeURIComponent(application_id)}`);
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[issue-virtual-account] PortOne 결제 조회 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_LOOKUP_FAILED", detail: e.body });
    }
    console.error("[issue-virtual-account] 예외:", e);
    return json(500, { error: "PORTONE_LOOKUP_FAILED" });
  }

  const status: string | undefined = payment?.status;
  // 분기 결과(PAID/VIRTUAL_ACCOUNT_ISSUED/그 외)와 무관하게 항상 남겨 둡니다 — "결제했는데 상태가 안 바뀐다"는
  // 신고가 들어왔을 때, 클라이언트 재시도가 실제로 어떤 PortOne 상태를 몇 번 받았는지 로그만 보고 바로 알 수 있어야 합니다.
  console.log("[issue-virtual-account] PortOne 조회 결과:", { application_id, payMethod: payment?.method?.type ?? payment?.payMethod, status });

  if (status === "PAID") {
    // 즉시 승인 완료 — 카드/간편결제/계좌이체, 또는 드물게 조회 시점에 이미 입금된 가상계좌 (요구사항 2)
    // PortOne 재조회 결과의 실제 승인 금액을 같이 넘겨서, DB 함수가 신청서 service_type 기준 정가와
    // 정확히 일치할 때만 MATCHING_PENDING 으로 전환하도록 합니다(브라우저가 보낸 totalAmount는 조작될 수
    // 있어 신뢰하지 않음 — sql/payment_confirmation_functions.sql 의 expected_service_price() 참고).
    const paidAmount: number | null = payment?.amount?.total ?? payment?.totalAmount ?? null;
    // transactionId: PortOne 쪽 거래 식별자(= merchant_uid 가 아니라 imp_uid 격 — paymentId 는 이미
    // application_id 와 같은 값이라 따로 저장하지 않습니다). 환불/고객센터 조회용으로 보관합니다.
    const paymentKey: string | null = payment?.transactionId ?? payment?.id ?? null;

    const { data: updated, error: rpcErr } = await admin.rpc("mark_payment_matching_pending", {
      p_application_id: application_id,
      p_paid_amount: paidAmount,
      p_payment_key: paymentKey,
    });
    if (rpcErr) {
      // 이 지점은 PortOne 이 이미 'PAID' 를 돌려준 뒤입니다 — 고객은 결제를 완료했는데 DB 전환이
      // 실패하면 매니저 배정이 영원히 시작되지 않으므로, console.error 로만 남기지 않고 운영자에게도
      // 즉시 알립니다(요금표 변경 후 expected_service_price() 를 DB에 재배포하지 않아 전건이
      // AMOUNT_MISMATCH 로 막혔던 사고 재발 방지). 알림 발송 실패는 응답에 영향을 주지 않습니다.
      const reason = rpcErr.message?.includes("AMOUNT_MISMATCH") ? "AMOUNT_MISMATCH" : "STATUS_UPDATE_FAILED";
      const notified = await notifySafely("결제 반영 실패 경보", () => sendTelegramMessage(buildPaymentReconciliationFailureMessage({
        applicationId: application_id,
        reason,
        detail: rpcErr.message,
        source: "issue-virtual-account",
      })));
      console.log("[issue-virtual-account] 결제 반영 실패 경보 발송 결과: " + notified);
      if (reason === "AMOUNT_MISMATCH") {
        console.error("[issue-virtual-account] 입금 금액 불일치:", rpcErr.message);
        return json(409, { error: "AMOUNT_MISMATCH", message: rpcErr.message });
      }
      console.error("[issue-virtual-account] mark_payment_matching_pending 실패:", rpcErr);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: rpcErr.message });
    }

    // 신규 신청이 매칭 대기(MATCHING_PENDING)로 들어간 시점의 매니저 알림은 이제 DB 트리거
    // (service_applications_notify_care_request, sql/telegram_care_request_webhook_trigger.sql) →
    // notify-care-request Edge Function이 담당합니다(개인 DM + 그룹 하이브리드 알림 + [동행 수락하기]
    // 인라인 버튼) — status 컬럼이 바뀌는 이 RPC 호출 자체가 트리거를 깨우므로 여기서 더 할 일이 없습니다.

    return json(200, { status: "PAID", application: updated });
  }

  if (status === "VIRTUAL_ACCOUNT_ISSUED") {
    // 가상계좌 발급 완료, 아직 입금 전 — 계좌 정보만 저장하고 상태는 그대로 둡니다(입금 완료는 portone-webhook 이 처리).
    // PortOne 응답 중첩 구조가 문서와 미세하게 다를 수 있어 알려진 몇 가지 경로를 방어적으로 확인합니다.
    const va = payment?.virtualAccount ?? payment?.method?.virtualAccount ?? null;
    const accountNumber: string | undefined = va?.accountNumber;
    const bankName: string | undefined = va?.bankName ?? va?.bank;
    const expiredAtRaw = va?.expiry?.dueDate ?? va?.dueDate ?? va?.issuedAt ?? null;
    const totalAmount: number | undefined = payment?.amount?.total ?? payment?.totalAmount;

    if (!accountNumber || !bankName || !totalAmount) {
      console.error("[issue-virtual-account] PortOne 응답에서 계좌 정보를 찾지 못했습니다. 원본 응답:", JSON.stringify(payment));
      return json(502, { error: "PORTONE_RESPONSE_UNRECOGNIZED", raw: payment });
    }

    const expiredAt = expiredAtRaw
      ? new Date(expiredAtRaw).toISOString()
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insertErr } = await admin
      .from("virtual_accounts")
      .upsert(
        {
          application_id,
          bank_name: bankName,
          account_number: accountNumber,
          amount: totalAmount,
          expired_at: expiredAt,
          is_paid: false,
        },
        { onConflict: "application_id" },
      )
      .select("application_id, bank_name, account_number, amount, expired_at, is_paid")
      .single();

    if (insertErr) {
      console.error("[issue-virtual-account] virtual_accounts upsert 실패:", insertErr);
      return json(500, { error: "VIRTUAL_ACCOUNT_SAVE_FAILED", message: insertErr.message });
    }

    return json(200, { status: "VIRTUAL_ACCOUNT_ISSUED", virtual_account: inserted });
  }

  // PAID/VIRTUAL_ACCOUNT_ISSUED 가 아닌 그 외 상태(FAILED/CANCELLED 등)는 승인 실패로 간주합니다.
  console.error("[issue-virtual-account] 예상치 못한 PortOne 결제 상태:", status, JSON.stringify(payment));
  return json(409, { error: "PAYMENT_NOT_APPROVED", status: status ?? null });
});
