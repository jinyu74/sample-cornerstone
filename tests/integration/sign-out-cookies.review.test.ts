import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME } from "@/shared/api/supabase/auth-cookie";

/**
 * PR #4 리뷰 P2: 로그아웃이 같은 호스트(다른 포트)의 다른 Supabase 프로젝트 세션 쿠키까지 지우면 안 된다.
 * 인증 서비스 오류로 signOut 이 실패해도 이 앱의 세션 쿠키(키·청크)는 확실히 지운다.
 */
vi.mock("server-only", () => ({}));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { signOut } }),
}));

const { POST } = await import("@/app/auth/sign-out/route");

const ORIGIN = "http://127.0.0.1:3100";
const OWN = [
  AUTH_COOKIE_NAME,
  `${AUTH_COOKIE_NAME}.0`,
  `${AUTH_COOKIE_NAME}.1`,
];
const OTHERS = [
  "sb-127-auth-token",
  "sb-127-auth-token.0",
  "sb-otherproject-auth-token",
  "theme",
];

function request() {
  return new NextRequest(`${ORIGIN}/auth/sign-out`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      host: "127.0.0.1:3100",
      cookie: [...OWN, ...OTHERS].map((name) => `${name}=v`).join("; "),
    },
  });
}

/** 응답이 지우라고(만료) 지시한 쿠키 이름 */
function deleted(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((line) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(line))
    .map((line) => line.split("=")[0]!);
}

afterEach(() => signOut.mockReset());

describe("POST /auth/sign-out: 이 앱 세션 쿠키만 지운다", () => {
  it.each([
    ["정상", () => signOut.mockResolvedValue({ error: null })],
    [
      "서비스 오류(예외)",
      () => signOut.mockRejectedValue(new TypeError("fetch failed")),
    ],
    [
      "서비스 오류(응답)",
      () =>
        signOut.mockResolvedValue({
          error: { name: "AuthRetryableFetchError", status: 0 },
        }),
    ],
  ])(
    "%s: 이 앱 키·청크는 지우고 다른 프로젝트·앱 쿠키는 보존한다",
    async (_name, arrange) => {
      arrange();
      const response = await POST(request());
      expect(response.status).toBe(303);
      const removed = deleted(response);
      for (const name of OWN) expect(removed).toContain(name);
      for (const name of OTHERS) expect(removed).not.toContain(name);
    },
  );
});
