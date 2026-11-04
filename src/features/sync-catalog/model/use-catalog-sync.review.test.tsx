import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  CatalogSyncOutcome,
  CatalogSyncRequest,
  DicomStore,
  StoredInstanceRecord,
} from "@/entities/dicom-study";

import { useCatalogSync } from "./use-catalog-sync";

const STUDY = "2.25.1";
function record(index: number): StoredInstanceRecord {
  const ids = {
    studyInstanceUid: STUDY,
    seriesInstanceUid: "2.25.10",
    sopInstanceUid: `2.25.100.${index}`,
  };
  return {
    ...ids,
    contentDigest: index.toString(16).padStart(64, "0"),
    byteLength: 1,
    importedAt: "2026-11-04T00:00:00.000Z",
    metadata: {
      ...ids,
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      rows: 1,
      columns: 1,
      numberOfFrames: 1,
      frameKind: "single",
    },
  };
}

describe("동기화 중 같은 검사에 영상을 추가 가져오는 경계", () => {
  it("첫 전송이 진행 중일 때 새 원본을 추가하고 반영을 요청해도 마지막 원본까지 서버에 반영한다", async () => {
    let records = [record(1)];
    const store: DicomStore = {
      listInstances: async () => structuredClone(records),
      addInstance: async () => undefined,
      getInstance: async () => undefined,
      getFile: async () => undefined,
      listSeriesInstances: async () => [],
      close: () => undefined,
    };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const serverSops = new Set<string>();
    let calls = 0;
    const submit = async (
      request: CatalogSyncRequest,
    ): Promise<CatalogSyncOutcome> => {
      calls += 1;
      if (calls === 1) await pending;
      for (const series of request.study.series)
        for (const instance of series.instances)
          serverSops.add(instance.sopInstanceUid);
      return {
        status: "synced",
        seriesCount: 1,
        instanceCount: serverSops.size,
      };
    };
    const { result } = renderHook(() =>
      useCatalogSync({
        userId: "8f14e45f-ceea-4e7a-9b1c-000000000001",
        store,
        submit,
      }),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.syncStudies([STUDY]);
    });
    await waitFor(() => expect(calls).toBe(1));
    records = [...records, record(2)];
    let second!: Promise<void>;
    act(() => {
      second = result.current.syncStudies([STUDY]);
    });
    await act(async () => {
      release();
      await Promise.all([first, second]);
    });
    await waitFor(() =>
      expect(serverSops).toEqual(new Set(records.map((r) => r.sopInstanceUid))),
    );
    expect(result.current.states.get(STUDY)).toEqual({ kind: "synced" });
  });
});
