// POST /functions/v1/notify-care-report-alimtalk
//
// Supabase Database Webhook 수신 엔드포인트 — public.care_reports 에 새 리포트가 INSERT 될 때마다
// (매니저가 mypage-manager.html '케어 리포트 작성' 모달에서 제출하는 즉시) Solapi 카카오 알림톡으로
// 보호자에게 핵심 요약을 보냅니다. care_reports.schedule_id 가 unique라 한 케어 건당 리포트는 정확히
// 한 번만 INSERT 되므로(수정은 이 저장소에 없음), service_applications 웹훅(notify-care-request)과
// 달리 중복 발송을 막는 선점 로직이 필요 없습니다.
//
// Supabase 대시보드(Database → Webhooks) 등록값:
//   대상 테이블: care_reports,  이벤트: INSERT,  메서드: POST,
//   URL: https://<project-ref>.functions.supabase.co/notify-care-report-alimtalk,
//   HTTP Headers 에 X-Webhook-Secret: <DB_WEBHOOK_SECRET 값> 추가 — notify-care-request Edge Function이
//   쓰는 바로 그 비밀값을 그대로 재사용합니다(둘 다 "우리 Database Webhook만 호출" 이라는 같은 신뢰
//   경계라 시크릿을 따로 둘 필요가 없습니다).
//
// 알림 발송 자체가 실패해도 리포트 저장(매니저의 '케어 리포트 작성' 제출)은 이미 끝난 뒤이므로, 이
// 함수는 어떤 경우에도 500을 돌려주지 않고 로그만 남깁니다(_shared/solapi.ts의 sendAlimtalk()와 같은
// "알림 실패가 핵심 흐름을 막지 않는다" 원칙).
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { sendAlimtalk } from "../_shared/solapi.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface DbWebhookPayload {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  record?: Record<string, any>;
}

// 카카오 알림톡 템플릿은 너무 긴 변수값을 거부하거나 보기 흉하게 잘라버리므로, 여기서 미리 적정
// 길이로 요약합니다 — AI 요약 호출 없이 단순 길이 제한(단어 경계 고려 없이 자르고 '…' 붙임)만 합니다.
function summarize(text: string | null | undefined, maxLen: number): string {
  const t = (text || "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen).trim() + "…" : t;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  try {
    return await handle(req);
  } catch (e) {
    console.error("[notify-care-report-alimtalk] 처리 중 예상치 못한 예외(알림만 실패, 리포트 저장에는 영향 없음):", e);
    return json(200, { ok: false, error: "UNEXPECTED_ERROR" });
  }
});

async function handle(req: Request): Promise<Response> {
  // notify-care-request Edge Function과 같은 공유 비밀값을 그대로 씁니다(둘 다 Database Webhook 전용 —
  // 위 파일 상단 주석 참고).
  const expectedSecret = Deno.env.get("DB_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[notify-care-report-alimtalk] DB_WEBHOOK_SECRET 환경변수가 없습니다. supabase secrets set DB_WEBHOOK_SECRET=... 로 설정하세요.");
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

  if (body.table !== "care_reports" || !body.record?.id) {
    return json(200, { ok: true, skipped: "NOT_CARE_REPORTS" });
  }

  const report = body.record;
  const admin = createAdminClient();

  const { data: schedule, error: scheduleErr } = await admin
    .from("care_schedules")
    .select("guardian_name, guardian_phone, senior_name")
    .eq("id", report.schedule_id)
    .maybeSingle();
  if (scheduleErr || !schedule) {
    console.error("[notify-care-report-alimtalk] care_schedules 조회 실패(schedule_id=" + report.schedule_id + "):", scheduleErr?.message);
    return json(200, { ok: false, error: "SCHEDULE_NOT_FOUND" });
  }
  if (!schedule.guardian_phone) {
    console.warn("[notify-care-report-alimtalk] guardian_phone 이 없어 알림톡을 건너뜁니다 (report_id=" + report.id + ").");
    return json(200, { ok: false, skipped: "NO_GUARDIAN_PHONE" });
  }

  // 컨디션 요약 — 매니저가 고른 칩(condition_tags)을 1순위로, 없으면 자유 입력(senior_condition), 둘 다
  // 없으면(아동 케어 등 AI 리포트만 작성한 경우) quick_tags 로 대신합니다.
  const conditionTags: string[] = Array.isArray(report.condition_tags) ? report.condition_tags : [];
  const quickTags: string[] = Array.isArray(report.quick_tags) ? report.quick_tags : [];
  const conditionSummary = conditionTags.length
    ? conditionTags.join(", ")
    : summarize(report.senior_condition, 60) || (quickTags.length ? quickTags.join(", ") : "특이사항 없음");

  // 의사 소견 요약 — AI가 다듬은 최종본(ai_message)을 1순위로, 없으면 매니저가 직접 쓴 physician_notes.
  const physicianSummary = summarize(report.ai_message || report.physician_notes, 80) || "작성된 소견 없음";

  const photos: unknown[] = Array.isArray(report.photos) ? report.photos : [];
  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  const reportLink = (siteUrl ? `${siteUrl}/mypage.html` : "mypage.html") + "?report_id=" + report.id;

  // 승인된 카카오 템플릿의 고정 문구가 "다음 병원 방문 예정일: #{다음방문일}" / "증빙 사진: #{사진수}장
  // 첨부됨" 형태로 변수 앞뒤를 감싸고 있다는 전제입니다 — 다음 방문일이 없으면 그 줄 전체가 어색해지므로
  // 템플릿에서 그 줄을 조건부로 빼둘 수 없다면(알림톡은 서버에서 줄 단위 조건 분기를 할 수 없음) 값 자체를
  // "없음"으로 채웁니다.
  const variables: Record<string, string> = {
    "#{보호자명}": schedule.guardian_name || "보호자",
    "#{컨디션요약}": conditionSummary,
    "#{의사소견}": physicianSummary,
    "#{다음방문일}": report.next_visit_date ? fmtDate(report.next_visit_date) : "없음",
    "#{사진수}": String(photos.length),
    "#{링크}": reportLink,
  };

  const sent = await sendAlimtalk({
    to: schedule.guardian_phone,
    stage: "CARE_REPORT_SUBMITTED",
    variables,
    logRef: `report:${report.id}`,
  });

  return json(200, { ok: sent, reportId: report.id });
}
