import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { writeEnvLocal } from "../../scripts/auth/local-supabase";

it("로컬 연결 설정을 다시 생성해도 다른 환경 변수와 주석은 보존한다", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "dicom-auth-env-review-"),
  );
  const file = path.join(directory, ".env.local");
  try {
    await writeFile(
      file,
      "# App configuration\nDICOM_PRIVATE_ROOT=/data/private/dicom\nSUPABASE_URL=http://127.0.0.1:1\nSUPABASE_PUBLISHABLE_KEY=old-local-key\n",
    );
    await writeEnvLocal(
      {
        apiUrl: "http://127.0.0.1:55321",
        publishableKey: "new-public-test-key",
        secretKey: "test-secret-must-never-be-written",
      },
      file,
    );
    const contents = await readFile(file, "utf8");
    expect(contents).toContain("# App configuration");
    expect(contents).toContain("DICOM_PRIVATE_ROOT=/data/private/dicom");
    expect(contents).toContain("SUPABASE_URL=http://127.0.0.1:55321");
    expect(contents).toContain("SUPABASE_PUBLISHABLE_KEY=new-public-test-key");
    expect(contents).not.toContain("test-secret-must-never-be-written");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
