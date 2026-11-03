import type { StudyWork } from "../model/types";

export type WorkStoreErrorCode =
  "stale" | "quota-exceeded" | "unavailable" | "unknown";

export class WorkStoreError extends Error {
  override readonly name = "WorkStoreError";

  constructor(
    readonly code: WorkStoreErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** 작업 결과 저장소. 원본 DICOM 저장소와 분리하며 이후 서버 저장소로 교체할 수 있다. */
export interface StudyWorkStore {
  getWork(studyInstanceUid: string): Promise<StudyWork | undefined>;
  listWorks(): Promise<StudyWork[]>;
  /** 저장된 revision 이 더 크면 stale 로 거부해 오래된 쓰기가 최신 결과를 덮어쓰지 않게 한다 */
  saveWork(work: StudyWork): Promise<void>;
  close(): void;
}
