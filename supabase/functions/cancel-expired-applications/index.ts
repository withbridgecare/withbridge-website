// POST /functions/v1/cancel-expired-applications
//
// 결제 완료 후 48시간이 지나도 매니저가 배정되지 않은(service_applications.status = 'MATCHING_PENDING',
// manager_id is null) 신청서를 찾아 PortOne 환불(결제 취소) API를 호출하고, 성공한 건만
// 'EXPIRED_CANCELLED' / payment_status 'REFUNDED' 로 전환합니다. 전환에 성공한 건은 신청자 이메일로
// Resend를 통해 환불 완료 안내 메일도 보냅니다.
// apply.html의 "48시간 이내 매니저가 배정되지 않을 경우 신청이 자동 취소되며 결제금액은 100% 자동
// 환불됩니다" 안심 문구에 실제로 대응하는 백엔드 로직입니다 — DB 상태만 바꾸는 것으로는 돈이 실제로
// 돌아가지 않으므로, 반드시 PortOne 환불 API 호출이 성공한 뒤에만 DB를 전환합니다
// (sql/matching_expiry_auto_refund.sql 참고).
//
// 호출자: 다음 둘 중 하나만 허용합니다(일반 로그인 사용자/익명 키로는 호출할 수 없음).
//   1) pg_cron(같은 파일 맨 아래 스케줄) — Authorization 헤더가 이 프로젝트의
//      SUPABASE_SERVICE_ROLE_KEY 와 정확히 일치할 때. 이 경로는 body 를 무시하고 항상
//      list_expired_unmatched_applications()(48시간 경과분 전체)를 처리합니다.
//   2) 로그인한 관리자(admin.html) — admin-refund-application 과 동일한 패턴으로 (1) auth.getUser() 로
//      토큰을 GoTrue에 직접 검증하고 (2) service-role 클라이언트로 profiles.role === 'admin' 을
//      확인합니다(fail closed). pg_cron 이 로컬(127.0.0.1)이나 플랜 제약으로 동작하지 않는 환경에서도
//      admin.html 의 버튼으로 같은 로직을 수동 실행해 테스트할 수 있게 하기 위한 경로입니다.
//      - body 에 application_id 가 없으면: cron 과 동일하게 48시간 경과분 전체를 처리합니다
//        ("지금 배치 수동 실행" 버튼).
//      - body 에 application_id 가 있으면: 경과 시간과 무관하게 그 신청 "하나"만 대상으로 삼습니다
//        (status='MATCHING_PENDING' && manager_id is null 조건은 그대로 유지 — expire_unmatched_application()
//        자체가 이 조건을 다시 검증하므로 이미 매칭/취소된 건을 잘못 건드릴 수 없습니다). 특정 테스트
//        신청 건을 48시간을 기다리지 않고 바로 환불 플로우에 태울 때 씁니다(행별 "만료/환불 테스트" 버튼).
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";
import { sendEmail, ResendApiError } from "../_shared/resend.ts";
import { buildRefundEmail } from "../_shared/refundEmailTemplate.ts";

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

interface ApplicationRow {
  id: string;
  user_id: string | null;
  applicant_email: string | null;
  service_type: string | null;
  senior_name: string | null;
  created_at: string | null;
  status?: string | null;
  payment_status?: string | null;
}

// 신청서에 남은 흔적만으로 메일을 보낼 주소를 찾습니다 — 비로그인 신청은 이메일을 아예 받지 않으므로
// (apply.html, sql/supabase_schema_latest.sql applicant_email 주석 참고) null 이 돌아올 수 있고, 그
// 경우 메일 발송은 조용히 건너뜁니다(환불/상태 전환 자체는 이미 끝난 뒤라 실패로 치지 않습니다).
// user_id 가 있으면 신청 이후 이메일이 바뀌었을 수도 있는 현재 로그인 계정 이메일을 우선 쓰고, 그 조회가
// 안 되면(탈퇴 등) 신청 당시 저장해 둔 applicant_email 스냅샷으로 대체합니다.
async function resolveRecipientEmail(
  admin: ReturnType<typeof createAdminClient>,
  row: ApplicationRow,
): Promise<string | null> {
  if (row.user_id) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(row.user_id);
      if (!error && data?.user?.email) return data.user.email;
    } catch (e) {
      console.warn(`[cancel-expired-applications] ${row.id} auth.admin.getUserById 실패:`, e);
    }
  }
  return row.applicant_email || null;
}

async function notifyRefund(
  admin: ReturnType<typeof createAdminClient>,
  row: ApplicationRow,
  refundedAmount: number | null,
): Promise<void> {
  const to = await resolveRecipientEmail(admin, row);
  if (!to) {
    console.log(`[cancel-expired-applications] ${row.id} 메일 발송 대상 이메일 없음 — 건너뜀(비로그인 신청)`);
    return;
  }

  const { subject, html, text } = buildRefundEmail({
    serviceType: row.service_type,
    seniorName: row.senior_name,
    appliedAt: row.created_at,
    amount: refundedAmount,
  });

  try {
    await sendEmail({ to, subject, html, text });
    console.log(`[cancel-expired-applications] ${row.id} 환불 안내 메일 발송 완료 → ${to}`);
  } catch (e) {
    // 메일 발송 실패는 환불/상태 전환을 되돌리지 않습니다 — 돈은 이미 정상적으로 돌아갔으므로, 메일만
    // 못 보낸 상태로 로그만 남깁니다(재시도해도 list_expired_unmatched_applications 에 이 건은 더 이상
    // 안 잡히므로 — status 가 이미 EXPIRED_CANCELLED — 자동 재발송은 되지 않습니다. 운영자가 로그로 확인).
    console.error(`[cancel-expired-applications] ${row.id} 환불 안내 메일 발송 실패:`, e instanceof ResendApiError ? e.body : e);
  }
}

// ---------------------------------------------------------------------------------------------
// 취소 신청 후 48시간 미환불 자동 환불 (sql/cancelled_application_auto_refund.sql)
//   보호자가 신청을 취소(status = 'CANCELLED')했는데 관리자가 48시간 안에 [환불 처리]를 하지 않은 건을
//   전액 환불합니다. 관리자 [환불 처리](admin-refund-application)와 같은 순서·같은 DB 반영 함수를 씁니다:
//   PortOne 결제 상태 확인(PAID) → PortOne 전액 취소 → 성공한 뒤에만 admin_apply_application_refund() 로
//   refund_amount / payment_status(REFUNDED) / refunded_at / 환불 이력을 기록.
//   PortOne 결제 기록이 없거나(무통장 수동 입금 등) PAID 가 아닌 건은 건드리지 않고 관리자 처리로 남깁니다.
// ---------------------------------------------------------------------------------------------
const AUTO_REFUND_REASON = "취소 신청 후 48시간 내 미처리로 인한 자동 환불";

interface CancelledRefundRow extends ApplicationRow {
  final_amount: number | null;
  refund_amount: number | null;
}

async function processOverdueCancelledRefunds(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Array<{ application_id: string; ok: boolean; skipped?: string; detail?: unknown }>> {
  const { data: targets, error: listErr } = await admin.rpc("list_overdue_cancelled_refunds");
  if (listErr) {
    // SQL 을 아직 실행하지 않은 프로젝트(함수 없음)에서도 기존 만료 처리는 계속 돌도록 실패만 기록합니다.
    console.error("[cancel-expired-applications] list_overdue_cancelled_refunds 실패:", listErr.message);
    return [{ application_id: "-", ok: false, detail: "LIST_OVERDUE_CANCELLED_FAILED: " + listErr.message }];
  }
  const rows: CancelledRefundRow[] = Array.isArray(targets) ? targets : [];
  const results: Array<{ application_id: string; ok: boolean; skipped?: string; detail?: unknown }> = [];

  for (const row of rows) {
    try {
      let payment: any;
      try {
        payment = await portoneFetch(`/payments/${encodeURIComponent(row.id)}`);
      } catch (e) {
        if (e instanceof PortOneApiError && e.status === 404) {
          console.warn(`[cancel-expired-applications] ${row.id} 취소 건 PortOne 결제 기록 없음 — 관리자 처리로 남김`);
          results.push({ application_id: row.id, ok: false, skipped: "PORTONE_PAYMENT_NOT_FOUND" });
          continue;
        }
        throw e;
      }

      let refundRef: string | null = null;
      let refundedAmount: number | null = null;
      if (payment?.status === "PAID") {
        const cancellation: any = await portoneFetch(`/payments/${encodeURIComponent(row.id)}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason: AUTO_REFUND_REASON }), // amount 생략 = 남은 전액 취소
        });
        refundRef = cancellation?.cancellation?.id ?? cancellation?.id ?? null;
        refundedAmount = cancellation?.cancellation?.amount?.total ?? cancellation?.cancellation?.totalAmount ?? null;
      } else if (payment?.status === "CANCELLED") {
        // 이전 주기에 PortOne 취소는 성공했는데 DB 반영만 실패한 경우 — DB 만 맞춥니다.
        console.warn(`[cancel-expired-applications] ${row.id} PortOne 은 이미 전액 취소됨 — DB 만 반영`);
      } else {
        console.warn(`[cancel-expired-applications] ${row.id} PortOne 상태(${payment?.status ?? "확인 불가"})라 자동 환불하지 않음`);
        results.push({ application_id: row.id, ok: false, skipped: "PORTONE_STATUS_" + String(payment?.status ?? "UNKNOWN") });
        continue;
      }

      const amount = refundedAmount ?? Math.max((row.final_amount ?? 0) - (row.refund_amount ?? 0), 0);
      const { data: updated, error: rpcErr } = await admin.rpc("admin_apply_application_refund", {
        p_application_id: row.id,
        p_amount: amount,
        p_reason: AUTO_REFUND_REASON,
        p_portone_ref: refundRef,
      });
      if (rpcErr || !updated?.id) {
        // 돈은 이미 돌아갔는데 DB 반영만 실패 — 다음 주기에 PortOne 상태 CANCELLED 분기로 다시 맞춥니다.
        console.error(`[cancel-expired-applications] ${row.id} PortOne 환불 후 DB 반영 실패:`, rpcErr ?? "NO_ROW");
        results.push({ application_id: row.id, ok: false, detail: "DB_UPDATE_FAILED_AFTER_REFUND: " + (rpcErr?.message ?? "NO_ROW") });
        continue;
      }
      console.log(`[cancel-expired-applications] ${row.id} 취소 건 자동 환불 완료 (${amount}원)`);
      results.push({ application_id: row.id, ok: true });
    } catch (e) {
      // 네트워크·PortOne 오류 등은 상태를 바꾸지 않고 다음 cron 주기(10분 뒤)에 재시도합니다.
      console.error(`[cancel-expired-applications] ${row.id} 취소 건 자동 환불 실패:`, e);
      results.push({
        application_id: row.id,
        ok: false,
        detail: e instanceof PortOneApiError ? e.body : e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const isCronCall = !!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;

  // body 는 두 호출 경로 모두에서 선택적으로 읽습니다 — cron 은 보통 '{}' 를 보내 application_id 가
  // 없고, 관리자 수동 실행은 특정 건을 지정할 수도(단건 테스트), 안 할 수도(배치 전체 재실행) 있습니다.
  let body: { application_id?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const admin = createAdminClient();

  if (!isCronCall) {
    // cron 이 아니면 로그인한 관리자여야만 통과합니다 — admin-refund-application 과 동일한 이중 확인
    // (GoTrue 로 토큰 자체를 검증 + service-role 클라이언트로 profiles.role 조회, fail closed).
    if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

    const userClient = createUserClient(authHeader);
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("[cancel-expired-applications] 호출자 인증 확인 실패(토큰 만료/무효 가능성):", userErr);
      return json(401, { error: "NOT_AUTHENTICATED", message: "로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요." });
    }

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[cancel-expired-applications] profiles 조회 실패 — user_id=" + userData.user.id + ":", profileErr);
      return json(500, { error: "PROFILE_LOOKUP_FAILED", message: profileErr.message });
    }
    const normalizedRole = String(profile?.role ?? "").trim().toLowerCase();
    if (normalizedRole !== "admin" && normalizedRole !== "super_admin") {
      console.error("[cancel-expired-applications] 관리자 권한 없음 — user_id=" + userData.user.id + ", email=" + userData.user.email);
      return json(403, { error: "NOT_ADMIN", message: "관리자 권한이 없는 계정입니다." });
    }
  }

  let rows: ApplicationRow[];
  if (!isCronCall && body.application_id) {
    // 관리자가 특정 건 하나만 지정 — 48시간 경과 여부와 무관하게 그 건을 바로 대상으로 삼되, 아래
    // expire_unmatched_application() RPC 가 status='MATCHING_PENDING' && manager_id is null 조건을
    // 다시 검증하므로(이 파일 상단 주석 참고) 이미 매칭되었거나 취소된 건을 잘못 건드릴 수 없습니다.
    const { data: row, error: rowErr } = await admin
      .from("service_applications")
      .select("id, user_id, applicant_email, service_type, senior_name, created_at, status, manager_id")
      .eq("id", body.application_id)
      .maybeSingle();
    if (rowErr) {
      console.error("[cancel-expired-applications] 단건 조회 실패:", rowErr);
      return json(500, { error: "APPLICATION_LOOKUP_FAILED", message: rowErr.message });
    }
    if (!row) return json(404, { error: "APPLICATION_NOT_FOUND" });
    if (row.status !== "MATCHING_PENDING" || row.manager_id) {
      return json(409, {
        error: "NOT_EXPIRABLE",
        message: `이 신청은 만료/환불 대상이 아닙니다(status=${row.status}, manager_id=${row.manager_id ?? "null"}). ` +
          "이미 매니저가 배정되었거나(MATCHED), 이미 취소/만료 처리된 건일 수 있습니다.",
      });
    }
    rows = [row as ApplicationRow];
  } else {
    const { data: targets, error: listErr } = await admin.rpc("list_expired_unmatched_applications");
    if (listErr) {
      console.error("[cancel-expired-applications] list_expired_unmatched_applications 실패:", listErr);
      return json(500, { error: "LIST_FAILED", message: listErr.message });
    }
    rows = targets ?? [];
  }

  const results: Array<{ application_id: string; ok: boolean; detail?: unknown }> = [];

  for (const row of rows) {
    try {
      // PortOne V2 결제 취소: amount 를 안 넘기면 전액(100%) 취소. paymentId = application_id 로 맞춰 둔
      // issue-virtual-account/portone-webhook 과 같은 규칙을 그대로 씁니다.
      let cancellation: any;
      try {
        cancellation = await portoneFetch(`/payments/${encodeURIComponent(row.id)}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason: "48시간 이내 매니저 미배정으로 인한 자동 취소/환불" }),
        });
      } catch (cancelError) {
        // 이전 실행에서 PortOne 취소는 성공했지만 DB 반영만 실패했을 수 있습니다.
        // 이미 전액 취소된 상태라면 이번 주기에 DB 상태를 복구하고, 부분취소/기타 오류는 그대로 실패 처리합니다.
        if (!(cancelError instanceof PortOneApiError) || cancelError.status === 404) throw cancelError;
        try {
          const payment = await portoneFetch(`/payments/${encodeURIComponent(row.id)}`);
          if (payment?.status !== "CANCELLED") throw cancelError;
          cancellation = { payment };
          console.warn(`[cancel-expired-applications] ${row.id} PortOne은 이미 전액 취소됨 — DB 상태를 복구합니다`);
        } catch (lookupError) {
          if (lookupError === cancelError) throw cancelError;
          console.error(`[cancel-expired-applications] ${row.id} 취소 후 결제 상태 재조회 실패:`, lookupError);
          throw cancelError;
        }
      }

      const { data: updated, error: rpcErr } = await admin.rpc("expire_unmatched_application", {
        p_application_id: row.id,
        p_refund_ref: cancellation?.cancellation?.id ?? cancellation?.id ?? null,
      });
      if (rpcErr) throw rpcErr;
      if (updated?.status !== "EXPIRED_CANCELLED" || updated?.payment_status !== "REFUNDED") {
        throw new Error(
          `PORTONE_CANCELLED_BUT_DATABASE_NOT_UPDATED: status=${updated?.status ?? "null"}, ` +
          `payment_status=${updated?.payment_status ?? "null"}`,
        );
      }

      console.log(`[cancel-expired-applications] ${row.id} 환불/취소 완료`);
      const refundedAmount: number | null =
        cancellation?.cancellation?.amount?.total ?? cancellation?.cancellation?.totalAmount ?? null;
      await notifyRefund(admin, row, refundedAmount);
      results.push({ application_id: row.id, ok: true });
    } catch (e) {
      if (e instanceof PortOneApiError && e.status === 404) {
        // PortOne 쪽에 결제 기록이 없는 비정상 건(예: admin_confirm_manual_payment 로 수동 승인된 무통장
        // 입금 등 PortOne을 거치지 않은 결제) — 환불할 PortOne 결제 자체가 없으므로 상태만 정리합니다.
        console.warn(`[cancel-expired-applications] ${row.id} PortOne 결제 기록 없음 — 상태만 전환`);
        const { data: updated, error: rpcErr } = await admin.rpc("expire_unmatched_application", { p_application_id: row.id });
        const stateUpdated = updated?.status === "EXPIRED_CANCELLED" && updated?.payment_status === "REFUNDED";
        if (!rpcErr && stateUpdated) await notifyRefund(admin, row, null);
        results.push({
          application_id: row.id,
          ok: !rpcErr && stateUpdated,
          detail: rpcErr?.message ?? (!stateUpdated ? `DATABASE_NOT_UPDATED: status=${updated?.status ?? "null"}` : undefined),
        });
        continue;
      }
      // 그 외 오류(네트워크, PortOne 5xx 등)는 상태를 바꾸지 않고 실패로 남겨 다음 크론 주기에 재시도합니다.
      console.error(`[cancel-expired-applications] ${row.id} 처리 실패:`, e);
      results.push({
        application_id: row.id,
        ok: false,
        detail: e instanceof PortOneApiError ? e.body : e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 배치 실행(cron 또는 관리자 '지금 배치 수동 실행')일 때만 취소 건 자동 환불도 함께 처리합니다.
  // 관리자가 특정 신청 하나를 지정한 단건 테스트에서는 건드리지 않습니다.
  const cancelledRefunds = (isCronCall || !body.application_id)
    ? await processOverdueCancelledRefunds(admin)
    : [];

  return json(200, { checked: rows.length, results, cancelled_refunds: cancelledRefunds });
});
