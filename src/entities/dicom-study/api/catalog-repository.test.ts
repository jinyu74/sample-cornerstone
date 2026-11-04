import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  CatalogUnavailableError,
  readCatalogSummaries,
} from "./catalog-repository";

type Page = { data: unknown[] | null; error: unknown };

/** PostgREST 질의 빌더 대역: 호출마다 pages 의 다음 응답을 돌려준다(끝나면 마지막 응답 반복) */
function fakeClient(pages: Record<string, Page[]>) {
  const calls: Record<string, number> = {};
  const client = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        gt: () => builder,
        then(resolve: (value: Page) => unknown) {
          const index = calls[table] ?? 0;
          calls[table] = index + 1;
          const list = pages[table]!;
          return Promise.resolve(list[Math.min(index, list.length - 1)]!).then(
            resolve,
          );
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const summary = (uid: string) => ({
  study_instance_uid: uid,
  study_date: null,
  study_description: null,
  study_id: null,
  accession_number: null,
  modalities: null,
  series_count: 0,
  instance_count: 0,
});

describe("readCatalogSummaries 페이지 안전장치", () => {
  it("서버가 진행하지 않고 같은 페이지를 반복하면 끝없이 돌지 않고 오류로 멈춘다", async () => {
    const { client, calls } = fakeClient({
      catalog_study_summaries: [{ data: [summary("2.25.1")], error: null }],
      catalog_series: [{ data: [], error: null }],
      catalog_instances: [{ data: [], error: null }],
    });
    await expect(readCatalogSummaries(client, "owner")).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
    expect(calls.catalog_study_summaries).toBe(2);
  });

  it("DB 오류는 빈 목록이 아니라 서버 목록 오류로 알린다", async () => {
    const { client } = fakeClient({
      catalog_study_summaries: [{ data: null, error: { code: "57P01" } }],
      catalog_series: [{ data: [], error: null }],
      catalog_instances: [{ data: [], error: null }],
    });
    await expect(readCatalogSummaries(client, "owner")).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
  });

  it("빈 페이지에서 끝나고 선택 값이 없으면 키를 생략한다", async () => {
    const { client } = fakeClient({
      catalog_study_summaries: [
        { data: [summary("2.25.1")], error: null },
        { data: [], error: null },
      ],
      catalog_series: [{ data: [], error: null }],
      catalog_instances: [{ data: [], error: null }],
    });
    expect(await readCatalogSummaries(client, "owner")).toEqual([
      {
        studyInstanceUid: "2.25.1",
        modalities: [],
        seriesCount: 0,
        seriesInstanceUids: [],
        instanceCount: 0,
        instances: [],
      },
    ]);
  });
});
