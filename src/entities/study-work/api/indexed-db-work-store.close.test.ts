import { afterEach, describe, expect, it } from "vitest";

import { createStudyWork } from "../model/work-document";
import type { StudyWork } from "../model/types";

import { createIndexedDbWorkStore } from "./indexed-db-work-store";
import type { StudyWorkStore } from "./types";

let counter = 0;
const stores: StudyWorkStore[] = [];
function open(databaseName = `work-close-${(counter += 1)}`) {
  const store = createIndexedDbWorkStore({ databaseName });
  stores.push(store);
  return { store, databaseName };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

const work = (revision: number): StudyWork => ({
  ...createStudyWork("2.25.1", "2026-11-03T00:00:00.000Z"),
  revision,
});
const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("StudyWorkStore.close: 즉시 닫기", () => {
  it("close 전에 시작한 저장은 끝까지 기록된다", async () => {
    const { store, databaseName } = open();
    const saving = store.saveWork(work(1));
    store.close();
    await expect(saving).resolves.toBeUndefined();
    expect((await open(databaseName).store.getWork("2.25.1"))?.revision).toBe(
      1,
    );
  });

  it("close 뒤에 시작한 쓰기는 거부한다", async () => {
    const { store } = open();
    store.close();
    await expect(store.saveWork(work(1))).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("StudyWorkStore.closeWhenIdle: 진행 중 저장이 이어지는 동안 닫지 않는다", () => {
  it("첫 저장이 끝난 직후 이어서 요청한 저장(직렬 flush)까지 기록한 뒤 닫는다", async () => {
    const { store, databaseName } = open();
    // useStudyWork.flush 처럼 첫 저장이 끝나면 다음 revision 을 이어서 저장한다
    const chain = store.saveWork(work(1)).then(() => store.saveWork(work(2)));
    store.closeWhenIdle();
    await expect(chain).resolves.toBeUndefined();
    expect((await open(databaseName).store.getWork("2.25.1"))?.revision).toBe(
      2,
    );
  });

  it("진행 중인 작업이 없으면 다음 틱 이후 닫혀 새 쓰기를 거부한다", async () => {
    const { store } = open();
    await store.saveWork(work(1));
    store.closeWhenIdle();
    await nextMacrotask();
    await nextMacrotask();
    await expect(store.saveWork(work(2))).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
