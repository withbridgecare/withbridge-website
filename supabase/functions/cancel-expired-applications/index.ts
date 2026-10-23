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
// 호출자: pg_cron(같은 파일 맨 아래 스케줄)만 호출합니다. 실제로 환불을 일으키는 엔드포인트라 게이트웨이의
// JWT 검증만으로는 부족해, Authorization 헤더가 이 프로젝트의 SUPABASE_SERVICE_ROLE_KEY 와 정확히
// 일치할 때만 처리합니다(일반 로그인 사용자/익명 키로는 호출할 수 없음).
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";
import { sendEmail, ResendApiError } from "../_shared/resend.ts";
import { buildRefundEmail } from "../_shared/refundEmailTemplate.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface ApplicationRow {
  id: string;
  user_id: string | null;
  applicant_email: string | null;
  service_type: string | null;
  senior_name: string | null;
  created_at: string | null;
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return json(401, { error: "NOT_AUTHORIZED" });
  }

  const admin = createAdminClient();

  const { data: targets, error: listErr } = await admin.rpc("list_expired_unmatched_applications");
  if (listErr) {
    console.error("[cancel-expired-applications] list_expired_unmatched_applications 실패:", listErr);
    return json(500, { error: "LIST_FAILED", message: listErr.message });
  }

  const rows: ApplicationRow[] = targets ?? [];
  const results: Array<{ application_id: string; ok: boolean; detail?: unknown }> = [];

  for (const row of rows) {
    try {
      // PortOne V2 결제 취소: amount 를 안 넘기면 전액(100%) 취소. paymentId = application_id 로 맞춰 둔
      // issue-virtual-account/portone-webhook 과 같은 규칙을 그대로 씁니다.
      const cancellation: any = await portoneFetch(`/payments/${encodeURIComponent(row.id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "48시간 이내 매니저 미배정으로 인한 자동 취소/환불" }),
      });

      const { error: rpcErr } = await admin.rpc("expire_unmatched_application", {
        p_application_id: row.id,
        p_refund_ref: cancellation?.cancellation?.id ?? cancellation?.id ?? null,
      });
      if (rpcErr) throw rpcErr;

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
        const { error: rpcErr } = await admin.rpc("expire_unmatched_application", { p_application_id: row.id });
        if (!rpcErr) await notifyRefund(admin, row, null);
        results.push({ application_id: row.id, ok: !rpcErr, detail: rpcErr?.message });
        continue;
      }
      // 그 외 오류(네트워크, PortOne 5xx 등)는 상태를 바꾸지 않고 실패로 남겨 다음 주기(30분 후)에 재시도합니다.
      console.error(`[cancel-expired-applications] ${row.id} 처리 실패:`, e);
      results.push({
        application_id: row.id,
        ok: false,
        detail: e instanceof PortOneApiError ? e.body : e instanceof Error ? e.message : String(e),
      });
    }
  }

  return json(200, { checked: rows.length, results });
});
