"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Slider } from "@/shared/ui/slider";

export interface FrameNavigatorProps {
  /** 0부터 시작하는 현재 위치 */
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  disabled?: boolean;
}

/** 하단 영상·프레임 탐색. 영상이 1장이면 탐색 컨트롤을 숨기고 위치만 표시한다. */
export function FrameNavigator({
  index,
  count,
  onIndexChange,
  disabled = false,
}: FrameNavigatorProps) {
  const multiple = count > 1;
  const go = (next: number) =>
    onIndexChange(Math.min(Math.max(next, 0), count - 1));

  return (
    <div className="flex items-center gap-3 text-viewport-foreground">
      {multiple ? (
        <Button
          variant="viewport"
          size="icon"
          aria-label="이전 영상"
          disabled={disabled || index <= 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
      ) : null}
      <div className="flex flex-1 flex-col items-center gap-2">
        <p className="text-sm">
          영상{" "}
          <span data-testid="frame-position">{`${index + 1} / ${count}`}</span>
        </p>
        {multiple ? (
          <Slider
            min={1}
            max={count}
            step={1}
            value={[index + 1]}
            disabled={disabled}
            thumbLabel="슬라이스 위치"
            getValueText={(value) => `영상 ${value} / ${count}`}
            onValueChange={(value: number | readonly number[]) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === "number") go(next - 1);
            }}
          />
        ) : null}
      </div>
      {multiple ? (
        <Button
          variant="viewport"
          size="icon"
          aria-label="다음 영상"
          disabled={disabled || index >= count - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
