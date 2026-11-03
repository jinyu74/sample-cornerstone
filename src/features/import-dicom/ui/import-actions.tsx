"use client";

import { FolderIcon, UploadIcon } from "lucide-react";
import { useId, useRef, type ChangeEvent } from "react";

import { Button } from "@/shared/ui/button";

import { useFolderPickerSupport } from "../model/use-folder-picker-support";

export interface ImportActionsProps {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  /** 폴더 선택 지원 여부. 생략하면 브라우저 기능을 감지한다 */
  folderSupported?: boolean;
}

/** 파일·폴더 선택 버튼. 실제 input 은 hidden 으로 접근성 트리에서 빼고 같은 이름의 버튼으로만 연다. */
export function ImportActions({
  onFiles,
  busy = false,
  folderSupported,
}: ImportActionsProps) {
  const detected = useFolderPickerSupport();
  const supportsFolder = folderSupported ?? detected;
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    // 같은 파일을 다시 선택해도 change 가 발생하도록 비운다.
    event.currentTarget.value = "";
    if (files.length > 0) onFiles(files);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <UploadIcon data-icon="inline-start" aria-hidden />
          파일 가져오기
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={busy || !supportsFolder}
          aria-describedby={supportsFolder ? undefined : hintId}
          onClick={() => folderInput.current?.click()}
        >
          <FolderIcon data-icon="inline-start" aria-hidden />
          폴더 선택
        </Button>
      </div>
      {supportsFolder ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          이 브라우저는 폴더 선택을 지원하지 않습니다. 파일 가져오기에서 여러
          파일을 선택하세요.
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        data-testid="dicom-file-input"
        disabled={busy}
        onChange={handleChange}
      />
      <input
        ref={(element) => {
          folderInput.current = element;
          element?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        hidden
        data-testid="dicom-folder-input"
        disabled={busy || !supportsFolder}
        onChange={handleChange}
      />
    </div>
  );
}
