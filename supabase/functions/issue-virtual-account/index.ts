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
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";

const CORS_HEADERS: Record<string, string> = {
  // 운영 환경에서는 "*" 대신 실제 서비스 도메인으로 좁히는 것을 권장합니다.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
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
      .select("id, status")
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
      .select("id, status, user_id")
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

  if (status === "PAID") {
    // 즉시 승인 완료 — 카드/간편결제/계좌이체, 또는 드물게 조회 시점에 이미 입금된 가상계좌 (요구사항 2)
    const { data: updated, error: rpcErr } = await admin.rpc("mark_payment_matching_pending", {
      p_application_id: application_id,
    });
    if (rpcErr) {
      console.error("[issue-virtual-account] mark_payment_matching_pending 실패:", rpcErr);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: rpcErr.message });
    }
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
