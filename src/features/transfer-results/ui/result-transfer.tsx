"use client";

import {
  DownloadIcon,
  InfoIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";

export interface ResultTransferProps {
  onExport: () => void;
  /** 파일을 검증해 성공하면 null, 실패하면 이유 목록 */
  onImport: (text: string) => string[] | null;
  disabled?: boolean;
}

type Outcome = { kind: "imported" } | { kind: "rejected"; errors: string[] };

/** 작업 결과 JSON 내보내기·가져오기. 가져오기는 현재 결과를 바꾸므로 확인을 받는다 */
export function ResultTransfer({
  onExport,
  onImport,
  disabled = false,
}: ResultTransferProps) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();

  return (
    <section aria-label="결과 관리" className="flex flex-col gap-2">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        결과는 이 기기(브라우저)에 저장됩니다. JSON 에는 원본 픽셀이 없습니다.
      </p>
      <Button variant="outline" disabled={disabled} onClick={onExport}>
        <UploadIcon data-icon="inline-start" aria-hidden />
        결과 내보내기 (JSON)
      </Button>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <DownloadIcon data-icon="inline-start" aria-hidden />
        결과 가져오기 (JSON)
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="result-json-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void file.text().then(setPending, () =>
            setOutcome({
              kind: "rejected",
              errors: ["파일을 읽을 수 없습니다"],
            }),
          );
        }}
      />
      {outcome?.kind === "imported" ? (
        <p role="status" className="text-sm text-muted-foreground">
          작업 결과를 가져왔습니다. 실행 취소로 되돌릴 수 있습니다.
        </p>
      ) : null}
      {outcome?.kind === "rejected" ? (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>가져오지 않았습니다</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {outcome.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog
        open={pending !== undefined}
        onOpenChange={(open) => !open && setPending(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>작업 결과를 바꿀까요?</AlertDialogTitle>
            <AlertDialogDescription>
              파일을 검증한 뒤 이 검사의 현재 작업 결과를 가져온 결과로
              바꿉니다. 문제가 있으면 아무것도 바꾸지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const errors = pending === undefined ? null : onImport(pending);
                setPending(undefined);
                setOutcome(
                  errors ? { kind: "rejected", errors } : { kind: "imported" },
                );
              }}
            >
              가져오기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
