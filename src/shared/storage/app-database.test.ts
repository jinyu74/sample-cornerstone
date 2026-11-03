import { describe, expect, it } from "vitest";

import {
  openDatabase,
  requestToPromise,
  transactionDone,
} from "@/shared/lib/indexed-db";

import { APP_DATABASE_VERSION, openAppDatabase, STORE } from "./app-database";

describe("앱 데이터베이스 마이그레이션", () => {
  it("버전 1(원본·메타데이터만) 데이터를 보존한 채 작업 결과 저장소(works)를 추가한다", async () => {
    const name = "migration-v1-to-v2";
    const v1 = await openDatabase({
      factory: indexedDB,
      name,
      version: 1,
      upgrade(database) {
        database.createObjectStore("instances", { keyPath: "sopInstanceUid" });
        database.createObjectStore("files", { keyPath: "sopInstanceUid" });
      },
    });
    const tx = v1.transaction("instances", "readwrite");
    tx.objectStore("instances").add({
      sopInstanceUid: "2.25.1",
      studyInstanceUid: "2.25.9",
      seriesInstanceUid: "2.25.8",
    });
    await transactionDone(tx);
    v1.close();

    const upgraded = await openAppDatabase(indexedDB, name);

    expect(APP_DATABASE_VERSION).toBe(2);
    expect([...upgraded.objectStoreNames].sort()).toEqual(
      [STORE.files, STORE.instances, STORE.works].sort(),
    );
    const kept = await requestToPromise(
      upgraded.transaction("instances").objectStore("instances").get("2.25.1"),
    );
    expect(kept).toMatchObject({ sopInstanceUid: "2.25.1" });
    upgraded.close();
  });
});
