// POST /functions/v1/send-status-alimtalk
//
// 케어 동행 7단계 상태 전환마다 고객에게 카카오 알림톡을 보냅니다. 브라우저가 직접 호출하지 않고,
// sql/care_status_alimtalk_webhook.sql 의 DB 트리거(service_applications/care_schedules)가
// pg_net.http_post() 로 "상태가 방금 바뀌었다"는 사실만 알려주면, 이 함수가 필요한 데이터(고객
// 연락처, 매니저명/자격사항, 병원명, 일정 등)를 직접 조회해 메시지를 완성하고 Solapi로 보냅니다
// — 이렇게 데이터 조회·가공 로직을 한 곳(여기)에만 두면, 트리거 SQL은 "무엇이 바뀌었는지"만
// 알려주는 얕은 역할로 남아 유지보수가 쉬워집니다.
//
// 인증: verify_jwt = false로 배포하세요(DB 트리거는 로그인 세션이 없습니다). 대신 트리거가 보내는
// x-webhook-secret 헤더를 ALIMTALK_WEBHOOK_SECRET 환경변수와 대조해 아무나 이 URL을 호출해
// 알림을 마구 보내는 것을 막습니다 — portone-webhook이 PortOne 서명을 검증하는 것과 같은 목적,
// 다만 여기는 우리가 직접 만든 트리거가 유일한 호출자라 "공유 비밀값 대조"로 충분합니다.
//
// 요청 바디:
//   { stage: 'ORDER_RECEIVED', application_id: '<uuid>' }
//   { stage: 'MANAGER_ASSIGNED' | 'DEPARTED' | 'ARRIVED_HOSPITAL' | 'TREATMENT_COMPLETED'
//           | 'RETURNING' | 'CARE_FINISHED', schedule_id: '<uuid>' }
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { sendAlimtalk, fmtKoreanDateTime, extractNameFromContact, extractPhoneFromContact } from "../_shared/solapi.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const VALID_STAGES = [
  "ORDER_RECEIVED",
  "MANAGER_ASSIGNED",
  "DEPARTED",
  "ARRIVED_HOSPITAL",
  "TREATMENT_COMPLETED",
  "RETURNING",
  "CARE_FINISHED",
] as const;
type Stage = (typeof VALID_STAGES)[number];

interface RequestBody {
  stage?: string;
  schedule_id?: string;
  application_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const expectedSecret = Deno.env.get("ALIMTALK_WEBHOOK_SECRET");
  const givenSecret = req.headers.get("x-webhook-secret");
  if (!expectedSecret) {
    console.error("[send-status-alimtalk] ALIMTALK_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다 — 이 함수를 아무나 호출할 수 있는 상태라 요청을 전부 거부합니다.");
    return json(500, { error: "SERVER_MISCONFIGURED" });
  }
  if (!givenSecret || givenSecret !== expectedSecret) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const stage = payload.stage as Stage;
  if (!VALID_STAGES.includes(stage)) {
    return json(400, { error: "INVALID_STAGE", received: payload.stage });
  }

  const supabase = createAdminClient();

  try {
    if (stage === "ORDER_RECEIVED") {
      if (!payload.application_id) return json(400, { error: "MISSING_APPLICATION_ID" });

      const { data: app, error } = await supabase
        .from("service_applications")
        .select("id, user_contact, request_details, created_at")
        .eq("id", payload.application_id)
        .maybeSingle();
      if (error || !app) {
        console.error("[send-status-alimtalk] service_applications 조회 실패:", error, payload.application_id);
        return json(404, { error: "APPLICATION_NOT_FOUND" });
      }

      const desiredAt = /희망\s*일시:\s*([^\n]+)/.exec(app.request_details || "")?.[1]?.trim();
      const when = desiredAt || fmtKoreanDateTime(app.created_at);
      const phone = extractPhoneFromContact(app.user_contact);
      const name = extractNameFromContact(app.user_contact);

      const sent = await sendAlimtalk({
        to: phone,
        stage,
        variables: { "#{고객명}": name, "#{일시}": when },
        logRef: `application:${app.id}`,
      });
      return json(200, { ok: sent });
    }

    // 나머지 6단계는 전부 care_schedules 한 행을 기준으로 합니다.
    if (!payload.schedule_id) return json(400, { error: "MISSING_SCHEDULE_ID" });

    const { data: sched, error: schedErr } = await supabase
      .from("care_schedules")
      .select("id, manager_id, guardian_name, guardian_phone, senior_name, destination, scheduled_at")
      .eq("id", payload.schedule_id)
      .maybeSingle();
    if (schedErr || !sched) {
      console.error("[send-status-alimtalk] care_schedules 조회 실패:", schedErr, payload.schedule_id);
      return json(404, { error: "SCHEDULE_NOT_FOUND" });
    }

    const customerName = sched.guardian_name || "고객";
    const when = fmtKoreanDateTime(sched.scheduled_at);
    let managerName = "담당 매니저";
    let managerCert = "";

    if (stage === "MANAGER_ASSIGNED" || stage === "DEPARTED") {
      if (sched.manager_id) {
        const [{ data: profile }, { data: manager }] = await Promise.all([
          supabase.from("profiles").select("name").eq("id", sched.manager_id).maybeSingle(),
          supabase.from("managers").select("certification").eq("id", sched.manager_id).maybeSingle(),
        ]);
        managerName = profile?.name || managerName;
        managerCert = manager?.certification || "";
      }
    }

    let variables: Record<string, string>;
    switch (stage) {
      case "MANAGER_ASSIGNED":
        variables = {
          "#{고객명}": customerName,
          "#{매니저명}": managerName,
          "#{자격사항}": managerCert || "안전 교육 이수",
          "#{일시}": when,
        };
        break;
      case "DEPARTED":
        variables = { "#{고객명}": customerName, "#{매니저명}": managerName, "#{일시}": when };
        break;
      case "ARRIVED_HOSPITAL":
        variables = { "#{고객명}": customerName, "#{병원명}": sched.destination || "목적지" };
        break;
      case "TREATMENT_COMPLETED":
        variables = { "#{고객명}": customerName };
        break;
      case "RETURNING":
        variables = { "#{고객명}": customerName };
        break;
      case "CARE_FINISHED": {
        const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
        const reportLink = siteUrl ? `${siteUrl}/mypage.html` : "mypage.html";
        variables = { "#{고객명}": customerName, "#{리포트링크}": reportLink };
        break;
      }
      default:
        variables = { "#{고객명}": customerName };
    }

    const sent = await sendAlimtalk({
      to: sched.guardian_phone || "",
      stage,
      variables,
      logRef: `schedule:${sched.id}`,
    });
    return json(200, { ok: sent });
  } catch (e) {
    console.error("[send-status-alimtalk] 처리 중 예외:", e);
    return json(500, { error: "INTERNAL_ERROR" });
  }
});
