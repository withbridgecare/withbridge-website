const PORTONE_API_BASE = "https://api.portone.io";

function requireEnv(name: string): string {
  // Secret을 대시보드에 복사/붙여넣기할 때 앞뒤 공백이나 개행이 포함되면
  // PortOne은 인증 정보를 그대로 비교해 401을 반환하므로 요청 전에 제거합니다.
  const v = Deno.env.get(name)?.trim();
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
