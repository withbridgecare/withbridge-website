/**
 * 케어 매니저 지원 (예전 manager-apply.html).
 * 지원서 제출은 submit-manager-application Edge Function 이 허니팟·레이트리밋·중복 확인·저장·텔레그램 알림을 처리합니다 (원칙 1).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export const ID_CARD_BUCKET = 'manager-id-cards';

export type ManagerApplicationStatus = { id: string; status: string; reject_reason: string | null; created_at: string };

/** 내 가장 최근 지원서 (없으면 null) */
export async function getLatestManagerApplication(client: WBSupabaseClient, userId: string): Promise<ManagerApplicationStatus | null> {
  const { data, error } = await client
    .from('manager_applications')
    .select('id, status, reject_reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) console.error('[매니저 지원] 기존 내역 조회 실패:', error.code, error.message);
  return ((data as ManagerApplicationStatus[] | null) ?? [])[0] ?? null;
}

export type ManagerApplicationInput = {
  name: string;
  phone: string;
  birth_date: string;
  gender: string;
  address: string;
  id_image_path: string | null;
  activity_areas: string[];
  activity_schedule: string[];
  certifications: string[];
  career_experience: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  agree_safety: true;
  agree_no_direct_deal: true;
  agree_privacy: true;
  website: string;
};

/** 제출. 실패하면 서버가 보낸 { error, message } 본문(있으면)을 돌려줍니다. */
export async function submitManagerApplication(
  client: WBSupabaseClient,
  row: ManagerApplicationInput,
): Promise<{ ok: true } | { ok: false; body: { error?: string; message?: string } | null; raw: unknown }> {
  let err: unknown = null;
  try {
    const res = await client.functions.invoke('submit-manager-application', { body: row });
    err = res.error;
  } catch (e) {
    err = e;
  }
  if (!err) return { ok: true };
  let body: { error?: string; message?: string } | null = null;
  const ctx = (err as { context?: { json?: () => Promise<unknown> } }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      body = (await ctx.json()) as typeof body;
    } catch {
      /* JSON 아님 */
    }
  }
  return { ok: false, body, raw: err };
}

/** 신분증 사본 업로드 (비공개 버킷, 경로: <userId>/<랜덤>.<확장자>) */
export async function uploadIdCard(client: WBSupabaseClient, userId: string, file: File) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const randomId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
  return client.storage.from(ID_CARD_BUCKET).upload(userId + '/' + randomId + '.' + ext, file, { contentType: file.type, upsert: false });
}

export async function removeIdCard(client: WBSupabaseClient, path: string) {
  return client.storage.from(ID_CARD_BUCKET).remove([path]);
}
