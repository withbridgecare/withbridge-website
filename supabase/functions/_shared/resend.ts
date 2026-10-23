const RESEND_API_BASE = "https://api.resend.com";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`환경변수 ${name} 가 설정되어 있지 않습니다.`);
  return v;
}

export class ResendApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Resend API 오류 (status ${status}): ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// RESEND_API_KEY 로 인증하는 Resend 발송 공통 래퍼 (portone.ts의 portoneFetch() 와 같은 패턴).
// RESEND_FROM_EMAIL: Resend 콘솔에서 DNS 도메인 인증까지 끝낸 발신 주소를 넣어야 합니다 — 미인증
// 도메인이면 Resend가 발송 자체를 거부합니다. 아직 도메인 인증 전이라면 Resend가 기본 제공하는
// onboarding@resend.dev 로 우선 테스트할 수 있지만(발신 제한이 있어 실제 고객 발송에는 쓰지 마세요),
// 이 함수는 운영 중 실수로 그 기본값에 계속 머무르지 않도록 RESEND_FROM_EMAIL 이 없으면 바로 에러를
// 던집니다 — 조용히 onboarding@resend.dev 로 보내다가 나중에야 "고객이 메일을 못 받았다"는 걸
// 알게 되는 상황을 막기 위함입니다.
export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | null> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM_EMAIL");

  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new ResendApiError(res.status, body);
  return body as { id: string } | null;
}
