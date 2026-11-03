import { describe, expect, it } from "vitest";

import { classifySignInError, parseSignInForm } from "./sign-in";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseSignInForm", () => {
  it("이메일·비밀번호·안전한 복귀 경로를 읽는다", () => {
    expect(
      parseSignInForm(
        form({
          email: "  Reader@Example.test ",
          password: "correct horse battery",
          next: "/studies/1.2.3?series=4",
        }),
      ),
    ).toEqual({
      ok: true,
      email: "reader@example.test",
      password: "correct horse battery",
      next: "/studies/1.2.3?series=4",
    });
  });

  it("외부 복귀 경로는 기본 경로로 바꾼다", () => {
    const parsed = parseSignInForm(
      form({ email: "a@example.test", password: "pw", next: "//evil.example" }),
    );
    expect(parsed).toMatchObject({ ok: true, next: "/" });
  });

  it.each([
    [{ email: "", password: "pw" }],
    [{ email: "not-an-email", password: "pw" }],
    [{ email: "a@example.test", password: "" }],
    [{ password: "pw" }],
    [{ email: "a@example.test" }],
  ])("입력이 비었거나 형식이 틀리면 서버 요청 없이 거부한다 (%j)", (fields) => {
    expect(parseSignInForm(form(fields))).toEqual({
      ok: false,
      state: {
        status: "error",
        code: "invalid-input",
        message: "이메일과 비밀번호를 입력하세요.",
      },
    });
  });
});

describe("classifySignInError: 실패를 성공으로 표시하지 않는다", () => {
  it("잘못된 자격 증명은 계정 존재 여부를 드러내지 않는 같은 문구", () => {
    const state = classifySignInError({
      name: "AuthApiError",
      status: 400,
      code: "invalid_credentials",
    });
    expect(state).toEqual({
      status: "error",
      code: "invalid-credentials",
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  });

  it.each([
    [{ name: "AuthRetryableFetchError", status: 0 }],
    [{ name: "AuthApiError", status: 500, code: "unexpected_failure" }],
    [{ name: "AuthApiError", status: 429, code: "over_request_rate_limit" }],
    [new TypeError("fetch failed")],
    [undefined],
  ])("서비스 오류(%j)는 연결 실패로 알린다", (error) => {
    expect(classifySignInError(error)).toEqual({
      status: "error",
      code: "service-unavailable",
      message: "인증 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
    });
  });
});
