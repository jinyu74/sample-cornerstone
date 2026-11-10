// @vitest-environment node
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openOriginalStore } from "./original-store";

/**
 * 감독 지적(이슈 #7): 공개 서버 진입점의 목록 DAL 은 호출자가 넘긴 owner 값을 권한 근거로 쓰지 않는다.
 * 현재 요청의 Auth 계정만 본다(실제 FS, Auth 는 대역).
 */
vi.mock("server-only", () => ({}));
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/shared/auth/server", () => ({
  getCurrentUser,
  AuthServiceError: class AuthServiceError extends Error {},
}));
vi.mock("@/shared/api/supabase/server", () => ({
  createServerSupabase: async () => ({}),
}));

const { listStoredOriginals } = await import("./server-originals");

const A = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const B = "8f14e45f-ceea-4e7a-9b1c-00000000000b";
let base: string;

async function seed(owner: string, sop: string) {
  const store = await openOriginalStore(
    {
      root: path.join(base, "store"),
      maxFileBytes: 1024,
      uploadConcurrency: 1,
    },
    { projectRoot: process.cwd() },
  );
  const received = await store.receive(
    owner,
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${owner}:${sop}`));
        controller.close();
      },
    }),
  );
  await store.publish(owner, received, sop);
  await store.discard(received);
  return received.digest;
}

beforeEach(async () => {
  base = await realpath(
    await mkdtemp(path.join(tmpdir(), "server-originals-")),
  );
  process.env.DICOM_DATA_DIR = path.join(base, "store");
});
afterEach(async () => {
  delete process.env.DICOM_DATA_DIR;
  getCurrentUser.mockReset();
  await rm(base, { recursive: true, force: true });
});

describe("listStoredOriginals: 현재 계정의 서버 보관 원본만", () => {
  it("A 세션에서 B 를 owner 로 넘겨도 B 의 원본이 아니라 A 의 원본만 돌려준다", async () => {
    const digestA = await seed(A, "2.25.1");
    await seed(B, "2.25.2");
    getCurrentUser.mockResolvedValue({ id: A, email: null });
    const list = listStoredOriginals as (
      owner?: string,
    ) => ReturnType<typeof listStoredOriginals>;
    expect(await list(B)).toEqual({
      status: "ready",
      stored: new Map([["2.25.1", digestA]]),
    });
  });

  it("로그인하지 않았으면 unauthenticated 이고 파일을 읽지 않는다", async () => {
    await seed(A, "2.25.1");
    getCurrentUser.mockResolvedValue(null);
    expect(await listStoredOriginals()).toEqual({ status: "unauthenticated" });
  });

  it("설정이 없으면 unconfigured", async () => {
    delete process.env.DICOM_DATA_DIR;
    getCurrentUser.mockResolvedValue({ id: A, email: null });
    expect(await listStoredOriginals()).toEqual({ status: "unconfigured" });
  });
});
