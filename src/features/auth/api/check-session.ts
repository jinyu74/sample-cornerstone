import type { SessionCheck } from "../model/session-check";

/** 서버가 쿠키 세션을 Auth 서버로 검증해 현재 계정 ID 를 돌려주는 경로(no-store) */
export const SESSION_ENDPOINT = "/auth/session";

/**
 * 이미 열린 보호 화면에서 서버 세션을 다시 확인한다.
 * 401 만 인증 없음으로 보고, 그 밖의 실패는 성공으로 보지 않는 오류로 돌려준다.
 */
export async function checkSession(
  fetcher: typeof fetch = fetch,
): Promise<SessionCheck> {
  try {
    const response = await fetcher(SESSION_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (response.status === 401) return { status: "unauthenticated" };
    if (!response.ok) return { status: "error" };
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "userId" in body &&
      typeof body.userId === "string" &&
      body.userId !== ""
    ) {
      return { status: "ok", userId: body.userId };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}
