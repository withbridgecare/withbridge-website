// POST /functions/v1/admin-set-member-status
//
// 어드민 콘솔(admin.html) '회원 관리' 상세 모달의 [계정 정지] / [계정 활성화] 버튼이 호출합니다.
// 로그인 자체를 막는 계정 정지는 GoTrue Admin API(auth.admin.updateUserById, ban_duration)로만
// 가능해 service-role 이 필요합니다 — supabase/functions/delete-account 가 탈퇴 2단계에서 쓰는
// 것과 같은 메커니즘을, "본인이 아니라 관리자가 다른 회원을 대상으로" 호출하는 버전입니다.
//
// 요청 바디: { user_id, action } — action: 'suspend' | 'activate'
//   suspend : ban_duration = '876000h'(≈100년, GoTrue에 "영구 차단" 전용 값이 없어 관례적으로 씀 —
//             delete-account 와 동일)
//   activate: ban_duration = 'none'(GoTrue 가 인식하는 차단 해제 값)
//
// 인증: 로그인한 관리자만 호출 가능 — admin-refund-application 과 동일한 패턴으로 (1) Authorization
// 토큰을 auth.getUser() 로 직접 검증하고 (2) service-role 클라이언트로 profiles.role === 'admin' 을
// 확인합니다(fail closed). 자기 자신을 대상으로는 호출할 수 없게 막아 관리자가 스스로를 잠가 로그인
// 할 수 없게 되는 사고를 방지합니다.
import { createAdminClient, createUserClient } from "../_shared/supabaseClients.ts";

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

interface RequestBody {
  user_id?: string;
  action?: "suspend" | "activate";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const { user_id, action } = payload;
  if (!user_id || (action !== "suspend" && action !== "activate")) {
    return json(400, {
      error: "INVALID_INPUT",
      message: "user_id 와 action('suspend' 또는 'activate')은 모두 필수입니다.",
    });
  }

  const userClient = createUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    console.error("[admin-set-member-status] 호출자 인증 확인 실패(토큰 만료/무효 가능성):", userErr);
    return json(401, {
      error: "NOT_AUTHENTICATED",
      message: "로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.",
    });
  }

  if (user_id === userData.user.id) {
    return json(400, {
      error: "CANNOT_TARGET_SELF",
      message: "본인 계정은 이 기능으로 정지/활성화할 수 없습니다.",
    });
  }

  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("[admin-set-member-status] profiles 조회 실패 — user_id=" + userData.user.id + ":", profileErr);
    return json(500, { error: "PROFILE_LOOKUP_FAILED", message: profileErr.message });
  }
  const normalizedRole = String(profile?.role ?? "").trim().toLowerCase();
  if (normalizedRole !== "admin" && normalizedRole !== "super_admin") {
    console.error("[admin-set-member-status] 관리자 권한 없음 — user_id=" + userData.user.id +
      ", email=" + userData.user.email + ", 조회된 role=" + JSON.stringify(profile?.role ?? null));
    return json(403, {
      error: "NOT_ADMIN",
      message: "관리자 권한이 없는 계정입니다 (user_id: " + userData.user.id + ", email: " + userData.user.email + ").",
    });
  }

  // 권한 위계: 관리자는 일반·매니저·관리자 계정만 정지/활성화할 수 있고, 최고관리자 계정은
  // 최고관리자만 다룰 수 있습니다(sql/role_hierarchy_hardening.sql 의 can_manage_user() 와 같은 규칙).
  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user_id)
    .maybeSingle();
  if (targetErr) {
    console.error("[admin-set-member-status] 대상 profiles 조회 실패 — target user_id=" + user_id + ":", targetErr);
    return json(500, { error: "PROFILE_LOOKUP_FAILED", message: targetErr.message });
  }
  const targetRole = String(target?.role ?? "").trim().toLowerCase();
  if (targetRole === "super_admin" && normalizedRole !== "super_admin") {
    return json(403, {
      error: "CANNOT_MANAGE_SUPER_ADMIN",
      message: "최고관리자 계정은 최고관리자만 정지/활성화할 수 있습니다.",
    });
  }

  const banDuration = action === "suspend" ? "876000h" : "none";
  const { error: banErr } = await admin.auth.admin.updateUserById(user_id, {
    ban_duration: banDuration,
  });
  if (banErr) {
    console.error("[admin-set-member-status] " + action + " 실패 — target user_id=" + user_id + ":", banErr);
    return json(500, { error: "UPDATE_FAILED", message: banErr.message });
  }

  // 감사 로그(admin-logs.html) — sql/admin_logs.sql 의 log_admin_action(). 이미 계정 정지/활성화
  // 자체는 끝났으므로, 로그 기록이 실패해도 요청은 성공(200)으로 돌려주고 콘솔에만 남깁니다.
  const { error: logErr } = await userClient.rpc("log_admin_action", {
    p_action_type: action === "suspend" ? "member_suspend" : "member_activate",
    p_target_type: "member",
    p_target_id: user_id,
  });
  if (logErr) {
    console.error("[admin-set-member-status] 감사 로그 기록 실패(처리 자체는 완료됨) — target user_id=" + user_id + ":", logErr);
  }

  console.log("[admin-set-member-status] " + action + " 완료 — target user_id=" + user_id +
    ", admin user_id=" + userData.user.id);
  return json(200, { ok: true, action });
});
