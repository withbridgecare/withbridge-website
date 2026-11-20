/**
 * 기관·기업 제휴 문의 (sql/partner_inquiries.sql 의 partner_inquiries 테이블).
 * 저장되면 DB 트리거가 notify-partner-inquiry Edge Function 을 불러 담당자에게 메일을 보냅니다 (원칙 1: 알림은 서버에서).
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export const PARTNER_ORG_TYPES = ['요양원', '주야간보호센터', '복지관', '의료기관', '기타'] as const;
export type PartnerOrgType = (typeof PARTNER_ORG_TYPES)[number];

export type PartnerInquiryInput = {
  org_name: string;
  contact_name: string;
  phone: string;
  email: string;
  org_type: PartnerOrgType;
  message: string;
};

export async function submitPartnerInquiry(client: WBSupabaseClient, input: PartnerInquiryInput): Promise<void> {
  const { error } = await client.from('partner_inquiries').insert({ ...input, privacy_consent: true });
  if (error) throw error;
}

/** 입력 검사 규칙 — 통과하면 true, 아니면 안내 문구 */
export const PARTNER_RULES: Record<'org_name' | 'contact_name' | 'phone' | 'email' | 'message', (v: string) => true | string> = {
  org_name: (v) => v.trim().length >= 2 || '기관 · 기업명을 입력해 주세요.',
  contact_name: (v) => v.trim().length >= 2 || '담당자 성함을 입력해 주세요.',
  phone: (v) => /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(v.trim()) || '올바른 연락처를 입력해 주세요.',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || '올바른 이메일 주소를 입력해 주세요.',
  message: (v) => v.trim().length >= 10 || '문의 내용을 10자 이상 입력해 주세요.',
};

/** 연락처 자동 하이픈 (02 지역번호 포함) */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return d.replace(/(\d{3})(\d+)/, '$1-$2');
  return d.startsWith('02') ? d.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3') : d.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
}
