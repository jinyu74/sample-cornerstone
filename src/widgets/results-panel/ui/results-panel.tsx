"use client";

import { useId } from "react";

import {
  type Annotation,
  type AnnotationListEntry,
  AnnotationList,
  nextTargetName,
} from "@/entities/study-work";
import {
  AnnotationEditor,
  LabelManager,
  type StudyWorkState,
} from "@/features/edit-study-work";
import { ResultTransfer } from "@/features/transfer-results";
import type { ImagePoint, Vec3 } from "@/shared/lib/geometry";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Separator } from "@/shared/ui/separator";
import { Switch } from "@/shared/ui/switch";

export interface ResultsPanelProps {
  work: StudyWorkState;
  entries: readonly AnnotationListEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onExport: () => void;
  onImport: (text: string) => string[] | null;
  /** 새 라벨·대상 ID 생성 */
  newId: () => string;
  /** 편집한 영상 좌표의 world 좌표(원본 기하가 없으면 undefined). 영상·world 좌표 정합성을 유지한다 */
  resolveWorldPoints: (
    annotation: Annotation,
    imagePoints: readonly ImagePoint[],
  ) => Vec3[] | undefined;
}

/** 오른쪽 작업 결과 패널: 결과 목록, 선택한 주석 편집, 라벨 관리, 완료 표시, JSON 내보내기·가져오기 */
export function ResultsPanel({
  work,
  entries,
  selectedId,
  onSelect,
  onExport,
  onImport,
  newId,
}: ResultsPanelProps) {
  const ids = useId();
  const doc = work.work;
  const selected = entries.find((entry) => entry.annotation.id === selectedId);
  const ready = work.status === "ready" && doc !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">작업 결과</h2>
        <LabelManager
          labels={doc?.labels ?? []}
          disabled={!ready}
          onAdd={(label) => {
            const result = work.dispatch({
              type: "label/add",
              label: { ...label, id: newId() },
            });
            return result.ok ? null : result.error;
          }}
          onUpdate={(id, patch) => {
            const result = work.dispatch({ type: "label/update", id, patch });
            return result.ok ? null : result.error;
          }}
        />
      </div>
      {work.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          작업 결과를 불러오지 못했습니다: {work.loadError}
        </p>
      ) : null}
      <Field orientation="horizontal" className="w-auto">
        <Switch
          id={`${ids}-done`}
          checked={doc?.completed ?? false}
          disabled={!ready}
          onCheckedChange={(completed) =>
            work.dispatch({ type: "work/complete", completed })
          }
        />
        <FieldLabel htmlFor={`${ids}-done`}>완료 표시</FieldLabel>
      </Field>
      <AnnotationList
        entries={entries}
        selectedId={selectedId}
        onSelect={onSelect}
        onToggleVisibility={(id, visible) =>
          work.dispatch({ type: "annotation/update", id, patch: { visible } })
        }
      />
      {selected && doc ? (
        <>
          <Separator />
          <AnnotationEditor
            key={selected.annotation.id}
            annotation={selected.annotation}
            labels={doc.labels}
            targets={doc.targets}
            measurementText={selected.measurementText}
            calibrated={selected.calibrated ?? false}
            onChange={(patch) =>
              work.dispatch({
                type: "annotation/update",
                id: selected.annotation.id,
                patch,
              })
            }
            onCreateTarget={(labelId) => {
              const label = doc.labels.find((item) => item.id === labelId);
              if (!label) return;
              const target = {
                id: newId(),
                labelId,
                name: nextTargetName(label, doc.targets),
              };
              const added = work.dispatch({ type: "target/add", target });
              if (added.ok) {
                work.dispatch({
                  type: "annotation/update",
                  id: selected.annotation.id,
                  patch: { labelId, targetId: target.id },
                });
              }
            }}
            onDelete={() =>
              work.dispatch({
                type: "annotation/delete",
                id: selected.annotation.id,
              })
            }
          />
        </>
      ) : null}
      <Separator />
      <ResultTransfer
        disabled={!ready}
        onExport={onExport}
        onImport={onImport}
      />
    </div>
  );
}
