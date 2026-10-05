const PORTONE_API_BASE = "https://api.portone.io";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`환경변수 ${name} 가 설정되어 있지 않습니다.`);
  return v;
}

export class PortOneApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`PortOne API 오류 (status ${status}): ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

// PORTONE_API_SECRET 으로 인증하는 PortOne V2 REST 호출 공통 래퍼.
export async function portoneFetch(path: string, init: RequestInit = {}): Promise<any> {
  const apiSecret = requireEnv("PORTONE_API_SECRET");
  const res = await fetch(`${PORTONE_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `PortOne ${apiSecret}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new PortOneApiError(res.status, body);
  return body;
}
