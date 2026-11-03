"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import {
  type Annotation,
  type Label,
  type Target,
  TOOL_NAMES,
} from "@/entities/study-work";
import type { ImagePoint } from "@/shared/lib/geometry";
import { Button } from "@/shared/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";

type EditablePatch = Partial<
  Pick<Annotation, "imagePoints" | "note" | "visible" | "labelId" | "targetId">
>;

export interface AnnotationEditorProps {
  annotation: Annotation;
  labels: readonly Label[];
  targets: readonly Target[];
  measurementText?: string;
  calibrated: boolean;
  onChange: (patch: EditablePatch) => void;
  onCreateTarget: (labelId: string) => void;
  onDelete: () => void;
}

const NONE = "__none__";
const CATEGORY_NAMES = { organ: "장기", lesion: "병변" } as const;

/** 선택한 주석의 라벨·대상·좌표·메모·표시를 편집한다. 측정값은 좌표와 보정 정보에서 계산한 읽기 전용 값이다 */
export function AnnotationEditor({
  annotation,
  labels,
  targets,
  measurementText,
  calibrated,
  onChange,
  onCreateTarget,
  onDelete,
}: AnnotationEditorProps) {
  const ids = useId();
  const label = labels.find((item) => item.id === annotation.labelId);
  const labelTargets = targets.filter(
    (target) => target.labelId === annotation.labelId,
  );
  const labelItems = [
    { value: NONE, label: "라벨 없음" },
    ...labels.map((item) => ({ value: item.id, label: item.name })),
  ];
  const targetItems = [
    { value: NONE, label: "대상 없음" },
    ...labelTargets.map((item) => ({ value: item.id, label: item.name })),
  ];

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-4">
      <h3 id={`${ids}-title`} className="font-semibold">
        선택한 주석 편집
      </h3>
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel id={`${ids}-label`}>라벨</FieldLabel>
            <Select
              items={labelItems}
              value={annotation.labelId ?? NONE}
              onValueChange={(value) => {
                const next =
                  value === NONE || value == null ? undefined : String(value);
                onChange({ labelId: next, targetId: undefined });
              }}
            >
              <SelectTrigger
                aria-labelledby={`${ids}-label`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>라벨 없음</SelectItem>
                </SelectGroup>
                {(["organ", "lesion"] as const).map((category) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{CATEGORY_NAMES[category]}</SelectLabel>
                    {labels
                      .filter((item) => item.category === category)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <span
                            aria-hidden
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>분류</FieldLabel>
            <p className="flex h-8 items-center text-sm">
              {label ? CATEGORY_NAMES[label.category] : "—"}
            </p>
          </Field>
        </div>

        <Field>
          <FieldLabel id={`${ids}-target`}>대상</FieldLabel>
          <div className="flex gap-2">
            <Select
              items={targetItems}
              value={annotation.targetId ?? NONE}
              disabled={!label}
              onValueChange={(value) =>
                onChange({
                  targetId:
                    value === NONE || value == null ? undefined : String(value),
                })
              }
            >
              <SelectTrigger
                aria-labelledby={`${ids}-target`}
                className="min-w-0 flex-1"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {targetItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!label}
              onClick={() => label && onCreateTarget(label.id)}
            >
              <PlusIcon data-icon="inline-start" aria-hidden />새 대상
            </Button>
          </div>
          <FieldDescription>
            같은 병변을 여러 영상에 표시하면 같은 대상으로 묶으세요.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>측정값</FieldLabel>
          <p className="text-sm font-medium">
            {measurementText ?? `${TOOL_NAMES[annotation.tool]}(측정값 없음)`}
          </p>
          {!calibrated && measurementText ? (
            <FieldDescription>
              PixelSpacing 이 없거나 유효하지 않아 픽셀 단위로 표시합니다.
            </FieldDescription>
          ) : null}
          {annotation.tool === "contour" ? (
            <FieldDescription>
              2D 윤곽 주석입니다. 픽셀·복셀 분할 마스크가 아닙니다.
            </FieldDescription>
          ) : null}
        </Field>

        <CoordinateEditor
          points={annotation.imagePoints}
          onCommit={(imagePoints) => onChange({ imagePoints })}
        />

        <NoteField
          note={annotation.note}
          onCommit={(note) => onChange({ note })}
        />

        <div className="flex items-center justify-between gap-3">
          <Field orientation="horizontal" className="w-auto">
            <Switch
              id={`${ids}-visible`}
              checked={annotation.visible}
              onCheckedChange={(visible) => onChange({ visible })}
            />
            <FieldLabel htmlFor={`${ids}-visible`}>표시</FieldLabel>
          </Field>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2Icon data-icon="inline-start" aria-hidden />
            삭제
          </Button>
        </div>
      </FieldGroup>
    </section>
  );
}

/**
 * 입력 중일 때만 draft 를 두고, 그 외에는 문서 값을 표시한다. draft 를 시작한 문서 값이 그대로일 때만 반영해
 * 실행 취소·가져오기로 바뀐 값을 이전 입력으로 덮어쓰지 않는다.
 */
function NoteField({
  note,
  onCommit,
}: {
  note: string;
  onCommit: (note: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ source: string; value: string } | null>(
    null,
  );
  const editing = draft !== null && draft.source === note;
  return (
    <Field>
      <FieldLabel htmlFor={id}>메모</FieldLabel>
      <Textarea
        id={id}
        value={editing ? draft.value : note}
        rows={3}
        onChange={(event) =>
          setDraft({
            source: editing ? draft.source : note,
            value: event.currentTarget.value,
          })
        }
        onBlur={() => {
          if (editing && draft.value !== note) onCommit(draft.value);
          setDraft(null);
        }}
      />
    </Field>
  );
}

/** 좌표 편집. 값은 [열, 행] 픽셀 index 단위이며 Enter·포커스 이동 때 반영한다 */
function CoordinateEditor({
  points,
  onCommit,
}: {
  points: readonly ImagePoint[];
  onCommit: (points: ImagePoint[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{
    source: readonly ImagePoint[];
    values: string[][];
  } | null>(null);
  // 문서 좌표가 바뀌면(실행 취소·엔진 편집) 이전 draft 는 버리고 문서 값을 표시한다.
  const editing = draft !== null && draft.source === points;
  const values = editing
    ? draft.values
    : points.map(([column, row]) => [String(column), String(row)]);
  const parsed = values.map((pair) =>
    pair.map((value) => (value.trim() === "" ? Number.NaN : Number(value))),
  );
  const invalid = parsed.some((pair) =>
    pair.some((value) => !Number.isFinite(value)),
  );

  const commit = () => {
    if (!editing || invalid) return;
    const next = parsed.map(([column, row]) => [column!, row!] as const);
    const changed = next.some(
      ([column, row], index) =>
        column !== points[index]![0] || row !== points[index]![1],
    );
    setDraft(null);
    if (changed) onCommit(next);
  };

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={invalid ? `${id}-error` : undefined}
    >
      <legend className="mb-1 text-sm font-medium">
        좌표 (픽셀, [열, 행])
      </legend>
      <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
        {values.map((pair, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-muted-foreground">
              점 {index + 1}
            </span>
            {(["열", "행"] as const).map((axis, axisIndex) => (
              <Input
                key={axis}
                type="number"
                step="any"
                aria-label={`점 ${index + 1} ${axis}`}
                aria-invalid={
                  !Number.isFinite(parsed[index]![axisIndex]!) || undefined
                }
                value={pair[axisIndex]}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft({
                    source: points,
                    values: values.map((item, itemIndex) =>
                      itemIndex === index
                        ? item.map((old, oldIndex) =>
                            oldIndex === axisIndex ? value : old,
                          )
                        : item,
                    ),
                  });
                }}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit();
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {invalid ? (
        <FieldError id={`${id}-error`}>
          좌표는 유한한 숫자여야 합니다
        </FieldError>
      ) : null}
    </fieldset>
  );
}
