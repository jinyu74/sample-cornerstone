"use client";

import { useMemo, useState } from "react";

import {
  getBrowserDicomStore,
  toStudyListItem,
  useStudyCatalog,
} from "@/entities/dicom-study";
import { getBrowserWorkStore, useWorkStatuses } from "@/entities/study-work";
import {
  filterStudies,
  type StudyFilter,
  StudyFilterBar,
} from "@/features/filter-studies";
import {
  ImportActions,
  ImportDropZone,
  ImportResultList,
  useDicomImport,
} from "@/features/import-dicom";
import { AppHeader } from "@/shared/ui/app-header";
import { StudyTable } from "@/widgets/study-table";

const studyHref = (studyInstanceUid: string) =>
  `/studies/${encodeURIComponent(studyInstanceUid)}`;

export function StudyListPage() {
  const [store] = useState(getBrowserDicomStore);
  const [workStore] = useState(getBrowserWorkStore);
  const catalog = useStudyCatalog(store);
  const works = useWorkStatuses(workStore, catalog.studies);
  const importer = useDicomImport({ store, onFinished: catalog.reload });
  const [filter, setFilter] = useState<StudyFilter>({
    query: "",
    status: "all",
  });

  // 작업 상태는 저장된 작업 결과에서 계산한다(결과가 없으면 미작업).
  const items = useMemo(
    () =>
      catalog.studies.map((study) =>
        toStudyListItem(
          study,
          works.statuses.get(study.studyInstanceUid) ?? "untouched",
        ),
      ),
    [catalog.studies, works.statuses],
  );
  const visible = useMemo(() => filterStudies(items, filter), [items, filter]);
  const busy = importer.phase === "running";

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">검사 목록</h1>
            <p className="text-muted-foreground">
              이 기기의 DICOM 영상과 작업 결과를 관리합니다.
            </p>
          </div>
          <ImportActions onFiles={importer.importFiles} busy={busy} />
        </div>
        <ImportDropZone onFiles={importer.importFiles} busy={busy} />
        <ImportResultList
          phase={importer.phase}
          progress={importer.progress}
          report={importer.report}
        />
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
        />
      </main>
      <footer className="border-t px-4 py-4 text-xs text-muted-foreground md:px-6">
        영상과 결과는 이 브라우저(IndexedDB)에만 저장되며 서버로 업로드되지
        않습니다. 사이트 데이터를 삭제하거나 저장 용량이 부족하면 유실될 수
        있습니다.
      </footer>
    </div>
  );
}
