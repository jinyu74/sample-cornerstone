import { type NextRequest, NextResponse } from "next/server";

import { NO_STORE, refreshSession } from "@/shared/api/supabase/proxy";
import { isPublicPath } from "@/shared/auth/route-policy";
import { SupabaseConfigError } from "@/shared/config/supabase-env";
import { LOGIN_PATH, safeNextPath } from "@/shared/lib/navigation";

/**
 * 모든 페이지·인증 경로 요청에서
 * 1) 세션 토큰을 갱신해 요청·응답 쿠키에 반영하고
 * 2) 보호 경로에 세션이 없으면 로그인으로 보낸다(낙관적 검사, 실제 검증은 서버 DAL).
 * 사용자별 응답이 공유 캐시에 저장되지 않도록 모든 분기에 no-store 를 붙인다.
 */
export async function proxy(request: NextRequest) {
  let refreshed;
  try {
    refreshed = await refreshSession(request);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      // 설정이 없으면 인증을 우회하지 않고 실패한다.
      return noStore(
        new NextResponse("인증 설정이 없어 요청을 처리할 수 없습니다.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    }
    throw error;
  }
  const { response, userId } = refreshed;
  const { pathname, search } = request.nextUrl;

  if (!userId && !isPublicPath(pathname)) {
    const target = new URL(LOGIN_PATH, request.url);
    target.searchParams.set("next", safeNextPath(`${pathname}${search}`));
    const redirect = NextResponse.redirect(target, 307);
    // 갱신 과정에서 정리된(만료) 세션 쿠키도 함께 보낸다.
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    return noStore(redirect);
  }
  return noStore(response);
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export const config = {
  // 정적 자산·코덱(wasm)·이미지 최적화는 제외하고 페이지·인증 경로에서만 실행한다.
  // 원본 업·다운로드(api/originals/)는 제외한다: Proxy 가 실행되면 본문이 복제·메모리 버퍼링되고
  // 10MB 를 넘으면 잘린다(next/dist/server/body-streams.js). 이 경로의 Route 가 Auth 를 직접 검증한다.
  matcher: [
    "/((?!_next/static|_next/image|cornerstone/|api/originals/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|js|map)$).*)",
  ],
};
