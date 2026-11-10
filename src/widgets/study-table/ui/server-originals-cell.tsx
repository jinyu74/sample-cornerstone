import type {
  TransferDirection,
  TransferFailure,
} from "@/features/server-originals";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

import type { ServerOriginalsView } from "../model/types";

export interface ServerOriginalsCellProps {
  identifier: string;
  status: ServerOriginalsView;
  /** 이 브라우저에서 서버로 보관할 수 있는 영상 수 */
  uploadable: number;
  /** 서버에서 이 브라우저로 불러올 수 있는 영상 수 */
  downloadable: number;
  /** 이 브라우저 원본을 확인하기 전 등 동작을 시작할 수 없을 때 */
  disabled?: boolean;
  onUpload?: () => void;
  onDownload?: () => void;
}

const KEPT = "이 브라우저 원본은 그대로 있습니다.";

/** 실패 이유와 다시 시도로 해결될 수 있는지 */
function describeFailure(
  direction: TransferDirection,
  reason: TransferFailure,
): { message: string; retry: boolean } {
  const verb = direction === "upload" ? "보관" : "저장";
  switch (reason) {
    case "network":
    case "aborted":
      return { message: `네트워크 오류. ${KEPT}`, retry: true };
    case "busy":
      return {
        message: "서버가 다른 원본을 처리 중입니다. 잠시 뒤 다시 시도하세요.",
        retry: true,
      };
    case "unauthenticated":
      return { message: "로그인이 필요합니다.", retry: true };
    case "storage-full":
      return {
        message: "서버 저장 공간이 부족합니다. 운영자에게 알려 주세요.",
        retry: true,
      };
    case "storage-unavailable":
    case "unavailable":
      return {
        message: `서버 저장소를 사용할 수 없습니다. ${KEPT}`,
        retry: true,
      };
    case "local-read":
      return { message: "이 브라우저 원본을 읽지 못했습니다.", retry: true };
    case "local-write":
      return {
        message: "받은 원본을 이 브라우저에 저장하지 못했습니다.",
        retry: true,
      };
    case "integrity":
      return {
        message: "받은 내용이 서버 기록과 달라 저장하지 않았습니다.",
        retry: true,
      };
    case "not-found":
      return { message: "서버에 이 원본이 없습니다.", retry: false };
    case "conflict":
      return {
        message:
          direction === "upload"
            ? "서버 기록과 같은 UID 의 내용이 달라 보관하지 않았습니다."
            : "이 브라우저에 같은 UID 의 다른 원본이 있어 덮어쓰지 않았습니다.",
        retry: false,
      };
    case "account-mismatch":
      return { message: `계정이 바뀌어 ${verb}하지 않았습니다.`, retry: false };
    case "too-large":
    case "inflated-too-large":
      return { message: "서버가 허용하는 원본 크기를 넘습니다.", retry: false };
    case "invalid-dicom":
    case "sop-mismatch":
    case "bad-request":
      return {
        message: "서버가 이 파일을 DICOM 원본으로 받을 수 없습니다.",
        retry: false,
      };
    case "storage-corrupt":
      return {
        message: "서버에 손상된 원본이 있습니다. 운영자에게 알려 주세요.",
        retry: false,
      };
    case "unconfigured":
      return { message: "서버 원본 보관이 설정되지 않았습니다.", retry: false };
  }
}

/** 검사별 서버 원본 보관 상태와 보관·불러오기 동작. 보관·불러오기는 사용자가 누를 때만 시작한다 */
export function ServerOriginalsCell({
  identifier,
  status,
  uploadable,
  downloadable,
  disabled = false,
  onUpload,
  onDownload,
}: ServerOriginalsCellProps) {
  if (status.kind === "unconfigured")
    return <Badge variant="outline">서버 보관 사용 안 함</Badge>;
  if (status.kind === "unavailable")
    return <Badge variant="outline">서버 원본 확인 불가</Badge>;
  if (status.kind === "running")
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Spinner aria-hidden role="presentation" />
        {status.direction === "upload" ? "보관 중" : "불러오는 중"}{" "}
        {status.done}/{status.total}
      </span>
    );

  const actions = (
    <>
      {uploadable > 0 && onUpload ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`${identifier} 서버에 원본 보관`}
          onClick={onUpload}
        >
          서버에 원본 보관
        </Button>
      ) : null}
      {downloadable > 0 && onDownload ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`${identifier} 서버에서 원본 불러오기`}
          onClick={onDownload}
        >
          서버에서 원본 불러오기
        </Button>
      ) : null}
    </>
  );

  if (status.kind === "failed") {
    const { message, retry } = describeFailure(status.direction, status.reason);
    const upload = status.direction === "upload";
    return (
      <div className="flex max-w-60 flex-col items-start gap-1">
        <Badge variant="destructive">
          {upload ? "보관 실패" : "불러오기 실패"} {status.done}/{status.total}
        </Badge>
        <span className="text-xs whitespace-normal text-muted-foreground">
          {message}
        </span>
        {retry && (upload ? onUpload : onDownload) ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`${identifier} ${upload ? "다시 보관" : "다시 불러오기"}`}
            onClick={upload ? onUpload : onDownload}
          >
            {upload ? "다시 보관" : "다시 불러오기"}
          </Button>
        ) : null}
      </div>
    );
  }

  const { stored, total } = status;
  const badge =
    total > 0 && stored === total ? (
      <Badge variant="success">
        보관됨 {stored}/{total}
      </Badge>
    ) : stored > 0 ? (
      <Badge variant="warning">
        일부 보관 {stored}/{total}
      </Badge>
    ) : (
      <Badge variant="secondary">서버 원본 없음</Badge>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {badge}
      {actions}
    </div>
  );
}
