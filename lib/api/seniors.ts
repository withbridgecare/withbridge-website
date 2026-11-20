/**
 * 어르신 프로필 (seniors 테이블, RLS: 본인 것만). 신청서에서 불러오기·저장에 씁니다.
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export type SeniorProfile = {
  senior_id: string;
  senior_name: string | null;
  senior_birth: string | null;
  address: string | null;
  address_detail?: string | null;
  health_note: string | null;
  gender: string | null;
  senior_phone: string | null;
  mobility_level: string | null;
  frequent_hospital: string | null;
  frequent_hospital_detail?: string | null;
};

const BASE_COLS = 'senior_id, senior_name, senior_birth, address, health_note, gender, senior_phone, mobility_level, frequent_hospital';

/**
 * 내 어르신 목록. DB 에 아직 없는 선택 컬럼(address_detail 등)이 있으면(42703) 그 컬럼을 빼고 다시 조회합니다.
 */
export async function listMySeniors(client: WBSupabaseClient, userId: string): Promise<{ data: SeniorProfile[] | null; error: { code: string; message: string } | null }> {
  const optional = ['address_detail', 'frequent_hospital_detail'];
  for (;;) {
    const cols = BASE_COLS + (optional.length ? ', ' + optional.join(', ') : '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await client.from('seniors' as any).select(cols).eq('user_id', userId);
    if (!error || error.code !== '42703' || !optional.length) return { data: data as unknown as SeniorProfile[] | null, error };
    const msg = String(error.message || '');
    const hit = optional.findIndex((c) => msg.includes(c));
    optional.splice(hit >= 0 ? hit : 0, 1);
    console.warn('[seniors] 일부 컬럼이 없습니다(42703) → sql/seniors_profile_fields.sql 을 실행하세요:', msg);
  }
}

export async function findSeniorIdByName(client: WBSupabaseClient, userId: string, name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client.from('seniors' as any).select('senior_id').eq('user_id', userId).eq('senior_name', name).maybeSingle() as unknown as Promise<{
    data: { senior_id: string } | null;
    error: { code: string; message: string } | null;
  }>;
}

export async function saveSenior(client: WBSupabaseClient, userId: string, existingId: string | null, payload: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = client.from('seniors' as any);
  return (existingId
    ? table.update(payload).eq('senior_id', existingId).eq('user_id', userId).select().maybeSingle()
    : table.insert([{ user_id: userId, ...payload }]).select().maybeSingle()) as unknown as Promise<{
    data: { senior_id?: string; user_id?: string } | null;
    error: { code: string; message: string; details?: string; hint?: string } | null;
  }>;
}
