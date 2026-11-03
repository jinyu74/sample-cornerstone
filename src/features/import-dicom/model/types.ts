import type {
  DicomParseFailureReason,
  DicomStore,
} from "@/entities/dicom-study";

/** 가져올 파일. File 외의 출처(테스트, 폴더 항목)도 같은 형태로 다룬다. */
export interface ImportSource {
  name: string;
  read(): Promise<ArrayBuffer>;
}

export type ImportFailureReason =
  | DicomParseFailureReason
  | "read-error"
  | "storage-quota-exceeded"
  | "storage-unavailable"
  | "storage-error";

export type ImportStatus = "imported" | "duplicate" | "conflict" | "failed";

export interface ImportFileResult {
  fileName: string;
  status: ImportStatus;
  sopInstanceUid?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  reason?: ImportFailureReason;
  detail?: string;
}

export interface ImportProgress {
  completed: number;
  total: number;
  latest: ImportFileResult;
}

export interface ImportReport {
  results: ImportFileResult[];
  summary: Record<ImportStatus, number>;
}

export interface ImportDependencies {
  store: DicomStore;
  onProgress?: (progress: ImportProgress) => void;
  /** 테스트에서 고정 시각을 주입한다 */
  now?: () => Date;
}
