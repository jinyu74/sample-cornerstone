import type { DicomInstanceMetadata } from "../model/types";

/** 저장된 영상 1개의 레코드. 원본 바이트는 별도 저장소(files)에 있다. */
export interface StoredInstanceRecord {
  sopInstanceUid: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  /** 원본 바이트 SHA-256 (중복·충돌 판정) */
  contentDigest: string;
  byteLength: number;
  /** ISO 8601 */
  importedAt: string;
  metadata: DicomInstanceMetadata;
}

export type DicomStoreErrorCode =
  "already-exists" | "quota-exceeded" | "unavailable" | "unknown";

export class DicomStoreError extends Error {
  override readonly name = "DicomStoreError";

  constructor(
    readonly code: DicomStoreErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** 원본 DICOM 과 메타데이터 저장소. 이후 서버 저장소로 교체할 수 있도록 인터페이스로 둔다. */
export interface DicomStore {
  /** 메타데이터와 원본 바이트를 한 트랜잭션으로 추가한다. 같은 SOP UID 가 있으면 already-exists 로 거부한다. */
  addInstance(record: StoredInstanceRecord, bytes: ArrayBuffer): Promise<void>;
  getInstance(
    sopInstanceUid: string,
  ): Promise<StoredInstanceRecord | undefined>;
  getFile(sopInstanceUid: string): Promise<ArrayBuffer | undefined>;
  listInstances(): Promise<StoredInstanceRecord[]>;
  listSeriesInstances(
    studyInstanceUid: string,
    seriesInstanceUid: string,
  ): Promise<StoredInstanceRecord[]>;
  close(): void;
}

export type DicomParseFailureReason =
  | "not-dicom"
  | "parse-error"
  | "missing-uid"
  | "unsupported-transfer-syntax"
  | "no-pixel-data"
  | "invalid-frame-count"
  /** 서버 해제 상한을 넘게 팽창하는 deflate 데이터셋 */
  | "inflated-too-large";

export type DicomParseResult =
  | { ok: true; metadata: DicomInstanceMetadata }
  | { ok: false; reason: DicomParseFailureReason; detail: string };
