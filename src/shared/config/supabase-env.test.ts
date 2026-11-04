import { describe, expect, it } from "vitest";

import { readSupabaseServerEnv, SupabaseConfigError } from "./supabase-env";

const KEY = "sb_publishable_test-only-value";

describe("readSupabaseServerEnv", () => {
  it("로컬 http URL 과 공개 키를 읽는다", () => {
    expect(
      readSupabaseServerEnv({
        SUPABASE_URL: "http://127.0.0.1:55321",
        SUPABASE_PUBLISHABLE_KEY: KEY,
      }),
    ).toEqual({ url: "http://127.0.0.1:55321", publishableKey: KEY });
  });

  it("https 원격 URL 도 허용한다(후속 클라우드 연결용)", () => {
    expect(
      readSupabaseServerEnv({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: KEY,
      }).url,
    ).toBe("https://project.supabase.co");
  });

  it.each([
    [{}],
    [{ SUPABASE_URL: "http://127.0.0.1:55321" }],
    [{ SUPABASE_PUBLISHABLE_KEY: KEY }],
    [{ SUPABASE_URL: " ", SUPABASE_PUBLISHABLE_KEY: KEY }],
    [{ SUPABASE_URL: "not a url", SUPABASE_PUBLISHABLE_KEY: KEY }],
    [{ SUPABASE_URL: "ftp://127.0.0.1", SUPABASE_PUBLISHABLE_KEY: KEY }],
    // 원격 주소는 평문 http 를 허용하지 않는다
    [
      {
        SUPABASE_URL: "http://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: KEY,
      },
    ],
  ])("설정이 없거나 잘못되면 우회하지 않고 명확히 실패한다 (%j)", (env) => {
    expect(() => readSupabaseServerEnv(env)).toThrow(SupabaseConfigError);
  });

  it("오류 메시지에 키 값을 노출하지 않는다", () => {
    try {
      readSupabaseServerEnv({
        SUPABASE_URL: "bad",
        SUPABASE_PUBLISHABLE_KEY: KEY,
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
    }
  });

  it("서비스 비밀키를 공개 키로 받지 않는다", () => {
    expect(() =>
      readSupabaseServerEnv({
        SUPABASE_URL: "http://127.0.0.1:55321",
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_should-not-be-here",
      }),
    ).toThrow(SupabaseConfigError);
  });
});
