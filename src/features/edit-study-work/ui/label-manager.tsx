"use client";

import { TagsIcon } from "lucide-react";
import { useId, useState } from "react";

import type { Label, LabelCategory } from "@/entities/study-work";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";

export interface LabelManagerProps {
  labels: readonly Label[];
  /** 성공하면 null, 실패하면 이유 */
  onAdd: (label: Omit<Label, "id">) => string | null;
  onUpdate: (id: string, patch: Partial<Omit<Label, "id">>) => string | null;
  disabled?: boolean;
}

const CATEGORY_NAMES: Record<LabelCategory, string> = {
  organ: "장기",
  lesion: "병변",
};

/** 검사 작업 문서의 라벨(이름·색상·분류)을 추가·수정한다 */
export function LabelManager({
  labels,
  onAdd,
  onUpdate,
  disabled = false,
}: LabelManagerProps) {
  const ids = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<LabelCategory>("lesion");
  const [color, setColor] = useState("#0f766e");
  const [error, setError] = useState<string>();

  const add = () => {
    const problem = onAdd({ name: name.trim(), category, color });
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);
    setName("");
  };

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <TagsIcon data-icon="inline-start" aria-hidden />
        라벨 관리
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>라벨 관리</DialogTitle>
          <DialogDescription>
            라벨은 이 검사의 작업 결과에 저장됩니다. 이름은 같은 분류 안에서
            고유해야 합니다.
          </DialogDescription>
        </DialogHeader>
        <ul aria-label="라벨 목록" className="flex flex-col gap-2">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} onUpdate={onUpdate} />
          ))}
        </ul>
        <form
          className="flex flex-col gap-3 rounded-md border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <FieldGroup className="gap-3">
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={`${ids}-name`}>새 라벨 이름</FieldLabel>
              <Input
                id={`${ids}-name`}
                value={name}
                aria-invalid={error ? true : undefined}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              {error ? <FieldError role="alert">{error}</FieldError> : null}
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-auto">
                <FieldLabel id={`${ids}-category`}>분류</FieldLabel>
                <ToggleGroup
                  aria-labelledby={`${ids}-category`}
                  variant="outline"
                  spacing={0}
                  value={[category]}
                  onValueChange={(next: unknown[]) => {
                    const selected = next.at(-1) as LabelCategory | undefined;
                    if (selected) setCategory(selected);
                  }}
                >
                  {(["organ", "lesion"] as const).map((value) => (
                    <ToggleGroupItem key={value} value={value}>
                      {CATEGORY_NAMES[value]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field className="w-auto">
                <FieldLabel htmlFor={`${ids}-color`}>색상</FieldLabel>
                <Input
                  id={`${ids}-color`}
                  type="color"
                  className="w-14 p-1"
                  value={color}
                  onChange={(event) => setColor(event.currentTarget.value)}
                />
              </Field>
              <Button type="submit">라벨 추가</Button>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LabelRow({
  label,
  onUpdate,
}: {
  label: Label;
  onUpdate: LabelManagerProps["onUpdate"];
}) {
  const [name, setName] = useState(label.name);
  const [error, setError] = useState<string>();
  const commitName = () => {
    if (name.trim() === label.name) return;
    const problem = onUpdate(label.id, { name: name.trim() });
    setError(problem ?? undefined);
  };
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="color"
          aria-label={`${label.name} 색상`}
          className="w-10 shrink-0 p-1"
          value={label.color}
          onChange={(event) => {
            const problem = onUpdate(label.id, {
              color: event.currentTarget.value,
            });
            setError(problem ?? undefined);
          }}
        />
        <Input
          aria-label={`${label.name} 이름`}
          value={name}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
            }
          }}
        />
        <span className="w-10 shrink-0 text-xs text-muted-foreground">
          {CATEGORY_NAMES[label.category]}
        </span>
      </div>
      {error ? <FieldError role="alert">{error}</FieldError> : null}
    </li>
  );
}
