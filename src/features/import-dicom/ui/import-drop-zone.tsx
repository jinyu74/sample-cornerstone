"use client";

import { FileUpIcon, TriangleAlertIcon } from "lucide-react";
import { useState, type DragEvent } from "react";

import { cn } from "@/shared/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Spinner } from "@/shared/ui/spinner";

import {
  collectDroppedFiles,
  type DroppedEntry,
} from "../lib/collect-dropped-files";

export interface ImportDropZoneProps {
  /** 놓은 파일. 폴더를 놓으면 하위 파일을 모두 모으며 상대 경로를 이름으로 쓴다 */
  onFiles: (files: File[]) => void;
  busy?: boolean;
}

export function ImportDropZone({ onFiles, busy = false }: ImportDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string>();

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!busy) setDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    setReadError(undefined);
    const { dataTransfer } = event;
    const entries = Array.from(dataTransfer.items ?? []).flatMap((item) => {
      const entry = item.webkitGetAsEntry?.();
      return entry ? [entry as unknown as DroppedEntry] : [];
    });
    const fallback = Array.from(dataTransfer.files ?? []);
    void collectDroppedFiles(entries, fallback).then(
      (collected) => {
        const files = collected.map(({ path, file }) =>
          path === file.name
            ? file
            : new File([file], path, {
                type: file.type,
                lastModified: file.lastModified,
              }),
        );
        if (files.length > 0) onFiles(files);
      },
      (error: unknown) => {
        // 폴더 권한·읽기 오류를 조용히 삼키지 않고 표시한다.
        setReadError(
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
        );
      },
    );
  };

  return (
    <section
      aria-label="DICOM 파일 놓기 영역"
      aria-busy={busy}
      data-dragging={dragging ? "true" : "false"}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-sidebar px-6 py-10 text-center",
        dragging && "border-brand bg-accent",
      )}
    >
      {busy ? (
        <Spinner
          aria-hidden
          role="presentation"
          className="text-brand size-8"
        />
      ) : (
        <FileUpIcon
          aria-hidden
          className="size-8 text-muted-foreground"
          strokeWidth={1.5}
        />
      )}
      <p className="text-base font-semibold">
        {busy ? "가져오는 중입니다…" : "DICOM 파일을 여기에 놓으세요"}
      </p>
      <p className="text-muted-foreground">
        여러 파일이나 폴더를 한 번에 가져올 수 있습니다.
      </p>
      {readError ? (
        <Alert variant="destructive" className="mt-2 max-w-xl text-left">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>놓은 파일이나 폴더를 읽지 못했습니다</AlertTitle>
          <AlertDescription>{readError}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
