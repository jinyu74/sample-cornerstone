import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_LIMITS } from "@/entities/dicom-study";

/**
 * 이슈 #5 AC1·AC3·AC8: 서버 목록 동기화 Route Handler.
 * 같은 출처·JSON·본문 크기·엄격한 메타데이터 검증 뒤, Auth 서버로 확인한 현재 계정과
 * 요청의 기대 계정을 비교하고 사용자 세션(RLS)으로만 반영한다. 모든 응답은 캐시하지 않는다.
 */
vi.mock("server-only", () => ({}));
const getCurrentUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/shared/auth/server", async () => {
  class AuthServiceError extends Error {}
  return { getCurrentUser, AuthServiceError };
});
vi.mock("@/shared/api/supabase/server", () => ({
  createServerSupabase: async () => ({ rpc }),
}));

const { POST } = await import("@/app/api/catalog/sync/route");
const { AuthServiceError } = await import("@/shared/auth/server");

const ORIGIN = "http://127.0.0.1:3100";
const A = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const B = "8f14e45f-ceea-4e7a-9b1c-00000000000b";
const D = "1".padStart(64, "0");

const body = (extra: object = {}) => ({
  expectedUserId: A,
  study: {
    studyInstanceUid: "2.25.1",
    accessionNumber: "SYN-ACC",
    series: [
      {
        seriesInstanceUid: "2.25.10",
        modality: "CT",
        instances: [{ sopInstanceUid: "2.25.101", contentDigest: D }],
      },
    ],
    ...extra,
  },
});

function request(
  payload: BodyInit | null = JSON.stringify(body()),
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${ORIGIN}/api/catalog/sync`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      host: "127.0.0.1:3100",
      "content-type": "application/json",
      ...headers,
    },
    body: payload,
    // 스트림 본문(길이 헤더 없음)
    ...(payload instanceof ReadableStream ? { duplex: "half" } : {}),
  } as ConstructorParameters<typeof NextRequest>[1]);
}

async function call(req: NextRequest) {
  const response = await POST(req);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: A, email: "a@example.test" });
  rpc.mockResolvedValue({
    data: { studyInstanceUid: "2.25.1", seriesCount: 1, instanceCount: 1 },
    error: null,
  });
});
afterEach(() => {
  getCurrentUser.mockReset();
  rpc.mockReset();
});

describe("POST /api/catalog/sync", () => {
  it("정상 요청은 현재 계정 세션으로 검증된 값만 반영하고 서버가 센 수를 돌려준다", async () => {
    expect(await call(request())).toEqual({
      status: 200,
      json: { status: "synced", seriesCount: 1, instanceCount: 1 },
    });
    expect(rpc).toHaveBeenCalledWith("sync_catalog_study", {
      p_expected_owner: A,
      p_study: body().study,
    });
  });

  it("다른 출처의 요청은 403 이고 DB 에 닿지 않는다", async () => {
    expect(
      await call(request(undefined, { origin: "http://evil.example" })),
    ).toMatchObject({ status: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("JSON 이 아니면 415", async () => {
    expect(
      await call(request(undefined, { "content-type": "text/plain" })),
    ).toMatchObject({ status: 415 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("본문 길이 헤더가 상한을 넘으면 읽지 않고 413", async () => {
    expect(
      await call(
        request(undefined, {
          "content-length": String(CATALOG_LIMITS.maxBodyBytes + 1),
        }),
      ),
    ).toMatchObject({ status: 413 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("길이 헤더 없이 흘려보낸 본문도 상한을 넘으면 413(파일·픽셀 크기 본문 차단)", async () => {
    const piece = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > CATALOG_LIMITS.maxBodyBytes * 4) return controller.close();
        sent += piece.byteLength;
        controller.enqueue(piece);
      },
    });
    expect(await call(request(stream))).toMatchObject({ status: 413 });
    expect(sent).toBeLessThan(CATALOG_LIMITS.maxBodyBytes * 4);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("JSON 형식 오류는 400", async () => {
    expect(await call(request("{not json"))).toMatchObject({ status: 400 });
  });

  it("알 수 없는 필드(픽셀)는 400 으로 거부하고 DB 에 닿지 않는다", async () => {
    expect(
      await call(request(JSON.stringify(body({ pixelData: "AAAA" })))),
    ).toEqual({
      status: 400,
      json: {
        status: "invalid",
        path: "$.study.pixelData",
        problem: "unknown-key",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 401", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await call(request())).toEqual({
      status: 401,
      json: { status: "unauthenticated" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("A 화면에서 만든 요청이 B 로그인 뒤 도착하면 409 account-mismatch 이고 B 에 쓰지 않는다", async () => {
    getCurrentUser.mockResolvedValue({ id: B, email: "b@example.test" });
    expect(await call(request())).toEqual({
      status: 409,
      json: { status: "account-mismatch" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("DB 충돌은 409 와 종류를 알린다", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "instance-conflict" },
    });
    expect(await call(request())).toEqual({
      status: 409,
      json: { status: "conflict", kind: "instance" },
    });
  });

  it("인증 서비스·DB 장애는 성공으로 보이지 않게 503", async () => {
    getCurrentUser.mockRejectedValue(new AuthServiceError("down"));
    expect(await call(request())).toEqual({
      status: 503,
      json: { status: "unavailable" },
    });
    getCurrentUser.mockResolvedValue({ id: A, email: null });
    rpc.mockResolvedValue({
      data: null,
      error: { code: "", message: "fetch failed" },
    });
    expect(await call(request())).toEqual({
      status: 503,
      json: { status: "unavailable" },
    });
  });
});
