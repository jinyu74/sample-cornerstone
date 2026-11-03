/** Supabase 연결 설정이 없거나 잘못됨. 인증을 우회하지 않고 요청을 실패시킨다. */
export class SupabaseConfigError extends Error {
  override name = "SupabaseConfigError";
}

export interface SupabaseServerEnv {
  url: string;
  /** 브라우저에 공개돼도 되는 키(anon/publishable). 서비스 비밀키는 받지 않는다. */
  publishableKey: string;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * 서버(Proxy·Server Component·Route Handler)에서만 읽는 Supabase 설정.
 * `NEXT_PUBLIC_` 접두사를 쓰지 않아 브라우저 번들에 들어가지 않는다.
 */
export function readSupabaseServerEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseServerEnv {
  const rawUrl = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !publishableKey) {
    throw new SupabaseConfigError(
      "SUPABASE_URL 과 SUPABASE_PUBLISHABLE_KEY 를 설정해야 로그인할 수 있습니다",
    );
  }
  if (publishableKey.startsWith("sb_secret_")) {
    throw new SupabaseConfigError(
      "SUPABASE_PUBLISHABLE_KEY 에 서비스 비밀키를 넣을 수 없습니다",
    );
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SupabaseConfigError("SUPABASE_URL 형식이 올바르지 않습니다");
  }
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) {
    throw new SupabaseConfigError(
      "SUPABASE_URL 은 https 이거나 로컬(127.0.0.1·localhost) http 여야 합니다",
    );
  }
  return { url: url.origin, publishableKey };
}
