import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open as openFile,
  readdir,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import type { OriginalsConfig } from "@/shared/config/originals-env";

export type OriginalStoreErrorCode =
  | "unsafe-root"
  /** 원본 이름 자리에 손상·다른 종류 파일이 있음(보관됨으로 세지 않고 그대로 둔다) */
  | "corrupt"
  | "invalid"
  | "too-large"
  | "aborted"
  | "conflict"
  | "storage-full"
  | "storage-unavailable";

/** 원본 저장소 오류. 메시지는 코드뿐이며 경로·비밀값을 담지 않는다 */
export class OriginalStoreError extends Error {
  override name = "OriginalStoreError";
  constructor(readonly code: OriginalStoreErrorCode) {
    super(code);
  }
}

export interface ReceivedOriginal {
  /** 서버가 받은 바이트로 계산한 SHA-256(16진) */
  digest: string;
  size: number;
  /** 파싱용 바이트(상한 이하) */
  bytes: Uint8Array;
}

export interface OriginalStore {
  /** 본문을 임시 파일로 받는다(상한 초과·중단 시 임시 파일을 지우고 실패) */
  receive(
    owner: string,
    body: ReadableStream<Uint8Array>,
  ): Promise<ReceivedOriginal>;
  /** 받은 원본을 서버가 정한 이름으로 원자적으로 공개한다(덮어쓰기 없음) */
  publish(
    owner: string,
    received: ReceivedOriginal,
    sopInstanceUid: string,
  ): Promise<"stored" | "already-stored">;
  /** 이번 요청의 임시 파일만 지운다 */
  discard(received: ReceivedOriginal): Promise<void>;
  /** owner 의 보관 원본(SOP UID → digest). 실제 일반 파일만 센다(내용 해시는 읽기·재보관 때 검증) */
  list(owner: string): Promise<Map<string, string>>;
  open(
    owner: string,
    sopInstanceUid: string,
    digest: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UID = /^[0-9]+(\.[0-9]+)*$/;
const DIGEST = /^[0-9a-f]{64}$/;
const STORED_NAME = /^([0-9]+(?:\.[0-9]+)*)\.([0-9a-f]{64})\.dcm$/;
const LAYOUT = "v1";
const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;
/** 정적·빌드·소스 경로(프로젝트 루트 기준). 원본을 두면 배포·노출될 수 있다 */
const PROJECT_FORBIDDEN = [
  "public",
  ".next",
  "src",
  "node_modules",
  ".git",
  "supabase",
];
const SYSTEM_DIRS = [
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/lib",
  "/proc",
  "/sbin",
  "/sys",
  "/usr",
  "/var",
  "/tmp",
  "/private",
  "/System",
  "/Library",
  "/Applications",
  "/Users",
  "/home",
  "/root",
  "/opt",
];

const fail = (code: OriginalStoreErrorCode): never => {
  throw new OriginalStoreError(code);
};

function fsFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException)?.code;
  throw new OriginalStoreError(
    code === "ENOSPC" || code === "EDQUOT"
      ? "storage-full"
      : "storage-unavailable",
  );
}

/**
 * 같은 저장 루트·owner·SOP 의 공개를 이 프로세스 안에서 차례로 한다(저장소 객체를 요청마다 새로 열어도 공유).
 * 다른 프로세스와의 경합(같은 SOP 의 다른 내용)은 이 저장소가 막지 않는다: Route 가 공개 전에
 * 카탈로그 RPC(DB 고유 키·digest 충돌 검사)로 거부한다.
 */
const publishLocks = new Map<string, Promise<unknown>>();

const within = (parent: string, child: string) =>
  child === parent || child.startsWith(parent + path.sep);

async function existing(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 경로의 모든 기존 구성요소가 실제 디렉터리이며 symlink 가 아닌지 */
async function assertNoSymlinks(target: string) {
  const parts = target.split(path.sep).filter(Boolean);
  let current = path.parse(target).root;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await existing(current);
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory()) fail("unsafe-root");
  }
}

const identity = (info: { dev: number; ino: number }) =>
  `${info.dev}:${info.ino}`;

/**
 * 문자열 비교만으로는 대소문자를 구분하지 않는 볼륨의 별칭(project/PUBLIC = project/public)을 막지 못한다.
 * 1) 금지 폴더(프로젝트 루트·정적·빌드·소스·시스템·홈)의 실제 장치·inode 와, 저장 루트에서 가장 가까운
 *    기존 상위 폴더들의 장치·inode 를 비교하고, 2) 아직 없는 금지 폴더(예: 빌드 전 .next)는
 *    프로젝트 기준 상대 경로 첫 구성요소를 대소문자 무시로 비교한다. symlink 는 앞에서 이미 거부한다.
 */
async function assertOutsideForbidden(root: string, project: string) {
  const relative = path.relative(project, root);
  const first = relative.split(path.sep)[0]?.toLowerCase();
  if (
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    (relative === "" ||
      PROJECT_FORBIDDEN.some((dir) => dir.toLowerCase() === first))
  )
    fail("unsafe-root");

  const insideForbidden = new Set<string>();
  for (const dir of PROJECT_FORBIDDEN) {
    // 런타임 안전성 검사용 경로다(번들·출력 추적 대상이 아님). 없으면 Turbopack 이 프로젝트 전체를 추적한다.
    const info = await existing(
      path.join(/* turbopackIgnore: true */ project, dir),
    ).catch(() => null);
    if (info) insideForbidden.add(identity(info));
  }
  const exactForbidden = new Set<string>();
  for (const dir of [project, homedir(), ...SYSTEM_DIRS]) {
    const info = await existing(dir).catch(() => null);
    if (info) exactForbidden.add(identity(info));
  }

  // 기존 상위 폴더 중 프로젝트 루트와 같은 실제 폴더(대소문자 별칭 포함)가 있으면,
  // 그 폴더 기준 첫 구성요소로 아직 없는 금지 폴더(예: 빌드 전 .NEXT)도 거부한다.
  const projectInfo = await existing(project).catch(() => null);
  const projectId = projectInfo ? identity(projectInfo) : null;

  let current = root;
  let deepest = true;
  for (;;) {
    const info = await existing(current);
    if (info) {
      const id = identity(info);
      if (insideForbidden.has(id)) fail("unsafe-root");
      if (deepest && current === root && exactForbidden.has(id))
        fail("unsafe-root");
      deepest = false;
      if (id === projectId) {
        const head =
          path.relative(current, root).split(path.sep)[0]?.toLowerCase() ?? "";
        if (
          head === "" ||
          PROJECT_FORBIDDEN.some((dir) => dir.toLowerCase() === head)
        )
          fail("unsafe-root");
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/** 저장 루트 아래 이 저장소가 관리하는 디렉터리(0700). symlink·파일이면 쓰지 않는다 */
async function ensurePrivateDir(dir: string, code: OriginalStoreErrorCode) {
  try {
    await mkdir(dir, { mode: PRIVATE_DIR });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") fsFailure(error);
  }
  const info = await lstat(dir).catch(fsFailure);
  if (info.isSymbolicLink() || !info.isDirectory()) fail(code);
  if (!isPrivate(info)) fail(code);
}

/** 현재 사용자 소유이고 그룹·기타 권한이 전혀 없는지(기존 폴더 권한은 바꾸지 않고 판정만 한다) */
function isPrivate(info: { uid: number; mode: number }) {
  if (process.getuid && info.uid !== process.getuid()) return false;
  return (info.mode & 0o077) === 0;
}

/**
 * chunk 전체를 쓴다. OS 가 일부만 쓰면(bytesWritten < 길이) 남은 바이트를 이어서 쓰고,
 * 0바이트 쓰기가 나오면 진행할 수 없으므로 실패로 끝낸다(무한 반복 방지).
 */
async function writeAll(handle: FileHandle, chunk: Uint8Array) {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await handle
      .write(chunk, offset, chunk.byteLength - offset)
      .catch(fsFailure);
    if (bytesWritten <= 0) fail("storage-unavailable");
    offset += bytesWritten;
  }
}

/** 파일 내용의 SHA-256 */
async function hashFile(file: string): Promise<string> {
  const handle = await openFile(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hash.update(chunk as Buffer);
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

/**
 * 서버 비공개 원본 저장소를 연다. 루트가 정적·빌드·시스템 경로이거나 symlink 를 지나거나
 * 다른 사용자가 쓸 수 있으면 거부한다(기존 폴더 권한·내용은 바꾸지 않는다). 없으면 0700 으로 만든다.
 */
export async function openOriginalStore(
  config: OriginalsConfig,
  { projectRoot }: { projectRoot: string },
): Promise<OriginalStore> {
  const root = path.resolve(config.root);
  const project = path.resolve(projectRoot);
  if (
    root === project ||
    PROJECT_FORBIDDEN.some((dir) => within(path.join(project, dir), root)) ||
    SYSTEM_DIRS.includes(root) ||
    root === homedir() ||
    root === path.parse(root).root
  )
    fail("unsafe-root");

  await assertNoSymlinks(root);
  await assertOutsideForbidden(root, project);
  const info = await existing(root);
  if (info) {
    if (!info.isDirectory() || !isPrivate(info)) fail("unsafe-root");
  } else {
    await mkdir(root, { recursive: true, mode: PRIVATE_DIR }).catch(fsFailure);
    await chmod(root, PRIVATE_DIR).catch(fsFailure);
  }
  const layout = path.join(root, LAYOUT);
  const tmp = path.join(layout, "tmp");
  const users = path.join(layout, "users");
  for (const dir of [layout, tmp, users])
    await ensurePrivateDir(dir, "unsafe-root");

  const temps = new WeakMap<ReceivedOriginal, string>();
  const limit = config.maxFileBytes;

  const assertOwner = (owner: string) => {
    if (!UUID.test(owner)) fail("invalid");
  };
  const assertUid = (uid: string) => {
    if (uid.length > 64 || !UID.test(uid)) fail("invalid");
  };
  const instancesDir = (owner: string) => path.join(users, owner, "instances");

  /** 같은 owner·SOP 의 공개는 이 프로세스 안에서 차례로 한다(다른 digest 경합 방지) */
  async function serialized<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = publishLocks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    publishLocks.set(key, run);
    try {
      return await run;
    } finally {
      if (publishLocks.get(key) === run) publishLocks.delete(key);
    }
  }

  async function removeTemp(file: string) {
    await unlink(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  return {
    async receive(owner, body) {
      assertOwner(owner);
      const file = path.join(tmp, `${randomUUID()}.part`);
      let handle: FileHandle | undefined;
      try {
        handle = await openFile(
          file,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          PRIVATE_FILE,
        ).catch(fsFailure);
        const hash = createHash("sha256");
        const chunks: Uint8Array[] = [];
        let size = 0;
        const reader = body.getReader();
        for (;;) {
          let next: ReadableStreamReadResult<Uint8Array>;
          try {
            next = await reader.read();
          } catch {
            fail("aborted");
          }
          if (next!.done) break;
          const chunk = next!.value;
          size += chunk.byteLength;
          if (size > limit) {
            await reader.cancel().catch(() => undefined);
            fail("too-large");
          }
          hash.update(chunk);
          chunks.push(chunk);
          await writeAll(handle, chunk);
        }
        await handle.datasync().catch(fsFailure);
        await handle.close();
        handle = undefined;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        const received: ReceivedOriginal = {
          digest: hash.digest("hex"),
          size,
          bytes,
        };
        temps.set(received, file);
        return received;
      } catch (error) {
        await handle?.close().catch(() => undefined);
        await removeTemp(file).catch(() => undefined);
        throw error;
      }
    },

    async publish(owner, received, sop) {
      assertOwner(owner);
      assertUid(sop);
      const temp = temps.get(received);
      if (!temp || !DIGEST.test(received.digest)) fail("invalid");
      return serialized(`${root}\u0000${owner}\u0000${sop}`, async () => {
        await ensurePrivateDir(path.join(users, owner), "storage-unavailable");
        const dir = instancesDir(owner);
        await ensurePrivateDir(dir, "storage-unavailable");
        const names = await readdir(dir).catch(fsFailure);
        for (const name of names) {
          const match = STORED_NAME.exec(name);
          if (match?.[1] === sop && match[2] !== received.digest)
            fail("conflict");
        }
        const final = path.join(dir, `${sop}.${received.digest}.dcm`);
        try {
          await link(temp!, final);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST")
            fsFailure(error);
          // 같은 이름이라는 것만으로 성공으로 보지 않는다: 일반 파일이고 내용이 이름의 digest 와 같아야 한다
          const current = await lstat(final).catch(fsFailure);
          if (current.isSymbolicLink() || !current.isFile()) fail("corrupt");
          const actual = await hashFile(final).catch(fsFailure);
          if (actual !== received.digest) fail("corrupt");
          return "already-stored" as const;
        }
        // 공개한 이름이 디렉터리에 기록되도록 동기화한다(실패해도 파일은 완성본)
        const handle = await openFile(dir, constants.O_RDONLY).catch(
          () => undefined,
        );
        await handle?.sync().catch(() => undefined);
        await handle?.close().catch(() => undefined);
        return "stored" as const;
      });
    },

    async discard(received) {
      const temp = temps.get(received);
      if (!temp) return;
      temps.delete(received);
      await removeTemp(temp).catch(() => undefined);
    },

    async list(owner) {
      assertOwner(owner);
      const result = new Map<string, string>();
      const userDir = await existing(path.join(users, owner)).catch(fsFailure);
      if (!userDir) return result;
      if (
        userDir.isSymbolicLink() ||
        !userDir.isDirectory() ||
        !isPrivate(userDir)
      )
        fail("storage-unavailable");
      const dir = instancesDir(owner);
      const info = await existing(dir).catch(fsFailure);
      if (!info) return result;
      if (info.isSymbolicLink() || !info.isDirectory() || !isPrivate(info))
        fail("storage-unavailable");
      const entries = await readdir(dir, { withFileTypes: true }).catch(
        fsFailure,
      );
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const match = STORED_NAME.exec(entry.name);
        if (match) result.set(match[1]!, match[2]!);
      }
      return result;
    },

    async open(owner, sop, digest) {
      assertOwner(owner);
      assertUid(sop);
      if (!DIGEST.test(digest)) fail("invalid");
      for (const dir of [path.join(users, owner), instancesDir(owner)]) {
        const info = await existing(dir).catch(fsFailure);
        if (
          !info ||
          info.isSymbolicLink() ||
          !info.isDirectory() ||
          !isPrivate(info)
        )
          return null;
      }
      let handle: FileHandle;
      try {
        handle = await openFile(
          path.join(instancesDir(owner), `${sop}.${digest}.dcm`),
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ELOOP") return null;
        fsFailure(error);
      }
      const info = await handle!.stat().catch(async (error) => {
        await handle.close();
        fsFailure(error);
      });
      if (!info!.isFile()) {
        await handle!.close();
        return null;
      }
      const raw = Readable.toWeb(
        handle!.createReadStream({ autoClose: true }),
      ) as ReadableStream<Uint8Array>;
      // 읽는 동안 내용을 다시 해시해, 이름의 digest 와 다르면(디스크 손상 등) 스트림을 오류로 끝낸다
      const hash = createHash("sha256");
      const stream = raw.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            hash.update(chunk);
            controller.enqueue(chunk);
          },
          flush(controller) {
            if (hash.digest("hex") !== digest)
              controller.error(new OriginalStoreError("corrupt"));
          },
        }),
      );
      return { stream, size: info!.size };
    },
  };
}
