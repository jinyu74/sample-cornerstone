import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { readSupabaseServerEnv } from "@/shared/config/supabase-env";

export const NO_STORE =
  "private, no-cache, no-store, must-revalidate, max-age=0";

export interface RefreshedSession {
  /** 갱신된 세션 쿠키가 담긴 다음 단계 응답 */
  response: NextResponse;
  /** 쿠키 토큰이 서명 검증을 통과한 사용자 ID(낙관적 판정) */
  userId: string | null;
}

/**
 * Proxy 에서 세션 쿠키를 읽고 필요하면 토큰을 갱신해 요청·응답 쿠키에 함께 반영한다.
 * 여기서의 판정은 화면 이동을 위한 낙관적 검사이며, 보호 화면과 Route Handler 는
 * 서버 DAL(getUser)로 다시 검증한다.
 */
export async function refreshSession(
  request: NextRequest,
): Promise<RefreshedSession> {
  const { url, publishableKey } = readSupabaseServerEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers))
          response.headers.set(key, value);
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const sub = error ? undefined : data?.claims.sub;
  return { response, userId: typeof sub === "string" ? sub : null };
}
