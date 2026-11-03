import {
  DEFAULT_LABELS,
  validateLabel,
  type LabelValidationError,
} from "./labels";
import { validatePoints } from "./measure";
import {
  type Annotation,
  type Label,
  STUDY_WORK_SCHEMA_VERSION,
  type StudyWork,
  type Target,
  type WorkStatus,
} from "./types";

export type WorkAction =
  | { type: "annotation/add"; annotation: Annotation }
  | {
      type: "annotation/update";
      id: string;
      patch: Partial<
        Pick<
          Annotation,
          | "imagePoints"
          | "worldPoints"
          | "note"
          | "visible"
          | "labelId"
          | "targetId"
        >
      >;
    }
  | { type: "annotation/delete"; id: string }
  | { type: "label/add"; label: Label }
  | { type: "label/update"; id: string; patch: Partial<Omit<Label, "id">> }
  | { type: "target/add"; target: Target }
  | { type: "work/complete"; completed: boolean }
  /** 검증을 마친 같은 검사의 결과로 내용을 바꾼다(가져오기). 실행 취소할 수 있다 */
  | { type: "work/replace"; work: StudyWork };

export type WorkActionResult =
  { ok: true; work: StudyWork } | { ok: false; error: string };

const LABEL_ERRORS: Record<LabelValidationError, string> = {
  "empty-name": "라벨 이름을 입력하세요",
  "duplicate-name": "같은 분류에 같은 이름의 라벨이 있습니다",
  "invalid-color": "색상은 #rrggbb 형식이어야 합니다",
  "invalid-category": "분류는 장기 또는 병변이어야 합니다",
};

export function createStudyWork(
  studyInstanceUid: string,
  now: string,
): StudyWork {
  return {
    schemaVersion: STUDY_WORK_SCHEMA_VERSION,
    studyInstanceUid,
    labels: [...DEFAULT_LABELS],
    targets: [],
    annotations: [],
    completed: false,
    revision: 0,
    updatedAt: now,
  };
}

const fail = (error: string): WorkActionResult => ({ ok: false, error });

/** 작업 문서 편집. 입력 문서를 바꾸지 않고 새 문서를 돌려주며 변경마다 revision 을 올린다 */
export function applyWorkAction(
  work: StudyWork,
  action: WorkAction,
  now: string,
): WorkActionResult {
  const commit = (patch: Partial<StudyWork>): WorkActionResult => ({
    ok: true,
    work: { ...work, ...patch, revision: work.revision + 1, updatedAt: now },
  });

  switch (action.type) {
    case "annotation/add": {
      const { annotation } = action;
      if (work.annotations.some((item) => item.id === annotation.id)) {
        return fail(`이미 있는 주석 ID 입니다: ${annotation.id}`);
      }
      const problem = validateAnnotationLinks(work, annotation);
      if (problem) return fail(problem);
      return commit({ annotations: [...work.annotations, annotation] });
    }
    case "annotation/update": {
      const current = work.annotations.find((item) => item.id === action.id);
      if (!current) return fail(`주석을 찾을 수 없습니다: ${action.id}`);
      const next: Annotation = { ...current, ...action.patch, updatedAt: now };
      // 영상 좌표가 바뀌었는데 world 좌표가 함께 오지 않으면 이전 world 좌표는 더 이상 맞지 않으므로 지운다.
      if ("imagePoints" in action.patch && !("worldPoints" in action.patch))
        delete next.worldPoints;
      if (
        next.worldPoints &&
        next.worldPoints.length !== next.imagePoints.length
      ) {
        return fail("world 좌표 수가 영상 좌표 수와 다릅니다");
      }
      // 라벨이 바뀌면 다른 라벨의 대상 연결은 해제한다.
      if (
        "labelId" in action.patch &&
        !("targetId" in action.patch) &&
        next.targetId
      ) {
        const target = work.targets.find((item) => item.id === next.targetId);
        if (target?.labelId !== next.labelId) next.targetId = undefined;
      }
      const problem = validateAnnotationLinks(work, next);
      if (problem) return fail(problem);
      return commit({
        annotations: work.annotations.map((item) =>
          item.id === action.id ? next : item,
        ),
      });
    }
    case "annotation/delete": {
      if (!work.annotations.some((item) => item.id === action.id)) {
        return fail(`주석을 찾을 수 없습니다: ${action.id}`);
      }
      return commit({
        annotations: work.annotations.filter((item) => item.id !== action.id),
      });
    }
    case "label/add": {
      if (work.labels.some((label) => label.id === action.label.id)) {
        return fail(`이미 있는 라벨 ID 입니다: ${action.label.id}`);
      }
      const label = { ...action.label, name: action.label.name.trim() };
      const problem = validateLabel(label, work.labels);
      if (problem) return fail(LABEL_ERRORS[problem]);
      return commit({ labels: [...work.labels, label] });
    }
    case "label/update": {
      const current = work.labels.find((label) => label.id === action.id);
      if (!current) return fail(`라벨을 찾을 수 없습니다: ${action.id}`);
      const label: Label = { ...current, ...action.patch, id: current.id };
      label.name = label.name.trim();
      const problem = validateLabel(label, work.labels);
      if (problem) return fail(LABEL_ERRORS[problem]);
      return commit({
        labels: work.labels.map((item) =>
          item.id === action.id ? label : item,
        ),
      });
    }
    case "target/add": {
      const { target } = action;
      if (work.targets.some((item) => item.id === target.id))
        return fail(`이미 있는 대상 ID 입니다: ${target.id}`);
      if (!work.labels.some((label) => label.id === target.labelId)) {
        return fail(`라벨을 찾을 수 없습니다: ${target.labelId}`);
      }
      if (!target.name.trim()) return fail("대상 이름을 입력하세요");
      return commit({
        targets: [...work.targets, { ...target, name: target.name.trim() }],
      });
    }
    case "work/complete":
      return commit({ completed: action.completed });
    case "work/replace": {
      if (action.work.studyInstanceUid !== work.studyInstanceUid) {
        return fail(
          `다른 검사(${action.work.studyInstanceUid})의 결과로 바꿀 수 없습니다`,
        );
      }
      const { labels, targets, annotations, completed } = action.work;
      return commit({ labels, targets, annotations, completed });
    }
  }
}

function validateAnnotationLinks(
  work: StudyWork,
  annotation: Annotation,
): string | null {
  const points = validatePoints(annotation.tool, annotation.imagePoints);
  if (points) return points;
  if (
    annotation.labelId &&
    !work.labels.some((label) => label.id === annotation.labelId)
  ) {
    return `라벨을 찾을 수 없습니다: ${annotation.labelId}`;
  }
  if (annotation.targetId) {
    const target = work.targets.find((item) => item.id === annotation.targetId);
    if (!target) return `대상을 찾을 수 없습니다: ${annotation.targetId}`;
    if (target.labelId !== annotation.labelId) {
      return `대상 ${target.id} 은(는) 선택한 라벨에 속하지 않습니다`;
    }
  }
  return null;
}

/** 결과가 없으면 미작업, 주석이 있으면 작업 중, 사용자가 완료로 표시하면 완료 */
export function deriveWorkStatus(work: StudyWork | undefined): WorkStatus {
  if (!work) return "untouched";
  if (work.completed) return "done";
  return work.annotations.length > 0 ? "in-progress" : "untouched";
}
