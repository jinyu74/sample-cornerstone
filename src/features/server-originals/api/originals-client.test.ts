import { describe, expect, it, vi } from "vitest";

import { getOriginal, originalUrl, putOriginal } from "./originals-client";

const USER = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("putOriginal", () => {
  it("raw DICOM 을 같은 출처 PUT 으로 보내고(기대 계정·캐시·리다이렉트 없음) 결과를 돌려준다", async () => {
    const fetcher = vi.fn(async () =>
      json(200, {
        status: "stored",
        studyInstanceUid: "2.25.1",
        sopInstanceUid: "2.25.1.1",
      }),
    );
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(await putOriginal("2.25.1.1", bytes, USER, { fetcher })).toEqual({
      status: "stored",
    });
    expect(fetcher).toHaveBeenCalledWith(originalUrl("2.25.1.1"), {
      method: "PUT",
      headers: {
        "content-type": "application/dicom",
        "x-expected-user-id": USER,
      },
      body: bytes,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: undefined,
    });
  });

  it.each([
    [200, { status: "already-stored" }, { status: "already-stored" }],
    [409, { status: "conflict" }, { status: "conflict" }],
    [409, { status: "account-mismatch" }, { status: "account-mismatch" }],
    [401, { status: "unauthenticated" }, { status: "unauthenticated" }],
    [413, { status: "too-large" }, { status: "too-large" }],
    [429, { status: "busy" }, { status: "busy" }],
    [507, { status: "storage-full" }, { status: "storage-full" }],
    [503, { status: "unconfigured" }, { status: "unconfigured" }],
    [200, { status: "weird" }, { status: "unavailable" }],
    [200, "<html>", { status: "unavailable" }],
  ])(
    "%i %j → %j (알 수 없는 응답은 성공이 아니다)",
    async (code, body, expected) => {
      const fetcher = vi.fn(async () =>
        typeof body === "string"
          ? new Response(body, {
              status: code,
              headers: { "content-type": "text/html" },
            })
          : json(code, body),
      );
      expect(
        await putOriginal("2.25.1.1", new ArrayBuffer(1), USER, { fetcher }),
      ).toEqual(expected);
    },
  );

  it("네트워크 오류는 network, 취소는 aborted", async () => {
    expect(
      await putOriginal("2.25.1.1", new ArrayBuffer(1), USER, {
        fetcher: vi.fn(async () =>
          Promise.reject(new TypeError("fetch failed")),
        ),
      }),
    ).toEqual({ status: "network" });
    const controller = new AbortController();
    controller.abort();
    expect(
      await putOriginal("2.25.1.1", new ArrayBuffer(1), USER, {
        signal: controller.signal,
        fetcher: vi.fn(async () =>
          Promise.reject(new DOMException("aborted", "AbortError")),
        ),
      }),
    ).toEqual({ status: "aborted" });
  });
});

describe("getOriginal", () => {
  it("기대 계정과 같은 출처로 받아 바이트를 돌려준다", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([9, 8]), {
          status: 200,
          headers: { "content-type": "application/dicom" },
        }),
    );
    const result = await getOriginal("2.25.1.1", USER, { fetcher });
    expect(result.status).toBe("ok");
    if (result.status === "ok")
      expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([9, 8]));
    expect(fetcher).toHaveBeenCalledWith(originalUrl("2.25.1.1"), {
      method: "GET",
      headers: { "x-expected-user-id": USER },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: undefined,
    });
  });

  it.each([
    [404, { status: "not-found" }, { status: "not-found" }],
    [409, { status: "account-mismatch" }, { status: "account-mismatch" }],
    [200, { status: "ok" }, { status: "unavailable" }],
  ])(
    "%i → %j (DICOM 이 아닌 성공 응답도 실패)",
    async (code, body, expected) => {
      expect(
        await getOriginal("2.25.1.1", USER, {
          fetcher: vi.fn(async () => json(code, body)),
        }),
      ).toEqual(expected);
    },
  );

  it("본문을 읽다 끊기면(서버 무결성 오류 포함) network 이다", async () => {
    const broken = new ReadableStream({
      pull(controller) {
        controller.error(new Error("corrupt"));
      },
    });
    const fetcher = vi.fn(
      async () =>
        new Response(broken, {
          status: 200,
          headers: { "content-type": "application/dicom" },
        }),
    );
    expect(await getOriginal("2.25.1.1", USER, { fetcher })).toEqual({
      status: "network",
    });
  });
});
