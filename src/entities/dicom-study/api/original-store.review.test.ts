// @vitest-environment node
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  open as openFile,
  readFile,
  realpath,
  rm,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OriginalStoreError, openOriginalStore } from "./original-store";

const OWNER = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const SOP = "2.25.998001";
const content = Uint8Array.from(
  { length: 512 },
  (_, index) => (index * 17 + Math.floor(index / 251)) % 256,
);
const digest = createHash("sha256").update(content).digest("hex");
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(await realpath(tmpdir()), "original-review-"));
});
afterEach(async () => {
  await chmod(root, 0o700);
  await rm(root, { recursive: true, force: true });
});
const open = () =>
  openOriginalStore(
    { root, maxFileBytes: 2048, uploadConcurrency: 2 },
    { projectRoot: process.cwd() },
  );
const body = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(content);
      controller.close();
    },
  });
const file = () =>
  path.join(root, "v1", "users", OWNER, "instances", `${SOP}.${digest}.dcm`);

describe("원본 무결성·비공개 권한 감독 회귀", () => {
  it("프로젝트 경로 별칭과 아직 없는 .NEXT 폴더를 조합해도 빌드 경로 저장을 거부한다", async ({
    skip,
  }) => {
    const project = path.join(root, "project");
    await mkdir(project);
    const alias = path.join(root, "PROJECT");
    const actual = await realpath(alias).catch(() => null);
    if (actual === null) {
      skip();
      return;
    }
    expect(actual).toBe(await realpath(project));
    await expect(
      openOriginalStore(
        {
          root: path.join(alias, ".NEXT", "static", "medical"),
          maxFileBytes: 2048,
          uploadConcurrency: 2,
        },
        { projectRoot: project },
      ),
    ).rejects.toBeInstanceOf(OriginalStoreError);
  });

  it("대소문자를 구분하지 않는 파일 시스템에서도 PUBLIC 별칭으로 public 하위 보관을 우회하지 못한다", async ({
    skip,
  }) => {
    const project = path.join(root, "project");
    const publicDir = path.join(project, "public");
    await mkdir(publicDir, { recursive: true });
    const alias = path.join(project, "PUBLIC");
    const actual = await realpath(alias).catch(() => null);
    if (actual === null) {
      skip();
      return;
    } // 대소문자를 구분하는 볼륨에서는 같은 폴더의 별칭이 아니다.
    expect(actual).toBe(await realpath(publicDir));
    await expect(
      openOriginalStore(
        {
          root: path.join(alias, "medical"),
          maxFileBytes: 2048,
          uploadConcurrency: 2,
        },
        { projectRoot: project },
      ),
    ).rejects.toBeInstanceOf(OriginalStoreError);
  });

  it("OS 쓰기가 요청한 바이트 일부만 기록해도 전체 원본을 빠짐없이 보관한다", async () => {
    const store = await open();
    const probe = await openFile(path.join(root, "probe"), "w");
    const prototype = Object.getPrototypeOf(probe) as {
      write: (
        buffer: Uint8Array,
        offset?: number,
        length?: number,
      ) => Promise<{ bytesWritten: number; buffer: Uint8Array }>;
    };
    const originalWrite = prototype.write;
    await probe.close();
    const partial = vi.spyOn(prototype, "write").mockImplementation(function (
      this: FileHandle,
      buffer,
      offset = 0,
      length = buffer.byteLength - offset,
    ) {
      return originalWrite.call(
        this,
        buffer.subarray(offset, offset + Math.max(1, Math.floor(length / 2))),
      );
    });
    try {
      const received = await store.receive(OWNER, body());
      try {
        await store.publish(OWNER, received, SOP);
        expect(await readFile(file())).toEqual(Buffer.from(content));
      } finally {
        await store.discard(received);
      }
    } finally {
      partial.mockRestore();
    }
  });

  it("기존 루트가 다른 OS 사용자에게 읽기·탐색 가능하면 권한을 바꾸지 않고 거부한다", async () => {
    await chmod(root, 0o755);
    await expect(open()).rejects.toBeInstanceOf(OriginalStoreError);
  });

  it("동일한 digest 파일명이 있어도 실제 내용이 다르면 보관 성공으로 보지 않고 기존 파일을 보존한다", async () => {
    const store = await open();
    const first = await store.receive(OWNER, body());
    await store.publish(OWNER, first, SOP);
    await store.discard(first);
    const corrupt = new Uint8Array(content.length).fill(99);
    await writeFile(file(), corrupt);
    const retry = await store.receive(OWNER, body());
    try {
      await expect(store.publish(OWNER, retry, SOP)).rejects.toBeInstanceOf(
        OriginalStoreError,
      );
      expect(await readFile(file())).toEqual(Buffer.from(corrupt));
    } finally {
      await store.discard(retry);
    }
  });

  it("보관 뒤 손상된 원본을 정상 원본인 것처럼 읽기 응답으로 제공하지 않는다", async () => {
    const store = await open();
    const received = await store.receive(OWNER, body());
    await store.publish(OWNER, received, SOP);
    await store.discard(received);
    const valid = await store.open(OWNER, SOP, digest);
    expect(
      new Uint8Array(await new Response(valid!.stream).arrayBuffer()),
    ).toEqual(content);
    await writeFile(file(), new Uint8Array(content.length).fill(55));
    let rejected = false;
    let opened: Awaited<ReturnType<typeof store.open>> = null;
    try {
      opened = await store.open(OWNER, SOP, digest);
      // 조회 단계 또는 스트림 완료 전에 거부할 수 있지만 손상된 바이트가 정상 완료되면 안 된다.
      if (opened) await new Response(opened.stream).arrayBuffer();
    } catch (error) {
      expect(error).toBeInstanceOf(OriginalStoreError);
      rejected = true;
    }
    try {
      expect(rejected || opened === null).toBe(true);
    } finally {
      if (opened && !opened.stream.locked)
        await opened.stream.cancel().catch(() => undefined);
    }
  });
});
