/**
 * Supabase Edge Function 호출 (예전 js/edge-function-fetch.js 의 WBEdgeFn.invoke).
 *
 * supabase.functions.invoke() 대신 fetch 를 직접 써서 상태 코드·서버가 보낸 오류 코드를 그대로 돌려줍니다.
 * 로그인 세션이 있으면 사용자 토큰으로, 없으면 anon key 로 호출합니다 (비로그인 신청 등).
 * 앱(Expo)에서도 그대로 쓸 수 있도록 next/* · 브라우저 전용 API 를 쓰지 않습니다 (fetch 는 앱에도 있음).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export type EdgeFunctionError = { status?: number; message: string; error?: string; [key: string]: unknown };
export type EdgeFunctionResult<T> = { data: T; error: null } | { data: null; error: EdgeFunctionError };

export async function invokeEdgeFunction<T = unknown>(
  client: WBSupabaseClient,
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<EdgeFunctionResult<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  let accessToken = anonKey;
  try {
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) accessToken = data.session.access_token;
  } catch (e) {
    console.warn('[edge-fn] 세션 조회 실패 — anon key 로 호출합니다:', e);
  }

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken, apikey: anonKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`[edge-fn] ${functionName} — 서버에 연결하지 못함:`, e);
    return { data: null, error: { message: '서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.' } };
  }

  const rawText = await res.text().catch(() => '');
  let json: Record<string, unknown> | null = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    /* JSON 아님 */
  }

  if (!res.ok) {
    const message = String((json && (json.message || json.error)) || rawText || 'HTTP ' + res.status);
    if (res.status >= 500)
      console.error(`[edge-fn] ${functionName} ${res.status} — 함수 내부 오류. 'supabase functions logs ${functionName}' 로 확인하세요.`);
    else console.error(`[edge-fn] ${functionName} 실패(${res.status}):`, json || rawText);
    return { data: null, error: { ...(json || {}), status: res.status, message } };
  }
  return { data: json as T, error: null };
}
