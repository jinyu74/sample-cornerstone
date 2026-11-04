import { describe, expect, it } from "vitest";

import { APP_DATABASE_NAME } from "./app-database";
import { LEGACY_DATABASE_NAME, userDatabaseName } from "./user-database";

const A = "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f";
const B = "c9f0f895-fb98-4b91-8c2d-6e5f4a3b2c1d";

describe("userDatabaseName: 계정별 브라우저 저장소 이름", () => {
  it("계정마다 다른 이름을 만든다", () => {
    expect(userDatabaseName(A)).not.toBe(userDatabaseName(B));
    expect(userDatabaseName(A)).toBe(`${APP_DATABASE_NAME}:user:${A}`);
  });

  it("대소문자가 달라도 같은 계정은 같은 이름이다", () => {
    expect(userDatabaseName(A.toUpperCase())).toBe(userDatabaseName(A));
  });

  it("이전 익명 저장소 이름과 겹치지 않는다", () => {
    expect(LEGACY_DATABASE_NAME).toBe(APP_DATABASE_NAME);
    expect(userDatabaseName(A)).not.toBe(LEGACY_DATABASE_NAME);
  });

  it.each([[""], ["anonymous"], ["../x"], [`${A}:extra`], ["0"]])(
    "UUID 가 아닌 사용자 ID(%j)는 거부한다",
    (id) => {
      expect(() => userDatabaseName(id)).toThrow();
    },
  );
});
