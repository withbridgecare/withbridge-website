/**
 * 공지사항 (sql/notices_management.sql 의 notices 테이블).
 * 관리자 화면의 '공지사항 관리'에서 등록·수정한 내용이 그대로 보입니다. (원칙 3: 운영자가 직접 수정)
 */
import type { WBSupabaseClient } from '@/lib/supabase/client';

export type NoticeCategory = 'service' | 'maintenance' | 'event';
export type NoticeBadge = 'must' | 'important';

export type Notice = {
  id: string;
  pinned: boolean;
  badge: NoticeBadge | null;
  category: NoticeCategory;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 빈 줄로 나눈 문단 */
  paragraphs: string[];
};

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  service: '서비스 안내',
  maintenance: '시스템 점검',
  event: '이벤트',
};
export const NOTICE_BADGE_LABEL: Record<NoticeBadge, string> = { must: '필독', important: '중요' };

function formatDateOnly(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 게시된 공지 목록 (고정 공지 먼저, 최신순). 실패하면 예외를 던집니다. */
export async function listPublishedNotices(client: WBSupabaseClient): Promise<Notice[]> {
  const { data, error } = await client
    .from('notices')
    .select('id, title, category, badge, pinned, body, created_at')
    .eq('is_published', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    pinned: !!row.pinned,
    badge: row.badge ?? null,
    category: row.category,
    title: row.title,
    date: formatDateOnly(row.created_at),
    paragraphs: String(row.body || '').split(/\n\s*\n/).filter(Boolean),
  }));
}
