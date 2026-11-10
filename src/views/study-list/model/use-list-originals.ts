import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  type CatalogListResult,
  type DicomStore,
  summarizeServerOriginals,
} from "@/entities/dicom-study";
import { importDicomFiles } from "@/features/import-dicom";
import {
  type OriginalTransferState,
  type SaveOriginalResult,
  useOriginalTransfers,
} from "@/features/server-originals";

export interface UseListOriginalsOptions {
  userId: string;
  store: DicomStore;
  serverCatalog: CatalogListResult;
  /** 이 브라우저 원본(검사 UID → SOP UID → digest) */
  manifest: ReadonlyMap<string, ReadonlyMap<string, string>>;
  reloadLocal: () => Promise<void> | void;
}

export interface ListOriginals {
  states: ReadonlyMap<string, OriginalTransferState>;
  /** 그 검사의 서버 미보관 원본을 서버에 보관(사용자가 누를 때만) */
  upload: (studyInstanceUid: string) => void;
  /** 그 검사의 서버 보관 원본 중 이 브라우저에 없는 것을 불러온다 */
  download: (studyInstanceUid: string) => void;
}

const EMPTY = new Map<string, string>();

/**
 * 목록 화면의 원본 보관·불러오기 조립. 받은 원본은 기존 가져오기 경로(importDicomFiles)로
 * 계정별 저장소에 저장한다(같은 SOP 의 다른 내용은 덮어쓰지 않고 충돌). 끝나면 서버·로컬 목록을 다시 읽는다.
 */
export function useListOriginals({
  userId,
  store,
  serverCatalog,
  manifest,
  reloadLocal,
}: UseListOriginalsOptions): ListOriginals {
  const router = useRouter();
  const onChanged = useCallback(() => {
    router.refresh();
    void reloadLocal();
  }, [router, reloadLocal]);
  const save = useCallback(
    async (sop: string, bytes: ArrayBuffer): Promise<SaveOriginalResult> => {
      const report = await importDicomFiles(
        [{ name: sop, read: async () => bytes }],
        { store },
      );
      const status = report.results[0]?.status;
      return status === "imported" ||
        status === "duplicate" ||
        status === "conflict"
        ? status
        : "failed";
    },
    [store],
  );
  const transfers = useOriginalTransfers({ userId, store, save, onChanged });

  const studies = useMemo(
    () =>
      new Map(
        serverCatalog.status === "ready"
          ? serverCatalog.studies.map((study) => [
              study.studyInstanceUid,
              study,
            ])
          : [],
      ),
    [serverCatalog],
  );
  const { upload: startUpload, download: startDownload } = transfers;

  const upload = useCallback(
    (studyInstanceUid: string) => {
      const summary = summarizeServerOriginals(
        studies.get(studyInstanceUid),
        manifest.get(studyInstanceUid) ?? EMPTY,
      );
      if (summary.uploadable.length > 0)
        void startUpload(studyInstanceUid, summary.uploadable);
    },
    [studies, manifest, startUpload],
  );
  const download = useCallback(
    (studyInstanceUid: string) => {
      const remote = studies.get(studyInstanceUid);
      const summary = summarizeServerOriginals(
        remote,
        manifest.get(studyInstanceUid) ?? EMPTY,
      );
      const digests = new Map(
        (remote?.instances ?? []).map((item) => [
          item.sopInstanceUid,
          item.contentDigest,
        ]),
      );
      const items = summary.downloadable.map((sop) => ({
        sopInstanceUid: sop,
        contentDigest: digests.get(sop)!,
      }));
      if (items.length > 0) void startDownload(studyInstanceUid, items);
    },
    [studies, manifest, startDownload],
  );

  return { states: transfers.states, upload, download };
}
