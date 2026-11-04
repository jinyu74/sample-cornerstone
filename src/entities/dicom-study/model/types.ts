import type { Vec3 } from "@/shared/lib/geometry";

/** 스택 정렬에 필요한 영상(또는 멀티프레임의 프레임) 단위 메타데이터 */
export interface StackImageRef {
  sopInstanceUid: string;
  /** 멀티프레임이면 1부터 시작하는 프레임 번호, 단일 프레임이면 undefined */
  frameNumber?: number;
  instanceNumber?: number;
  /** ImagePositionPatient (0020,0032) */
  imagePositionPatient?: Vec3;
  /** ImageOrientationPatient (0020,0037): 행 방향 3개 + 열 방향 3개 */
  imageOrientationPatient?: Orientation;
}

/** ImageOrientationPatient (0020,0037): 행 방향 코사인 3개 + 열 방향 코사인 3개 */
export type Orientation = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export type StackOrderMethod =
  "empty" | "single" | "spatial" | "instance-number" | "unordered";

export type StackOrderWarning =
  | "missing-position"
  | "invalid-orientation"
  | "inconsistent-orientation"
  | "duplicate-position"
  | "missing-instance-number"
  | "no-ordering-metadata";

export interface StackOrderResult<T extends StackImageRef> {
  ordered: T[];
  method: StackOrderMethod;
  warnings: StackOrderWarning[];
}

/**
 * 멀티프레임 프레임의 의미.
 * single: 프레임 1개, spatial: 프레임마다 다른 공간 위치, temporal: 같은 위치의 시간 순서, unknown: 판단 불가
 */
export type FrameKind = "single" | "spatial" | "temporal" | "unknown";

/** 영상 1개(SOP Instance)의 정규화된 메타데이터. 원본 파일과 별도로 저장된다. */
export interface DicomInstanceMetadata {
  sopInstanceUid: string;
  sopClassUid: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  transferSyntaxUid: string;
  modality?: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  studyId?: string;
  accessionNumber?: string;
  patientId?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  instanceNumber?: number;
  frameOfReferenceUid?: string;
  rows: number;
  columns: number;
  numberOfFrames: number;
  imagePositionPatient?: Vec3;
  imageOrientationPatient?: Orientation;
  /** PixelSpacing (0028,0030): [행 간격, 열 간격] mm */
  pixelSpacing?: readonly [number, number];
  /** 멀티프레임 프레임별 위치(1번 프레임부터). 모든 프레임에 있을 때만 채운다 */
  framePositions?: readonly Vec3[];
  /**
   * PerFrameFunctionalGroupsSequence 의 프레임별 방향. 모든 프레임에 있을 때만 채운다.
   * 모든 프레임 방향이 같을 때만 imageOrientationPatient 에 대표값을 둔다.
   */
  frameOrientations?: readonly Orientation[];
  /** 프레임별 PixelSpacing. 모든 프레임 값이 같을 때만 pixelSpacing 에 대표값을 둔다 */
  framePixelSpacings?: readonly (readonly [number, number])[];
  frameKind: FrameKind;
}

/** 특정 프레임의 기하 정보(측정·스택 정렬용) */
export interface FrameGeometry {
  imagePositionPatient?: Vec3;
  imageOrientationPatient?: Orientation;
  pixelSpacing?: readonly [number, number];
}

/** 프레임 분류 입력 */
export interface FrameClassificationInput {
  numberOfFrames: number;
  framePositions?: readonly Vec3[];
  imageOrientationPatient?: Orientation;
  /** 프레임별 방향. 서로 다르면 공간 스택으로 보지 않는다 */
  frameOrientations?: readonly Orientation[];
  /** FrameTime (0018,1063) ms */
  frameTimeMs?: number;
  /** FrameTimeVector (0018,1065) */
  frameTimeVector?: readonly number[];
}

/** 스택의 한 장: 영상 1개 또는 멀티프레임의 프레임 1개 */
export interface StackItem extends StackImageRef {
  seriesInstanceUid: string;
  frameKind: FrameKind;
}

export interface SeriesGroup {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  modality?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  frameOfReferenceUid?: string;
  instances: DicomInstanceMetadata[];
  /** 파일(영상) 수 */
  instanceCount: number;
  /** 화면에 표시할 프레임 수(멀티프레임은 프레임 수만큼) */
  frameCount: number;
  stack: StackOrderResult<StackItem>;
}

export interface StudyGroup {
  studyInstanceUid: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  studyId?: string;
  accessionNumber?: string;
  patientId?: string;
  modalities: string[];
  series: SeriesGroup[];
}

/** 검사 작업 상태: 미작업 / 작업 중 / 완료 */
export type WorkStatus = "untouched" | "in-progress" | "done";

/**
 * 목록에 보이는 작업 상태. 작업 결과는 아직 이 브라우저에만 있으므로
 * 서버 목록에서 온 검사의 원본·기록이 이 브라우저에 없으면 "unknown"(미작업으로 단정하지 않음),
 * 이 브라우저를 확인하기 전(최초 HTML)은 "checking" 이다.
 */
export type ListWorkStatus = WorkStatus | "checking" | "unknown";

/** 검사 목록 한 행 */
export interface StudyListItem {
  studyInstanceUid: string;
  /** DICOM DA 원문(검색용) */
  studyDate?: string;
  displayDate: string;
  identifier: string;
  description?: string;
  modalities: string[];
  seriesCount: number;
  workStatus: ListWorkStatus;
}
