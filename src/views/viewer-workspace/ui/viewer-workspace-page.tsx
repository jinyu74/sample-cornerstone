"use client";

import {
  ArrowLeftIcon,
  ListIcon,
  PanelRightIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  useDicomStore,
  imagePlaneAt,
  SeriesList,
  useStudyCatalog,
} from "@/entities/dicom-study";
import { type Annotation, useStudyWorkStore } from "@/entities/study-work";
import { AccountMenu, submitSignOut } from "@/features/auth";
import { useStudyWork, ViewerToolbar } from "@/features/edit-study-work";
import {
  downloadJson,
  exportStudyWork,
  parseStudyWorkImport,
} from "@/features/transfer-results";
import { imageToWorld, samePoints } from "@/shared/lib/geometry";
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
import { AppHeader } from "@/shared/ui/app-header";
import { Button, buttonVariants } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Spinner } from "@/shared/ui/spinner";
import type { ViewerTool } from "@/shared/viewer";
import { ResultsPanel } from "@/widgets/results-panel";
import {
  type DisplayedAnnotation,
  SeriesThumbnail,
  type StackAnnotationCommit,
  StackViewer,
} from "@/widgets/stack-viewer";

import {
  canvasTextLines,
  useWorkspaceAnnotations,
} from "../model/use-workspace-annotations";
import { useUnsavedChangesGuard } from "../model/use-unsaved-changes-guard";

export interface ViewerWorkspacePageProps {
  studyInstanceUid: string;
  seriesInstanceUid?: string;
}

const newId = () => crypto.randomUUID();

export function ViewerWorkspacePage({
  studyInstanceUid,
  seriesInstanceUid,
}: ViewerWorkspacePageProps) {
  const dicomStore = useDicomStore();
  const workStore = useStudyWorkStore();
  const catalog = useStudyCatalog(dicomStore);
  const work = useStudyWork({ store: workStore, studyInstanceUid });
  const router = useRouter();
  const [tool, setTool] = useState<ViewerTool>("select");
  const [selectedId, setSelectedId] = useState<string>();
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<"series" | "results">();
  const [leaveFailed, setLeaveFailed] = useState<{
    message: string;
    /** 저장 실패를 확인한 뒤 갈 곳 */
    target: "list" | "sign-out";
  }>();

  const study = catalog.studies.find(
    (item) => item.studyInstanceUid === studyInstanceUid,
  );
  const selected =
    study?.series.find(
      (item) => item.seriesInstanceUid === seriesInstanceUid,
    ) ?? study?.series[0];
  const index = selected ? (positions[selected.seriesInstanceUid] ?? 0) : 0;
  const instances = useMemo(
    () => study?.series.flatMap((series) => series.instances) ?? [],
    [study],
  );
  const { entries, locations } = useWorkspaceAnnotations(study, work.work);
  const unsaved = work.saveState !== "saved";
  const unloadGuard = useUnsavedChangesGuard(unsaved);

  const displayed = useMemo<DisplayedAnnotation[]>(
    () =>
      entries
        .filter(
          ({ annotation }) =>
            annotation.reference.seriesInstanceUid ===
            selected?.seriesInstanceUid,
        )
        .map((entry) => ({
          annotation: entry.annotation,
          textLines: canvasTextLines(entry),
        })),
    [entries, selected?.seriesInstanceUid],
  );

  const goToSeries = useCallback(
    (uid: string) => {
      const params = new URLSearchParams({ series: uid });
      router.replace(
        `/studies/${encodeURIComponent(studyInstanceUid)}?${params.toString()}`,
      );
    },
    [router, studyInstanceUid],
  );

  const selectAnnotation = (id: string) => {
    setSelectedId(id);
    setPanel(undefined);
    const location = locations.get(id);
    if (!location) return;
    setPositions((current) => ({
      ...current,
      [location.seriesInstanceUid]: location.index,
    }));
    if (location.seriesInstanceUid !== selected?.seriesInstanceUid)
      goToSeries(location.seriesInstanceUid);
  };

  const commitAnnotation = ({
    id,
    tool: annotationTool,
    imagePoints,
    index: at,
  }: StackAnnotationCommit) => {
    if (!selected) return;
    const item = selected.stack.ordered[at];
    if (!item) return;
    const plane = imagePlaneAt(
      instances,
      item.sopInstanceUid,
      item.frameNumber,
    );
    const worldPoints = plane
      ? imagePoints.map((point) => imageToWorld(plane, point))
      : undefined;
    const existing = work.work?.annotations.find(
      (annotation) => annotation.id === id,
    );
    if (existing) {
      // 같은 좌표(재동기화 등)는 편집으로 만들지 않아 실행 취소·revision·저장이 생기지 않게 한다.
      if (samePoints(existing.imagePoints, imagePoints)) return;
      work.dispatch({
        type: "annotation/update",
        id,
        patch: { imagePoints, worldPoints },
      });
    } else {
      const now = new Date().toISOString();
      const instance = instances.find(
        (candidate) => candidate.sopInstanceUid === item.sopInstanceUid,
      );
      const annotation: Annotation = {
        id,
        tool: annotationTool,
        reference: {
          studyInstanceUid,
          seriesInstanceUid: selected.seriesInstanceUid,
          sopInstanceUid: item.sopInstanceUid,
          ...(item.frameNumber === undefined
            ? {}
            : { frameNumber: item.frameNumber }),
        },
        ...(instance?.frameOfReferenceUid
          ? { frameOfReferenceUid: instance.frameOfReferenceUid }
          : {}),
        imagePoints,
        ...(worldPoints ? { worldPoints } : {}),
        note: "",
        visible: true,
        createdAt: now,
        updatedAt: now,
      };
      work.dispatch({ type: "annotation/add", annotation });
    }
    setSelectedId(id);
  };

  const exportResults = () => {
    if (!work.work) return;
    const now = new Date().toISOString();
    downloadJson(
      `study-${studyInstanceUid}-results.json`,
      exportStudyWork(work.work, instances, now),
    );
  };

  const importResults = (text: string) => {
    if (!work.work) return ["작업 결과를 아직 불러오지 못했습니다"];
    const parsed = parseStudyWorkImport(text, {
      studyInstanceUid,
      instances,
      currentRevision: work.work.revision,
      now: new Date().toISOString(),
    });
    if (!parsed.ok) return parsed.errors;
    const replaced = work.dispatch({ type: "work/replace", work: parsed.work });
    if (!replaced.ok) return [replaced.error];
    setSelectedId(undefined);
    return null;
  };

  /** 저장하지 않은 변경이 있으면 저장한 뒤 이동하고, 저장에 실패하면 확인을 받는다 */
  const leave = async () => {
    if (unsaved && !(await work.saveNow())) {
      setLeaveFailed({
        message: work.saveError ?? "작업 결과를 저장하지 못했습니다",
        target: "list",
      });
      return;
    }
    router.push("/");
  };

  /**
   * 로그아웃은 문서 전체 이동이라 화면 정리(cleanup)의 저장을 기대할 수 없다.
   * 이동 전에 마지막 변경까지 저장하고, 실패하면 사용자 확인을 받는다.
   */
  const confirmSignOut = async () => {
    if (!(await work.saveNow())) {
      setLeaveFailed({
        message: work.saveError ?? "작업 결과를 저장하지 못했습니다",
        target: "sign-out",
      });
      return false;
    }
    unloadGuard.release();
    return true;
  };

  const seriesList = study ? (
    <SeriesList
      series={study.series}
      selectedSeriesUid={selected?.seriesInstanceUid}
      onSelect={(uid) => {
        setPanel(undefined);
        goToSeries(uid);
      }}
      renderThumbnail={(series) => (
        <SeriesThumbnail store={dicomStore} series={series} />
      )}
    />
  ) : null;

  const resultsPanel = (
    <ResultsPanel
      work={work}
      entries={entries}
      selectedId={selectedId}
      onSelect={selectAnnotation}
      onExport={exportResults}
      onImport={importResults}
      newId={newId}
      resolveWorldPoints={(annotation, imagePoints) => {
        const plane = imagePlaneAt(
          instances,
          annotation.reference.sopInstanceUid,
          annotation.reference.frameNumber,
        );
        return plane
          ? imagePoints.map((point) => imageToWorld(plane, point))
          : undefined;
      }}
    />
  );

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        actions={
          <>
            <AccountMenu confirmSignOut={confirmSignOut} />
            <div className="flex items-center gap-1 lg:hidden">
              <Button
                variant="outline"
                size="icon"
                aria-label="시리즈 열기"
                onClick={() => setPanel("series")}
              >
                <ListIcon aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="작업 결과 열기"
                onClick={() => setPanel("results")}
              >
                <PanelRightIcon aria-hidden />
              </Button>
            </div>
          </>
        }
      >
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          onClick={(event) => {
            if (!unsaved) return;
            event.preventDefault();
            void leave();
          }}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          검사 목록
        </Link>
        <h1 className="hidden truncate text-base font-semibold sm:block">
          {study?.studyDescription ?? study?.accessionNumber ?? "검사"}
        </h1>
      </AppHeader>
      {catalog.status === "loading" ? (
        <div
          role="status"
          className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"
        >
          <Spinner aria-hidden role="presentation" />
          검사를 불러오는 중
        </div>
      ) : catalog.status === "error" || !study || !selected ? (
        <div className="p-6">
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>검사를 열 수 없습니다</AlertTitle>
            <AlertDescription>
              {catalog.error ??
                "이 브라우저의 로컬 저장소에 해당 검사·시리즈가 없습니다."}
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <>
          <div className="border-b px-3 py-2">
            <ViewerToolbar
              tool={tool}
              onToolChange={setTool}
              canUndo={work.canUndo}
              canRedo={work.canRedo}
              onUndo={work.undo}
              onRedo={work.redo}
              saveState={work.saveState}
              saveError={work.saveError}
              onSave={() => void work.saveNow()}
              disabled={work.status !== "ready"}
            />
          </div>
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-72 shrink-0 overflow-y-auto border-r bg-sidebar p-3 lg:block">
              {seriesList}
            </aside>
            <main className="min-h-0 min-w-0 flex-1">
              <StackViewer
                key={selected.seriesInstanceUid}
                store={dicomStore}
                series={selected}
                index={index}
                onIndexChange={(next) =>
                  setPositions((current) => ({
                    ...current,
                    [selected.seriesInstanceUid]: next,
                  }))
                }
                tool={work.status === "ready" ? tool : "select"}
                annotations={displayed}
                selectedAnnotationId={selectedId}
                onAnnotationCommit={commitAnnotation}
                onAnnotationSelect={(id) => {
                  if (id) setSelectedId(id);
                }}
              />
            </main>
            <aside className="hidden w-80 shrink-0 overflow-y-auto border-l p-4 lg:block">
              {resultsPanel}
            </aside>
          </div>
          <Sheet
            open={panel === "series"}
            onOpenChange={(open) => setPanel(open ? "series" : undefined)}
          >
            <SheetContent side="left" className="w-80 overflow-y-auto p-3">
              <SheetHeader className="sr-only">
                <SheetTitle>시리즈</SheetTitle>
              </SheetHeader>
              {seriesList}
            </SheetContent>
          </Sheet>
          <Sheet
            open={panel === "results"}
            onOpenChange={(open) => setPanel(open ? "results" : undefined)}
          >
            <SheetContent
              side="right"
              className="w-[22rem] max-w-full overflow-y-auto p-4"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>작업 결과</SheetTitle>
              </SheetHeader>
              {resultsPanel}
            </SheetContent>
          </Sheet>
        </>
      )}
      <AlertDialog
        open={leaveFailed !== undefined}
        onOpenChange={(open) => !open && setLeaveFailed(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 못했습니다</AlertDialogTitle>
            <AlertDialogDescription>
              {leaveFailed?.message} 지금 나가면 저장하지 않은 변경이 사라질 수
              있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>머무르기</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (leaveFailed?.target === "sign-out") {
                  unloadGuard.release();
                  submitSignOut();
                } else {
                  router.push("/");
                }
              }}
            >
              {leaveFailed?.target === "sign-out"
                ? "저장하지 않고 로그아웃"
                : "저장하지 않고 나가기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
