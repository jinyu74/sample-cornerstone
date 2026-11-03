import { CircleAlertIcon, CircleCheckIcon, CircleDotIcon } from "lucide-react";

import { Spinner } from "@/shared/ui/spinner";

import type { SaveState } from "../model/use-study-work";

export interface SaveStatusProps {
  state: SaveState;
  error?: string;
}

/** 저장 상태. 실패를 성공으로 표시하지 않으며 실패 이유를 함께 보여 준다 */
export function SaveStatus({ state, error }: SaveStatusProps) {
  return (
    <p
      role="status"
      className="flex min-w-0 items-center gap-1.5 text-sm"
      title={error}
    >
      {state === "saved" ? (
        <>
          <CircleCheckIcon aria-hidden className="text-brand size-4" />
          <span className="text-muted-foreground">저장됨</span>
        </>
      ) : state === "saving" ? (
        <>
          <Spinner aria-hidden role="presentation" />
          <span className="text-muted-foreground">저장 중…</span>
        </>
      ) : state === "unsaved" ? (
        <>
          <CircleDotIcon
            aria-hidden
            className="size-4 text-warning-foreground"
          />
          <span className="text-warning-foreground">저장되지 않은 변경</span>
        </>
      ) : (
        <>
          <CircleAlertIcon aria-hidden className="size-4 text-destructive" />
          <span className="truncate text-destructive">
            저장 실패{error ? `: ${error}` : ""}
          </span>
        </>
      )}
    </p>
  );
}
