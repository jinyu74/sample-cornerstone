const MAX_LENGTH = 2048;
export const LOGIN_PATH = "/login";
const PROBE_ORIGIN = "http://next.invalid";
/** 브라우저가 URL 에서 제거하거나 헤더를 끊는 제어 문자(U+0000–U+001F, U+007F) */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * 로그인 후 돌아갈 경로를 같은 사이트의 내부 경로로만 제한한다.
 * - 외부 URL·스킴·`//host`·`/\host`·제어 문자·잘못된 인코딩은 거부한다.
 * - 인코딩을 여러 번 풀어도 위 형태가 되면 거부한다(이중 인코딩 우회 방지).
 * - 정상 경로·쿼리·인코딩 값은 바꾸지 않고 그대로 돌려준다.
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (value === "" || value !== raw || value.length > MAX_LENGTH)
    return fallback;
  if (!value.startsWith("/")) return fallback;

  let decoded = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isSafeShape(decoded)) return fallback;
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    decoded = next;
  }
  if (!isSafeShape(decoded)) return fallback;

  const url = new URL(value, PROBE_ORIGIN);
  if (url.origin !== PROBE_ORIGIN) return fallback;
  if (url.pathname === LOGIN_PATH || url.pathname.startsWith(`${LOGIN_PATH}/`))
    return fallback;
  return value;
}

function isSafeShape(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\") &&
    !path.includes("\\") &&
    !hasControlCharacter(path)
  );
}
