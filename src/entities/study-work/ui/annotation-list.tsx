import { EyeIcon, EyeOffIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { Annotation, AnnotationTool, Label, Target } from "../model/types";

export const TOOL_NAMES: Record<AnnotationTool, string> = {
  length: "길이",
  angle: "각도",
  ellipse: "타원",
  contour: "윤곽",
  arrow: "메모",
};

export interface AnnotationListEntry {
  annotation: Annotation;
  label?: Label;
  target?: Target;
  /** 측정값 문구(예: 24.57 mm). 메모·화살표는 없음 */
  measurementText?: string;
  /** 위치 문구(예: Axial · 영상 3/5) */
  locationText: string;
  /** 측정값이 물리 보정(mm)으로 계산됐는지 */
  calibrated?: boolean;
}

export interface AnnotationListProps {
  entries: readonly AnnotationListEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string, visible: boolean) => void;
}

export function annotationTitle(
  entry: Pick<AnnotationListEntry, "annotation" | "label" | "target">,
): string {
  return (
    entry.target?.name ?? entry.label?.name ?? TOOL_NAMES[entry.annotation.tool]
  );
}

/** 작업 결과 목록. 선택하면 해당 영상으로 이동하고, 눈 버튼으로 표시·숨김을 바꾼다 */
export function AnnotationList({
  entries,
  selectedId,
  onSelect,
  onToggleVisibility,
}: AnnotationListProps) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-6 text-center text-muted-foreground">
        아직 작업 결과가 없습니다
        <br />
        <span className="text-xs">위 도구로 측정하거나 메모를 남기세요.</span>
      </p>
    );
  }
  return (
    <ul aria-label="작업 결과" className="flex flex-col gap-1.5">
      {entries.map((entry) => {
        const { annotation, label } = entry;
        const title = annotationTitle(entry);
        const selected = annotation.id === selectedId;
        const detail = [TOOL_NAMES[annotation.tool], entry.measurementText]
          .filter(Boolean)
          .join(" · ");
        return (
          <li
            key={annotation.id}
            className={cn(
              "flex items-center gap-1 rounded-md border bg-background pr-1",
              selected && "border-brand bg-accent",
            )}
          >
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(annotation.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full border"
                style={{ backgroundColor: label?.color ?? "transparent" }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {title}
                  {annotation.visible ? null : (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (숨김)
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {annotation.tool === "arrow" && annotation.note
                    ? `${detail} · ${annotation.note}`
                    : detail}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {entry.locationText}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`${title} ${annotation.visible ? "숨기기" : "표시"}`}
              aria-pressed={!annotation.visible}
              onClick={() =>
                onToggleVisibility(annotation.id, !annotation.visible)
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {annotation.visible ? (
                <EyeIcon aria-hidden className="size-4" />
              ) : (
                <EyeOffIcon aria-hidden className="size-4" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
