import {
  createConnectionLifecycle,
  requestToPromise,
  transactionDone,
} from "@/shared/lib/indexed-db";
import {
  APP_DATABASE_NAME,
  INDEX,
  openAppDatabase,
  STORE,
} from "@/shared/storage";

import {
  type DicomStore,
  DicomStoreError,
  type StoredInstanceRecord,
} from "./types";

export interface IndexedDbDicomStoreOptions {
  databaseName?: string;
  /** 기본값은 globalThis.indexedDB. null 이면 사용할 수 없는 환경으로 본다. */
  indexedDB?: IDBFactory | null;
}

interface StoredFile {
  sopInstanceUid: string;
  bytes: ArrayBuffer;
}

/** IndexedDB 구현. 계정 저장소 정리 시 진행 중 저장이 끝난 뒤 닫을 수 있다. */
export interface IndexedDbDicomStore extends DicomStore {
  /** 진행 중 작업과 그 직후 이어지는 작업(직렬 저장 flush)이 끝난 뒤 닫는다 */
  closeWhenIdle(): void;
  /** 실제로 닫힌 뒤 끝난다(계정 저장소 정리 완료 대기) */
  whenClosed(): Promise<void>;
}

export function createIndexedDbDicomStore(
  options: IndexedDbDicomStoreOptions = {},
): IndexedDbDicomStore {
  const factory =
    options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
  const databaseName = options.databaseName ?? APP_DATABASE_NAME;
  let opening: Promise<IDBDatabase> | undefined;
  const lifecycle = createConnectionLifecycle(() => {
    void opening?.then((db) => db.close()).catch(() => undefined);
  });

  function database(): Promise<IDBDatabase> {
    if (lifecycle.closed)
      return Promise.reject(
        new DicomStoreError("unavailable", "저장소가 닫혔습니다"),
      );
    if (!factory) {
      return Promise.reject(
        new DicomStoreError(
          "unavailable",
          "이 브라우저에서 IndexedDB 를 사용할 수 없습니다",
        ),
      );
    }
    opening ??= openAppDatabase(factory, databaseName).catch(
      (error: unknown) => {
        opening = undefined;
        throw new DicomStoreError(
          "unavailable",
          "로컬 저장소를 열 수 없습니다",
          { cause: error },
        );
      },
    );
    return opening;
  }

  async function read<T>(
    storeName: string,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await database();
    try {
      return await requestToPromise(
        run(db.transaction(storeName, "readonly").objectStore(storeName)),
      );
    } catch (error) {
      throw toStoreError(error);
    }
  }

  return {
    addInstance(record: StoredInstanceRecord, bytes: ArrayBuffer) {
      return lifecycle.track(async () => {
        const db = await database();
        const transaction = db.transaction(
          [STORE.instances, STORE.files],
          "readwrite",
        );
        const done = transactionDone(transaction);
        try {
          // add 는 같은 키가 있으면 ConstraintError 로 실패해 기존 데이터를 덮어쓰지 않는다.
          transaction.objectStore(STORE.instances).add(record);
          const file: StoredFile = {
            sopInstanceUid: record.sopInstanceUid,
            bytes,
          };
          transaction.objectStore(STORE.files).add(file);
        } catch (error) {
          // 동기 예외(예: 용량 초과) 시 이미 요청한 메타데이터 추가까지 함께 취소한다.
          transaction.abort();
          await done.catch(() => undefined);
          throw toStoreError(error);
        }
        try {
          await done;
        } catch (error) {
          throw toStoreError(error);
        }
      });
    },

    getInstance(sopInstanceUid) {
      return lifecycle.track(async () => {
        return read<StoredInstanceRecord | undefined>(
          STORE.instances,
          (store) => store.get(sopInstanceUid),
        );
      });
    },

    getFile(sopInstanceUid) {
      return lifecycle.track(async () => {
        const file = await read<StoredFile | undefined>(STORE.files, (store) =>
          store.get(sopInstanceUid),
        );
        return file?.bytes;
      });
    },

    listInstances() {
      return lifecycle.track(async () => {
        return read<StoredInstanceRecord[]>(STORE.instances, (store) =>
          store.getAll(),
        );
      });
    },

    listSeriesInstances(studyInstanceUid, seriesInstanceUid) {
      return lifecycle.track(async () => {
        return read<StoredInstanceRecord[]>(STORE.instances, (store) =>
          store
            .index(INDEX.instancesBySeries)
            .getAll([studyInstanceUid, seriesInstanceUid]),
        );
      });
    },

    close() {
      lifecycle.close();
    },

    closeWhenIdle() {
      lifecycle.closeWhenIdle();
    },

    whenClosed() {
      return lifecycle.whenClosed();
    },
  };
}

function toStoreError(error: unknown): DicomStoreError {
  if (error instanceof DicomStoreError) return error;
  const name =
    error instanceof DOMException || error instanceof Error
      ? error.name
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (name === "ConstraintError") {
    return new DicomStoreError(
      "already-exists",
      "같은 SOP Instance UID 가 이미 저장되어 있습니다",
      { cause: error },
    );
  }
  if (name === "QuotaExceededError") {
    return new DicomStoreError(
      "quota-exceeded",
      "브라우저 저장 용량이 부족합니다",
      { cause: error },
    );
  }
  if (name === "InvalidStateError" || name === "UnknownError") {
    return new DicomStoreError("unavailable", message, { cause: error });
  }
  return new DicomStoreError("unknown", message, { cause: error });
}
