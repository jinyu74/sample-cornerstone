import {
  ContrastIcon,
  Maximize2Icon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react";

import { Button } from "@/shared/ui/button";

export interface ViewportControlsProps {
  inverted: boolean;
  onInvert: () => void;
  onRotate: () => void;
  onFit: () => void;
  onReset: () => void;
  disabled?: boolean;
}

/** 반전·회전·화면 맞춤·초기화. 검은 영상 영역 하단에 둔다 */
export function ViewportControls({
  inverted,
  onInvert,
  onRotate,
  onFit,
  onReset,
  disabled = false,
}: ViewportControlsProps) {
  return (
    <div
      role="group"
      aria-label="화면 조작"
      className="flex items-center gap-1"
    >
      <Button
        variant="viewport"
        size="icon"
        aria-label="반전"
        aria-pressed={inverted}
        disabled={disabled}
        onClick={onInvert}
      >
        <ContrastIcon aria-hidden />
      </Button>
      <Button
        variant="viewport"
        size="icon"
        aria-label="90° 회전"
        disabled={disabled}
        onClick={onRotate}
      >
        <RotateCwIcon aria-hidden />
      </Button>
      <Button
        variant="viewport"
        size="icon"
        aria-label="화면 맞춤"
        disabled={disabled}
        onClick={onFit}
      >
        <Maximize2Icon aria-hidden />
      </Button>
      <Button
        variant="viewport"
        size="icon"
        aria-label="초기화"
        disabled={disabled}
        onClick={onReset}
      >
        <RotateCcwIcon aria-hidden />
      </Button>
    </div>
  );
}
