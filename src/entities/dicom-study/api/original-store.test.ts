// @vitest-environment node
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  OriginalStoreError,
  openOriginalStore,
  type OriginalStore,
} from "./original-store";

/**
 * 이슈 #7 AC3·AC4: 서버 비공개 폴더의 원본 저장소(실제 파일 시스템).
 * 실행마다 새 임시 루트만 쓰고, 끝나면 그 루트만 지운다.
 */
const A = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const B = "8f14e45f-ceea-4e7a-9b1c-00000000000b";
const SOP = "2.25.400001";
const MAX = 64 * 1024;
const mode = async (file: string) => (await stat(file)).mode & 0o777;
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function bytes(size: number, fill = 7) {
  return new Uint8Array(size).fill(fill);
}

function streamOf(
  chunks: Uint8Array[],
  { failAfter }: { failAfter?: number } = {},
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (failAfter !== undefined && index === failAfter) {
        controller.error(new Error("client aborted"));
        return;
      }
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}

let base: string;
let root: string;
let project: string;

beforeEach(async () => {
  // macOS 의 tmpdir(/var/…)는 symlink 경로라 정규 경로로 바꿔 쓴다(설정은 정규 경로를 요구)
  base = await realpath(
    await mkdtemp(path.join(tmpdir(), "dicom-originals-test-")),
  );
  root = path.join(base, "originals");
  project = path.join(base, "project");
  await mkdir(project);
});
afterEach(async () => {
  // 권한을 바꾼 테스트 디렉터리도 지울 수 있게 되돌린 뒤 이 실행의 루트만 지운다
  await chmod(base, 0o700).catch(() => undefined);
  await rm(base, { recursive: true, force: true });
});

const open = (dir = root) =>
  openOriginalStore(
    { root: dir, maxFileBytes: MAX, uploadConcurrency: 2 },
    { projectRoot: project },
  );

async function store(
  target: OriginalStore,
  owner: string,
  content: Uint8Array,
  sop = SOP,
) {
  const received = await target.receive(owner, streamOf([content]));
  try {
    return await target.publish(owner, received, sop);
  } finally {
    await target.discard(received);
  }
}

describe("openOriginalStore: 저장 루트 검증(fail-closed)", () => {
  it("루트가 없으면 0700 으로 만들고 v1 배치(tmp·users)를 준비한다", async () => {
    await open();
    expect(await mode(root)).toBe(0o700);
    expect(await mode(path.join(root, "v1"))).toBe(0o700);
    expect((await readdir(path.join(root, "v1"))).sort()).toEqual([
      "tmp",
      "users",
    ]);
  });

  it("이미 있는 루트의 다른 내용·권한은 바꾸지 않는다", async () => {
    await mkdir(root, { mode: 0o700 });
    await writeFile(path.join(root, "keep.txt"), "user file", { mode: 0o644 });
    await open();
    expect(await readFile(path.join(root, "keep.txt"), "utf8")).toBe(
      "user file",
    );
    expect(await mode(path.join(root, "keep.txt"))).toBe(0o644);
    expect(await mode(root)).toBe(0o700);
  });

  it("다른 사용자가 쓸 수 있는 기존 루트는 권한을 고치지 않고 거부한다", async () => {
    await mkdir(root);
    await chmod(root, 0o777);
    await expect(open()).rejects.toMatchObject({ code: "unsafe-root" });
    expect(await mode(root)).toBe(0o777);
  });

  it("그룹·기타 접근 권한이 있는 기존 루트는 읽기만 허용돼도 거부하고 권한을 바꾸지 않는다", async () => {
    await mkdir(root);
    await chmod(root, 0o750);
    await expect(open()).rejects.toMatchObject({ code: "unsafe-root" });
    expect(await mode(root)).toBe(0o750);
  });

  it("이미 있는 관리 하위 폴더(v1/tmp)가 private 이 아니면 거부하고 권한을 바꾸지 않는다", async () => {
    await mkdir(path.join(root, "v1", "tmp"), { recursive: true, mode: 0o700 });
    await chmod(root, 0o700);
    await chmod(path.join(root, "v1"), 0o700);
    await chmod(path.join(root, "v1", "tmp"), 0o755);
    await expect(open()).rejects.toMatchObject({ code: "unsafe-root" });
    expect(await mode(path.join(root, "v1", "tmp"))).toBe(0o755);
  });

  it("루트 자체나 경로 중간이 symlink 면 거부한다", async () => {
    const real = path.join(base, "real");
    await mkdir(real, { mode: 0o700 });
    await symlink(real, root);
    await expect(open()).rejects.toMatchObject({ code: "unsafe-root" });
    const linkedParent = path.join(base, "linked");
    await symlink(real, linkedParent);
    await expect(open(path.join(linkedParent, "inner"))).rejects.toMatchObject({
      code: "unsafe-root",
    });
  });

  it.each(["", "public", ".next", "src", "node_modules", "public/originals"])(
    "프로젝트 루트/%s 아래는 정적·빌드 경로라 거부한다",
    async (inside) => {
      await expect(open(path.join(project, inside))).rejects.toMatchObject({
        code: "unsafe-root",
      });
    },
  );
});

describe("receive: 스트림 수신과 상한", () => {
  it("본문을 임시 파일(0600)에 받고 서버가 계산한 SHA-256·크기를 돌려준다", async () => {
    const target = await open();
    const content = bytes(3000);
    const received = await target.receive(
      A,
      streamOf([content.subarray(0, 1000), content.subarray(1000)]),
    );
    expect(received.digest).toBe(sha(content));
    expect(received.size).toBe(3000);
    expect(received.bytes).toEqual(content);
    await target.discard(received);
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it("길이 헤더 없이 상한을 넘으면 too-large 이고 부분 파일을 남기지 않는다", async () => {
    const target = await open();
    const chunk = bytes(16 * 1024);
    await expect(
      target.receive(A, streamOf([chunk, chunk, chunk, chunk, chunk])),
    ).rejects.toMatchObject({ code: "too-large" });
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it("업로드가 중간에 끊기면 aborted 이고 부분 파일을 남기지 않는다", async () => {
    const target = await open();
    await expect(
      target.receive(A, streamOf([bytes(100), bytes(100)], { failAfter: 1 })),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });
});

describe("publish: 원자적 공개·멱등·충돌·격리", () => {
  it("완성된 원본만 서버가 정한 이름(0600)으로 공개하고 목록에 나타난다", async () => {
    const target = await open();
    const content = bytes(500);
    expect(await store(target, A, content)).toBe("stored");
    const dir = path.join(root, "v1", "users", A, "instances");
    const [name] = await readdir(dir);
    expect(name).toBe(`${SOP}.${sha(content)}.dcm`);
    expect(await mode(path.join(dir, name!))).toBe(0o600);
    expect(await mode(dir)).toBe(0o700);
    expect(await target.list(A)).toEqual(new Map([[SOP, sha(content)]]));
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it("같은 owner 의 같은 원본을 동시에 5번 보관해도 모두 성공하고 파일은 하나다", async () => {
    const target = await open();
    const content = bytes(800);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store(target, A, content)),
    );
    expect(results.filter((r) => r === "stored")).toHaveLength(1);
    expect(results.filter((r) => r === "already-stored")).toHaveLength(4);
    expect(
      await readdir(path.join(root, "v1", "users", A, "instances")),
    ).toHaveLength(1);
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it("같은 SOP 의 다른 내용은 conflict 이고 기존 원본을 그대로 둔다", async () => {
    const target = await open();
    const first = bytes(500, 1);
    await store(target, A, first);
    await expect(store(target, A, bytes(500, 2))).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await target.list(A)).toEqual(new Map([[SOP, sha(first)]]));
    const file = path.join(
      root,
      "v1",
      "users",
      A,
      "instances",
      `${SOP}.${sha(first)}.dcm`,
    );
    expect(await readFile(file)).toEqual(Buffer.from(first));
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it("같은 이름의 기존 파일 내용이 손상돼 있으면 보관됨으로 세지 않고 기존 파일을 덮어쓰지 않는다", async () => {
    const target = await open();
    const content = bytes(300, 4);
    const dir = path.join(root, "v1", "users", A, "instances");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(path.join(root, "v1", "users", A), 0o700);
    const name = path.join(dir, `${SOP}.${sha(content)}.dcm`);
    await writeFile(name, "damaged", { mode: 0o600 });
    await expect(store(target, A, content)).rejects.toMatchObject({
      code: "corrupt",
    });
    expect(await readFile(name, "utf8")).toBe("damaged");
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it.each([
    ["디렉터리", async (file: string) => mkdir(file, { mode: 0o700 })],
    [
      "symlink",
      async (file: string) => {
        const other = path.join(base, "other.dcm");
        await writeFile(other, "x");
        await symlink(other, file);
      },
    ],
  ])(
    "원본 이름 자리에 %s 가 있으면 보관됨으로 세지 않는다",
    async (_kind, plant) => {
      const target = await open();
      const content = bytes(30, 6);
      const dir = path.join(root, "v1", "users", A, "instances");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await chmod(path.join(root, "v1", "users", A), 0o700);
      await plant(path.join(dir, `${SOP}.${sha(content)}.dcm`));
      await expect(store(target, A, content)).rejects.toMatchObject({
        code: "corrupt",
      });
      expect(await target.list(A)).toEqual(new Map());
    },
  );

  it("다른 사용자가 접근할 수 있는 기존 사용자 폴더에는 쓰지 않는다(권한을 바꾸지 않음)", async () => {
    const target = await open();
    const userDir = path.join(root, "v1", "users", A);
    await mkdir(userDir, { mode: 0o700 });
    await chmod(userDir, 0o755);
    await expect(store(target, A, bytes(10))).rejects.toMatchObject({
      code: "storage-unavailable",
    });
    await expect(target.list(A)).rejects.toMatchObject({
      code: "storage-unavailable",
    });
    expect(await mode(userDir)).toBe(0o755);
  });

  it("A 와 B 의 같은 UID 원본은 서로 다른 폴더에 격리된다", async () => {
    const target = await open();
    await store(target, A, bytes(100, 1));
    await store(target, B, bytes(100, 2));
    expect(await target.list(A)).toEqual(new Map([[SOP, sha(bytes(100, 1))]]));
    expect(await target.list(B)).toEqual(new Map([[SOP, sha(bytes(100, 2))]]));
  });

  it.each([
    ["owner 가 UUID 가 아님", "../" + A, SOP],
    ["SOP UID 에 경로 조작", A, "../../etc/passwd"],
    ["SOP UID 에 구분자", A, "2.25.1/2"],
  ])("%s 는 파일 시스템에 닿기 전에 거부한다", async (_name, owner, sop) => {
    const target = await open();
    const received = await target.receive(A, streamOf([bytes(10)]));
    await expect(target.publish(owner, received, sop)).rejects.toMatchObject({
      code: "invalid",
    });
    await target.discard(received);
    expect(await readdir(path.join(root, "v1", "users"))).toEqual([]);
  });

  it("사용자 폴더 자리에 심어 둔 symlink 를 따라 쓰지 않는다", async () => {
    const target = await open();
    const outside = path.join(base, "outside");
    await mkdir(outside, { mode: 0o700 });
    await symlink(outside, path.join(root, "v1", "users", A));
    await expect(store(target, A, bytes(10))).rejects.toMatchObject({
      code: "storage-unavailable",
    });
    expect(await readdir(outside)).toEqual([]);
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });

  it("공개 단계의 디스크 쓰기 실패는 성공으로 보이지 않고 임시 파일을 정리한다", async () => {
    if (process.getuid?.() === 0) return; // root 는 권한 검사를 우회하므로 실제 결함과 구분할 수 없다
    const target = await open();
    await store(target, A, bytes(10, 1), "2.25.1");
    const dir = path.join(root, "v1", "users", A, "instances");
    await chmod(dir, 0o500);
    try {
      await expect(
        store(target, A, bytes(10, 2), "2.25.2"),
      ).rejects.toMatchObject({ code: "storage-unavailable" });
    } finally {
      await chmod(dir, 0o700);
    }
    expect(await target.list(A)).toEqual(
      new Map([["2.25.1", sha(bytes(10, 1))]]),
    );
    expect(await readdir(path.join(root, "v1", "tmp"))).toEqual([]);
  });
});

describe("open: 소유자 원본 읽기", () => {
  async function read(stream: ReadableStream<Uint8Array>) {
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  it("저장한 바이트 그대로 스트림으로 읽고, 없는 원본·다른 계정은 null 이다", async () => {
    const target = await open();
    const content = bytes(2000, 9);
    await store(target, A, content);
    const found = await target.open(A, SOP, sha(content));
    expect(found?.size).toBe(2000);
    expect(await read(found!.stream)).toEqual(content);
    expect(await target.open(B, SOP, sha(content))).toBeNull();
    expect(await target.open(A, "2.25.9", sha(content))).toBeNull();
    expect(await target.open(A, SOP, sha(bytes(1)))).toBeNull();
  });

  it("내용이 이름의 digest 와 다른(손상된) 원본은 읽기 스트림이 오류로 끝나 정상 원본처럼 쓰이지 않는다", async () => {
    const target = await open();
    const content = bytes(4000, 3);
    await store(target, A, content);
    const file = path.join(
      root,
      "v1",
      "users",
      A,
      "instances",
      `${SOP}.${sha(content)}.dcm`,
    );
    await chmod(file, 0o600);
    await writeFile(file, bytes(4000, 8));
    const found = await target.open(A, SOP, sha(content));
    await expect(read(found!.stream)).rejects.toThrow();
  });

  it("원본 이름 자리에 심어 둔 symlink 는 열지 않는다", async () => {
    const target = await open();
    const secret = path.join(base, "secret.txt");
    await writeFile(secret, "not yours");
    const digest = sha(bytes(5));
    const dir = path.join(root, "v1", "users", A, "instances");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await symlink(secret, path.join(dir, `${SOP}.${digest}.dcm`));
    expect(await target.open(A, SOP, digest)).toBeNull();
    expect((await lstat(secret)).isFile()).toBe(true);
  });
});

it("오류 코드는 경로를 담지 않는다", () => {
  const error = new OriginalStoreError("storage-unavailable");
  expect(error.message).not.toContain("/");
});
