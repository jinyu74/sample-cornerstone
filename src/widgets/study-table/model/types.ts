import type { OriginalsView, StudyListItem } from "@/entities/dicom-study";
import type { CatalogSyncFailure } from "@/features/sync-catalog";

/** 서버 목록 반영 상태(표시용) */
export type SyncView =
  | { kind: "checking" }
  | { kind: "synced" }
  | { kind: "unsynced"; count: number }
  | { kind: "syncing" }
  | {
      kind: "failed";
      reason: CatalogSyncFailure;
      conflict?: "series" | "instance";
    }
  /** 서버 목록을 읽지 못해 반영 여부를 모름 */
  | { kind: "unknown" };

export interface StudyTableRow extends StudyListItem {
  /** 서버 기록 대비 이 브라우저 원본 일치 정도 */
  originals: OriginalsView;
  /** 이 브라우저에 실제로 있는 원본 수(서버 기록에 없는 것 포함). 열기 가능 여부의 기준 */
  localOriginals: number;
  sync: SyncView;
}
