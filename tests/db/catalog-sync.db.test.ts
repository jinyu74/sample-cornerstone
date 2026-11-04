import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { submitCatalogStudy } from "@/entities/dicom-study/api/catalog-repository";

import { clearCatalog, setupDbTest, type DbTestContext } from "./support";

/** 서버 동기화(DAL 핵심): 실제 RPC 결과를 화면이 구분할 수 있는 결과로 분류한다 */
const D = (n: number) => n.toString(16).padStart(64, "0");
const study = (digest = D(1), seriesInstanceUid = "2.25.9102") => ({
  studyInstanceUid: "2.25.9101",
  series: [
    {
      seriesInstanceUid,
      instances: [{ sopInstanceUid: "2.25.9103", contentDigest: digest }],
    },
  ],
});

let ctx: DbTestContext;
beforeAll(async () => {
  ctx = await setupDbTest();
});
beforeEach(async () => clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]));
afterAll(async () => {
  if (ctx) await clearCatalog(ctx.admin, [ctx.a.id, ctx.b.id]);
});

describe("submitCatalogStudy", () => {
  it("성공하면 서버가 센 시리즈·영상 수를 돌려주고, 다시 보내도 같은 결과다", async () => {
    const request = { expectedUserId: ctx.a.id, study: study() };
    const expected = { status: "synced", seriesCount: 1, instanceCount: 1 };
    expect(await submitCatalogStudy(ctx.a.client, request)).toEqual(expected);
    expect(await submitCatalogStudy(ctx.a.client, request)).toEqual(expected);
  });

  it("세션 계정과 기대 계정이 다르면 account-mismatch", async () => {
    expect(
      await submitCatalogStudy(ctx.b.client, {
        expectedUserId: ctx.a.id,
        study: study(),
      }),
    ).toEqual({ status: "account-mismatch" });
  });

  it("같은 SOP 의 다른 내용은 instance 충돌, 다른 검사의 시리즈는 series 충돌", async () => {
    await submitCatalogStudy(ctx.a.client, {
      expectedUserId: ctx.a.id,
      study: study(),
    });
    expect(
      await submitCatalogStudy(ctx.a.client, {
        expectedUserId: ctx.a.id,
        study: study(D(2)),
      }),
    ).toEqual({ status: "conflict", kind: "instance" });
    expect(
      await submitCatalogStudy(ctx.a.client, {
        expectedUserId: ctx.a.id,
        study: { ...study(D(3), "2.25.9102"), studyInstanceUid: "2.25.9999" },
      }),
    ).toEqual({ status: "conflict", kind: "series" });
  });

  it("DB 형식 제약 위반은 invalid", async () => {
    expect(
      await submitCatalogStudy(ctx.a.client, {
        expectedUserId: ctx.a.id,
        study: study("not-a-digest"),
      }),
    ).toEqual({ status: "invalid" });
  });

  it("로그인하지 않은 클라이언트는 unauthenticated", async () => {
    expect(
      await submitCatalogStudy(ctx.anon, {
        expectedUserId: ctx.a.id,
        study: study(),
      }),
    ).toEqual({ status: "unauthenticated" });
  });
});
