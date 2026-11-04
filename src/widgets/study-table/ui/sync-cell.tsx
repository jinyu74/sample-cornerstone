import type { CatalogSyncFailure } from "@/features/sync-catalog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

import type { SyncView } from "../model/types";

const KEPT = "원본은 이 브라우저에 그대로 있습니다.";

/** 실패 이유와 다시 시도로 해결될 수 있는지 */
function describeFailure(
  reason: CatalogSyncFailure,
  conflict?: "series" | "instance",
): { message: string; retry: boolean } {
  switch (reason) {
    case "network":
      return { message: `네트워크 오류. ${KEPT}`, retry: true };
    case "unavailable":
      return { message: `서버를 사용할 수 없습니다. ${KEPT}`, retry: true };
    case "unauthenticated":
      return { message: `로그인이 필요합니다. ${KEPT}`, retry: true };
    case "local-read":
      return { message: "이 브라우저 원본을 읽지 못했습니다.", retry: true };
    case "account-mismatch":
      return { message: "계정이 바뀌어 반영하지 않았습니다.", retry: false };
    case "invalid":
      return {
        message: "서버가 받을 수 없는 메타데이터라 반영하지 않았습니다.",
        retry: false,
      };
    case "conflict":
      return {
        message:
          conflict === "series"
            ? "서버 기록에서 같은 시리즈가 다른 검사에 속해 있어 반영하지 않았습니다."
            : "서버 기록과 같은 UID 의 내용이 달라 반영하지 않았습니다.",
        retry: false,
      };
  }
}

export interface SyncCellProps {
  sync: SyncView;
  identifier: string;
  onSync?: () => void;
}

/** 서버 목록 반영 상태와 반영·다시 시도 동작 */
export function SyncCell({ sync, identifier, onSync }: SyncCellProps) {
  switch (sync.kind) {
    case "checking":
      return <Badge variant="outline">확인 중</Badge>;
    case "synced":
      return <Badge variant="success">반영됨</Badge>;
    case "unknown":
      return <Badge variant="outline">서버 목록 확인 불가</Badge>;
    case "syncing":
      return (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden role="presentation" />
          반영 중
        </span>
      );
    case "unsynced":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">미반영 {sync.count}개</Badge>
          {onSync ? (
            <Button
              variant="outline"
              size="sm"
              aria-label={`${identifier} 서버 목록에 반영`}
              onClick={onSync}
            >
              서버 목록에 반영
            </Button>
          ) : null}
        </div>
      );
    case "failed": {
      const { message, retry } = describeFailure(sync.reason, sync.conflict);
      return (
        <div className="flex max-w-56 flex-col items-start gap-1">
          <Badge variant="destructive">서버 반영 실패</Badge>
          <span className="text-xs whitespace-normal text-muted-foreground">
            {message}
          </span>
          {retry && onSync ? (
            <Button
              variant="outline"
              size="sm"
              aria-label={`${identifier} 다시 시도`}
              onClick={onSync}
            >
              다시 시도
            </Button>
          ) : null}
        </div>
      );
    }
  }
}
