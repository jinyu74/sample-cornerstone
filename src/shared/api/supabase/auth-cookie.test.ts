import { describe, expect, it } from "vitest";

import { AUTH_COOKIE_NAME, isOwnAuthCookie } from "./auth-cookie";

describe("isOwnAuthCookie: 이 앱의 세션 쿠키(키·청크)만 고른다", () => {
  it.each([
    AUTH_COOKIE_NAME,
    `${AUTH_COOKIE_NAME}.0`,
    `${AUTH_COOKIE_NAME}.1`,
    `${AUTH_COOKIE_NAME}.12`,
    `${AUTH_COOKIE_NAME}-code-verifier`,
  ])("%s 는 이 앱 쿠키", (name) => {
    expect(isOwnAuthCookie(name)).toBe(true);
  });

  it.each([
    "sb-127-auth-token",
    "sb-127-auth-token.0",
    "sb-otherproject-auth-token",
    `${AUTH_COOKIE_NAME}x`,
    `${AUTH_COOKIE_NAME}.x`,
    `${AUTH_COOKIE_NAME}.`,
    `prefix-${AUTH_COOKIE_NAME}`,
    "theme",
  ])("%s 는 다른 프로젝트·앱 쿠키라 건드리지 않는다", (name) => {
    expect(isOwnAuthCookie(name)).toBe(false);
  });
});
