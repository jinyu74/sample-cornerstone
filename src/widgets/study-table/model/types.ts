import type { OriginalsView, StudyListItem } from "@/entities/dicom-study";
import type {
  TransferDirection,
  TransferFailure,
} from "@/features/server-originals";
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
  /** 서버 비공개 폴더의 원본 보관 상태 */
  serverOriginals: ServerOriginalsView;
  /** 이 브라우저에서 서버로 보관할 수 있는 영상 수(사용자가 눌러야 시작) */
  uploadableOriginals: number;
  /** 서버에서 이 브라우저로 불러올 수 있는 영상 수 */
  downloadableOriginals: number;
  sync: SyncView;
}

/** 서버 비공개 폴더의 원본 보관 상태(표시용). 보관됨은 실제 서버 파일로만 판정한 값이다 */
export type ServerOriginalsView =
  | { kind: "summary"; stored: number; total: number }
  | {
      kind: "running";
      direction: TransferDirection;
      done: number;
      total: number;
    }
  | {
      kind: "failed";
      direction: TransferDirection;
      reason: TransferFailure;
      done: number;
      total: number;
    }
  /** 서버에 저장 루트가 설정되지 않음 */
  | { kind: "unconfigured" }
  /** 서버 원본 저장소를 확인하지 못함 */
  | { kind: "unavailable" };
