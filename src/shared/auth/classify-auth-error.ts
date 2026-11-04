export type UserLookupFailure = "unauthenticated" | "service-error";

/**
 * 서버에서 Auth 서버에 사용자를 확인하다 실패한 이유를 나눈다.
 * - 세션 없음·위조·만료·폐기(4xx, 요청 한도 제외)는 인증 없음 → 로그인으로 보낸다.
 * - 네트워크·5xx·요청 한도는 서비스 오류 → 성공으로 보지 않고 오류를 표시한다.
 */
export function classifyUserLookupError(error: unknown): UserLookupFailure {
  if (typeof error !== "object" || error === null) return "service-error";
  const name = "name" in error ? error.name : undefined;
  const status = "status" in error ? error.status : undefined;
  if (name === "AuthSessionMissingError" || name === "AuthInvalidJwtError")
    return "unauthenticated";
  if (
    name === "AuthApiError" &&
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 429
  )
    return "unauthenticated";
  return "service-error";
}
