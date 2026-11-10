// @vitest-environment node
import type * as FsPromises from "node:fs/promises";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR #8 리뷰 P2: 저장 루트 검사(lstat)의 OS 오류(EACCES 등)가 OriginalStoreError 로 정규화되지 않아
 * SSR 목록·GET/PUT 이 미처리 예외로 실패하던 결함. 파일 쓰기 없이 lstat 오류만 주입한다.
 */
const inject = vi.hoisted(() => ({
  match: null as null | ((target: string) => boolean),
  error: null as null | (() => Error),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    lstat: async (target: string, ...rest: unknown[]) => {
      if (inject.match?.(String(target)) && inject.error) throw inject.error();
      return (actual.lstat as (...args: unknown[]) => unknown)(target, ...rest);
    },
  };
});
vi.mock("server-only", () => ({}));
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/shared/auth/server", () => ({
  getCurrentUser,
  AuthServiceError: class AuthServiceError extends Error {},
}));
vi.mock("@/shared/api/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { content_digest: "a".repeat(64) },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

const { openOriginalStore, OriginalStoreError } =
  await import("./original-store");
const { listStoredOriginals, readOriginal, storeOriginal } =
  await import("./server-originals");

const USER = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const eacces = () =>
  Object.assign(new Error("EACCES: permission denied, lstat '/secret/path'"), {
    code: "EACCES",
    errno: -13,
    syscall: "lstat",
    path: "/secret/path",
  });

let base: string;
let root: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), "store-fs-error-")));
  root = path.join(base, "store");
  process.env.DICOM_DATA_DIR = root;
  getCurrentUser.mockResolvedValue({ id: USER, email: null });
});
afterEach(async () => {
  inject.match = null;
  inject.error = null;
  delete process.env.DICOM_DATA_DIR;
  getCurrentUser.mockReset();
  await rm(base, { recursive: true, force: true });
});

const open = () =>
  openOriginalStore(
    { root, maxFileBytes: 1024, uploadConcurrency: 1 },
    { projectRoot: process.cwd() },
  );

describe("저장 루트 검사의 OS 오류", () => {
  it.each([
    ["상위 경로 symlink 검사", () => (target: string) => target === base],
    ["루트 자체 확인", () => (target: string) => target === root],
  ])(
    "%s 의 EACCES 는 storage-unavailable 이고 경로를 담지 않는다",
    async (_name, match) => {
      await mkdir(root, { mode: 0o700 });
      inject.match = match();
      inject.error = eacces;
      const error = await open().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(OriginalStoreError);
      expect(error).toMatchObject({ code: "storage-unavailable" });
      expect(String((error as Error).message)).not.toContain("/");
    },
  );

  it("금지 폴더(프로젝트 public 등) 확인이 EACCES 로 실패하면 없는 것으로 보고 통과시키지 않는다(fail-closed)", async () => {
    inject.match = (target) => target === path.join(process.cwd(), "public");
    inject.error = eacces;
    await expect(open()).rejects.toMatchObject({ code: "storage-unavailable" });
  });

  it("OS 오류가 아닌 프로그래밍 오류는 삼키지 않고 그대로 전파한다", async () => {
    inject.match = (target) => target === base;
    inject.error = () => new TypeError("bug");
    await expect(open()).rejects.toBeInstanceOf(TypeError);
  });

  it("기존 unsafe-root 판정은 그대로다(다른 사용자가 쓸 수 있는 루트)", async () => {
    await mkdir(root, { mode: 0o700 });
    const { chmod } = await import("node:fs/promises");
    await chmod(root, 0o777);
    await expect(open()).rejects.toMatchObject({ code: "unsafe-root" });
  });
});

describe("DAL: 루트 검사 OS 오류는 제어된 실패 응답", () => {
  beforeEach(() => {
    inject.match = (target) => target === base;
    inject.error = eacces;
  });

  it("SSR 목록은 unavailable(보관됨 추정 없음)", async () => {
    expect(await listStoredOriginals()).toEqual({ status: "unavailable" });
  });

  it("GET 은 storage-unavailable", async () => {
    expect(
      await readOriginal({ sopInstanceUid: "2.25.1", expectedUserId: USER }),
    ).toEqual({ status: "storage-unavailable" });
  });

  it("PUT 은 storage-unavailable", async () => {
    expect(
      await storeOriginal({
        sopInstanceUid: "2.25.1",
        expectedUserId: USER,
        body: new ReadableStream({ start: (c) => c.close() }),
      }),
    ).toEqual({ status: "storage-unavailable" });
  });
});
