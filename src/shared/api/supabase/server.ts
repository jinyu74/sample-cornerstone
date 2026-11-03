import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readSupabaseServerEnv } from "@/shared/config/supabase-env";

/**
 * 요청마다 새로 만드는 서버 Supabase 클라이언트(Server Component·Server Action·Route Handler).
 * 세션 토큰은 HttpOnly 가 아닌 Supabase 쿠키에 있지만, 세션 검증은 항상 서버의 getUser 로 한다.
 * Server Component 렌더링 중에는 쿠키를 쓸 수 없으므로 토큰 갱신 쿠키는 Proxy 가 응답에 쓴다.
 */
export async function createServerSupabase() {
  const { url, publishableKey } = readSupabaseServerEnv();
  const store = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list)
            store.set(name, value, options);
        } catch {
          // Server Component 렌더링 중: Proxy 가 같은 요청에서 갱신 쿠키를 이미 응답에 썼다.
        }
      },
    },
  });
}
