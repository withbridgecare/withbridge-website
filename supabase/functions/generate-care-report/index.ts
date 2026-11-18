// POST /functions/v1/generate-care-report
//
// mypage-manager.html '케어 리포트 작성' 모달(#reportModal)의 [AI 리포트 초안 생성] 버튼이 호출합니다.
// 매니저가 고른 케어 대상 유형(어르신/아동) · 빠른 선택 태그 · 핵심 메모만 받아, 보호자에게 보낼 정중하고
// 따뜻한 리포트 초안을 OpenAI(gpt-4o-mini) 또는 Gemini(gemini-2.5-flash)로 생성해 돌려줍니다.
// 생성된 초안은 이 함수가 저장하지 않습니다 — 매니저가 화면에서 직접 수정한 뒤 care_reports.ai_message 로
// 제출하는 건 프런트엔드(api.submitReport)가 따로 합니다. 이 함수는 순수하게 "초안 문구를 만들어 주는" 역할만
// 하므로 DB에 쓰지 않고, service_role 클라이언트도 쓰지 않습니다.
//
// API 키가 브라우저에 절대 노출되지 않도록, 호출은 반드시 이 서버 사이드 함수를 거칩니다 — OPENAI_API_KEY /
// GEMINI_API_KEY 는 Supabase Edge Function Secrets 로만 등록합니다("supabase secrets set OPENAI_API_KEY=...").
//
// 인증: Authorization 헤더 필수(verify_jwt = true) — 로그인한 매니저 본인 세션 토큰. 이 함수는 어떤 케어
// 일정의 리포트인지(scheduleId) 알 필요가 없으므로(매니저가 이미 화면에서 알고 있는 사실만 보냄) DB 조회는
// 하지 않고, 로그인 여부만 확인합니다.
import { createUserClient } from "../_shared/supabaseClients.ts";

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

interface GenerateRequestBody {
  careType?: string;
  tags?: string[];
  memo?: string;
  hasPhoto?: boolean;
  seniorName?: string;
}

const MAX_TAGS = 10;
const MAX_TAG_LEN = 20;
const MAX_MEMO_LEN = 500;
const MAX_NAME_LEN = 50;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// 매니저가 실제로 입력한 사실(케어 대상 유형 · 태그 · 메모 · 대상자 이름)만 모델에 넘기고, 그 밖의 어떤
// 내용도 지어내지 말라고 시스템 프롬프트에서 명시적으로 금지합니다(No Hallucination 요구사항).
function buildSystemPrompt(careType: "senior" | "child"): string {
  const toneRule = careType === "senior"
    ? "보호자를 안심시키는 정중하고 신뢰감 있는 어조로 작성하세요. 과장하거나 가벼운 표현은 피하고, 차분하고 예의 바른 존댓말을 씁니다."
    : "다정하고 세심하며 활기찬 어조로 작성하세요. 아이를 아끼는 마음이 느껴지는 따뜻한 존댓말을 씁니다.";

  return [
    "당신은 돌봄 매니저를 도와 보호자에게 전달할 '케어 리포트'를 작성하는 보조 작가입니다.",
    toneRule,
    "반드시 아래 세 부분으로 구성하세요: (1) 짧은 인사말, (2) 오늘의 동행/케어 내용을 요약한 불렛 포인트 목록, (3) 짧은 맺음말.",
    "매니저가 입력한 '빠른 선택 태그'·'현장 메모'·'현장 사진 촬영 여부'에 있는 사실만 사용하세요. 그 안에 없는 시간, 장소, 증상, 진단명, 처방, 숫자, 이름 등은 절대로 새로 지어내지 마세요.",
    "사진이 첨부된 경우, 사진 안에 무엇이 찍혀 있는지는 알 수 없으니 내용을 추측하지 말고 '사진으로 기록을 남겼다'는 사실만 자연스럽게 언급하세요.",
    "메모가 짧거나 비어 있으면 태그(와 사진 첨부 여부)만으로 간단히 작성하고, 없는 세부사항을 추측해서 채우지 마세요.",
    "전체 길이는 300자 내외로, 보호자가 핸드폰으로 읽기 편한 문장으로 작성하세요.",
    "마크다운 기호(#, **, - 등)는 쓰지 말고, 불렛 포인트는 '· ' 로 시작하는 줄로 표현하세요.",
    "이모지는 쓰지 마세요.",
  ].join("\n");
}

function buildUserPrompt(input: { careType: "senior" | "child"; tags: string[]; memo: string; hasPhoto: boolean; seniorName?: string }): string {
  const targetLabel = input.careType === "senior" ? "어르신" : "아동";
  const lines = [
    `케어 대상: ${targetLabel}${input.seniorName ? " (" + input.seniorName + ")" : ""}`,
    `빠른 선택 태그: ${input.tags.length ? input.tags.join(", ") : "(선택된 태그 없음)"}`,
    `현장 메모: ${input.memo || "(입력된 메모 없음)"}`,
    // 사진이 있다는 사실 자체만 전달합니다 — 사진 안에 무엇이 보이는지는 모델에 보내지 않으므로, 내용을
    // 추측해서 쓰면 안 됩니다(시스템 프롬프트의 No Hallucination 규칙이 이 사실에도 그대로 적용됩니다).
    `현장 사진: ${input.hasPhoto ? "촬영해 첨부함(사진 내용은 설명하지 말고, 기록을 남겼다는 사실만 자연스럽게 반영)" : "없음"}`,
  ];
  return lines.join("\n");
}

function validatePayload(body: GenerateRequestBody): { error: string } | {
  careType: "senior" | "child"; tags: string[]; memo: string; hasPhoto: boolean; seniorName?: string;
} {
  if (body.careType !== "senior" && body.careType !== "child") {
    return { error: "케어 대상 유형(어르신 케어/아동 케어)을 선택해 주세요." };
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t) => isNonEmptyString(t)).map((t) => t.trim().slice(0, MAX_TAG_LEN)).slice(0, MAX_TAGS)
    : [];
  const memo = isNonEmptyString(body.memo) ? body.memo.trim().slice(0, MAX_MEMO_LEN) : "";
  const hasPhoto = body.hasPhoto === true;
  // 사진만 첨부하고 태그/메모가 비어 있는 "5초 컷" 흐름도 허용합니다 — 사진 한 장도 '오늘 기록을
  // 남겼다'는 유효한 사실이라, 그것만으로도 짧은 초안을 만들 수 있습니다.
  if (!tags.length && !memo && !hasPhoto) {
    return { error: "태그를 고르거나, 사진을 첨부하거나, 메모를 입력해 주세요." };
  }
  const seniorName = isNonEmptyString(body.seniorName) ? body.seniorName.trim().slice(0, MAX_NAME_LEN) : undefined;
  return { careType: body.careType, tags, memo, hasPhoto, seniorName };
}

async function callOpenAi(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OPENAI_HTTP_${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!isNonEmptyString(content)) throw new Error("OPENAI_EMPTY_RESPONSE");
  return content.trim();
}

async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GEMINI_HTTP_${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
  if (!isNonEmptyString(content)) throw new Error("GEMINI_EMPTY_RESPONSE");
  return content.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  const userClient = createUserClient(authHeader);
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json(401, { error: "NOT_AUTHENTICATED" });

  let body: GenerateRequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const validated = validatePayload(body);
  if ("error" in validated) return json(400, { error: "INVALID_INPUT", message: validated.error });

  const systemPrompt = buildSystemPrompt(validated.careType);
  const userPrompt = buildUserPrompt(validated);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!openaiKey && !geminiKey) {
    console.error("[generate-care-report] OPENAI_API_KEY / GEMINI_API_KEY 환경변수가 모두 없습니다. supabase secrets set OPENAI_API_KEY=... 로 설정하세요.");
    return json(500, { error: "AI_NOT_CONFIGURED", message: "AI 리포트 생성이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." });
  }

  try {
    const draft = openaiKey
      ? await callOpenAi(openaiKey, systemPrompt, userPrompt)
      : await callGemini(geminiKey!, systemPrompt, userPrompt);
    return json(200, { draft });
  } catch (e) {
    console.error("[generate-care-report] AI 호출 실패:", e);
    return json(502, { error: "AI_CALL_FAILED", message: "AI 리포트 초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." });
  }
});
