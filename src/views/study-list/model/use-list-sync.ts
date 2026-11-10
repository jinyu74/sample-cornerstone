import { useRouter } from "next/navigation";
import { useCallback } from "react";

import type { DicomStore } from "@/entities/dicom-study";
import type { ImportReport } from "@/features/import-dicom";
import { type CatalogSyncState, useCatalogSync } from "@/features/sync-catalog";

export interface UseListSyncOptions {
  /** 이 화면(계정별 저장소)의 계정 */
  userId: string;
  store: DicomStore;
  /** 이 브라우저 목록 다시 읽기 */
  reloadLocal: () => Promise<void> | void;
}

export interface ListSync {
  states: ReadonlyMap<string, CatalogSyncState>;
  /** 한 검사를 서버 목록에 반영(처음·다시 시도) */
  syncStudy: (studyInstanceUid: string) => void;
  /** 가져오기 완료 처리. 안정된 참조라 useDicomImport 의 onFinished 로 쓸 수 있다 */
  onImported: (report: ImportReport) => void;
}

/**
 * 가져오기 → 로컬 목록 갱신 → 저장된 원본 검사의 서버 목록 반영 → 서버 목록 다시 렌더링(router.refresh).
 * 기존 로컬 검사는 자동으로 보내지 않고 사용자가 반영을 누를 때만 보낸다.
 */
export function useListSync({
  userId,
  store,
  reloadLocal,
}: UseListSyncOptions): ListSync {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { states, syncStudies } = useCatalogSync({
    userId,
    store,
    onSynced: refresh,
  });

  const onImported = useCallback(
    (report: ImportReport) => {
      void reloadLocal();
      const uids = new Set<string>();
      for (const result of report.results)
        if (
          (result.status === "imported" || result.status === "duplicate") &&
          result.studyInstanceUid
        )
          uids.add(result.studyInstanceUid);
      if (uids.size > 0) void syncStudies([...uids]);
    },
    [reloadLocal, syncStudies],
  );
  const syncStudy = useCallback(
    (studyInstanceUid: string) => void syncStudies([studyInstanceUid]),
    [syncStudies],
  );
  return { states, syncStudy, onImported };
}
