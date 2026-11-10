import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { config } = await import("./proxy");

/**
 * 이슈 #7: Proxy 가 실행되는 요청은 본문이 복제·메모리 버퍼링되고 10MB 를 넘으면 잘린다
 * (설치된 next/dist/server/body-streams.js getCloneableBody). 원본 업·다운로드 경로는 Proxy 를 거치지 않는다.
 */
const matches = (pathname: string) =>
  config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));

describe("Proxy matcher", () => {
  it.each([
    "/api/originals/instances/2.25.1",
    "/api/originals/instances/1.2.840.10008.5.1",
  ])(
    "원본 경로 %s 는 Proxy 를 거치지 않는다(본문 복제·10MB 절단 방지)",
    (pathname) => {
      expect(matches(pathname)).toBe(false);
    },
  );

  it.each([
    "/",
    "/login",
    "/studies/2.25.1",
    "/api/catalog/sync",
    "/auth/session",
    "/api/originals-x",
  ])("그 밖의 페이지·인증·API 경로 %s 는 계속 Proxy 를 거친다", (pathname) => {
    expect(matches(pathname)).toBe(true);
  });
});
