import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCatalogSummaries } from "@/entities/dicom-study/api/catalog-repository";

import { clearCatalog, setupDbTest, type DbTestContext } from "./support";

/**
 * 서버 목록 조회(DAL 핵심): PostgREST max_rows(1000) 를 넘는 영상·검사도 빠짐·중복 없이 읽고,
 * 서버 쪽 행 상한이 페이지 크기보다 작아도 잘리지 않으며, 다른 계정 자료가 섞이지 않는다.
 */
const D = (n: number) => n.toString(16).padStart(64, "0");
const BIG = "2.25.8001";
const BIG_INSTANCES = 2500;

let ctx: DbTestContext;

function chunk(studyInstanceUid: string, from: number, to: number) {
  return {
    studyInstanceUid,
    accessionNumber: "SYN-BIG",
    series: [
      {
        seriesInstanceUid: `${studyInstanceUid}.1`,
        modality: "CT",
        instances: Array.from({ length: to - from }, (_, i) => ({
          sopInstanceUid: `${studyInstanceUid}.1.${from + i}`,
          contentDigest: D(from + i),
        })),
      },
    ],
  };
}

beforeAll(async () => {
  ctx = await setupDbTest();
  await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
  // A: 영상 2500개 검사 1개(3청크) + 작은 검사 1100개(검사 행 수도 1000 초과)
  for (const [from, to] of [
    [0, 1000],
    [1000, 2000],
    [2000, BIG_INSTANCES],
  ] as const) {
    const { error } = await ctx.a.client.rpc("sync_catalog_study", {
      p_expected_owner: ctx.a.id,
      p_study: chunk(BIG, from, to),
    });
    expect(error).toBeNull();
  }
  const small = Array.from({ length: 1100 }, (_, i) => `2.25.82${i}`);
  await Promise.all(
    Array.from({ length: 10 }, async (_, worker) => {
      for (let i = worker; i < small.length; i += 10) {
        const { error } = await ctx.a.client.rpc("sync_catalog_study", {
          p_expected_owner: ctx.a.id,
          p_study: chunk(small[i]!, 0, 1),
        });
        expect(error).toBeNull();
      }
    }),
  );
  // B: A 와 같은 UID 의 검사(섞이면 안 된다)
  const { error } = await ctx.b.client.rpc("sync_catalog_study", {
    p_expected_owner: ctx.b.id,
    p_study: chunk(BIG, 0, 3),
  });
  expect(error).toBeNull();
}, 180_000);

afterAll(async () => {
  if (ctx) await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
});

describe("readCatalogSummaries", () => {
  it.each([1000, 7, 5000])(
    "페이지 크기 %i 로 1000행을 넘는 검사·영상을 빠짐·중복 없이 읽는다",
    async (pageSize) => {
      const studies = await readCatalogSummaries(ctx.a.client, ctx.a.id, {
        pageSize,
      });
      expect(studies).toHaveLength(1101);
      const uids = studies.map((study) => study.studyInstanceUid);
      expect(new Set(uids).size).toBe(uids.length);
      const big = studies.find((study) => study.studyInstanceUid === BIG)!;
      expect(big).toMatchObject({
        accessionNumber: "SYN-BIG",
        modalities: ["CT"],
        seriesCount: 1,
        seriesInstanceUids: [`${BIG}.1`],
        instanceCount: BIG_INSTANCES,
      });
      const sops = big.instances.map((instance) => instance.sopInstanceUid);
      expect(sops).toHaveLength(BIG_INSTANCES);
      expect(new Set(sops).size).toBe(BIG_INSTANCES);
      expect(
        big.instances.every(
          (instance) =>
            instance.contentDigest ===
            D(Number(instance.sopInstanceUid.split(".").at(-1))),
        ),
      ).toBe(true);
      for (const study of studies) {
        expect(study.instances).toHaveLength(study.instanceCount);
        expect(study.seriesInstanceUids).toHaveLength(study.seriesCount);
      }
    },
    60_000,
  );

  it("목록 DTO 는 최소 필드만 담고(owner·내부 시각 없음) 영상당 크기가 SOP UID·digest 수준이다", async () => {
    const [first] = await readCatalogSummaries(ctx.b.client, ctx.b.id);
    expect(Object.keys(first!).sort()).toEqual(
      [
        "accessionNumber",
        "instanceCount",
        "instances",
        "modalities",
        "seriesCount",
        "seriesInstanceUids",
        "studyInstanceUid",
      ].sort(),
    );
    expect(Object.keys(first!.instances[0]!).sort()).toEqual([
      "contentDigest",
      "sopInstanceUid",
    ]);
    const studies = await readCatalogSummaries(ctx.a.client, ctx.a.id);
    const big = studies.find((study) => study.studyInstanceUid === BIG)!;
    const perInstance =
      new TextEncoder().encode(JSON.stringify(big.instances)).byteLength /
      big.instances.length;
    expect(perInstance).toBeLessThan(150);
  });

  it("다른 계정의 같은 UID 검사는 섞이지 않는다", async () => {
    const studies = await readCatalogSummaries(ctx.b.client, ctx.b.id, {
      pageSize: 2,
    });
    expect(studies).toEqual([
      expect.objectContaining({ studyInstanceUid: BIG, instanceCount: 3 }),
    ]);
    expect(studies[0]!.instances).toHaveLength(3);
  });

  it("세션 계정과 다른 owner 를 지정해도 RLS 로 다른 계정 자료를 읽지 못한다", async () => {
    expect(await readCatalogSummaries(ctx.b.client, ctx.a.id)).toEqual([]);
  });
});
