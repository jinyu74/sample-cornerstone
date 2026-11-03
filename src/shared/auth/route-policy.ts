/**
 * Proxy 가 로그인 없이 통과시키는 경로. 그 밖의 경로는 모두 보호 경로다.
 * `/auth/session`·`/auth/sign-out` 은 공개로 통과시키되 Route Handler 가 직접 세션을 검증한다
 * (리다이렉트 대신 401·403 을 돌려주기 위해).
 */
const PUBLIC_PATHS = new Set(["/login", "/auth/session", "/auth/sign-out"]);

export function isPublicPath(pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return PUBLIC_PATHS.has(normalized);
}
