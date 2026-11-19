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
      profiles: Row<{
        id: string;
        role: string | null;
        name: string | null;
        phone: string | null;
        address: string | null;
        address_detail: string | null;
        notify_care: boolean | null;
        notify_marketing: boolean | null;
      }>;
      managers: Row<{ id: string; certification_verified: boolean | null }>;
      care_schedules: Row<{ id: string; guardian_id: string | null; extra_charge_status: string | null }>;
      notices: Row<{
        id: string;
        title: string;
        category: 'service' | 'maintenance' | 'event';
        badge: 'must' | 'important' | null;
        pinned: boolean;
        body: string;
        is_published: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      partner_inquiries: Row<{
        id: string;
        org_name: string;
        contact_name: string;
        phone: string;
        email: string;
        org_type: string;
        message: string | null;
        privacy_consent: boolean;
        status: string;
        created_at: string;
      }>;
      user_coupons: Row<{ id: string; user_id: string; coupon_code: string; amount: number | null; status: string | null; notified_at: string | null }>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_service_applications: { Args: { p_ids: string[] }; Returns: string[] };
      is_phone_registered: { Args: { p_phone: string }; Returns: boolean };
      set_initial_phone_if_missing: { Args: { p_phone: string }; Returns: { phone: string | null } };
      update_user_profile: {
        Args: { p_name: string; p_address: string | null; p_address_detail: string | null; p_notify_care: boolean; p_notify_marketing: boolean };
        Returns: unknown;
      };
      deactivate_own_account: { Args: Record<string, never>; Returns: unknown };
      mark_welcome_coupon_notified: { Args: Record<string, never>; Returns: { amount: number | null }[] };
      claim_welcome_coupon: { Args: Record<string, never>; Returns: { amount: number | null; status: string | null }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
