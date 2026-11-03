import { type NextRequest, NextResponse } from "next/server";

import { createServerSupabase } from "@/shared/api/supabase/server";
import {
  AUTH_COOKIE_NAME,
  isOwnAuthCookie,
} from "@/shared/api/supabase/auth-cookie";
import { NO_STORE } from "@/shared/api/supabase/proxy";
import { isSameOriginRequest } from "@/shared/auth/same-origin";
import { LOGIN_PATH } from "@/shared/lib/navigation";

/**
 * 로그아웃. 다른 사이트에서 보낸 요청(CSRF)은 거부한다.
 * 문서 전체 이동(303)으로 로그인 화면에 가므로 이전 계정의 메모리(영상 캐시 등)가 남지 않는다.
 * 계정별 브라우저 저장소(IndexedDB)는 지우지 않는다(다시 로그인하면 복원).
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("허용되지 않은 요청입니다.", {
      status: 403,
      headers: { "Cache-Control": NO_STORE },
    });
  }

  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // 인증 서비스 오류여도 이 앱의 세션 쿠키는 아래에서 지운다.
  }

  // 상대 Location: 서버 내부 주소(request.url 의 localhost 등)로 출처가 바뀌면
  // 쿠키와 탭 간 로그아웃 알림(BroadcastChannel)이 원래 출처에 닿지 않는다.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: `${LOGIN_PATH}?signed_out=1` },
  });
  // 이 앱 세션 쿠키(키·청크)만 지운다. 같은 호스트의 다른 Supabase 프로젝트 쿠키는 보존한다.
  // signOut 이 실패(서비스 오류)해도 이 브라우저에서는 확실히 로그아웃된다.
  const own = new Set([AUTH_COOKIE_NAME]);
  for (const cookie of request.cookies.getAll())
    if (isOwnAuthCookie(cookie.name)) own.add(cookie.name);
  for (const name of own) response.cookies.delete(name);
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

function isSameOrigin(request: NextRequest): boolean {
  return isSameOriginRequest({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    protocol: request.nextUrl.protocol,
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
}
