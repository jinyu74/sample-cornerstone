import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertLocalSupabaseUrl,
  generatePassword,
  parseSupabaseStatus,
  secretFilePath,
  writeEnvLocal,
} from "../../scripts/auth/local-supabase";

describe("로컬 Supabase 관리 스크립트 보호 장치", () => {
  it.each([
    "http://127.0.0.1:55321",
    "http://localhost:55321",
    "http://[::1]:55321",
  ])("로컬 주소 %s 만 관리 작업을 허용한다", (url) => {
    expect(() => assertLocalSupabaseUrl(url)).not.toThrow();
  });

  it.each([
    "https://project.supabase.co",
    "http://192.168.0.10:55321",
    "http://127.0.0.1.evil.example:55321",
    "not a url",
    "",
  ])("원격·비정상 주소 %j 에는 서비스 키를 쓰지 않는다", (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(/로컬/);
  });

  it("status 출력에서 필요한 값만 읽고 누락되면 실패한다", () => {
    expect(
      parseSupabaseStatus(
        JSON.stringify({
          API_URL: "http://127.0.0.1:55321",
          PUBLISHABLE_KEY: "pub",
          SECRET_KEY: "sec",
          JWT_SECRET: "ignored",
        }),
      ),
    ).toEqual({
      apiUrl: "http://127.0.0.1:55321",
      publishableKey: "pub",
      secretKey: "sec",
    });
    expect(() =>
      parseSupabaseStatus(JSON.stringify({ API_URL: "http://127.0.0.1:1" })),
    ).toThrow(/supabase start/);
    expect(() => parseSupabaseStatus("not json")).toThrow(/supabase start/);
  });

  it("비밀번호는 충분히 길고 매번 다르다", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
});

describe("writeEnvLocal: 자기 소유 키만 갱신", () => {
  async function tempFile(initial?: string) {
    const directory = await mkdtemp(path.join(tmpdir(), "dicom-auth-env-"));
    const file = path.join(directory, ".env.local");
    if (initial !== undefined) await writeFile(file, initial);
    return { directory, file };
  }
  const status = {
    apiUrl: "http://127.0.0.1:55321",
    publishableKey: "pub-1",
    secretKey: "secret-never-written",
  };

  it("파일이 없으면 만들고, 반복 실행해도 키가 중복되지 않는다", async () => {
    const { directory, file } = await tempFile();
    try {
      await writeEnvLocal(status, file);
      await writeEnvLocal({ ...status, publishableKey: "pub-2" }, file);
      const text = await readFile(file, "utf8");
      expect(text.match(/^SUPABASE_URL=/gm)).toHaveLength(1);
      expect(text.match(/^SUPABASE_PUBLISHABLE_KEY=/gm)).toHaveLength(1);
      expect(text).toContain("SUPABASE_PUBLISHABLE_KEY=pub-2");
      expect(text).not.toContain("secret-never-written");
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("다른 설정의 순서와 주석, 빈 줄을 그대로 둔다", async () => {
    const before = "# 앱\nA=1\n\n# 인증\nSUPABASE_URL=http://old\nB=2\n";
    const { directory, file } = await tempFile(before);
    try {
      await writeEnvLocal(status, file);
      expect(await readFile(file, "utf8")).toBe(
        "# 앱\nA=1\n\n# 인증\nSUPABASE_URL=http://127.0.0.1:55321\nB=2\nSUPABASE_PUBLISHABLE_KEY=pub-1\n",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("secretFilePath: 비밀번호 파일 경로 경계", () => {
  const base = path.join(tmpdir(), "auth-secrets");
  it.each([
    "reader@example.test",
    "../../etc/passwd@example.test",
    "a/b@example.test",
    "..",
    ".hidden@example.test",
    "a\\b@example.test",
  ])("%j 도 지정한 폴더 바로 아래의 일반 파일이 된다", (email) => {
    const file = secretFilePath(base, email);
    expect(path.dirname(file)).toBe(base);
    expect(path.basename(file).startsWith(".")).toBe(false);
    expect(path.basename(file)).not.toContain("/");
    expect(path.basename(file)).not.toContain("\\");
  });

  it("같은 이메일은 같은 파일, 다른 이메일은 다른 파일", () => {
    expect(secretFilePath(base, "a@example.test")).toBe(
      secretFilePath(base, "a@example.test"),
    );
    expect(secretFilePath(base, "a/b@example.test")).not.toBe(
      secretFilePath(base, "a_b@example.test"),
    );
  });
});
