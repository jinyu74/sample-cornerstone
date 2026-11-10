// @vitest-environment node
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * E2E 서버 원본 루트의 소유권: 이번 실행이 직접 만든 루트(실행별 토큰 표식)만 정리한다.
 * 이 테스트는 자기 실행에서 만든 임시 폴더만 쓴다.
 */
const base = path.resolve(".local/e2e");
let target: string;

beforeEach(async () => {
  vi.resetModules();
  await mkdir(base, { recursive: true });
  target = path.join(
    base,
    `originals-ownership-test-${process.pid}-${Date.now()}`,
  );
  vi.stubEnv("E2E_ORIGINALS_DIR", target);
  vi.stubEnv("E2E_ORIGINALS_TOKEN", `token-${Math.random()}`);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(target, { recursive: true, force: true });
});

describe("E2E 원본 루트 소유권", () => {
  it("이번 실행이 새로 만든 루트(0700)는 teardown 이 지운다", async () => {
    const paths = await import("../e2e/originals-paths");
    await paths.claimOriginalsRoot();
    expect((await stat(target)).mode & 0o777).toBe(0o700);
    expect(await paths.ownsOriginalsRoot()).toBe(true);
    const { default: teardown } = await import("../e2e/global-teardown");
    await teardown();
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("이미 있던 폴더는 소유권을 주장하지 않는다(만들기 실패·표식 없음)", async () => {
    await mkdir(target);
    await writeFile(path.join(target, "keep.txt"), "earlier");
    const paths = await import("../e2e/originals-paths");
    await expect(paths.claimOriginalsRoot()).rejects.toThrow();
    expect(await paths.ownsOriginalsRoot()).toBe(false);
    expect(await readdir(target)).toEqual(["keep.txt"]);
  });

  it("표식의 토큰이 이번 실행과 다르면 소유하지 않은 것으로 본다", async () => {
    const paths = await import("../e2e/originals-paths");
    await paths.claimOriginalsRoot();
    vi.stubEnv("E2E_ORIGINALS_TOKEN", "another-run");
    vi.resetModules();
    const other = await import("../e2e/originals-paths");
    expect(await other.ownsOriginalsRoot()).toBe(false);
  });

  it("소유하지 않은 루트에서는 테스트별 부분 정리도 하지 않고 실패한다", async () => {
    await mkdir(path.join(target, "v1", "users", "someone"), {
      recursive: true,
    });
    const paths = await import("../e2e/originals-paths");
    await expect(paths.removeOwnedUserDirs(["someone"])).rejects.toThrow();
    expect(await readdir(path.join(target, "v1", "users"))).toEqual([
      "someone",
    ]);
  });

  it("소유한 루트에서는 지정한 합성 계정 폴더만 지운다", async () => {
    const paths = await import("../e2e/originals-paths");
    await paths.claimOriginalsRoot();
    await mkdir(path.join(target, "v1", "users", "a"), { recursive: true });
    await mkdir(path.join(target, "v1", "users", "other"), { recursive: true });
    await paths.removeOwnedUserDirs(["a"]);
    expect(await readdir(path.join(target, "v1", "users"))).toEqual(["other"]);
  });

  it("claim 에 성공한 실행의 환경을 이어받은 워커(새 모듈)도 소유를 인정받아 합성 계정 폴더만 정리한다", async () => {
    const setup = await import("../e2e/originals-paths");
    await setup.claimOriginalsRoot();
    await mkdir(path.join(target, "v1", "users", "a"), { recursive: true });
    vi.resetModules();
    const worker = await import("../e2e/originals-paths");
    expect(await worker.ownsOriginalsRoot()).toBe(true);
    await worker.removeOwnedUserDirs(["a"]);
    expect(await readdir(path.join(target, "v1", "users"))).toEqual([]);
  });
});
