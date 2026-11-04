import { describe, expect, it, vi } from "vitest";

import { CATALOG_SYNC_ENDPOINT, postCatalogStudy } from "./post-catalog-study";

const request = {
  expectedUserId: "8f14e45f-ceea-4e7a-9b1c-00000000000a",
  study: {
    studyInstanceUid: "2.25.1",
    series: [
      {
        seriesInstanceUid: "2.25.10",
        instances: [
          { sopInstanceUid: "2.25.101", contentDigest: "1".padStart(64, "0") },
        ],
      },
    ],
  },
};

const respond = (status: number, body: unknown, type = "application/json") =>
  vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": type },
      }),
  );

describe("postCatalogStudy", () => {
  it("같은 출처 JSON POST 로 보내고(캐시·리다이렉트 없음) 서버 결과를 돌려준다", async () => {
    const fetcher = respond(200, {
      status: "synced",
      seriesCount: 1,
      instanceCount: 1,
    });
    expect(await postCatalogStudy(request, fetcher)).toEqual({
      status: "synced",
      seriesCount: 1,
      instanceCount: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(CATALOG_SYNC_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  });

  it.each([
    [409, { status: "account-mismatch" }, { status: "account-mismatch" }],
    [
      409,
      { status: "conflict", kind: "series" },
      { status: "conflict", kind: "series" },
    ],
    [401, { status: "unauthenticated" }, { status: "unauthenticated" }],
    [
      400,
      { status: "invalid", path: "$", problem: "type" },
      { status: "invalid" },
    ],
    [413, { status: "too-large" }, { status: "invalid" }],
    [503, { status: "unavailable" }, { status: "unavailable" }],
    [200, { status: "weird" }, { status: "unavailable" }],
    [200, "<html>login</html>", { status: "unavailable" }, "text/html"],
    [200, { status: "synced", seriesCount: "1" }, { status: "unavailable" }],
  ])(
    "%i %j → %j (알 수 없는 응답은 성공으로 보지 않는다)",
    async (status, body, expected, type?: string) => {
      expect(
        await postCatalogStudy(request, respond(status, body, type)),
      ).toEqual(expected);
    },
  );
});
