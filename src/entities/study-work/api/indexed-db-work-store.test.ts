import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LABELS } from "../model/labels";
import type { StudyWork } from "../model/types";

import { createIndexedDbWorkStore } from "./indexed-db-work-store";
import type { StudyWorkStore } from "./types";

let counter = 0;
const stores: StudyWorkStore[] = [];
function open(databaseName = `work-store-${(counter += 1)}`) {
  const store = createIndexedDbWorkStore({ databaseName });
  stores.push(store);
  return { store, databaseName };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
});

function work(revision: number, note = ""): StudyWork {
  return {
    schemaVersion: 1,
    studyInstanceUid: "2.25.1",
    labels: [...DEFAULT_LABELS],
    targets: [],
    annotations: [
      {
        id: "a1",
        tool: "arrow",
        reference: {
          studyInstanceUid: "2.25.1",
          seriesInstanceUid: "2.25.2",
          sopInstanceUid: "2.25.3",
        },
        imagePoints: [
          [1, 1],
          [2, 2],
        ],
        note,
        visible: true,
        createdAt: "2026-11-02T00:00:00.000Z",
        updatedAt: "2026-11-02T00:00:00.000Z",
      },
    ],
    completed: false,
    revision,
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

describe("IndexedDB StudyWorkStore (S6-1, S6-4)", () => {
  it("작업 결과를 저장·조회하고 다시 열어도(새로고침) 남아 있다", async () => {
    const first = open();
    await first.store.saveWork(work(1, "첫 메모"));
    first.store.close();

    const reopened = open(first.databaseName);

    expect(await reopened.store.getWork("2.25.1")).toEqual(work(1, "첫 메모"));
    expect(await reopened.store.getWork("2.25.404")).toBeUndefined();
    expect(
      (await reopened.store.listWorks()).map((item) => item.studyInstanceUid),
    ).toEqual(["2.25.1"]);
  });

  it("저장된 revision 보다 오래된 쓰기는 stale 로 거부하고 최신 결과를 유지한다", async () => {
    const { store } = open();
    await store.saveWork(work(5, "최신"));

    await expect(store.saveWork(work(3, "오래됨"))).rejects.toMatchObject({
      name: "WorkStoreError",
      code: "stale",
    });

    expect((await store.getWork("2.25.1"))!.annotations[0]!.note).toBe("최신");
    await store.saveWork(work(5, "같은 revision 재저장"));
    await store.saveWork(work(6, "다음"));
    expect((await store.getWork("2.25.1"))!.revision).toBe(6);
  });

  it("저장 용량 초과는 quota-exceeded 로 실패하고 이전 결과를 보존한다", async () => {
    const { store } = open();
    await store.saveWork(work(1, "보존"));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    });

    await expect(store.saveWork(work(2, "실패"))).rejects.toMatchObject({
      code: "quota-exceeded",
    });
    vi.restoreAllMocks();

    expect((await store.getWork("2.25.1"))!.annotations[0]!.note).toBe("보존");
  });

  it("IndexedDB 를 사용할 수 없으면 unavailable", async () => {
    const store = createIndexedDbWorkStore({ indexedDB: null });
    stores.push(store);

    await expect(store.getWork("2.25.1")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
