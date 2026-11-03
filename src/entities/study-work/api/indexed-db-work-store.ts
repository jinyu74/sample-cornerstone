import { requestToPromise, transactionDone } from "@/shared/lib/indexed-db";
import { APP_DATABASE_NAME, openAppDatabase, STORE } from "@/shared/storage";

import type { StudyWork } from "../model/types";

import { type StudyWorkStore, WorkStoreError } from "./types";

export interface IndexedDbWorkStoreOptions {
  databaseName?: string;
  /** 기본값은 globalThis.indexedDB. null 이면 사용할 수 없는 환경으로 본다 */
  indexedDB?: IDBFactory | null;
}

export function createIndexedDbWorkStore(
  options: IndexedDbWorkStoreOptions = {},
): StudyWorkStore {
  const factory =
    options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
  const databaseName = options.databaseName ?? APP_DATABASE_NAME;
  let opening: Promise<IDBDatabase> | undefined;
  let closed = false;

  function database(): Promise<IDBDatabase> {
    if (closed)
      return Promise.reject(
        new WorkStoreError("unavailable", "저장소가 닫혔습니다"),
      );
    if (!factory) {
      return Promise.reject(
        new WorkStoreError(
          "unavailable",
          "이 브라우저에서 IndexedDB 를 사용할 수 없습니다",
        ),
      );
    }
    opening ??= openAppDatabase(factory, databaseName).catch(
      (error: unknown) => {
        opening = undefined;
        throw new WorkStoreError(
          "unavailable",
          "로컬 저장소를 열 수 없습니다",
          { cause: error },
        );
      },
    );
    return opening;
  }

  return {
    async getWork(studyInstanceUid) {
      const db = await database();
      try {
        return await requestToPromise<StudyWork | undefined>(
          db
            .transaction(STORE.works, "readonly")
            .objectStore(STORE.works)
            .get(studyInstanceUid),
        );
      } catch (error) {
        throw toWorkStoreError(error);
      }
    },

    async listWorks() {
      const db = await database();
      try {
        return await requestToPromise<StudyWork[]>(
          db
            .transaction(STORE.works, "readonly")
            .objectStore(STORE.works)
            .getAll(),
        );
      } catch (error) {
        throw toWorkStoreError(error);
      }
    },

    async saveWork(work) {
      const db = await database();
      const transaction = db.transaction(STORE.works, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(STORE.works);
      let stale: WorkStoreError | undefined;
      try {
        // 같은 트랜잭션 안에서 저장된 revision 과 비교해 오래된 쓰기를 거부한다.
        const current = await requestToPromise<StudyWork | undefined>(
          store.get(work.studyInstanceUid),
        );
        if (current && current.revision > work.revision) {
          stale = new WorkStoreError(
            "stale",
            `더 최신 결과(revision ${current.revision})가 이미 저장되어 있어 revision ${work.revision} 을 저장하지 않았습니다`,
          );
          transaction.abort();
        } else {
          store.put(work);
        }
      } catch (error) {
        transaction.abort();
        await done.catch(() => undefined);
        throw toWorkStoreError(error);
      }
      try {
        await done;
      } catch (error) {
        throw stale ?? toWorkStoreError(error);
      }
      if (stale) throw stale;
    },

    close() {
      closed = true;
      void opening?.then((db) => db.close()).catch(() => undefined);
    },
  };
}

function toWorkStoreError(error: unknown): WorkStoreError {
  if (error instanceof WorkStoreError) return error;
  const name =
    error instanceof DOMException || error instanceof Error
      ? error.name
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (name === "QuotaExceededError") {
    return new WorkStoreError(
      "quota-exceeded",
      "브라우저 저장 용량이 부족해 작업 결과를 저장하지 못했습니다",
      {
        cause: error,
      },
    );
  }
  if (name === "InvalidStateError" || name === "UnknownError") {
    return new WorkStoreError("unavailable", message, { cause: error });
  }
  return new WorkStoreError("unknown", message, { cause: error });
}
