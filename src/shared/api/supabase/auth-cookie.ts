/**
 * 이 앱의 Supabase 세션 쿠키 이름. 기본 이름(sb-<호스트 첫 부분>-auth-token)은 같은 호스트의
 * 다른 Supabase 프로젝트(다른 포트)와 겹치므로 앱 전용 이름을 쓴다. 쿠키는 포트로 구분되지 않는다.
 */
export const AUTH_COOKIE_NAME = "sb-dicom-annotator-auth-token";

const CHUNK = /^\.\d+$/;

/** 이 앱 세션 쿠키(키, 큰 값을 나눈 청크 `.N`, PKCE `-code-verifier`)인지 */
export function isOwnAuthCookie(name: string): boolean {
  if (name === AUTH_COOKIE_NAME) return true;
  if (!name.startsWith(AUTH_COOKIE_NAME)) return false;
  const rest = name.slice(AUTH_COOKIE_NAME.length);
  return CHUNK.test(rest) || rest === "-code-verifier";
}
