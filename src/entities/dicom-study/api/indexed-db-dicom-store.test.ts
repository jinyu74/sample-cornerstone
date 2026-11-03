import { afterEach, describe, expect, it, vi } from "vitest";

import type { DicomInstanceMetadata } from "../model/types";

import { createIndexedDbDicomStore } from "./indexed-db-dicom-store";
import type { DicomStore, StoredInstanceRecord } from "./types";

let databaseCounter = 0;
const stores: DicomStore[] = [];

function openStore(
  databaseName = `dicom-store-test-${(databaseCounter += 1)}`,
) {
  const store = createIndexedDbDicomStore({ databaseName });
  stores.push(store);
  return { store, databaseName };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
});

function record(
  sopInstanceUid: string,
  overrides: Partial<DicomInstanceMetadata> = {},
): StoredInstanceRecord {
  return {
    sopInstanceUid,
    studyInstanceUid: overrides.studyInstanceUid ?? "2.25.1",
    seriesInstanceUid: overrides.seriesInstanceUid ?? "2.25.10",
    contentDigest: `digest-${sopInstanceUid}`,
    byteLength: 4,
    importedAt: "2026-11-02T00:00:00.000Z",
    metadata: {
      sopInstanceUid,
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.10",
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      rows: 2,
      columns: 2,
      numberOfFrames: 1,
      frameKind: "single",
      ...overrides,
    },
  };
}

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe("IndexedDB DicomStore (S6-1, S6-4, S2-4)", () => {
  it("메타데이터와 원본 바이트를 별도 저장소에 저장하고 그대로 읽는다", async () => {
    const { store } = openStore();

    await store.addInstance(record("2.25.100"), bytes(1, 2, 3, 4));

    expect(await store.getInstance("2.25.100")).toEqual(record("2.25.100"));
    expect(new Uint8Array((await store.getFile("2.25.100"))!)).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(await store.getInstance("2.25.missing")).toBeUndefined();
    expect(await store.getFile("2.25.missing")).toBeUndefined();
  });

  it("데이터베이스를 다시 열어도(새로고침) 저장된 내용이 남아 있다", async () => {
    const first = openStore();
    await first.store.addInstance(record("2.25.200"), bytes(9, 9));
    first.store.close();

    const reopened = openStore(first.databaseName);

    expect(
      (await reopened.store.listInstances()).map((item) => item.sopInstanceUid),
    ).toEqual(["2.25.200"]);
  });

  it("검사·시리즈 조합으로 영상을 조회하고 다른 검사의 같은 시리즈 UID 를 섞지 않는다", async () => {
    const { store } = openStore();
    await store.addInstance(
      record("2.25.301", {
        studyInstanceUid: "2.25.1",
        seriesInstanceUid: "2.25.10",
      }),
      bytes(1),
    );
    await store.addInstance(
      record("2.25.302", {
        studyInstanceUid: "2.25.2",
        seriesInstanceUid: "2.25.10",
      }),
      bytes(2),
    );
    await store.addInstance(
      record("2.25.303", {
        studyInstanceUid: "2.25.1",
        seriesInstanceUid: "2.25.10",
      }),
      bytes(3),
    );

    const series = await store.listSeriesInstances("2.25.1", "2.25.10");

    expect(series.map((item) => item.sopInstanceUid).sort()).toEqual([
      "2.25.301",
      "2.25.303",
    ]);
  });

  it("이미 있는 SOP Instance UID 는 덮어쓰지 않고 already-exists 로 거부하며 기존 데이터를 보존한다", async () => {
    const { store } = openStore();
    await store.addInstance(record("2.25.400"), bytes(1, 1));

    const replacement = { ...record("2.25.400"), contentDigest: "other" };
    await expect(
      store.addInstance(replacement, bytes(2, 2)),
    ).rejects.toMatchObject({
      name: "DicomStoreError",
      code: "already-exists",
    });

    expect((await store.getInstance("2.25.400"))!.contentDigest).toBe(
      "digest-2.25.400",
    );
    expect(new Uint8Array((await store.getFile("2.25.400"))!)).toEqual(
      new Uint8Array([1, 1]),
    );
  });

  it("저장 용량 초과 시 quota-exceeded 로 실패하고 메타데이터만 남는 부분 저장 없이 기존 데이터를 보존한다", async () => {
    const { store } = openStore();
    await store.addInstance(record("2.25.500"), bytes(5));

    const originalAdd = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "files") {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      }
      return originalAdd.apply(this, args);
    });

    await expect(
      store.addInstance(record("2.25.501"), bytes(6)),
    ).rejects.toMatchObject({
      name: "DicomStoreError",
      code: "quota-exceeded",
    });
    vi.restoreAllMocks();

    expect(await store.getInstance("2.25.501")).toBeUndefined();
    expect(await store.getFile("2.25.501")).toBeUndefined();
    expect(
      (await store.listInstances()).map((item) => item.sopInstanceUid),
    ).toEqual(["2.25.500"]);
    expect(new Uint8Array((await store.getFile("2.25.500"))!)).toEqual(
      new Uint8Array([5]),
    );
  });

  it("IndexedDB 를 사용할 수 없으면 unavailable 로 실패한다", async () => {
    const store = createIndexedDbDicomStore({
      databaseName: "none",
      indexedDB: null,
    });
    stores.push(store);

    await expect(store.listInstances()).rejects.toMatchObject({
      name: "DicomStoreError",
      code: "unavailable",
    });
  });
});
