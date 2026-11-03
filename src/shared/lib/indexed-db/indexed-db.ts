/** IndexedDB 요청·트랜잭션을 Promise 로 감싸는 얇은 도우미. 엔진 상태는 React 밖에 둔다. */

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 트랜잭션이 commit 되면 resolve, 오류·중단되면 원인 오류로 reject 한다. */
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    // 요청 오류는 트랜잭션으로 전파되며, 이 시점의 transaction.error 는 아직 비어 있을 수 있다.
    transaction.onerror = (event) =>
      reject((event.target as IDBRequest | null)?.error ?? transaction.error);
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new DOMException("Transaction aborted", "AbortError"),
      );
  });
}

export interface OpenDatabaseOptions {
  factory: IDBFactory;
  name: string;
  version: number;
  upgrade: (
    database: IDBDatabase,
    oldVersion: number,
    transaction: IDBTransaction,
  ) => void;
}

export function openDatabase({
  factory,
  name,
  version,
  upgrade,
}: OpenDatabaseOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = (event) => {
      upgrade(request.result, event.oldVersion, request.transaction!);
    };
    request.onsuccess = () => {
      const database = request.result;
      // 다른 탭이 새 버전을 열면 연결을 닫아 업그레이드를 막지 않는다.
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new DOMException("Database upgrade blocked", "InvalidStateError"));
  });
}
