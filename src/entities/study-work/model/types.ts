import type { ImagePoint, Vec3 } from "@/shared/lib/geometry";

export const STUDY_WORK_SCHEMA_VERSION = 1;

export type AnnotationTool =
  "length" | "angle" | "ellipse" | "contour" | "arrow";

export type LabelCategory = "organ" | "lesion";

export interface Label {
  id: string;
  name: string;
  /** #rrggbb */
  color: string;
  category: LabelCategory;
}

/** 라벨 종류와 구분되는 개별 대상(예: 같은 병변을 여러 슬라이스에 표시) */
export interface Target {
  id: string;
  labelId: string;
  name: string;
}

/** 주석이 그려진 원본 영상(프레임) 참조. 스택 순번이 아닌 UID 와 프레임 번호로 식별한다 */
export interface ImageReference {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  /** 멀티프레임이면 1부터 시작하는 프레임 번호 */
  frameNumber?: number;
}

/**
 * 주석. 좌표의 기준은 imagePoints(픽셀 index 단위, 첫 픽셀 중심 = (0,0), [열, 행])이다.
 * worldPoints 는 영상 기하가 유효할 때 imagePoints 에서 계산한 환자 좌표(mm)이며 측정에 쓰지 않는다.
 * 윤곽(contour)은 닫힌 2D 다각형 주석이며 픽셀·복셀 segmentation mask 가 아니다.
 */
export interface Annotation {
  id: string;
  tool: AnnotationTool;
  reference: ImageReference;
  frameOfReferenceUid?: string;
  imagePoints: ImagePoint[];
  worldPoints?: Vec3[];
  labelId?: string;
  targetId?: string;
  note: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 검사 하나의 작업 결과. 원본 DICOM 과 별도로 저장한다 */
export interface StudyWork {
  schemaVersion: typeof STUDY_WORK_SCHEMA_VERSION;
  studyInstanceUid: string;
  labels: Label[];
  targets: Target[];
  annotations: Annotation[];
  /** 사용자가 완료로 표시했는지 */
  completed: boolean;
  /** 변경마다 1씩 증가. 오래된 비동기 저장이 최신 결과를 덮어쓰지 않게 비교한다 */
  revision: number;
  updatedAt: string;
}

export type MeasurementKind = "length" | "angle" | "area";
export type MeasurementUnit = "mm" | "px" | "mm²" | "px²" | "°";

export interface Measurement {
  kind: MeasurementKind;
  value: number;
  unit: MeasurementUnit;
  /** 윤곽·타원 둘레 */
  perimeter?: { value: number; unit: "mm" | "px" };
  /** 물리 보정(PixelSpacing) 사용 여부 */
  calibrated: boolean;
}

export type WorkStatus = "untouched" | "in-progress" | "done";
