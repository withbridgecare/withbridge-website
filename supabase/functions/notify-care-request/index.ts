// POST /functions/v1/notify-care-request
//
// Supabase Database Webhook 수신 엔드포인트 — public.service_applications 에 INSERT 또는 UPDATE 가
// 생길 때마다 호출되도록 Supabase 대시보드(Database → Webhooks)에서 등록합니다.
//
//   대상 테이블: service_applications,  이벤트: INSERT, UPDATE,  메서드: POST,
//   URL: https://<project-ref>.functions.supabase.co/notify-care-request,
//   HTTP Headers 에 X-Webhook-Secret: <DB_WEBHOOK_SECRET 값> 추가(아래 비밀키 확인용).
//
// 신청은 보통 두 번 이 함수를 때립니다 — (1) apply.html 제출 INSERT 시점(아직 결제 전일 수 있음),
// (2) 결제 확인 UPDATE 로 status 가 매칭 가능 상태(MATCHING_PENDING 등)가 되는 시점. 패키지 차감
// 신청은 결제가 필요 없어 INSERT 때 바로 매칭 가능 상태입니다. 두 시점 모두 같은 신청에 중복 알림을
//보내면 안 되므로, DB 쪽 claim_telegram_notification() 이 "telegram_notified_at IS NULL" 조건의
// UPDATE 로 원자적으로 1회만 선점합니다 — 이 함수는 그 선점에 성공한 행에 대해서만 알림을 보냅니다.
//
// 알림 발송 자체(텔레그램 API 호출)가 실패해도 DB의 신청 접수/매칭 가능 상태 전환은 이미 끝난 뒤이므로,
// 이 함수는 어떤 경우에도 500을 돌려주지 않고 로그만 남깁니다(Database Webhook의 불필요한 재시도 방지 —
// 재시도해도 claim_telegram_notification() 이 이미 선점된 행을 다시 선점하지 못해 알림이 비지 않습니다).
//
// 인증: Supabase Database Webhook은 로그인 세션이 없어 verify_jwt=false(config.toml)로 공개 엔드포인트
// 입니다. 그래서 자체적으로 DB_WEBHOOK_SECRET 공유 비밀키를 X-Webhook-Secret 헤더로 검증합니다.
import { createAdminClient } from "../_shared/supabaseClients.ts";
import {
  buildAcceptInlineKeyboard,
  buildCareRequestTelegramMessage,
  detectAddressRegion,
  detectTimeSlot,
  managerCoversRegion,
  managerCoversSchedule,
  sendTelegramMessageTo,
} from "../_shared/telegram.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface DbWebhookPayload {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  record?: Record<string, any>;
  old_record?: Record<string, any> | null;
}

interface ApprovedManagerForTelegram {
  manager_id: string;
  name: string | null;
  activity_areas: string[] | null;
  activity_schedule: string[] | null;
  chat_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  try {
    return await handle(req);
  } catch (e) {
    console.error("[notify-care-request] 처리 중 예상치 못한 예외(알림만 실패, DB 반영에는 영향 없음):", e);
    return json(200, { ok: false, error: "UNEXPECTED_ERROR" });
  }
});

async function handle(req: Request): Promise<Response> {
  const expectedSecret = Deno.env.get("DB_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[notify-care-request] DB_WEBHOOK_SECRET 환경변수가 없습니다. supabase secrets set DB_WEBHOOK_SECRET=... 로 설정하세요.");
    return json(500, { error: "NOT_CONFIGURED" });
  }
  if (req.headers.get("X-Webhook-Secret") !== expectedSecret) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  let body: DbWebhookPayload;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  if (body.table !== "service_applications" || !body.record?.id) {
    return json(200, { ok: true, skipped: "NOT_SERVICE_APPLICATIONS" });
  }

  const applicationId = body.record.id as string;
  const admin = createAdminClient();

  // 원자적 선점 — 이미 알림을 보냈거나(telegram_notified_at not null), 이미 배정됐거나(manager_id not
  // null), 매칭 가능 상태가 아니면(is_pending_application_status) null 을 돌려받습니다.
  // claim_telegram_notification() 은 SETOF가 아닌 단일 service_applications 행(또는 0건이면 null)을
  // 돌려주는 함수라 PostgREST가 이미 객체(또는 null) 그대로 돌려줍니다 — accept_service_application() 을
  // 호출하는 기존 코드(mypage-manager.html)와 동일하게 .single()/.maybeSingle() 을 붙이지 않습니다.
  const { data: claimed, error: claimErr } = await admin
    .rpc("claim_telegram_notification", { p_application_id: applicationId });

  if (claimErr) {
    console.error("[notify-care-request] claim_telegram_notification 호출 실패:", claimErr.message);
    return json(200, { ok: false, error: "CLAIM_FAILED" });
  }
  if (!claimed) {
    return json(200, { ok: true, skipped: "ALREADY_NOTIFIED_OR_NOT_ELIGIBLE" });
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const broadcastChatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !broadcastChatId) {
    console.warn("[notify-care-request] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 가 없어 알림을 건너뜁니다.");
    return json(200, { ok: true, skipped: "TELEGRAM_NOT_CONFIGURED" });
  }

  const { data: managers, error: managersErr } = await admin.rpc("list_approved_managers_for_telegram");
  if (managersErr) {
    console.error("[notify-care-request] list_approved_managers_for_telegram 호출 실패:", managersErr.message);
  }
  const managerList: ApprovedManagerForTelegram[] = Array.isArray(managers) ? managers : [];

  const region = detectAddressRegion(claimed.address);
  const slot = detectTimeSlot(claimed.request_details);
  const targeted = managerList.filter((m) =>
    managerCoversRegion(m.activity_areas, region) &&
    (slot === null || managerCoversSchedule(m.activity_schedule, slot))
  );

  const messageInput = {
    serviceType: claimed.service_type,
    address: claimed.address,
    requestDetails: claimed.request_details,
    userContact: claimed.user_contact,
    createdAt: claimed.created_at,
    addonCodes: claimed.addon_codes,
  };
  const keyboard = buildAcceptInlineKeyboard(applicationId);

  const sentRows: {
    application_id: string;
    target_type: "broadcast" | "private";
    manager_id: string | null;
    chat_id: string;
    message_id: number;
    message_text: string;
  }[] = [];

  // 1순위: 지역/시간대가 맞는 매니저에게 개인 봇(DM)으로 타겟 알림
  const privateText = buildCareRequestTelegramMessage(messageInput, "private");
  for (const m of targeted) {
    const result = await sendTelegramMessageTo(token, m.chat_id, privateText, keyboard);
    if (result.ok && result.messageId != null) {
      sentRows.push({ application_id: applicationId, target_type: "private", manager_id: m.manager_id, chat_id: m.chat_id, message_id: result.messageId, message_text: privateText });
    }
  }

  // 동시에: 지역 상관없이 전체 공용 채널(그룹방)에도 실시간 타임라인으로 발송
  const broadcastText = buildCareRequestTelegramMessage(messageInput, "broadcast");
  const broadcastResult = await sendTelegramMessageTo(token, broadcastChatId, broadcastText, keyboard);
  if (broadcastResult.ok && broadcastResult.messageId != null) {
    sentRows.push({ application_id: applicationId, target_type: "broadcast", manager_id: null, chat_id: broadcastChatId, message_id: broadcastResult.messageId, message_text: broadcastText });
  }

  if (sentRows.length > 0) {
    const { error: insertErr } = await admin.from("care_request_telegram_notifications").insert(sentRows);
    if (insertErr) {
      // 메시지는 이미 나갔는데 기록만 실패한 경우 — 나중에 수락 시 "다른 매니저에게 마감 안내"가 일부
      // 누락될 수 있다는 뜻이라 반드시 로그로 남깁니다(수락 자체는 영향 없음).
      console.error("[notify-care-request] care_request_telegram_notifications insert 실패:", insertErr.message);
    }
  }

  return json(200, {
    ok: true,
    applicationId,
    targetedManagerCount: targeted.length,
    sentCount: sentRows.length,
  });
}
