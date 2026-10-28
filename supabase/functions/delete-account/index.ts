// POST /functions/v1/delete-account
//
// profile-edit.html 하단 '회원 탈퇴' 버튼이 호출합니다 — 단, 이 함수는 탈퇴 처리의 "2단계"입니다.
// 브라우저는 이 함수를 부르기 *전에* 이미 client.rpc('deactivate_own_account') 로 profiles 의
// 이름/연락처/주소 등 개인식별정보를 스스로 지웁니다(sql/profile_account_management.sql). 이 함수는
// 그 다음 "다시 로그인하지 못하게" 막는 부분만 담당합니다 — GoTrue Admin API(auth.admin.updateUserById)
// 로만 할 수 있어 service-role 이 필요하므로 Edge Function이어야 합니다.
//
// 왜 auth.users 행을 실제로 지우지 않는가(하드 삭제가 아닌 이유):
//   profiles.id 를 참조하는 여러 테이블(예: care_schedules.guardian_id/manager_id)에 ON DELETE CASCADE
//   가 걸려 있지 않아, auth.users 를 지우면(→ profiles 가 cascade로 같이 지워짐) 거의 항상 외래키
//   제약 위반으로 실패합니다. 설령 전부 cascade 라도, 결제/정산 이력을 실제로 지우는 것은
//   전자상거래법상 바람직하지 않습니다. 대신 이 계정을 매우 긴 기간(ban_duration) 차단해 로그인만
//   막고, user_metadata(카카오가 준 이름/프로필 사진 등)는 비웁니다.
//
// 인증: 로그인한 본인만 호출 가능 — Authorization 헤더의 토큰을 auth.getUser() 로 직접 검증하고,
// 그 토큰의 사용자 자신만 차단합니다(다른 사용자 id를 파라미터로 받지 않으므로 권한 상승 경로가 없음).
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "NOT_AUTHENTICATED" });

  const userClient = createUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    console.error("[delete-account] 호출자 인증 확인 실패(토큰 만료/무효 가능성):", userErr);
    return json(401, {
      error: "NOT_AUTHENTICATED",
      message: "로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.",
    });
  }

  const userId = userData.user.id;
  const admin = createAdminClient();

  // ban_duration: GoTrue Admin API는 "영구 차단" 전용 플래그가 없고 기간 문자열("<n>h")만 받습니다.
  // 876000h ≈ 100년으로 사실상 영구 차단입니다. user_metadata 를 함께 비워 카카오가 넘겨준 이름/프로필
  // 사진도 더 이상 조회되지 않게 합니다(화면 표시 로직 대부분이 user_metadata 를 읽으므로).
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    user_metadata: {},
  });
  if (banErr) {
    console.error("[delete-account] 계정 차단(updateUserById) 실패 — user_id=" + userId + ":", banErr);
    return json(500, { error: "DEACTIVATE_FAILED", message: banErr.message });
  }

  console.log("[delete-account] 탈퇴 처리(로그인 차단) 완료 — user_id=" + userId);
  return json(200, { ok: true });
});
