import { NextResponse } from "next/server";

import { NO_STORE } from "@/shared/api/supabase/proxy";
import { AuthServiceError, getCurrentUser } from "@/shared/auth/server";

/**
 * 이미 열린 보호 화면의 세션 재검증(useSessionGuard). Auth 서버로 확인한 계정 ID 만 돌려준다.
 * 200 {userId} / 401 인증 없음 / 503 인증 서비스 오류. 어떤 분기도 캐시하지 않는다.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "unauthenticated" }, 401);
    return json({ userId: user.id }, 200);
  } catch (error) {
    if (!(error instanceof AuthServiceError)) throw error;
    return json({ error: "auth-unavailable" }, 503);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": NO_STORE },
  });
}
