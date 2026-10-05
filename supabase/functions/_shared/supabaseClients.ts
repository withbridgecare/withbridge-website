import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 Supabase Edge Function 런타임이
// 자동으로 주입하는 값입니다(.env 에 따로 넣지 않습니다).

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

// 호출자의 Authorization 헤더를 그대로 전달해, RLS가 본인 소유 행만 보이도록 걸러주는 클라이언트.
export function createUserClient(authorizationHeader: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY 환경변수가 없습니다.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorizationHeader } },
  });
}
