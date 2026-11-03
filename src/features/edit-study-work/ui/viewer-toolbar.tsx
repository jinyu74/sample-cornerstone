"use client";

import {
  CircleIcon,
  HandIcon,
  MessageSquareIcon,
  MousePointer2Icon,
  Redo2Icon,
  RulerIcon,
  SaveIcon,
  SplineIcon,
  SunMediumIcon,
  TriangleRightIcon,
  Undo2Icon,
  ZoomInIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import type { ViewerTool } from "@/shared/viewer";

import type { SaveState } from "../model/use-study-work";

import { SaveStatus } from "./save-status";

const TOOLS: { value: ViewerTool; label: string; icon: LucideIcon }[] = [
  { value: "select", label: "선택", icon: MousePointer2Icon },
  { value: "pan", label: "이동", icon: HandIcon },
  { value: "zoom", label: "확대", icon: ZoomInIcon },
  { value: "windowLevel", label: "밝기·대비", icon: SunMediumIcon },
  { value: "length", label: "길이", icon: RulerIcon },
  { value: "angle", label: "각도", icon: TriangleRightIcon },
  { value: "ellipse", label: "타원", icon: CircleIcon },
  { value: "contour", label: "윤곽", icon: SplineIcon },
  { value: "arrow", label: "메모", icon: MessageSquareIcon },
];

export interface ViewerToolbarProps {
  tool: ViewerTool;
  onToolChange: (tool: ViewerTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveState: SaveState;
  saveError?: string;
  onSave: () => void;
  disabled?: boolean;
}

export function ViewerToolbar({
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveState,
  saveError,
  onSave,
  disabled = false,
}: ViewerToolbarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ToggleGroup
        aria-label="도구"
        variant="outline"
        spacing={0}
        value={[tool]}
        disabled={disabled}
        className="flex-wrap"
        onValueChange={(next: unknown[]) => {
          const selected = next.at(-1) as ViewerTool | undefined;
          if (selected && selected !== tool) onToolChange(selected);
        }}
      >
        {TOOLS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={label}
            title={label}
          >
            <Icon data-icon="inline-start" aria-hidden />
            <span className="hidden xl:inline">{label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Separator orientation="vertical" className="h-6" />
      <Button
        variant="ghost"
        size="icon"
        aria-label="실행 취소"
        disabled={disabled || !canUndo}
        onClick={onUndo}
      >
        <Undo2Icon aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="다시 실행"
        disabled={disabled || !canRedo}
        onClick={onRedo}
      >
        <Redo2Icon aria-hidden />
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <SaveStatus state={saveState} error={saveError} />
      <Button disabled={disabled || saveState === "saving"} onClick={onSave}>
        <SaveIcon data-icon="inline-start" aria-hidden />
        저장
      </Button>
    </div>
  );
}
