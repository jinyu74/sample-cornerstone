import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "./same-origin";

const base = { host: "127.0.0.1:3200", protocol: "http:" };

describe("isSameOriginRequest: 상태 변경 요청(로그아웃)의 같은 출처 판정", () => {
  it("scheme·host·port 가 모두 같으면 허용", () => {
    expect(
      isSameOriginRequest({ ...base, origin: "http://127.0.0.1:3200" }),
    ).toBe(true);
  });

  it.each([
    ["다른 사이트", "https://evil.example"],
    ["같은 host 다른 port", "http://127.0.0.1:3100"],
    ["같은 host·port 다른 scheme", "https://127.0.0.1:3200"],
    ["port 생략(기본 80)", "http://127.0.0.1"],
    ["다른 host 이름(localhost)", "http://localhost:3200"],
    ["형식 오류", "not a url"],
    ["null origin(샌드박스·파일)", "null"],
  ])("%s(%s)는 거부", (_name, origin) => {
    expect(isSameOriginRequest({ ...base, origin })).toBe(false);
  });

  it("Host 헤더가 없으면 거부", () => {
    expect(
      isSameOriginRequest({
        origin: "http://127.0.0.1:3200",
        host: null,
        protocol: "http:",
      }),
    ).toBe(false);
  });

  it("Origin 이 없으면 Fetch Metadata 가 same-origin 일 때만 허용", () => {
    expect(
      isSameOriginRequest({
        ...base,
        origin: null,
        secFetchSite: "same-origin",
      }),
    ).toBe(true);
    expect(
      isSameOriginRequest({
        ...base,
        origin: null,
        secFetchSite: "cross-site",
      }),
    ).toBe(false);
    expect(isSameOriginRequest({ ...base, origin: null })).toBe(false);
  });
});
