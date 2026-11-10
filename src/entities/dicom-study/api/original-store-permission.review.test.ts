// @vitest-environment node
import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { openOriginalStore } from "./original-store";

it("상위 폴더 탐색 권한이 없어도 경로 없는 저장소 오류로 실패한다", async () => {
  const parent = await mkdtemp(
    path.join(await realpath(tmpdir()), "original-permission-review-"),
  );
  try {
    await chmod(parent, 0o000);
    await expect(
      openOriginalStore(
        {
          root: path.join(parent, "private"),
          maxFileBytes: 2048,
          uploadConcurrency: 1,
        },
        { projectRoot: process.cwd() },
      ),
    ).rejects.toMatchObject({
      name: "OriginalStoreError",
      code: "storage-unavailable",
      message: "storage-unavailable",
    });
  } finally {
    await chmod(parent, 0o700);
    await rm(parent, { recursive: true, force: true });
  }
});
