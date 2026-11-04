/** 한 검사의 서버 목록 반영 상태(이 화면에서 시도한 것만) */
export type CatalogSyncFailure =
  | "network"
  | "unavailable"
  | "unauthenticated"
  | "account-mismatch"
  | "conflict"
  | "invalid"
  | "local-read";

export type CatalogSyncState =
  | { kind: "syncing" }
  | { kind: "synced" }
  | {
      kind: "failed";
      reason: CatalogSyncFailure;
      conflict?: "series" | "instance";
    };
