// POST /functions/v1/telegram-webhook
//
// 텔레그램 봇(@BotFather)이 모든 업데이트(메시지/버튼 클릭)를 실시간으로 쏴주는 Webhook 수신처입니다.
// 배포 후 아래를 한 번 호출해 Telegram에 이 URL을 등록해야 동작합니다(토큰/시크릿은 그대로 노출하지
// 말고 터미널에서 직접 실행하세요):
//
//   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
//     -d "url=https://<project-ref>.functions.supabase.co/telegram-webhook" \
//     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET 값>"
//
// 처리하는 업데이트 두 가지:
//   1) message.text 가 "/start <token>" — mypage-manager.html "텔레그램 알림 연결" 버튼이 발급한
//      1회용 토큰(request_telegram_link_token())을 이 채팅의 chat_id 에 묶습니다(manager_telegram_links).
//      텔레그램에서는 1:1 개인 채팅의 chat_id === 그 사람의 user id 이므로, 그룹방에서 버튼을 눌러도
//      callback_query.from.id 로 같은 사람을 식별할 수 있습니다.
//   2) callback_query.data 가 "ACCEPT:<application_id>" — [동행 수락하기] 버튼 클릭. 아직 배정되지
//      않았으면 그 자리에서 수락 처리(accept_service_application_as)하고, 이 신청으로 보냈던 다른 모든
//      메시지(개인 DM + 그룹 공용 채널)를 "이미 마감된 건입니다"로 고쳐 씁니다. 이미 배정이 끝난 건을
//      (다른 매니저가 먼저 수락했거나, 같은 메시지를 다시 눌렀거나) 다시 누르면 DB 예외/시스템 에러
//      대신 클릭한 사람에게만 보이는 "이미 배정 완료된 케어 건입니다." 안내(answerCallbackQuery
//      show_alert)만 뜨고, 그 외 예상 못한 오류도 전부 같은 방식의 안전한 문구로만 보여줍니다
//      (handleAccept 의 바깥 try/catch, handleAcceptInner 참고).
//
// 인증: 텔레그램은 Supabase 로그인 토큰 없이 직접 호출하므로 verify_jwt=false(config.toml)인 공개
// 엔드포인트입니다. 대신 setWebhook 의 secret_token 이 모든 요청에 X-Telegram-Bot-Api-Secret-Token
// 헤더로 그대로 돌아오므로, 그 값을 TELEGRAM_WEBHOOK_SECRET 과 비교해 텔레그램이 보낸 요청만 받습니다.
import { createAdminClient } from "../_shared/supabaseClients.ts";
import {
  answerCallbackQuery,
  buildCareRequestAcceptedSuffix,
  buildCareRequestClosedSuffix,
  editTelegramMessageText,
  guessScheduledAt,
  sendTelegramMessageTo,
} from "../_shared/telegram.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface TelegramUpdate {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number | string };
    from: { id: number | string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number | string; first_name?: string };
    message?: { message_id: number; chat: { id: number | string } };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  try {
    return await handle(req);
  } catch (e) {
    // 텔레그램은 비-2xx 응답을 재시도합니다 — 어떤 예외든 일단 200으로 받고 로그만 남겨 무한 재시도를 막습니다.
    console.error("[telegram-webhook] 처리 중 예상치 못한 예외:", e);
    return json(200, { ok: false, error: "UNEXPECTED_ERROR" });
  }
});

async function handle(req: Request): Promise<Response> {
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[telegram-webhook] TELEGRAM_WEBHOOK_SECRET 환경변수가 없습니다. supabase secrets set TELEGRAM_WEBHOOK_SECRET=... 로 설정하세요.");
    return json(500, { error: "NOT_CONFIGURED" });
  }
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expectedSecret) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    console.error("[telegram-webhook] TELEGRAM_BOT_TOKEN 환경변수가 없습니다.");
    return json(200, { ok: false, error: "NOT_CONFIGURED" });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const admin = createAdminClient();

  if (update.message?.text?.startsWith("/start")) {
    await handleStartLink(admin, token, update.message);
    return json(200, { ok: true });
  }

  if (update.callback_query?.data?.startsWith("ACCEPT:")) {
    await handleAccept(admin, token, update.callback_query);
    return json(200, { ok: true });
  }

  return json(200, { ok: true, skipped: "UNHANDLED_UPDATE" });
}

async function handleStartLink(admin: ReturnType<typeof createAdminClient>, token: string, message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = String(message.chat.id);
  const parts = message.text!.trim().split(/\s+/);
  const linkToken = parts[1];
  if (!linkToken) {
    await sendTelegramMessageTo(token, chatId, "위드브릿지 매니저 마이페이지의 [텔레그램 알림 연결] 버튼을 눌러 연결해 주세요.");
    return;
  }

  const { data: tokenRow, error: tokenErr } = await admin
    .from("telegram_link_tokens")
    .select("user_id, used_at, expires_at")
    .eq("token", linkToken)
    .maybeSingle();

  if (tokenErr) {
    console.error("[telegram-webhook] telegram_link_tokens 조회 실패:", tokenErr.message);
    await sendTelegramMessageTo(token, chatId, "연결 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    return;
  }
  if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    await sendTelegramMessageTo(token, chatId, "링크가 유효하지 않거나 만료되었습니다. 마이페이지에서 [텔레그램 알림 연결]을 다시 눌러 주세요.");
    return;
  }

  const { error: linkErr } = await admin
    .from("manager_telegram_links")
    .upsert({ user_id: tokenRow.user_id, chat_id: chatId, linked_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (linkErr) {
    if (linkErr.code === "23505") {
      await sendTelegramMessageTo(token, chatId, "이 텔레그램 계정은 이미 다른 매니저 계정에 연결되어 있습니다. 문의가 필요하면 운영팀에 알려 주세요.");
      return;
    }
    console.error("[telegram-webhook] manager_telegram_links upsert 실패:", linkErr.message);
    await sendTelegramMessageTo(token, chatId, "연결 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    return;
  }

  await admin.from("telegram_link_tokens").update({ used_at: new Date().toISOString() }).eq("token", linkToken);
  await sendTelegramMessageTo(
    token,
    chatId,
    "✅ 위드브릿지 알림 연결이 완료되었습니다!\n이제 이 채팅으로 내 활동 지역의 신규 케어 신청 알림을 받고, [동행 수락하기] 버튼으로 바로 수락할 수 있어요.",
  );
}

// Telegram 클라이언트는 콜백 버튼을 누르면 answerCallbackQuery 응답이 올 때까지 로딩 스피너를 띄우고,
// 응답을 못 받으면("query is too old and response timeout expired" 등) 자체적으로 못생긴 에러 토스트를
// 띄웁니다 — 그래서 이 함수 안에서 무슨 일이 있어도(예상 못한 예외 포함) 반드시 answerCallbackQuery 를
// 한 번은 호출해야 합니다. handleAcceptInner() 가 어디서 던지든 이 바깥 try/catch 가 잡아서 깔끔한
// 안내 문구로 대신 답하고, 실제 원인은 서버 로그에만 남깁니다.
async function handleAccept(admin: ReturnType<typeof createAdminClient>, token: string, callbackQuery: NonNullable<TelegramUpdate["callback_query"]>) {
  try {
    await handleAcceptInner(admin, token, callbackQuery);
  } catch (e) {
    console.error("[telegram-webhook] handleAccept 처리 중 예상치 못한 예외:", e);
    try {
      await answerCallbackQuery(token, callbackQuery.id, "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", true);
    } catch (e2) {
      console.error("[telegram-webhook] 예외 처리 중 answerCallbackQuery 마저 실패:", e2);
    }
  }
}

async function handleAcceptInner(admin: ReturnType<typeof createAdminClient>, token: string, callbackQuery: NonNullable<TelegramUpdate["callback_query"]>) {
  const applicationId = callbackQuery.data!.slice("ACCEPT:".length);
  const clickerChatId = String(callbackQuery.from.id);
  const clickedMessage = callbackQuery.message;

  const { data: link, error: linkErr } = await admin
    .from("manager_telegram_links")
    .select("user_id")
    .eq("chat_id", clickerChatId)
    .maybeSingle();

  if (linkErr) {
    console.error("[telegram-webhook] manager_telegram_links 조회 실패:", linkErr.message);
    await answerCallbackQuery(token, callbackQuery.id, "처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", true);
    return;
  }
  if (!link) {
    await answerCallbackQuery(token, callbackQuery.id, "먼저 마이페이지에서 [텔레그램 알림 연결]을 완료해 주세요.", true);
    return;
  }

  const { data: app, error: appErr } = await admin
    .from("service_applications")
    .select("id, request_details, created_at, manager_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !app) {
    await answerCallbackQuery(token, callbackQuery.id, "신청 정보를 찾을 수 없습니다.", true);
    return;
  }

  // 흔한 경우(먼저 수락된 건의 버튼을 뒤늦게 누름 — 다른 매니저의 DM/그룹 메시지, 또는 이 메시지를
  // 두 번 누름)를 accept RPC 호출·예외 없이 여기서 먼저 걸러, 항상 같은 깔끔한 안내만 보여줍니다.
  if (app.manager_id) {
    const { data: managerName } = await lookupManagerName(admin, applicationId);
    await answerCallbackQuery(token, callbackQuery.id, "이미 배정 완료된 케어 건입니다.", true);
    await closeNotifications(admin, token, applicationId, { allClosed: true, managerName });
    return;
  }

  const scheduledAt = guessScheduledAt(app.request_details, app.created_at);

  const { error: acceptErr } = await admin.rpc("accept_service_application_as", {
    p_application_id: applicationId,
    p_manager_id: link.user_id,
    p_scheduled_at: scheduledAt.toISOString(),
  });

  if (acceptErr) {
    // REQUEST_UNAVAILABLE(P0002) — 바로 위 사전 확인 이후의 극히 짧은 순간에 다른 매니저가 먼저
    // 수락을 끝낸 진짜 동시 클릭 레이스입니다. 그 외(예: NOT_A_MANAGER — 연동 이후 매니저 인증이
    // 취소된 경우)는 사용자에게는 똑같이 안전한 문구만 보여주고, 실제 원인은 로그로만 구분합니다 —
    // DB 에러 메시지를 그대로 노출하면 사용자에게는 의미 없는 "시스템 에러"로만 보입니다.
    const isAlreadyAssigned = acceptErr.code === "P0002" || /REQUEST_UNAVAILABLE/.test(acceptErr.message || "");
    console.error(`[telegram-webhook] accept_service_application_as 실패(alreadyAssigned=${isAlreadyAssigned}):`, acceptErr.code, acceptErr.message);
    const { data: managerName } = await lookupManagerName(admin, applicationId);
    await answerCallbackQuery(
      token,
      callbackQuery.id,
      isAlreadyAssigned ? "이미 배정 완료된 케어 건입니다." : "수락 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      true,
    );
    await closeNotifications(admin, token, applicationId, { allClosed: true, managerName });
    return;
  }

  const { data: managerName } = await admin.from("profiles").select("name").eq("id", link.user_id).maybeSingle();
  await answerCallbackQuery(token, callbackQuery.id, "✅ 수락 완료! 마이페이지에서 일정을 확인해 주세요.", false);
  await closeNotifications(admin, token, applicationId, {
    allClosed: false,
    managerName: managerName?.name ?? null,
    scheduledAt,
    acceptedChatId: clickedMessage ? String(clickedMessage.chat.id) : undefined,
    acceptedMessageId: clickedMessage?.message_id,
  });
}

async function lookupManagerName(admin: ReturnType<typeof createAdminClient>, applicationId: string): Promise<{ data: string | null }> {
  const { data: app } = await admin.from("service_applications").select("manager_id").eq("id", applicationId).maybeSingle();
  if (!app?.manager_id) return { data: null };
  const { data: profile } = await admin.from("profiles").select("name").eq("id", app.manager_id).maybeSingle();
  return { data: profile?.name ?? null };
}

// 이 신청으로 보낸 모든(개인 DM + 그룹 공용 채널) 메시지를 찾아 더 이상 누를 수 없게 버튼을 지우고
// "수락됨"/"마감됨" 안내를 덧붙입니다. allClosed=true 면 모든 메시지가 "마감됨"(이 클릭은 race에서 짐),
// 아니면 acceptedChatId/acceptedMessageId 로 지정된 메시지만 "수락됨", 나머지는 "마감됨"입니다.
async function closeNotifications(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  applicationId: string,
  opts: { allClosed: boolean; managerName: string | null; scheduledAt?: Date; acceptedChatId?: string; acceptedMessageId?: number },
) {
  const { data: rows, error } = await admin
    .from("care_request_telegram_notifications")
    .select("id, chat_id, message_id, message_text")
    .eq("application_id", applicationId)
    .is("closed_at", null);

  if (error) {
    console.error("[telegram-webhook] care_request_telegram_notifications 조회 실패(마감 안내 생략):", error.message);
    return;
  }
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const isAcceptedRow = !opts.allClosed && opts.acceptedChatId === row.chat_id && opts.acceptedMessageId === row.message_id;
    const suffix = isAcceptedRow
      ? buildCareRequestAcceptedSuffix(opts.managerName, opts.scheduledAt!)
      : buildCareRequestClosedSuffix(opts.managerName);
    await editTelegramMessageText(token, row.chat_id, row.message_id, row.message_text + suffix);
  }

  const { error: closeErr } = await admin
    .from("care_request_telegram_notifications")
    .update({ closed_at: new Date().toISOString() })
    .in("id", rows.map((r) => r.id));
  if (closeErr) {
    console.error("[telegram-webhook] care_request_telegram_notifications closed_at 갱신 실패:", closeErr.message);
  }
}
