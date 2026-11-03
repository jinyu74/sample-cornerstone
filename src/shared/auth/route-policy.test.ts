import { describe, expect, it } from "vitest";

import { isPublicPath } from "./route-policy";

describe("isPublicPath: 로그인 없이 열 수 있는 경로", () => {
  it.each(["/login", "/login/", "/auth/session", "/auth/sign-out"])(
    "%s 는 공개(자체 검증하는 인증 경로 포함)",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each([
    "/",
    "/studies/1.2.3",
    "/loginx",
    "/login-admin",
    "/authx",
    "/auth",
    "/auth/other",
    "/studies/login",
  ])("%s 는 보호 경로", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
