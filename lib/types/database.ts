/**
 * Supabase DB 타입.
 *
 * ⚠️ 이 파일은 원래 자동 생성해야 합니다 (NEXTJS_MIGRATION_PLAN.md 원칙 5):
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <프로젝트 ref> > lib/types/database.ts
 *
 * 생성 권한(Supabase 계정 로그인)이 필요해서 아직 실행하지 못했습니다. 그동안은 Next.js 로 옮긴 화면이
 * 실제로 쓰는 테이블·RPC 만 손으로 적어 둡니다. 자동 생성 파일로 교체하면 이 내용은 모두 덮어써집니다.
 */

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Row<{ id: string; role: string | null; name: string | null; phone: string | null }>;
      managers: Row<{ id: string; certification_verified: boolean | null }>;
      care_schedules: Row<{ id: string; guardian_id: string | null; extra_charge_status: string | null }>;
      notices: Row<{
        id: string;
        title: string;
        content: string | null;
        category: string | null;
        is_pinned: boolean | null;
        is_published: boolean | null;
        show_popup: boolean | null;
        created_at: string;
        updated_at: string | null;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_service_applications: { Args: { p_ids: string[] }; Returns: string[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
