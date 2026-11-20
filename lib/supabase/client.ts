import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * 브라우저용 Supabase 클라이언트 (페이지당 1개).
 *
 * 로그인 정보는 supabase-js 기본값대로 localStorage('sb-<프로젝트>-auth-token')에 저장합니다.
 * 아직 Next.js 로 옮기지 않은 레거시 HTML 페이지(CDN supabase-js)도 같은 키를 쓰므로,
 * 새 페이지와 옛 페이지를 오가도 로그인이 유지됩니다. (NEXTJS_MIGRATION_PLAN.md 4장)
 * 쿠키 저장(@supabase/ssr)으로의 전환은 레거시가 모두 사라진 뒤에 합니다.
 */
let browserClient: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      '[supabase] SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다. 로컬은 .env, 배포는 Vercel 환경 변수를 확인하세요.',
    );
  }
  browserClient = createClient<Database>(url, anonKey);
  return browserClient;
}

export type WBSupabaseClient = SupabaseClient<Database>;
