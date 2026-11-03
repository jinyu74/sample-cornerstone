import { useCallback, useRef, useState } from "react";

import type { DicomStore } from "@/entities/dicom-study";

import { importDicomFiles } from "./import-dicom-files";
import type { ImportReport } from "./types";

export interface UseDicomImportOptions {
  store: DicomStore;
  onFinished?: (report: ImportReport) => void;
}

export interface DicomImportState {
  phase: "idle" | "running" | "done";
  progress?: { completed: number; total: number };
  report?: ImportReport;
  importFiles: (files: readonly File[]) => Promise<void>;
}

type ImportSnapshot = Omit<DicomImportState, "importFiles">;

/** 파일 가져오기 실행·진행 상태를 관리한다. 실행 중 중복 요청은 무시한다. onFinished 는 안정된 참조로 넘긴다. */
export function useDicomImport({
  store,
  onFinished,
}: UseDicomImportOptions): DicomImportState {
  const [snapshot, setSnapshot] = useState<ImportSnapshot>({ phase: "idle" });
  const running = useRef(false);

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0 || running.current) return;
      running.current = true;
      setSnapshot({
        phase: "running",
        progress: { completed: 0, total: files.length },
      });
      try {
        const report = await importDicomFiles(
          files.map((file) => ({
            name: file.webkitRelativePath || file.name,
            read: () => file.arrayBuffer(),
          })),
          {
            store,
            onProgress: ({ completed, total }) =>
              setSnapshot((previous) => ({
                ...previous,
                progress: { completed, total },
              })),
          },
        );
        setSnapshot({
          phase: "done",
          progress: { completed: files.length, total: files.length },
          report,
        });
        onFinished?.(report);
      } finally {
        running.current = false;
      }
    },
    [store, onFinished],
  );

  return { ...snapshot, importFiles };
}
