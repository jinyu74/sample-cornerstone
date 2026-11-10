"use client";

import { CloudOffIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  type CatalogListResult,
  useDicomStore,
  useStudyCatalog,
} from "@/entities/dicom-study";
import { useStudyWorkStore, useWorkStatuses } from "@/entities/study-work";
import { AccountMenu, useSessionUser } from "@/features/auth";
import {
  filterStudies,
  type StudyFilter,
  StudyFilterBar,
} from "@/features/filter-studies";
import {
  ImportActions,
  type ImportActionsHandle,
  ImportDropZone,
  ImportResultList,
  useDicomImport,
} from "@/features/import-dicom";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { AppHeader } from "@/shared/ui/app-header";
import { StudyTable } from "@/widgets/study-table";

import { buildCatalogRows } from "../model/build-catalog-rows";
import { useListSync } from "../model/use-list-sync";

const studyHref = (studyInstanceUid: string) =>
  `/studies/${encodeURIComponent(studyInstanceUid)}`;

export interface StudyListPageProps {
  /** 서버가 렌더링 시점에 읽은 이 계정의 서버 목록(최소 DTO). 행이 최초 HTML 에 들어간다 */
  serverCatalog: CatalogListResult;
}

export function StudyListPage({ serverCatalog }: StudyListPageProps) {
  const user = useSessionUser();
  const store = useDicomStore();
  const workStore = useStudyWorkStore();
  const catalog = useStudyCatalog(store);
  const works = useWorkStatuses(workStore, catalog.studies);
  const sync = useListSync({
    userId: user.id,
    store,
    reloadLocal: catalog.reload,
  });
  const importer = useDicomImport({ store, onFinished: sync.onImported });
  const importActions = useRef<ImportActionsHandle>(null);
  const [filter, setFilter] = useState<StudyFilter>({
    query: "",
    status: "all",
  });

  // 서버 목록 + 이 브라우저 원본·작업 기록 + 이번 화면의 반영 상태
  const items = useMemo(
    () =>
      buildCatalogRows({
        server: serverCatalog,
        local: catalog,
        works,
        sync: sync.states,
      }),
    [serverCatalog, catalog, works, sync.states],
  );
  const visible = useMemo(() => filterStudies(items, filter), [items, filter]);
  const busy = importer.phase === "running";

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader actions={<AccountMenu />} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">검사 목록</h1>
            <p className="text-muted-foreground">
              계정의 검사 목록과 이 브라우저의 DICOM 원본·작업 결과를
              관리합니다.
            </p>
          </div>
          <ImportActions
            ref={importActions}
            onFiles={importer.importFiles}
            busy={busy}
          />
        </div>
        <ImportDropZone onFiles={importer.importFiles} busy={busy} />
        <ImportResultList
          phase={importer.phase}
          progress={importer.progress}
          report={importer.report}
        />
        {serverCatalog.status === "unavailable" ? (
          <Alert>
            <CloudOffIcon aria-hidden />
            <AlertTitle>서버 목록을 불러오지 못했습니다</AlertTitle>
            <AlertDescription>
              이 브라우저에 저장된 검사만 표시합니다. 서버 반영 여부는 확인할 수
              없습니다.
            </AlertDescription>
          </Alert>
        ) : null}
        <StudyFilterBar value={filter} onChange={setFilter} />
        {works.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            작업 상태를 읽지 못했습니다: {works.error}
          </p>
        ) : null}
        <StudyTable
          status={catalog.status}
          items={visible}
          error={catalog.error}
          filtered={items.length > 0}
          getStudyHref={studyHref}
          onSync={sync.syncStudy}
          onImportOriginals={() => importActions.current?.openFilePicker()}
        />
      </main>
      <footer className="border-t px-4 py-4 text-xs text-muted-foreground md:px-6">
        원본 영상과 작업 결과는 이 브라우저(IndexedDB)에만 저장되며 서버로
        업로드되지 않습니다. 서버에는 계정별 목록용 메타데이터(검사·시리즈·영상
        UID, 날짜, 설명, 검사 번호, modality, 파일 digest)만 저장됩니다. 사이트
        데이터를 삭제하거나 저장 용량이 부족하면 이 브라우저의 원본이 유실될 수
        있습니다.
      </footer>
    </div>
  );
}
