// POST /functions/v1/get-portone-payment-config
// 브라우저 결제창이 사용할 공개 식별자만 반환합니다. PORTONE_API_SECRET 등 서버 비밀값은 반환하지 않습니다.
// 결제 모드는 PORTONE_CHANNEL_KEY에 지정된 PortOne 채널(테스트/실연동)에 따라 결정됩니다.

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

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const storeId = Deno.env.get("PORTONE_STORE_ID")?.trim();
  const channelKey = Deno.env.get("PORTONE_CHANNEL_KEY")?.trim();
  if (!storeId || !channelKey) {
    console.error("[get-portone-payment-config] PORTONE_STORE_ID 또는 PORTONE_CHANNEL_KEY가 설정되지 않았습니다.");
    return json(500, { error: "PORTONE_CONFIG_MISSING" });
  }

  // 이 두 값은 결제 요청 시 브라우저 SDK가 사용해야 하는 공개 식별자입니다.
  return json(200, { storeId, channelKey });
});
