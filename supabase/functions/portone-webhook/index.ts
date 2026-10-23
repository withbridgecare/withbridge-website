// POST /functions/v1/portone-webhook
//
// PortOne V2가 결제 상태 변경 시(가상계좌 입금 완료·취소/만료 등) 호출하는 웹훅 수신 엔드포인트입니다.
// 받은 즉시 DB를 바꾸지 않고, 반드시 PortOne API(GET /payments/{paymentId})를 다시 조회해 실제 상태를
// 확인한 뒤에만 virtual_accounts.is_paid 와 service_applications.status 를 바꿉니다
// (웹훅 바디 자체는 위변조/재전송에 취약할 수 있으므로 신뢰하지 않습니다 — event.type 문자열로 분기하지
// 않고, 어떤 이벤트든 paymentId 만 뽑아 재조회한 실제 status 로 분기합니다).
//
// 인증: PortOne이 Supabase 로그인 토큰 없이 직접 호출하므로 verify_jwt = false 로 공개 엔드포인트입니다
// (config.toml 참고). 대신 PORTONE_WEBHOOK_SECRET 이 설정되어 있으면 Standard Webhooks 서명을 검증합니다.
//
// MATCHING_PENDING 전환에 "처음" 성공하면(+ 가상계좌/무통장이 아닌 경우에만) _shared/telegram.ts 로
// 매니저 운영 채널에 신규 신청 알림을 보냅니다. 가상계좌/무통장 입금은 이 웹훅이 자동으로 감지해도
// 알림을 보내지 않습니다 — 그 알림은 어드민 콘솔 [수동 입금 확인] 클릭(admin_confirm_manual_payment())
// 시점으로만 가도록 트리거를 분리해 두었습니다.
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { portoneFetch, PortOneApiError } from "../_shared/portone.ts";
import { buildNewApplicationMessage, sendTelegramMessage } from "../_shared/telegram.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface PortOneWebhookEvent {
  type?: string;
  data?: { paymentId?: string; transactionId?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  // 서명 검증을 위해 body는 반드시 "가공 전 원문 문자열"로 읽어야 합니다(JSON.parse 후 재직렬화하면 깨짐).
  const rawBody = await req.text();

  let event: PortOneWebhookEvent;
  const webhookSecret = Deno.env.get("PORTONE_WEBHOOK_SECRET");
  if (webhookSecret) {
    try {
      const { Webhook } = await import("npm:@portone/server-sdk@0.9");
      event = (await Webhook.verify(webhookSecret, rawBody, Object.fromEntries(req.headers))) as PortOneWebhookEvent;
    } catch (e) {
      console.error("[portone-webhook] 웹훅 서명 검증 실패:", e);
      return json(400, { error: "INVALID_SIGNATURE" });
    }
  } else {
    // 지금 발급받은 3개 키(STORE_ID/API_SECRET/CHANNEL_KEY)에는 웹훅 시크릿이 없습니다.
    // PortOne 콘솔 > 결제 연동 > 연동 관리 > 결제알림(Webhook) 관리에서 발급 후 PORTONE_WEBHOOK_SECRET
    // 로 채워 넣으면 서명 검증이 자동으로 켜집니다. 그 전까지는 아래 PortOne 재조회만으로 신뢰성을 확보합니다.
    console.warn("[portone-webhook] PORTONE_WEBHOOK_SECRET 미설정 — 서명 검증 없이 처리합니다.");
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "INVALID_JSON" });
    }
  }

  const paymentId = event.data?.paymentId;
  if (!paymentId) {
    // 결제 상태 변경과 무관한 이벤트는 확인만 하고 종료 — 불필요한 재시도를 막기 위해 2xx로 응답합니다.
    return json(200, { ignored: event.type ?? null });
  }

  // 발급 시 paymentId = application_id(UUID) 로 맞춰 두었으므로 그대로 조회에 쓸 수 있습니다.
  let payment: any;
  try {
    payment = await portoneFetch(`/payments/${encodeURIComponent(paymentId)}`);
  } catch (e) {
    if (e instanceof PortOneApiError) {
      console.error("[portone-webhook] PortOne 결제 조회 실패:", e.status, e.body);
      return json(502, { error: "PORTONE_LOOKUP_FAILED" });
    }
    console.error("[portone-webhook] 예외:", e);
    return json(500, { error: "PORTONE_LOOKUP_FAILED" });
  }

  const status: string | undefined = payment?.status;
  const admin = createAdminClient();

  // paymentId 가 기본 결제(application_id)인지, 추가 요금 2차 결제(care_schedules.extra_charge_payment_id)
  // 인지부터 구분합니다 — 두 결제는 서로 다른 uuid 공간(service_applications.id / 새로 발급한 uuid)을
  // 쓰므로 섞일 일은 없지만, 웹훅은 어느 쪽 결제인지 사전 정보 없이 paymentId 만 받으므로 직접 찾아봐야
  // 합니다(sql/extra_charge_billing.sql 참고).
  const { data: extraChargeRow, error: extraChargeLookupErr } = await admin
    .from("care_schedules")
    .select("id")
    .eq("extra_charge_payment_id", paymentId)
    .maybeSingle();
  if (extraChargeLookupErr) {
    console.error("[portone-webhook] care_schedules 추가 요금 조회 실패:", extraChargeLookupErr);
    return json(500, { error: "SCHEDULE_LOOKUP_FAILED", message: extraChargeLookupErr.message });
  }

  if (extraChargeRow) {
    // 추가 요금 2차 결제 — 즉시결제 전용(가상계좌 미지원)이라 PAID 만 의미가 있고, 그 외 상태는 상태를
    // 아직 바꾸지 않았으므로(REQUESTED 그대로) 되돌릴 것도 없습니다.
    if (status !== "PAID") {
      return json(200, { skipped: true, status: status ?? null, kind: "extra_charge" });
    }
    const paidAmount: number | null = payment?.amount?.total ?? payment?.totalAmount ?? null;
    const { error } = await admin.rpc("confirm_extra_charge_payment", {
      p_payment_id: paymentId,
      p_paid_amount: paidAmount,
    });
    if (error) {
      if (error.message?.includes("AMOUNT_MISMATCH")) {
        console.error("[portone-webhook] 추가 요금 결제 금액 불일치:", error.message);
        return json(409, { error: "AMOUNT_MISMATCH", message: error.message });
      }
      console.error("[portone-webhook] confirm_extra_charge_payment 실패:", error);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: error.message });
    }
    return json(200, { ok: true, status: "PAID", kind: "extra_charge" });
  }

  // paymentId 가 패키지(5회권/10회권) 선결제 주문(package_orders.id)인지 확인합니다 — 기본 결제/추가
  // 요금과 마찬가지로 독립된 uuid 공간을 쓰므로 섞일 일은 없습니다(sql/user_packages_system.sql 참고).
  const { data: packageOrderRow, error: packageOrderLookupErr } = await admin
    .from("package_orders")
    .select("id")
    .eq("id", paymentId)
    .maybeSingle();
  if (packageOrderLookupErr) {
    console.error("[portone-webhook] package_orders 조회 실패:", packageOrderLookupErr);
    return json(500, { error: "ORDER_LOOKUP_FAILED", message: packageOrderLookupErr.message });
  }

  if (packageOrderRow) {
    // 패키지 구매도 추가 요금과 마찬가지로 즉시결제 전용입니다.
    if (status !== "PAID") {
      return json(200, { skipped: true, status: status ?? null, kind: "package_order" });
    }
    const paidAmount: number | null = payment?.amount?.total ?? payment?.totalAmount ?? null;
    const paymentKey: string | null = payment?.transactionId ?? payment?.id ?? null;
    const { error } = await admin.rpc("confirm_package_order_payment", {
      p_order_id: paymentId,
      p_paid_amount: paidAmount,
      p_payment_key: paymentKey,
    });
    if (error) {
      if (error.message?.includes("AMOUNT_MISMATCH")) {
        console.error("[portone-webhook] 패키지 결제 금액 불일치:", error.message);
        return json(409, { error: "AMOUNT_MISMATCH", message: error.message });
      }
      console.error("[portone-webhook] confirm_package_order_payment 실패:", error);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: error.message });
    }
    return json(200, { ok: true, status: "PAID", kind: "package_order" });
  }

  if (status === "PAID") {
    // 가상계좌 입금 완료(또는 그 외 방식의 승인 완료) — 요구사항 3
    // mark_payment_matching_pending() 은 이미 MATCHING_PENDING/MATCHED 로 넘어간 건에 재호출돼도(웹훅
    // 중복 전송 등) 에러 없이 조용히 같은 행을 그대로 돌려줍니다(멱등) — 그래서 RPC 응답만 보고는
    // "방금 실제로 전환됐는지"와 "이미 전에 전환돼 있었는지"를 구분할 수 없습니다. 알림을 중복 발송하지
    // 않으려면 RPC 호출 *전에* 현재 상태를 먼저 확인해, 그 시점에 'PAYMENT_PENDING' 이었던 경우에만(=
    // 이 호출이 실제로 전환을 수행한 경우에만) 알림을 보냅니다.
    const { data: beforeApp, error: beforeErr } = await admin
      .from("service_applications")
      .select("status, service_type, address, request_details, user_contact, created_at, addon_codes")
      .eq("id", paymentId)
      .maybeSingle();
    if (beforeErr) {
      console.error("[portone-webhook] 신청서 조회 실패:", beforeErr);
      return json(500, { error: "APPLICATION_LOOKUP_FAILED", message: beforeErr.message });
    }
    const wasFirstTransition = beforeApp?.status === "PAYMENT_PENDING";

    // PortOne 재조회 결과의 실제 승인 금액을 같이 넘겨서, DB 함수가 신청서 service_type 기준 정가와
    // 정확히 일치할 때만 MATCHING_PENDING 으로 전환하도록 합니다 — 웹훅 바디 자체를 신뢰하지 않는 것과
    // 같은 이유로, 입금액도 PortOne 재조회 결과만 신뢰합니다(sql/payment_confirmation_functions.sql 의
    // expected_service_price() 참고).
    const paidAmount: number | null = payment?.amount?.total ?? payment?.totalAmount ?? null;
    const paymentKey: string | null = payment?.transactionId ?? payment?.id ?? null;
    const { error } = await admin.rpc("mark_payment_matching_pending", {
      p_application_id: paymentId,
      p_paid_amount: paidAmount,
      p_payment_key: paymentKey,
    });
    if (error) {
      if (error.message?.includes("AMOUNT_MISMATCH")) {
        console.error("[portone-webhook] 입금 금액 불일치:", error.message);
        return json(409, { error: "AMOUNT_MISMATCH", message: error.message });
      }
      console.error("[portone-webhook] mark_payment_matching_pending 실패:", error);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: error.message });
    }

    // 신규 신청이 매칭 대기(MATCHING_PENDING)로 처음 들어간 시점에 매니저 운영 채널로 텔레그램 알림을
    // 보냅니다 — 단, 가상계좌/무통장은 제외합니다. 이 웹훅은 PortOne 쪽 결제 상태 변경을 전부(카드
    // 간편결제든 가상계좌 입금이든) 받을 수 있는 범용 엔드포인트라, "이 웹훅이 호출됐다"만으로는 어떤
    // 결제 수단인지 알 수 없어 매번 가상계좌 여부를 다시 판별합니다. 가상계좌/무통장의 알림은 어드민
    // 콘솔의 [수동 입금 확인] 클릭(admin_confirm_manual_payment() RPC, sql/
    // admin_manual_payment_telegram_notify.sql)시점으로만 보내기로 했으므로 — 입금이 실제로 통장에
    // 들어온 걸 웹훅이 자동으로 감지해도, 관리자가 그 입금을 직접 확인하기 전까지는 매니저에게 먼저
    // 알리지 않습니다.
    const isVirtualAccount = !!(payment?.virtualAccount ?? payment?.method?.virtualAccount);
    if (wasFirstTransition && beforeApp && !isVirtualAccount) {
      await sendTelegramMessage(buildNewApplicationMessage({
        serviceType: beforeApp.service_type,
        address: beforeApp.address,
        requestDetails: beforeApp.request_details,
        userContact: beforeApp.user_contact,
        createdAt: beforeApp.created_at,
        addonCodes: beforeApp.addon_codes,
      }));
    }

    return json(200, { ok: true, status: "PAID" });
  }

  if (status === "CANCELLED" || status === "FAILED") {
    // 가상계좌 입금 기한 만료(자동 취소) 또는 결제 취소/실패 — 요구사항 4
    const { error } = await admin.rpc("cancel_unpaid_application", { p_application_id: paymentId });
    if (error) {
      console.error("[portone-webhook] cancel_unpaid_application 실패:", error);
      return json(500, { error: "STATUS_UPDATE_FAILED", message: error.message });
    }
    return json(200, { ok: true, status });
  }

  // 그 외 상태(VIRTUAL_ACCOUNT_ISSUED, READY 등 아직 확정 전)는 지금은 처리할 것이 없습니다.
  return json(200, { skipped: true, status: status ?? null });
});
