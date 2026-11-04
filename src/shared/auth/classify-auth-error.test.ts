import { describe, expect, it } from "vitest";

import { classifyUserLookupError } from "./classify-auth-error";

describe("classifyUserLookupError: 서버 사용자 확인 실패의 의미", () => {
  it.each([
    [{ name: "AuthSessionMissingError", status: 400 }],
    [{ name: "AuthApiError", status: 401, code: "bad_jwt" }],
    [{ name: "AuthApiError", status: 403, code: "session_not_found" }],
    [{ name: "AuthApiError", status: 404, code: "user_not_found" }],
    [{ name: "AuthInvalidJwtError", status: 400 }],
  ])("세션 없음·위조·만료·폐기(%j)는 인증 없음", (error) => {
    expect(classifyUserLookupError(error)).toBe("unauthenticated");
  });

  it.each([
    [{ name: "AuthRetryableFetchError", status: 0 }],
    [{ name: "AuthRetryableFetchError", status: 503 }],
    [{ name: "AuthApiError", status: 500 }],
    [{ name: "AuthApiError", status: 429, code: "over_request_rate_limit" }],
    [new TypeError("fetch failed")],
    [undefined],
  ])(
    "인증 서비스 오류(%j)는 로그인 성공으로도 로그아웃으로도 보지 않는다",
    (error) => {
      expect(classifyUserLookupError(error)).toBe("service-error");
    },
  );
});
