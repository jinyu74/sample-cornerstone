import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CATALOG_RELATIONS,
  CATALOG_TABLES,
  clearCatalog,
  setupDbTest,
  type DbTestContext,
} from "./support";

/**
 * 이슈 #5 AC2·AC3·AC4: 실제 사용자 JWT 로 Data API(PostgREST)에 직접 요청해
 * 계정별 RLS·최소 권한·RPC 경계·중복/동시/충돌 처리를 확인한다.
 */
const D = (n: number) => n.toString(16).padStart(64, "0");
const STUDY = "2.25.5001";
const SERIES = "2.25.5002";

interface InstanceInput {
  sopInstanceUid: string;
  contentDigest: string;
}

function study({
  studyInstanceUid = STUDY,
  series = [
    {
      seriesInstanceUid: SERIES,
      modality: "CT",
      instances: [
        { sopInstanceUid: "2.25.5101", contentDigest: D(1) },
        { sopInstanceUid: "2.25.5102", contentDigest: D(2) },
      ],
    },
  ],
}: {
  studyInstanceUid?: string;
  series?: {
    seriesInstanceUid: string;
    modality?: string;
    instances: InstanceInput[];
  }[];
} = {}) {
  return {
    studyInstanceUid,
    studyDate: "20260101",
    studyDescription: "Synthetic RLS study",
    accessionNumber: "SYN-RLS",
    series,
  };
}

function sync(
  client: SupabaseClient,
  expectedOwner: string,
  payload: ReturnType<typeof study> = study(),
) {
  return client.rpc("sync_catalog_study", {
    p_expected_owner: expectedOwner,
    p_study: payload,
  });
}

/** 거부 검사 전에 A 의 정상 쓰기가 실제로 성공함을 확인한다(테이블·함수 없음을 차단으로 오인하지 않는다) */
async function syncOk(
  client: SupabaseClient,
  expectedOwner: string,
  payload?: ReturnType<typeof study>,
) {
  const result = await sync(client, expectedOwner, payload);
  expect(result.error).toBeNull();
  return result;
}

async function summaries(client: SupabaseClient) {
  const { data, error } = await client
    .from("catalog_study_summaries")
    .select(
      "study_instance_uid, accession_number, series_count, instance_count, modalities",
    );
  expect(error).toBeNull();
  return data;
}

async function instanceDigests(client: SupabaseClient) {
  const { data, error } = await client
    .from("catalog_instances")
    .select("sop_instance_uid, series_instance_uid, content_digest")
    .order("sop_instance_uid");
  expect(error).toBeNull();
  return data;
}

let ctx: DbTestContext;

beforeAll(async () => {
  ctx = await setupDbTest();
  await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
});

beforeEach(async () => {
  await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
});

afterAll(async () => {
  if (ctx) await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
});

describe("anon(로그인하지 않은 요청)", () => {
  it.each(CATALOG_RELATIONS)("%s 를 읽을 수 없다", async (relation) => {
    await syncOk(ctx.a.client, ctx.a.id);
    const { data, error } = await ctx.anon.from(relation).select("*");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });

  it.each(CATALOG_TABLES)("%s 에 쓸 수 없다", async (table) => {
    const { error } = await ctx.anon
      .from(table)
      .insert({ owner_id: ctx.a.id, study_instance_uid: STUDY });
    expect(error?.code).toBe("42501");
  });

  it("동기화 RPC 를 실행할 권한이 없다(로그인한 A 는 같은 RPC 를 실행할 수 있다)", async () => {
    const { error } = await sync(ctx.anon, ctx.a.id);
    expect(error?.code).toBe("42501");
    expect(await summaries(ctx.a.client)).toEqual([]);
    await syncOk(ctx.a.client, ctx.a.id);
    expect(await summaries(ctx.a.client)).toHaveLength(1);
  });
});

describe("계정별 소유와 조회", () => {
  it("A 가 동기화한 검사는 A 의 목록에만 보이고, 시리즈·영상 수는 서버가 센다", async () => {
    const { data, error } = await sync(ctx.a.client, ctx.a.id);
    expect(error).toBeNull();
    expect(data).toEqual({
      studyInstanceUid: STUDY,
      seriesCount: 1,
      instanceCount: 2,
    });
    expect(await summaries(ctx.a.client)).toEqual([
      {
        study_instance_uid: STUDY,
        accession_number: "SYN-RLS",
        series_count: 1,
        instance_count: 2,
        modalities: ["CT"],
      },
    ]);
    for (const relation of CATALOG_RELATIONS) {
      const { data: seen, error: seenError } = await ctx.b.client
        .from(relation)
        .select("*");
      expect(seenError).toBeNull();
      expect(seen).toEqual([]);
    }
  });

  it("A 와 B 는 같은 UID 를 서로 독립적으로 소유한다(내용이 달라도 충돌하지 않는다)", async () => {
    expect((await sync(ctx.a.client, ctx.a.id)).error).toBeNull();
    const other = study({
      series: [
        {
          seriesInstanceUid: SERIES,
          instances: [{ sopInstanceUid: "2.25.5101", contentDigest: D(77) }],
        },
      ],
    });
    expect((await sync(ctx.b.client, ctx.b.id, other)).error).toBeNull();
    expect(await instanceDigests(ctx.a.client)).toEqual([
      {
        sop_instance_uid: "2.25.5101",
        series_instance_uid: SERIES,
        content_digest: D(1),
      },
      {
        sop_instance_uid: "2.25.5102",
        series_instance_uid: SERIES,
        content_digest: D(2),
      },
    ]);
    expect(await instanceDigests(ctx.b.client)).toEqual([
      {
        sop_instance_uid: "2.25.5101",
        series_instance_uid: SERIES,
        content_digest: D(77),
      },
    ]);
  });
});

describe("계정 변경 경합·소유권 변경 차단", () => {
  it("B 세션으로 A 를 기대 계정으로 보낸 늦은 요청은 거부되고 어느 계정에도 쓰이지 않는다", async () => {
    const { error } = await sync(ctx.b.client, ctx.a.id);
    expect(error?.message).toContain("account-mismatch");
    expect(await summaries(ctx.a.client)).toEqual([]);
    expect(await summaries(ctx.b.client)).toEqual([]);
  });

  it.each(CATALOG_TABLES)(
    "B 는 owner_id 를 A 로 지정해 %s 에 직접 넣을 수 없다",
    async (table) => {
      await syncOk(ctx.a.client, ctx.a.id);
      const row = {
        owner_id: ctx.a.id,
        study_instance_uid: "2.25.5999",
        series_instance_uid: "2.25.5998",
        sop_instance_uid: "2.25.5997",
        content_digest: D(5),
      };
      const columns: Record<(typeof CATALOG_TABLES)[number], string[]> = {
        catalog_studies: ["owner_id", "study_instance_uid"],
        catalog_series: [
          "owner_id",
          "study_instance_uid",
          "series_instance_uid",
        ],
        catalog_instances: Object.keys(row),
      };
      const { error } = await ctx.b.client
        .from(table)
        .insert(
          Object.fromEntries(
            columns[table].map((key) => [key, row[key as keyof typeof row]]),
          ),
        );
      expect(error?.code).toBe("42501");
      expect(await summaries(ctx.a.client)).toHaveLength(1);
    },
  );

  it.each(CATALOG_TABLES)(
    "자기 행이라도 %s 의 UPDATE(소유권 변경)·DELETE 권한이 없다",
    async (table) => {
      await syncOk(ctx.a.client, ctx.a.id);
      const update = await ctx.a.client
        .from(table)
        .update({ owner_id: ctx.b.id })
        .eq("owner_id", ctx.a.id);
      expect(update.error?.code).toBe("42501");
      const removal = await ctx.a.client
        .from(table)
        .delete()
        .eq("owner_id", ctx.a.id);
      expect(removal.error?.code).toBe("42501");
      expect(await summaries(ctx.a.client)).toHaveLength(1);
      expect(await summaries(ctx.b.client)).toEqual([]);
    },
  );
});

describe("중복·재시도·동시 동기화", () => {
  it("같은 요청을 반복하고 동시에 다시 보내도 검사·시리즈·영상 수가 늘지 않는다", async () => {
    expect((await sync(ctx.a.client, ctx.a.id)).error).toBeNull();
    expect((await sync(ctx.a.client, ctx.a.id)).error).toBeNull();
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () => sync(ctx.a.client, ctx.a.id)),
    );
    for (const result of concurrent) expect(result.error).toBeNull();
    expect(await summaries(ctx.a.client)).toEqual([
      expect.objectContaining({ series_count: 1, instance_count: 2 }),
    ]);
    expect(await instanceDigests(ctx.a.client)).toHaveLength(2);
  });

  it("나눠 보낸 청크는 한 검사로 합쳐진다", async () => {
    const first = study({
      series: [
        {
          seriesInstanceUid: SERIES,
          instances: [{ sopInstanceUid: "2.25.5101", contentDigest: D(1) }],
        },
      ],
    });
    const second = study({
      series: [
        {
          seriesInstanceUid: SERIES,
          instances: [{ sopInstanceUid: "2.25.5102", contentDigest: D(2) }],
        },
        {
          seriesInstanceUid: "2.25.5003",
          modality: "MR",
          instances: [{ sopInstanceUid: "2.25.5201", contentDigest: D(3) }],
        },
      ],
    });
    expect((await sync(ctx.a.client, ctx.a.id, first)).error).toBeNull();
    expect((await sync(ctx.a.client, ctx.a.id, second)).error).toBeNull();
    expect(await summaries(ctx.a.client)).toEqual([
      expect.objectContaining({
        series_count: 2,
        instance_count: 3,
        modalities: ["MR"],
      }),
    ]);
  });
});

describe("충돌은 기존 자료를 보존하고 실패로 알린다(원자적)", () => {
  it("같은 SOP UID 의 다른 digest 는 거부되고, 기존 digest 와 같은 요청의 새 영상도 반영되지 않는다", async () => {
    await syncOk(ctx.a.client, ctx.a.id);
    const conflicting = study({
      series: [
        {
          seriesInstanceUid: SERIES,
          instances: [
            { sopInstanceUid: "2.25.5101", contentDigest: D(99) },
            { sopInstanceUid: "2.25.5103", contentDigest: D(3) },
          ],
        },
      ],
    });
    const { error } = await sync(ctx.a.client, ctx.a.id, conflicting);
    expect(error?.message).toContain("instance-conflict");
    expect(await instanceDigests(ctx.a.client)).toEqual([
      expect.objectContaining({
        sop_instance_uid: "2.25.5101",
        content_digest: D(1),
      }),
      expect.objectContaining({ sop_instance_uid: "2.25.5102" }),
    ]);
  });

  it("이미 다른 검사에 속한 시리즈 UID 는 계층 충돌로 거부된다", async () => {
    await syncOk(ctx.a.client, ctx.a.id);
    const moved = study({
      studyInstanceUid: "2.25.6001",
      series: [
        {
          seriesInstanceUid: SERIES,
          instances: [{ sopInstanceUid: "2.25.6101", contentDigest: D(4) }],
        },
      ],
    });
    const { error } = await sync(ctx.a.client, ctx.a.id, moved);
    expect(error?.message).toContain("series-conflict");
    expect(await summaries(ctx.a.client)).toEqual([
      expect.objectContaining({ study_instance_uid: STUDY }),
    ]);
  });

  it("이미 다른 시리즈에 속한 SOP UID 는 계층 충돌로 거부된다", async () => {
    await syncOk(ctx.a.client, ctx.a.id);
    const moved = study({
      series: [
        {
          seriesInstanceUid: "2.25.5003",
          instances: [{ sopInstanceUid: "2.25.5101", contentDigest: D(1) }],
        },
      ],
    });
    const { error } = await sync(ctx.a.client, ctx.a.id, moved);
    expect(error?.message).toContain("instance-conflict");
    expect(await summaries(ctx.a.client)).toEqual([
      expect.objectContaining({ series_count: 1, instance_count: 2 }),
    ]);
  });
});

describe("DB 제약은 RPC 를 거치지 않은 직접 쓰기에도 적용된다", () => {
  it("digest 형식이 틀리면 CHECK 로 거부된다", async () => {
    await syncOk(ctx.a.client, ctx.a.id);
    const { error } = await ctx.a.client.from("catalog_instances").insert({
      owner_id: ctx.a.id,
      study_instance_uid: STUDY,
      series_instance_uid: SERIES,
      sop_instance_uid: "2.25.5199",
      content_digest: "not-a-digest",
    });
    expect(error?.code).toBe("23514");
  });

  it("없는 시리즈를 가리키는 영상은 FK 로 거부된다", async () => {
    await syncOk(ctx.a.client, ctx.a.id);
    const { error } = await ctx.a.client.from("catalog_instances").insert({
      owner_id: ctx.a.id,
      study_instance_uid: STUDY,
      series_instance_uid: "2.25.5404",
      sop_instance_uid: "2.25.5199",
      content_digest: D(8),
    });
    expect(error?.code).toBe("23503");
  });

  it("RPC 도 요청 영상 수 상한을 넘으면 거부한다", async () => {
    const huge = study({
      series: [
        {
          seriesInstanceUid: SERIES,
          instances: Array.from({ length: 1001 }, (_, i) => ({
            sopInstanceUid: `2.25.7${i}`,
            contentDigest: D(i),
          })),
        },
      ],
    });
    const { error } = await sync(ctx.a.client, ctx.a.id, huge);
    expect(error?.message).toContain("payload-too-large");
    expect(await summaries(ctx.a.client)).toEqual([]);
  });
});
