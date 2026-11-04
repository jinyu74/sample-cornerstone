import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createIndexedDbDicomStore } from "../api/indexed-db-dicom-store";
import type { DicomStore, StoredInstanceRecord } from "../api/types";

import { useSeriesStack, useStudyCatalog } from "./use-study-catalog";

let counter = 0;
const stores: DicomStore[] = [];
function newStore() {
  const store = createIndexedDbDicomStore({
    databaseName: `catalog-test-${(counter += 1)}`,
  });
  stores.push(store);
  return store;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
});

function record(
  sop: string,
  study: string,
  series: string,
  z: number,
): StoredInstanceRecord {
  return {
    sopInstanceUid: sop,
    studyInstanceUid: study,
    seriesInstanceUid: series,
    contentDigest: sop,
    byteLength: 1,
    importedAt: "2026-11-02T00:00:00.000Z",
    metadata: {
      sopInstanceUid: sop,
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      studyInstanceUid: study,
      seriesInstanceUid: series,
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      rows: 2,
      columns: 2,
      numberOfFrames: 1,
      frameKind: "single",
      imagePositionPatient: [0, 0, z],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    },
  };
}

describe("useStudyCatalog", () => {
  it("서버 목록과 비교할 검사별 원본 manifest(SOP UID → digest)를 함께 준다", async () => {
    const store = newStore();
    await store.addInstance(
      record("2.25.11", "2.25.1", "2.25.10", 0),
      new ArrayBuffer(1),
    );
    await store.addInstance(
      record("2.25.12", "2.25.1", "2.25.10", 1),
      new ArrayBuffer(1),
    );
    await store.addInstance(
      record("2.25.21", "2.25.2", "2.25.20", 0),
      new ArrayBuffer(1),
    );
    const { result } = renderHook(() => useStudyCatalog(store));
    expect(result.current.manifest.size).toBe(0);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.manifest).toEqual(
      new Map([
        [
          "2.25.1",
          new Map([
            ["2.25.11", "2.25.11"],
            ["2.25.12", "2.25.12"],
          ]),
        ],
        ["2.25.2", new Map([["2.25.21", "2.25.21"]])],
      ]),
    );
  });

  it("저장소가 비어 있으면 빈 목록으로 ready", async () => {
    const { result } = renderHook(() => useStudyCatalog(newStore()));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.studies).toEqual([]);
  });

  it("저장된 영상을 검사로 묶고 reload 로 새 영상을 반영한다", async () => {
    const store = newStore();
    await store.addInstance(
      record("2.25.11", "2.25.1", "2.25.10", 0),
      new ArrayBuffer(1),
    );
    const { result } = renderHook(() => useStudyCatalog(store));
    await waitFor(() => expect(result.current.studies).toHaveLength(1));

    await store.addInstance(
      record("2.25.21", "2.25.2", "2.25.20", 0),
      new ArrayBuffer(1),
    );
    await act(() => result.current.reload());

    expect(
      result.current.studies.map((study) => study.studyInstanceUid),
    ).toEqual(["2.25.1", "2.25.2"]);
  });

  it("저장소를 읽지 못하면 error 상태와 이유를 돌려준다(빈 목록으로 숨기지 않음)", async () => {
    const store = createIndexedDbDicomStore({ indexedDB: null });

    const { result } = renderHook(() => useStudyCatalog(store));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toContain("IndexedDB");
  });
});

describe("useSeriesStack", () => {
  it("검사·시리즈 UID 로 정렬된 스택을 불러온다", async () => {
    const store = newStore();
    await store.addInstance(
      record("2.25.12", "2.25.1", "2.25.10", 5),
      new ArrayBuffer(1),
    );
    await store.addInstance(
      record("2.25.11", "2.25.1", "2.25.10", 0),
      new ArrayBuffer(1),
    );
    await store.addInstance(
      record("2.25.13", "2.25.2", "2.25.10", -5),
      new ArrayBuffer(1),
    );

    const { result } = renderHook(() =>
      useSeriesStack(store, "2.25.1", "2.25.10"),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(
      result.current.series?.stack.ordered.map((item) => item.sopInstanceUid),
    ).toEqual(["2.25.11", "2.25.12"]);
  });

  it("없는 시리즈는 not-found", async () => {
    const { result } = renderHook(() =>
      useSeriesStack(newStore(), "2.25.1", "2.25.99"),
    );

    await waitFor(() => expect(result.current.status).toBe("not-found"));
    expect(result.current.series).toBeUndefined();
  });
});
