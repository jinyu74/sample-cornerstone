// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

let existing: string;
beforeEach(async () => {
  vi.resetModules();
  await mkdir(path.resolve(".local/e2e"), { recursive: true });
  existing = await mkdtemp(
    path.resolve(".local/e2e/originals-unowned-review-"),
  );
  await writeFile(path.join(existing, "keep.txt"), "belongs-to-an-earlier-run");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(existing, { recursive: true, force: true });
});

it("E2E 환경변수가 이미 있는 폴더를 가리켜도 이번 실행이 만들지 않은 원본 루트를 삭제하지 않는다", async () => {
  vi.stubEnv("E2E_ORIGINALS_DIR", existing);
  const { default: teardown } = await import("../e2e/global-teardown");
  await teardown();
  expect(await readFile(path.join(existing, "keep.txt"), "utf8")).toBe(
    "belongs-to-an-earlier-run",
  );
});

it("이번 실행이 실제 새로 만든 원본 루트는 정상 종료 때 정리한다", async () => {
  await rm(existing, { recursive: true, force: true }); // 이 unit 테스트가 만든 임시 폴더만 비운다.
  vi.stubEnv("E2E_ORIGINALS_DIR", existing);
  const { claimOriginalsRoot } = await import("../e2e/originals-paths");
  await claimOriginalsRoot();
  await writeFile(path.join(existing, "keep.txt"), "this-run");
  const { default: teardown } = await import("../e2e/global-teardown");
  await teardown();
  await expect(stat(existing)).rejects.toMatchObject({ code: "ENOENT" });
});

it("이전 표식과 같은 토큰이 전달돼도 기존 루트의 생성에 실패한 실행은 삭제 권한을 얻지 않는다", async () => {
  const token = "1".repeat(32);
  await writeFile(path.join(existing, ".e2e-run-owner"), token, {
    mode: 0o600,
  });
  vi.stubEnv("E2E_ORIGINALS_DIR", existing);
  vi.stubEnv("E2E_ORIGINALS_TOKEN", token);
  const { claimOriginalsRoot } = await import("../e2e/originals-paths");
  await expect(claimOriginalsRoot()).rejects.toMatchObject({ code: "EEXIST" });
  const { default: teardown } = await import("../e2e/global-teardown");
  await teardown();
  expect(await readFile(path.join(existing, "keep.txt"), "utf8")).toBe(
    "belongs-to-an-earlier-run",
  );
});
