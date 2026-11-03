import { describe, expect, it, vi } from "vitest";

import { checkSession, SESSION_ENDPOINT } from "./check-session";

const USER = "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f";

function respond(status: number, body?: unknown) {
  return vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("checkSession: 서버 세션 재검증 요청", () => {
  it("캐시하지 않고 같은 출처 쿠키로 서버에 묻는다", async () => {
    const fetcher = respond(200, { userId: USER });
    await checkSession(fetcher);
    expect(fetcher).toHaveBeenCalledWith(SESSION_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  });

  it("200 과 사용자 ID 면 유효", async () => {
    await expect(checkSession(respond(200, { userId: USER }))).resolves.toEqual(
      {
        status: "ok",
        userId: USER,
      },
    );
  });

  it("401 이면 인증 없음", async () => {
    await expect(
      checkSession(respond(401, { error: "unauthenticated" })),
    ).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it.each([
    ["서버 오류", respond(503, { error: "auth-unavailable" })],
    ["형식이 다른 성공 응답", respond(200, { user: USER })],
    [
      "네트워크 오류",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    ],
  ])("%s 는 성공으로 보지 않고 오류로 돌려준다", async (_name, fetcher) => {
    await expect(checkSession(fetcher)).resolves.toEqual({ status: "error" });
  });
});
