import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next-path";

describe("safeNextPath: 로그인 후 복귀 경로", () => {
  it.each([
    ["/", "/"],
    ["/studies/1.2.840.113619", "/studies/1.2.840.113619"],
    // 정상 쿼리·인코딩은 과도하게 막지 않는다
    ["/studies/1.2.3?series=1.2.3.4", "/studies/1.2.3?series=1.2.3.4"],
    ["/studies/1.2.3?series=a%2Fb", "/studies/1.2.3?series=a%2Fb"],
    ["/studies/%31.2.3", "/studies/%31.2.3"],
    [
      "/studies/1.2.3?q=%ED%95%9C%EA%B8%80",
      "/studies/1.2.3?q=%ED%95%9C%EA%B8%80",
    ],
    ["/studies/1.2.3#frame-2", "/studies/1.2.3#frame-2"],
  ])("내부 경로 %s 는 그대로 허용한다", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([[undefined], [null], [""], ["   "]])(
    "값이 없으면(%s) 기본 경로",
    (raw) => {
      expect(safeNextPath(raw)).toBe("/");
    },
  );

  it.each([
    ["https://evil.example/"],
    ["http:/evil.example"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["//evil.example"],
    ["///evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/%2F/evil.example"],
    ["/%2f%2fevil.example"],
    ["/%5Cevil.example"],
    ["/%252F%252Fevil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["/studies/1%0d%0aSet-Cookie:x=1"],
    ["/%E0%A4%A"],
    ["studies/1.2.3"],
    ["/" + "a".repeat(2100)],
  ])("외부·비정상 경로 %j 는 기본 경로로 바꾼다", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  it("로그인 화면 자체로는 돌아가지 않는다(반복 이동 방지)", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/studies/1")).toBe("/");
  });

  it("배열·숫자 같은 비문자열은 거부한다", () => {
    expect(safeNextPath(["/studies/1"] as unknown as string)).toBe("/");
    expect(safeNextPath(1 as unknown as string)).toBe("/");
  });

  it("기본 경로를 바꿀 수 있다", () => {
    expect(safeNextPath("//evil.example", "/studies")).toBe("/studies");
  });
});
