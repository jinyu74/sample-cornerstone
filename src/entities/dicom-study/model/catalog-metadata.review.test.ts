import { describe, expect, it } from "vitest";

import type { StoredInstanceRecord } from "../api/types";

import {
  CATALOG_LIMITS,
  parseCatalogSyncRequest,
  projectCatalogStudy,
} from "./catalog-metadata";

const STUDY = "2.25.1";
const USER = "8f14e45f-ceea-4e7a-9b1c-000000000001";

/** 여러 시리즈를 가진 한 검사를 가져와도 각 요청은 서버 수신 상한 안에 있어야 한다. */
function instance(index: number): StoredInstanceRecord {
  const identity = {
    studyInstanceUid: STUDY,
    seriesInstanceUid: `2.25.10.${index + 1}`,
    sopInstanceUid: `2.25.20.${index + 1}`,
  };
  return {
    ...identity,
    contentDigest: (index + 1).toString(16).padStart(64, "0"),
    byteLength: 1,
    importedAt: "2026-11-04T00:00:00.000Z",
    metadata: {
      ...identity,
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      rows: 1,
      columns: 1,
      numberOfFrames: 1,
      frameKind: "single",
    },
  };
}

describe("큰 검사 메타데이터 동기화의 시리즈 경계", () => {
  it("영상 수는 작아도 시리즈 수가 상한을 넘으면 유효한 요청들로 나누고 모든 영상을 정확히 한 번 보낸다", () => {
    const records = Array.from(
      { length: CATALOG_LIMITS.maxSeriesPerRequest + 1 },
      (_, index) => instance(index),
    );
    const chunks = projectCatalogStudy(STUDY, records);
    expect(chunks.length).toBeGreaterThan(1);
    for (const study of chunks) {
      expect(study.series.length).toBeLessThanOrEqual(
        CATALOG_LIMITS.maxSeriesPerRequest,
      );
      expect(
        parseCatalogSyncRequest({ expectedUserId: USER, study }),
      ).toMatchObject({ ok: true });
    }
    const sent = chunks.flatMap((study) =>
      study.series.flatMap((series) =>
        series.instances.map((record) => record.sopInstanceUid),
      ),
    );
    expect(sent).toHaveLength(records.length);
    expect(new Set(sent)).toEqual(
      new Set(records.map((record) => record.sopInstanceUid)),
    );
  });
});
