import { describe, expect, it } from "vitest";

import {
  type CatalogStudySummary,
  groupStudies,
  type DicomInstanceMetadata,
} from "@/entities/dicom-study";

import { buildCatalogRows, type LocalCatalog } from "./build-catalog-rows";

const D = (n: number) => n.toString(16).padStart(64, "0");

function meta(
  sop: string,
  overrides: Partial<DicomInstanceMetadata> = {},
): DicomInstanceMetadata {
  return {
    sopInstanceUid: sop,
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.10",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    modality: "CT",
    studyDate: "20261101",
    accessionNumber: "SYN-ACC",
    patientId: "SYN-0001",
    rows: 1,
    columns: 1,
    numberOfFrames: 1,
    frameKind: "single",
    ...overrides,
  };
}

function local(
  entries: [DicomInstanceMetadata, string][],
  status: LocalCatalog["status"] = "ready",
): LocalCatalog {
  const manifest = new Map<string, Map<string, string>>();
  for (const [m, digest] of entries) {
    const study = manifest.get(m.studyInstanceUid) ?? new Map();
    study.set(m.sopInstanceUid, digest);
    manifest.set(m.studyInstanceUid, study);
  }
  return {
    status,
    studies: groupStudies(entries.map(([m]) => m)),
    manifest,
  };
}

const server = (
  overrides: Partial<CatalogStudySummary> = {},
): CatalogStudySummary => ({
  studyInstanceUid: "2.25.1",
  studyDate: "20261101",
  accessionNumber: "SYN-ACC",
  modalities: ["CT"],
  seriesCount: 1,
  seriesInstanceUids: ["2.25.10"],
  instanceCount: 2,
  instances: [
    { sopInstanceUid: "2.25.1.1", contentDigest: D(1) },
    { sopInstanceUid: "2.25.1.2", contentDigest: D(2) },
  ],
  ...overrides,
});

const LOADING: LocalCatalog = {
  status: "loading",
  studies: [],
  manifest: new Map(),
};
const NO_WORKS = { status: "ready" as const, statuses: new Map() };

describe("buildCatalogRows", () => {
  it("최초 HTML(이 브라우저 확인 전)에는 서버 행을 그리되 원본·작업·반영 상태는 확인 중이다", () => {
    expect(
      buildCatalogRows({
        server: { status: "ready", studies: [server()] },
        local: LOADING,
        works: { status: "loading", statuses: new Map() },
        sync: new Map(),
      }),
    ).toEqual([
      {
        studyInstanceUid: "2.25.1",
        studyDate: "20261101",
        displayDate: "2026.11.01",
        identifier: "SYN-ACC",
        modalities: ["CT"],
        seriesCount: 1,
        localOriginals: 0,
        workStatus: "checking",
        originals: { kind: "checking" },
        sync: { kind: "checking" },
      },
    ]);
  });

  it("서버에만 있는 검사는 원본 없음이고, 작업 상태를 미작업으로 단정하지 않는다", () => {
    const [row] = buildCatalogRows({
      server: { status: "ready", studies: [server()] },
      local: local([]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(row).toMatchObject({
      originals: { kind: "missing", total: 2 },
      workStatus: "unknown",
      sync: { kind: "synced" },
    });
  });

  it("서버 식별자는 patientId 없이 accession → study ID → UID 순으로 정한다", () => {
    const rows = buildCatalogRows({
      server: {
        status: "ready",
        studies: [
          server({ accessionNumber: undefined, studyId: "S9" }),
          server({
            studyInstanceUid: "2.25.2",
            accessionNumber: undefined,
            instances: [],
          }),
        ],
      },
      local: local([]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(rows.map((row) => row.identifier)).toEqual(["S9", "2.25.2"]);
  });

  it("같은 원본이 모두 있으면 기존 로컬 행(식별자·작업 상태)을 쓰고 원본 있음·반영됨이다", () => {
    const [row] = buildCatalogRows({
      server: { status: "ready", studies: [server()] },
      local: local([
        [meta("2.25.1.1", { accessionNumber: undefined }), D(1)],
        [meta("2.25.1.2", { accessionNumber: undefined }), D(2)],
      ]),
      works: { status: "ready", statuses: new Map([["2.25.1", "done"]]) },
      sync: new Map(),
    });
    expect(row).toMatchObject({
      // 이 브라우저 원본이 있으면 기존 목록과 같은 식별자 규칙(patientId 포함)을 유지한다
      identifier: "SYN-0001",
      originals: { kind: "complete", total: 2 },
      workStatus: "done",
      sync: { kind: "synced" },
    });
  });

  it("원본이 일부만 있으면 일부 있음이며, 이 브라우저 작업 기록이 없으면 기존처럼 미작업이다", () => {
    const [row] = buildCatalogRows({
      server: { status: "ready", studies: [server()] },
      local: local([[meta("2.25.1.2"), D(2)]]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(row).toMatchObject({
      originals: { kind: "partial", present: 1, total: 2 },
      workStatus: "untouched",
    });
  });

  it("서버에 없는 로컬 전용 검사는 숨기지 않고 미반영 수를 보여 준다", () => {
    const rows = buildCatalogRows({
      server: { status: "ready", studies: [] },
      local: local([
        [meta("2.25.1.1"), D(1)],
        [meta("2.25.1.2"), D(2)],
      ]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(rows).toEqual([
      expect.objectContaining({
        studyInstanceUid: "2.25.1",
        originals: { kind: "complete", total: 2 },
        sync: { kind: "unsynced", count: 2 },
        workStatus: "untouched",
      }),
    ]);
  });

  it("서버 일부만 반영된 검사는 남은 미반영 수를 보여 준다", () => {
    const [row] = buildCatalogRows({
      server: { status: "ready", studies: [server()] },
      local: local([
        [meta("2.25.1.1"), D(1)],
        [meta("2.25.1.2"), D(2)],
        [meta("2.25.1.3"), D(3)],
      ]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(row!.sync).toEqual({ kind: "unsynced", count: 1 });
  });

  it("진행 중·실패한 반영 상태는 계산한 상태보다 우선한다", () => {
    const rows = buildCatalogRows({
      server: { status: "ready", studies: [] },
      local: local([
        [meta("2.25.1.1"), D(1)],
        [meta("2.25.2.1", { studyInstanceUid: "2.25.2" }), D(2)],
      ]),
      works: NO_WORKS,
      sync: new Map([
        ["2.25.1", { kind: "syncing" }],
        ["2.25.2", { kind: "failed", reason: "network" }],
      ]),
    });
    expect(
      Object.fromEntries(rows.map((r) => [r.studyInstanceUid, r.sync])),
    ).toEqual({
      "2.25.1": { kind: "syncing" },
      "2.25.2": { kind: "failed", reason: "network" },
    });
  });

  it("서버 목록을 읽지 못하면 로컬 검사는 그대로 보이고 반영 여부는 확인 불가다", () => {
    const rows = buildCatalogRows({
      server: { status: "unavailable" },
      local: local([[meta("2.25.1.1"), D(1)]]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(rows).toEqual([
      expect.objectContaining({
        originals: { kind: "complete", total: 1 },
        sync: { kind: "unknown" },
      }),
    ]);
  });

  it("이 브라우저 저장소를 읽지 못하면 서버 행의 원본은 확인 실패이고 작업 상태도 단정하지 않는다", () => {
    const [row] = buildCatalogRows({
      server: { status: "ready", studies: [server()] },
      local: { status: "error", studies: [], manifest: new Map() },
      works: { status: "error", statuses: new Map() },
      sync: new Map(),
    });
    expect(row).toMatchObject({
      originals: { kind: "unreadable" },
      workStatus: "unknown",
    });
  });

  it("최근 날짜 순, 날짜 없는 검사는 뒤, 같으면 UID 순으로 정렬한다", () => {
    const rows = buildCatalogRows({
      server: {
        status: "ready",
        studies: [
          server({
            studyInstanceUid: "2.25.9",
            studyDate: undefined,
            instances: [],
          }),
          server({
            studyInstanceUid: "2.25.3",
            studyDate: "20250101",
            instances: [],
          }),
        ],
      },
      local: local([
        [
          meta("2.25.5.1", {
            studyInstanceUid: "2.25.5",
            studyDate: "20261231",
          }),
          D(5),
        ],
      ]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(rows.map((row) => row.studyInstanceUid)).toEqual([
      "2.25.5",
      "2.25.3",
      "2.25.9",
    ]);
  });

  it("시리즈 수는 서버 목록과 이 브라우저 원본의 시리즈 합집합(UID 기준)이다", () => {
    const [row] = buildCatalogRows({
      server: {
        status: "ready",
        studies: [
          server({
            seriesCount: 2,
            seriesInstanceUids: ["2.25.10", "2.25.20"],
          }),
        ],
      },
      local: local([
        [meta("2.25.1.1"), D(1)],
        [meta("2.25.1.9", { seriesInstanceUid: "2.25.30" }), D(9)],
      ]),
      works: NO_WORKS,
      sync: new Map(),
    });
    // 서버 {10, 20} ∪ 로컬 {10, 30} = 3 (최댓값 2 가 아니다)
    expect(row!.seriesCount).toBe(3);
  });

  it("서버 기록과 맞는 원본이 없어도 이 브라우저에 미반영 원본이 있으면 원본 수를 알리고 열 수 있게 둔다", () => {
    const [row] = buildCatalogRows({
      server: { status: "ready", studies: [server()] },
      local: local([[meta("2.25.1.9"), D(9)]]),
      works: NO_WORKS,
      sync: new Map(),
    });
    expect(row).toMatchObject({
      // 서버 기록 대비 일치는 그대로(서버 영상 0/2)
      originals: { kind: "missing", total: 2 },
      localOriginals: 1,
      workStatus: "untouched",
      sync: { kind: "unsynced", count: 1 },
    });
  });
});
