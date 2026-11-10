import { createHash } from "node:crypto";
import { chmod, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { buildSyntheticDicom, TS } from "@tests/fixtures/dicom/synthetic-dicom";

import { clearCatalog, setupDbTest, type DbTestContext } from "./support";

/**
 * 이슈 #7: 원본 보관·조회 Route Handler 를 실제 Auth(getUser)·실제 RLS(카탈로그 RPC)·실제 파일 시스템으로 검증한다.
 * 쿠키 경로만 대역(요청 사용자 세션 클라이언트를 주입)이며, 쿠키·Proxy 를 포함한 전체 경로는 E2E 가 검증한다.
 */
vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/shared/api/supabase/server", () => ({
  createServerSupabase: async () => session.client,
}));

const ORIGIN = "http://127.0.0.1:3100";
const EMAILS = {
  a: "db-originals-a@example.test",
  b: "db-originals-b@example.test",
};
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

let ctx: DbTestContext;
let base: string;
let root: string;

type Route = typeof import("@/app/api/originals/instances/[sopUid]/route");
let route: Route;

beforeAll(async () => {
  ctx = await setupDbTest(EMAILS);
  route = await import("@/app/api/originals/instances/[sopUid]/route");
});
beforeEach(async () => {
  await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
  base = await realpath(await mkdtemp(path.join(tmpdir(), "originals-route-")));
  root = path.join(base, "store");
  process.env.DICOM_DATA_DIR = root;
  process.env.DICOM_MAX_FILE_BYTES = String(256 * 1024);
  process.env.DICOM_UPLOAD_CONCURRENCY = "8";
  session.client = ctx.a.client;
});
afterEach(async () => {
  await chmod(base, 0o700).catch(() => undefined);
  await rm(base, { recursive: true, force: true });
  delete process.env.DICOM_DATA_DIR;
  delete process.env.DICOM_MAX_FILE_BYTES;
  delete process.env.DICOM_UPLOAD_CONCURRENCY;
});
afterAll(async () => {
  if (ctx) await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
});

async function dicom(
  sop: string,
  options: {
    pixel?: number;
    transferSyntaxUid?: string;
    rows?: number;
    frames?: number;
  } = {},
) {
  return buildSyntheticDicom({
    studyInstanceUid: "2.25.7001",
    seriesInstanceUid: "2.25.7002",
    sopInstanceUid: sop,
    accessionNumber: "SYN-ORIG",
    patientId: "SYN-PATIENT-SECRET",
    pixel: () => options.pixel ?? 100,
    ...(options.transferSyntaxUid
      ? { transferSyntaxUid: options.transferSyntaxUid }
      : {}),
    ...(options.rows ? { rows: options.rows, columns: options.rows } : {}),
    ...(options.frames ? { frames: options.frames } : {}),
  });
}

function body(bytes: Uint8Array, chunk = 8 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
}

function put(
  sop: string,
  payload: ReadableStream<Uint8Array> | Uint8Array | null,
  {
    expected = ctx.a.id,
    headers = {},
  }: { expected?: string | null; headers?: Record<string, string> } = {},
) {
  const stream = payload instanceof Uint8Array ? body(payload) : payload;
  const request = new NextRequest(
    `${ORIGIN}/api/originals/instances/${encodeURIComponent(sop)}`,
    {
      method: "PUT",
      headers: {
        origin: ORIGIN,
        host: "127.0.0.1:3100",
        "content-type": "application/dicom",
        ...(expected ? { "x-expected-user-id": expected } : {}),
        ...headers,
      },
      body: stream,
      duplex: "half",
    } as ConstructorParameters<typeof NextRequest>[1],
  );
  return route.PUT(request, { params: Promise.resolve({ sopUid: sop }) });
}

function get(
  sop: string,
  {
    expected = ctx.a.id,
    headers = {},
  }: { expected?: string | null; headers?: Record<string, string> } = {},
) {
  const request = new NextRequest(
    `${ORIGIN}/api/originals/instances/${encodeURIComponent(sop)}`,
    {
      method: "GET",
      headers: {
        host: "127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
        ...(expected ? { "x-expected-user-id": expected } : {}),
        ...headers,
      },
    },
  );
  return route.GET(request, { params: Promise.resolve({ sopUid: sop }) });
}

async function json(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  const text = await response.text();
  // 응답에 서버 저장 경로·임시 경로가 드러나지 않는다
  expect(text).not.toContain(base);
  return {
    status: response.status,
    body: JSON.parse(text) as Record<string, unknown>,
  };
}

async function storedFiles(owner: string) {
  try {
    return await readdir(path.join(root, "v1", "users", owner, "instances"));
  } catch {
    return [];
  }
}
async function tempFiles() {
  try {
    return await readdir(path.join(root, "v1", "tmp"));
  } catch {
    return [];
  }
}
async function catalogDigests(client: SupabaseClient) {
  const { data, error } = await client
    .from("catalog_instances")
    .select("sop_instance_uid, content_digest");
  expect(error).toBeNull();
  return Object.fromEntries(
    (data ?? []).map((row) => [row.sop_instance_uid, row.content_digest]),
  );
}

describe("PUT /api/originals/instances/[sopUid]", () => {
  it("서버가 원본을 직접 파싱·해시해 카탈로그에 반영하고 비공개 파일로 원자적으로 보관한다", async () => {
    const bytes = await dicom("2.25.7101");
    expect(await json(await put("2.25.7101", bytes))).toEqual({
      status: 200,
      body: {
        status: "stored",
        studyInstanceUid: "2.25.7001",
        sopInstanceUid: "2.25.7101",
      },
    });
    expect(await storedFiles(ctx.a.id)).toEqual([
      `2.25.7101.${sha(bytes)}.dcm`,
    ]);
    expect(await tempFiles()).toEqual([]);
    expect(await catalogDigests(ctx.a.client)).toEqual({
      "2.25.7101": sha(bytes),
    });
    const file = path.join(
      root,
      "v1",
      "users",
      ctx.a.id,
      "instances",
      `2.25.7101.${sha(bytes)}.dcm`,
    );
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("로그인하지 않으면 401 이고 설정·파일 시스템보다 인증을 먼저 본다(저장 루트를 만들지 않음)", async () => {
    session.client = ctx.anon;
    expect(
      await json(await put("2.25.7102", await dicom("2.25.7102"))),
    ).toMatchObject({
      status: 401,
      body: { status: "unauthenticated" },
    });
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("A 화면의 요청이 B 로그인 뒤 도착하면(기대 계정 불일치) 409 이고 파일·카탈로그를 만들지 않는다", async () => {
    session.client = ctx.b.client;
    expect(
      await json(await put("2.25.7103", await dicom("2.25.7103"))),
    ).toMatchObject({
      status: 409,
      body: { status: "account-mismatch" },
    });
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await catalogDigests(ctx.b.client)).toEqual({});
  });

  it("기대 계정 헤더가 없으면 400", async () => {
    expect(
      (
        await json(
          await put("2.25.7104", await dicom("2.25.7104"), { expected: null }),
        )
      ).status,
    ).toBe(400);
  });

  it("다른 출처의 요청은 403, DICOM 이 아닌 형식 헤더는 415", async () => {
    expect(
      (
        await json(
          await put("2.25.7105", await dicom("2.25.7105"), {
            headers: { origin: "http://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await json(
          await put("2.25.7105", await dicom("2.25.7105"), {
            headers: { "content-type": "multipart/form-data" },
          }),
        )
      ).status,
    ).toBe(415);
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("DICOM 이 아닌 본문은 400 이고 아무것도 남기지 않는다", async () => {
    expect(
      await json(await put("2.25.7106", new TextEncoder().encode("not dicom"))),
    ).toMatchObject({
      status: 400,
      body: { status: "invalid-dicom" },
    });
    expect(await storedFiles(ctx.a.id)).toEqual([]);
    expect(await tempFiles()).toEqual([]);
    expect(await catalogDigests(ctx.a.client)).toEqual({});
  });

  it("주소의 SOP UID 와 파일 내용의 SOP UID 가 다르면(사칭) 400 이고 저장하지 않는다", async () => {
    expect(
      await json(await put("2.25.7999", await dicom("2.25.7107"))),
    ).toMatchObject({
      status: 400,
      body: { status: "sop-mismatch" },
    });
    expect(await storedFiles(ctx.a.id)).toEqual([]);
    expect(await catalogDigests(ctx.a.client)).toEqual({});
  });

  it.each(["../../etc/passwd", "2.25.1/2", "abc"])(
    "형식이 틀린 SOP UID(%s)는 본문을 읽기 전에 400",
    async (sop) => {
      expect(
        (await json(await put(sop, await dicom("2.25.7108")))).status,
      ).toBe(400);
      expect(await tempFiles()).toEqual([]);
    },
  );

  it("길이 헤더 없이 상한을 넘는 본문은 413 이고 부분 파일·카탈로그를 남기지 않는다", async () => {
    const big = await dicom("2.25.7109", { rows: 512 }); // 512×512×2 = 512KiB > 256KiB
    expect(await json(await put("2.25.7109", big))).toMatchObject({
      status: 413,
      body: { status: "too-large" },
    });
    expect(await tempFiles()).toEqual([]);
    expect(await storedFiles(ctx.a.id)).toEqual([]);
    expect(await catalogDigests(ctx.a.client)).toEqual({});
  });

  it("작은 deflate 본문이 상한보다 크게 팽창하면 413 이고 저장하지 않는다", async () => {
    const bomb = await dicom("2.25.7110", {
      transferSyntaxUid: TS.deflatedExplicitLittle,
      rows: 512,
      frames: 4,
      pixel: 0,
    });
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    expect(await json(await put("2.25.7110", bomb))).toMatchObject({
      status: 413,
      body: { status: "inflated-too-large" },
    });
    expect(await storedFiles(ctx.a.id)).toEqual([]);
  });

  it("업로드가 중간에 끊기면 실패이며 부분 파일·카탈로그를 남기지 않는다", async () => {
    const bytes = await dicom("2.25.7111");
    let sent = 0;
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > 0) return controller.error(new Error("client aborted"));
        sent += 1;
        controller.enqueue(bytes.slice(0, 1024));
      },
    });
    expect((await json(await put("2.25.7111", broken))).status).toBe(400);
    expect(await tempFiles()).toEqual([]);
    expect(await catalogDigests(ctx.a.client)).toEqual({});
  });

  it("같은 원본을 동시에 5번 보관해도 모두 성공하고 파일·카탈로그 행은 하나다", async () => {
    const bytes = await dicom("2.25.7112");
    const results = await Promise.all(
      Array.from({ length: 5 }, async () =>
        json(await put("2.25.7112", bytes)),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => r.body.status === "stored")).toHaveLength(1);
    expect(await storedFiles(ctx.a.id)).toHaveLength(1);
    expect(Object.keys(await catalogDigests(ctx.a.client))).toEqual([
      "2.25.7112",
    ]);
  });

  it("같은 SOP 의 서로 다른 원본을 별도 요청으로 동시에 보내면 하나만 보관되고, 파일과 카탈로그 digest 가 같다(라운드 반복)", async () => {
    for (let round = 0; round < 5; round += 1) {
      const sop = `2.25.713${round}`;
      const contents = await Promise.all(
        [1, 2, 3].map((pixel) => dicom(sop, { pixel: pixel * 10 + round })),
      );
      const results = await Promise.all(
        contents.map(async (bytes) => json(await put(sop, bytes))),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      const winner = contents[results.findIndex((r) => r.status === 200)]!;
      const files = (await storedFiles(ctx.a.id)).filter((name) =>
        name.startsWith(`${sop}.`),
      );
      expect(files).toEqual([`${sop}.${sha(winner)}.dcm`]);
      expect((await catalogDigests(ctx.a.client))[sop]).toBe(sha(winner));
    }
    expect(await tempFiles()).toEqual([]);
  });

  it("이미 보관한 SOP 의 다른 원본은 409 이고 기존 파일·카탈로그를 보존한다", async () => {
    const first = await dicom("2.25.7114", { pixel: 1 });
    await put("2.25.7114", first);
    expect(
      await json(
        await put("2.25.7114", await dicom("2.25.7114", { pixel: 2 })),
      ),
    ).toMatchObject({
      status: 409,
      body: { status: "conflict" },
    });
    expect(await storedFiles(ctx.a.id)).toEqual([
      `2.25.7114.${sha(first)}.dcm`,
    ]);
    expect(await catalogDigests(ctx.a.client)).toEqual({
      "2.25.7114": sha(first),
    });
  });

  it("카탈로그 반영 뒤 파일 공개가 실패하면 보관됨이 아니고(조회 404), 고친 뒤 다시 보내면 멱등하게 보관된다", async () => {
    if (process.getuid?.() === 0) return; // root 는 권한 검사를 우회해 실제 결함과 구분할 수 없다
    await put("2.25.7115", await dicom("2.25.7115"));
    const dir = path.join(root, "v1", "users", ctx.a.id, "instances");
    await chmod(dir, 0o500);
    const bytes = await dicom("2.25.7116");
    try {
      expect(await json(await put("2.25.7116", bytes))).toMatchObject({
        status: 503,
        body: { status: "storage-unavailable" },
      });
    } finally {
      await chmod(dir, 0o700);
    }
    expect(await catalogDigests(ctx.a.client)).toMatchObject({
      "2.25.7116": sha(bytes),
    });
    expect((await get("2.25.7116")).status).toBe(404);
    expect(await tempFiles()).toEqual([]);
    expect((await json(await put("2.25.7116", bytes))).body.status).toBe(
      "stored",
    );
  });

  it("동시 처리 상한을 넘는 요청은 429 이고 진행 중인 요청을 방해하지 않는다", async () => {
    process.env.DICOM_UPLOAD_CONCURRENCY = "1";
    const bytes = await dicom("2.25.7117");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let sent = false;
    const slow = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent) return controller.close();
        await gate;
        sent = true;
        controller.enqueue(bytes);
      },
    });
    const pending = put("2.25.7117", slow);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await put("2.25.7118", await dicom("2.25.7118"));
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    release();
    expect((await json(await pending)).status).toBe(200);
  });

  it("저장 루트가 설정되지 않았으면 인증 뒤 503 unconfigured", async () => {
    delete process.env.DICOM_DATA_DIR;
    expect(
      await json(await put("2.25.7119", await dicom("2.25.7119"))),
    ).toMatchObject({
      status: 503,
      body: { status: "unconfigured" },
    });
  });

  it("B 는 A 와 같은 UID 의 다른 원본을 자기 폴더에 독립적으로 보관한다", async () => {
    const a = await dicom("2.25.7120", { pixel: 1 });
    const b = await dicom("2.25.7120", { pixel: 2 });
    await put("2.25.7120", a);
    session.client = ctx.b.client;
    expect(
      (await json(await put("2.25.7120", b, { expected: ctx.b.id }))).status,
    ).toBe(200);
    expect(await storedFiles(ctx.a.id)).toEqual([`2.25.7120.${sha(a)}.dcm`]);
    expect(await storedFiles(ctx.b.id)).toEqual([`2.25.7120.${sha(b)}.dcm`]);
  });
});

describe("GET /api/originals/instances/[sopUid]", () => {
  it("소유자는 보관한 원본을 그대로 받는다(비공개·캐시 금지·다운로드)", async () => {
    const bytes = await dicom("2.25.7201");
    await put("2.25.7201", bytes);
    const response = await get("2.25.7201");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("application/dicom");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).not.toContain(base);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("다른 계정은 같은 UID 를 추측해도 404 이고 A 의 원본을 받지 못한다", async () => {
    await put("2.25.7202", await dicom("2.25.7202"));
    session.client = ctx.b.client;
    expect(
      (await json(await get("2.25.7202", { expected: ctx.b.id }))).status,
    ).toBe(404);
  });

  it("로그인하지 않으면 401, 기대 계정이 다르면 409(A 의 다운로드 대기가 B 로그인 뒤 B 원본을 받지 않음)", async () => {
    session.client = ctx.b.client;
    await put("2.25.7203", await dicom("2.25.7203"), { expected: ctx.b.id });
    expect(
      (await json(await get("2.25.7203", { expected: ctx.a.id }))).body.status,
    ).toBe("account-mismatch");
    session.client = ctx.anon;
    expect((await json(await get("2.25.7203"))).status).toBe(401);
  });

  it("다른 사이트에서 연 요청(sec-fetch-site cross-site)은 403", async () => {
    await put("2.25.7204", await dicom("2.25.7204"));
    expect(
      (
        await json(
          await get("2.25.7204", {
            headers: { "sec-fetch-site": "cross-site" },
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("카탈로그에만 있고 파일이 없는 영상은 보관됨으로 보지 않고 404", async () => {
    const { error } = await ctx.a.client.rpc("sync_catalog_study", {
      p_expected_owner: ctx.a.id,
      p_study: {
        studyInstanceUid: "2.25.7001",
        series: [
          {
            seriesInstanceUid: "2.25.7002",
            instances: [
              { sopInstanceUid: "2.25.7205", contentDigest: "a".repeat(64) },
            ],
          },
        ],
      },
    });
    expect(error).toBeNull();
    expect((await json(await get("2.25.7205"))).status).toBe(404);
  });
});

describe("listCatalogStudies: SSR 목록의 서버 원본 보관 표시", () => {
  type Server = typeof import("@/entities/dicom-study/server");
  let server: Server;
  beforeAll(async () => {
    server = await import("@/entities/dicom-study/server");
  });

  it("실제 파일이 있는 영상만 stored 이고, 메타데이터만 반영된 영상은 보관됨이 아니다", async () => {
    await put("2.25.7301", await dicom("2.25.7301"));
    const { error } = await ctx.a.client.rpc("sync_catalog_study", {
      p_expected_owner: ctx.a.id,
      p_study: {
        studyInstanceUid: "2.25.7001",
        series: [
          {
            seriesInstanceUid: "2.25.7002",
            instances: [
              { sopInstanceUid: "2.25.7302", contentDigest: "b".repeat(64) },
            ],
          },
        ],
      },
    });
    expect(error).toBeNull();
    const result = await server.listCatalogStudies();
    expect(result).toMatchObject({ status: "ready", originals: "ready" });
    if (result.status !== "ready") throw new Error("ready 여야 한다");
    const instances = result.studies[0]!.instances;
    expect(
      instances.find((i) => i.sopInstanceUid === "2.25.7301")?.stored,
    ).toBe(true);
    expect(
      instances.find((i) => i.sopInstanceUid === "2.25.7302")?.stored,
    ).toBeUndefined();
    // 서버 경로·헤더·원본은 SSR props 에 들어가지 않는다
    expect(JSON.stringify(result)).not.toContain(base);
    expect(JSON.stringify(result)).not.toContain("SYN-PATIENT-SECRET");
  });

  it("저장 루트가 설정되지 않았으면 목록은 그대로이고 원본 기능은 unconfigured(보관됨 추정 없음)", async () => {
    await put("2.25.7303", await dicom("2.25.7303"));
    delete process.env.DICOM_DATA_DIR;
    const result = await server.listCatalogStudies();
    expect(result).toMatchObject({
      status: "ready",
      originals: "unconfigured",
    });
    if (result.status !== "ready") throw new Error("ready 여야 한다");
    expect(result.studies[0]!.instances.every((i) => !i.stored)).toBe(true);
  });

  it("저장소를 읽지 못하면 unavailable 이고 보관됨으로 표시하지 않는다", async () => {
    if (process.getuid?.() === 0) return;
    await put("2.25.7304", await dicom("2.25.7304"));
    const userDir = path.join(root, "v1", "users", ctx.a.id);
    await chmod(userDir, 0o750); // private 이 아니면 저장소가 읽지 않는다
    try {
      const result = await server.listCatalogStudies();
      expect(result).toMatchObject({
        status: "ready",
        originals: "unavailable",
      });
      if (result.status !== "ready") throw new Error("ready 여야 한다");
      expect(result.studies[0]!.instances.every((i) => !i.stored)).toBe(true);
    } finally {
      await chmod(userDir, 0o700);
    }
  });
});
