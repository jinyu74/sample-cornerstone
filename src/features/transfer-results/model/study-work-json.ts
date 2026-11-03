import {
  type DicomInstanceMetadata,
  imagePlaneAt,
  pixelSpacingAt,
} from "@/entities/dicom-study";
import {
  type Annotation,
  type AnnotationTool,
  type Label,
  type Measurement,
  measureAnnotation,
  STUDY_WORK_SCHEMA_VERSION,
  type StudyWork,
  type Target,
  validateLabel,
  validatePoints,
} from "@/entities/study-work";
import {
  imageToWorld,
  type ImagePoint,
  type Vec3,
} from "@/shared/lib/geometry";

export const STUDY_WORK_FORMAT = "dicom-annotator/study-work";

/** 내보내기·가져오기가 공유하는 좌표계 식별자. 다른 값(예: canvas 좌표)은 가져오지 않는다 */
export const COORDINATE_SYSTEM = {
  image: "pixel-index [column, row], first pixel center = (0,0)",
  world: "DICOM patient (mm)",
} as const;

/** 저장된 world 좌표와 이미지 좌표에서 다시 계산한 값의 허용 차이(mm) */
const WORLD_TOLERANCE_MM = 0.01;

const TOOLS: readonly AnnotationTool[] = [
  "length",
  "angle",
  "ellipse",
  "contour",
  "arrow",
];

export interface ExportedAnnotation extends Annotation {
  coordinateSystem: { image: string; world: string };
  /** 좌표·보정 정보에서 계산한 참고값. 가져올 때는 다시 계산하며 이 값은 쓰지 않는다 */
  derivedMeasurement: Measurement | null;
}

export interface StudyWorkExport {
  format: typeof STUDY_WORK_FORMAT;
  schemaVersion: typeof STUDY_WORK_SCHEMA_VERSION;
  exportedAt: string;
  containsPixelData: false;
  reconnection: string;
  studyInstanceUid: string;
  completed: boolean;
  labels: Label[];
  targets: Target[];
  annotations: ExportedAnnotation[];
}

export interface ImportContext {
  studyInstanceUid: string;
  /** 현재 브라우저에 있는 이 검사의 원본 영상 메타데이터 */
  instances: readonly DicomInstanceMetadata[];
  /** 현재 작업 결과의 revision. 가져온 결과는 이보다 큰 revision 으로 저장된다 */
  currentRevision: number;
  now: string;
}

export type StudyWorkImportResult =
  { ok: true; work: StudyWork } | { ok: false; errors: string[] };

const RECONNECTION =
  "이 파일에는 원본 픽셀 데이터가 없습니다. 같은 StudyInstanceUID·SeriesInstanceUID·SOPInstanceUID(멀티프레임은 frameNumber)를 가진 원본 DICOM 을 이 브라우저에 먼저 가져와야 결과를 다시 연결할 수 있습니다.";

/** 작업 결과를 버전 있는 JSON 객체로 만든다(원본 픽셀 데이터 미포함) */
export function exportStudyWork(
  work: StudyWork,
  instances: readonly DicomInstanceMetadata[],
  now: string,
): StudyWorkExport {
  return {
    format: STUDY_WORK_FORMAT,
    schemaVersion: STUDY_WORK_SCHEMA_VERSION,
    exportedAt: now,
    containsPixelData: false,
    reconnection: RECONNECTION,
    studyInstanceUid: work.studyInstanceUid,
    completed: work.completed,
    labels: work.labels,
    targets: work.targets,
    annotations: work.annotations.map((annotation) => ({
      ...annotation,
      coordinateSystem: { ...COORDINATE_SYSTEM },
      derivedMeasurement: measureAnnotation(
        annotation.tool,
        annotation.imagePoints,
        pixelSpacingAt(
          instances,
          annotation.reference.sopInstanceUid,
          annotation.reference.frameNumber,
        ),
      ),
    })),
  };
}

/**
 * JSON 을 검증해 작업 결과로 만든다. 하나라도 문제가 있으면 전체를 거부하고 모든 이유를 돌려준다.
 * 다른 검사·없는 영상·프레임 범위·FrameOfReference·world 좌표 불일치는 조용히 연결하지 않는다.
 */
export function parseStudyWorkImport(
  text: string,
  context: ImportContext,
): StudyWorkImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["JSON 형식이 아닙니다"] };
  }
  if (!isRecord(json) || json.format !== STUDY_WORK_FORMAT) {
    return { ok: false, errors: ["이 앱의 작업 결과 파일이 아닙니다"] };
  }
  if (json.schemaVersion !== STUDY_WORK_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `지원하지 않는 schemaVersion 입니다: ${String(json.schemaVersion)}`,
      ],
    };
  }
  if (json.studyInstanceUid !== context.studyInstanceUid) {
    return {
      ok: false,
      errors: [
        `현재 검사(${context.studyInstanceUid})와 다른 검사(${String(json.studyInstanceUid)})의 결과입니다`,
      ],
    };
  }

  const errors: string[] = [];
  const labels = readLabels(json.labels, errors);
  const targets = readTargets(json.targets, labels, errors);
  const annotations = readAnnotations(
    json.annotations,
    labels,
    targets,
    context,
    errors,
  );
  if (typeof json.completed !== "boolean")
    errors.push("completed 는 true/false 여야 합니다");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    work: {
      schemaVersion: STUDY_WORK_SCHEMA_VERSION,
      studyInstanceUid: context.studyInstanceUid,
      labels,
      targets,
      annotations,
      completed: json.completed as boolean,
      revision: context.currentRevision + 1,
      updatedAt: context.now,
    },
  };
}

function readLabels(value: unknown, errors: string[]): Label[] {
  if (!Array.isArray(value)) {
    errors.push("labels 는 배열이어야 합니다");
    return [];
  }
  const labels: Label[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      !isString(item.id) ||
      !isString(item.name) ||
      !isString(item.color)
    ) {
      errors.push("라벨 형식이 올바르지 않습니다");
      continue;
    }
    if (ids.has(item.id)) {
      errors.push(`중복된 라벨 ID: ${item.id}`);
      continue;
    }
    ids.add(item.id);
    const label = {
      id: item.id,
      name: item.name,
      color: item.color,
      category: item.category,
    } as Label;
    const problem = validateLabel(label, labels);
    if (problem) errors.push(`라벨 ${item.id}: ${problem}`);
    labels.push(label);
  }
  return labels;
}

function readTargets(
  value: unknown,
  labels: readonly Label[],
  errors: string[],
): Target[] {
  if (!Array.isArray(value)) {
    errors.push("targets 는 배열이어야 합니다");
    return [];
  }
  const targets: Target[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !isString(item.id) ||
      !isString(item.labelId) ||
      !isString(item.name)
    ) {
      errors.push("대상 형식이 올바르지 않습니다");
      continue;
    }
    if (targets.some((target) => target.id === item.id)) {
      errors.push(`중복된 대상 ID: ${item.id}`);
      continue;
    }
    if (!labels.some((label) => label.id === item.labelId)) {
      errors.push(`대상 ${item.id}: 라벨 ${item.labelId} 이 없습니다`);
    }
    targets.push({ id: item.id, labelId: item.labelId, name: item.name });
  }
  return targets;
}

function readAnnotations(
  value: unknown,
  labels: readonly Label[],
  targets: readonly Target[],
  context: ImportContext,
  errors: string[],
): Annotation[] {
  if (!Array.isArray(value)) {
    errors.push("annotations 는 배열이어야 합니다");
    return [];
  }
  const annotations: Annotation[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !isString(item.id)) {
      errors.push("주석 형식이 올바르지 않습니다(id 없음)");
      continue;
    }
    if (ids.has(item.id)) {
      errors.push(`중복된 주석 ID: ${item.id}`);
      continue;
    }
    ids.add(item.id);
    const before = errors.length;
    const add = (message: string) =>
      errors.push(`주석 ${String(item.id)}: ${message}`);
    const annotation = readAnnotation(item, add, labels, targets, context);
    if (annotation && errors.length === before) annotations.push(annotation);
  }
  return annotations;
}

function readAnnotation(
  item: Record<string, unknown>,
  add: (message: string) => void,
  labels: readonly Label[],
  targets: readonly Target[],
  context: ImportContext,
): Annotation | undefined {
  const tool = item.tool as AnnotationTool;
  if (!TOOLS.includes(tool)) {
    add(`알 수 없는 도구 ${String(item.tool)}`);
    return undefined;
  }
  const coordinateSystem = item.coordinateSystem;
  if (!isRecord(coordinateSystem)) {
    add("좌표계(coordinateSystem) 선언이 없습니다");
    return undefined;
  }
  if (coordinateSystem.image !== COORDINATE_SYSTEM.image) {
    add(`지원하지 않는 영상 좌표계입니다: ${String(coordinateSystem.image)}`);
    return undefined;
  }
  if (coordinateSystem.world !== COORDINATE_SYSTEM.world) {
    add(`지원하지 않는 world 좌표계입니다: ${String(coordinateSystem.world)}`);
    return undefined;
  }
  if (!Array.isArray(item.imagePoints)) {
    add("imagePoints 는 배열이어야 합니다");
    return undefined;
  }
  const imagePoints = item.imagePoints as ImagePoint[];
  const pointProblem = validatePoints(tool, imagePoints);
  if (pointProblem) {
    add(pointProblem);
    return undefined;
  }

  // 원본 영상 연결
  const reference = item.reference;
  if (
    !isRecord(reference) ||
    !isString(reference.studyInstanceUid) ||
    !isString(reference.seriesInstanceUid) ||
    !isString(reference.sopInstanceUid)
  ) {
    add("reference 에 Study/Series/SOP Instance UID 가 필요합니다");
    return undefined;
  }
  if (reference.studyInstanceUid !== context.studyInstanceUid) {
    add(`다른 검사(${reference.studyInstanceUid})의 영상을 참조합니다`);
    return undefined;
  }
  const seriesInstances = context.instances.filter(
    (instance) => instance.seriesInstanceUid === reference.seriesInstanceUid,
  );
  if (seriesInstances.length === 0) {
    add(`이 검사에 시리즈 ${reference.seriesInstanceUid} 가 없습니다`);
    return undefined;
  }
  const instance = seriesInstances.find(
    (candidate) => candidate.sopInstanceUid === reference.sopInstanceUid,
  );
  if (!instance) {
    add(
      `시리즈 ${reference.seriesInstanceUid} 에 영상 ${reference.sopInstanceUid} 이 없습니다`,
    );
    return undefined;
  }
  const frameNumber = reference.frameNumber;
  if (instance.numberOfFrames > 1) {
    if (frameNumber === undefined) {
      add("멀티프레임 영상에는 frameNumber 가 필요합니다");
      return undefined;
    }
    if (
      !Number.isInteger(frameNumber) ||
      (frameNumber as number) < 1 ||
      (frameNumber as number) > instance.numberOfFrames
    ) {
      add(
        `frameNumber ${String(frameNumber)} 이(가) 범위(1~${instance.numberOfFrames})를 벗어났습니다`,
      );
      return undefined;
    }
  } else if (frameNumber !== undefined) {
    add("단일 프레임 영상에 frameNumber 가 있습니다");
    return undefined;
  }
  const frame = frameNumber as number | undefined;

  if (
    imagePoints.some(
      ([column, row]) =>
        column < -0.5 ||
        row < -0.5 ||
        column > instance.columns - 0.5 ||
        row > instance.rows - 0.5,
    )
  ) {
    add(
      `좌표가 영상 범위(${instance.columns} × ${instance.rows})를 벗어났습니다`,
    );
  }

  if (
    item.frameOfReferenceUid !== undefined &&
    item.frameOfReferenceUid !== instance.frameOfReferenceUid
  ) {
    add(
      `FrameOfReferenceUID 가 원본(${instance.frameOfReferenceUid ?? "없음"})과 다릅니다`,
    );
  }

  let worldPoints: Vec3[] | undefined;
  if (item.worldPoints !== undefined) {
    worldPoints = readWorldPoints(item.worldPoints, imagePoints.length, add);
    if (worldPoints) {
      const plane = imagePlaneAt(
        context.instances,
        instance.sopInstanceUid,
        frame,
      );
      if (!plane) {
        add(
          "원본 영상에 공간 기하 정보가 없어 world 좌표를 검증할 수 없습니다",
        );
      } else {
        const mismatch = imagePoints.some((point, index) => {
          const expected = imageToWorld(plane, point);
          const actual = worldPoints![index]!;
          return (
            Math.hypot(
              expected[0] - actual[0],
              expected[1] - actual[1],
              expected[2] - actual[2],
            ) > WORLD_TOLERANCE_MM
          );
        });
        if (mismatch) add("world 좌표가 영상 좌표와 맞지 않습니다");
      }
    }
  }

  const labelId = item.labelId;
  if (
    labelId !== undefined &&
    (!isString(labelId) || !labels.some((label) => label.id === labelId))
  ) {
    add(`라벨 ${String(labelId)} 이 없습니다`);
  }
  const targetId = item.targetId;
  if (targetId !== undefined) {
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) add(`대상 ${String(targetId)} 이 없습니다`);
    else if (target.labelId !== labelId) {
      add(
        `대상 ${target.id} 의 라벨(${target.labelId})과 주석 라벨(${String(labelId ?? "없음")})이 다릅니다`,
      );
    }
  }

  if (typeof item.note !== "string") add("note 는 문자열이어야 합니다");
  if (typeof item.visible !== "boolean")
    add("visible 은 true/false 여야 합니다");
  if (!isIsoDate(item.createdAt) || !isIsoDate(item.updatedAt))
    add("createdAt/updatedAt 은 ISO 8601 시각이어야 합니다");

  const annotation: Annotation = {
    id: item.id as string,
    tool,
    reference: {
      studyInstanceUid: reference.studyInstanceUid,
      seriesInstanceUid: reference.seriesInstanceUid,
      sopInstanceUid: reference.sopInstanceUid,
      ...(frame === undefined ? {} : { frameNumber: frame }),
    },
    imagePoints: imagePoints.map(([column, row]) => [column, row] as const),
    note: item.note as string,
    visible: item.visible as boolean,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
  if (isString(item.frameOfReferenceUid))
    annotation.frameOfReferenceUid = item.frameOfReferenceUid;
  if (worldPoints) annotation.worldPoints = worldPoints;
  if (isString(labelId)) annotation.labelId = labelId;
  if (isString(targetId)) annotation.targetId = targetId;
  return annotation;
}

function readWorldPoints(
  value: unknown,
  count: number,
  add: (message: string) => void,
): Vec3[] | undefined {
  if (!Array.isArray(value) || value.length !== count) {
    add("worldPoints 수가 imagePoints 와 다릅니다");
    return undefined;
  }
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 3) {
      add("world 좌표는 [x, y, z] 세 값이어야 합니다");
      return undefined;
    }
    if (
      !point.every(
        (coordinate) =>
          typeof coordinate === "number" && Number.isFinite(coordinate),
      )
    ) {
      add("world 좌표 값이 유한한 숫자가 아닙니다");
      return undefined;
    }
  }
  return value as Vec3[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
