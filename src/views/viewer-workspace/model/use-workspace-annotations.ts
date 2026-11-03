import { useMemo } from "react";

import { pixelSpacingAt, type StudyGroup } from "@/entities/dicom-study";
import {
  type AnnotationListEntry,
  annotationTitle,
  formatMeasurement,
  measureAnnotation,
  type StudyWork,
} from "@/entities/study-work";

export interface AnnotationLocation {
  seriesInstanceUid: string;
  index: number;
}

export interface WorkspaceAnnotations {
  entries: AnnotationListEntry[];
  /** 주석 ID → 시리즈·스택 위치(SOP UID + frame 으로 찾는다) */
  locations: ReadonlyMap<string, AnnotationLocation>;
}

/**
 * 작업 문서의 주석을 결과 목록 항목으로 만든다. 측정값은 참조한 영상(프레임)의 PixelSpacing 으로
 * 다시 계산하고, 위치는 스택 순번이 아니라 SOP UID·frame 으로 찾는다.
 */
export function useWorkspaceAnnotations(
  study: StudyGroup | undefined,
  work: StudyWork | undefined,
): WorkspaceAnnotations {
  return useMemo(() => {
    const entries: AnnotationListEntry[] = [];
    const locations = new Map<string, AnnotationLocation>();
    if (!study || !work) return { entries, locations };
    const instances = study.series.flatMap((series) => series.instances);
    for (const annotation of work.annotations) {
      const series = study.series.find(
        (item) =>
          item.seriesInstanceUid === annotation.reference.seriesInstanceUid,
      );
      const index =
        series?.stack.ordered.findIndex(
          (item) =>
            item.sopInstanceUid === annotation.reference.sopInstanceUid &&
            item.frameNumber === annotation.reference.frameNumber,
        ) ?? -1;
      if (series && index >= 0)
        locations.set(annotation.id, {
          seriesInstanceUid: series.seriesInstanceUid,
          index,
        });
      const spacing = pixelSpacingAt(
        instances,
        annotation.reference.sopInstanceUid,
        annotation.reference.frameNumber,
      );
      const measurement = measureAnnotation(
        annotation.tool,
        annotation.imagePoints,
        spacing,
      );
      const label = work.labels.find((item) => item.id === annotation.labelId);
      const target = work.targets.find(
        (item) => item.id === annotation.targetId,
      );
      entries.push({
        annotation,
        label,
        target,
        measurementText: measurement
          ? formatMeasurement(measurement)
          : undefined,
        calibrated: measurement?.calibrated ?? spacing !== undefined,
        locationText:
          series && index >= 0
            ? `${series.seriesDescription ?? `시리즈 ${series.seriesNumber ?? ""}`} · 영상 ${index + 1}/${series.stack.ordered.length}`
            : "원본 영상 없음",
      });
    }
    return { entries, locations };
  }, [study, work]);
}

/** 캔버스에 표시할 문구: 대상/라벨 이름과 측정값, 메모 */
export function canvasTextLines(entry: AnnotationListEntry): string[] {
  const lines = [
    entry.measurementText,
    entry.annotation.tool === "arrow" ? entry.annotation.note : undefined,
  ];
  const title =
    entry.target || entry.label ? annotationTitle(entry) : undefined;
  return [title, ...lines].filter((line): line is string => Boolean(line));
}
