"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  type DicomStore,
  imagePlaneAt,
  type SeriesGroup,
  seriesLabel,
} from "@/entities/dicom-study";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import type { ViewerTool } from "@/shared/viewer";

import {
  type DisplayedAnnotation,
  type EngineAnnotationCommit,
  useAnnotationSync,
} from "../model/use-annotation-sync";
import { useStackImageIds } from "../model/use-stack-image-ids";
import { useStackViewport } from "../model/use-stack-viewport";
import { useViewerTools } from "../model/use-viewer-tools";
import { useViewportPresentation } from "../model/use-viewport-presentation";

import { FrameNavigator } from "./frame-navigator";
import { ViewportControls } from "./viewport-controls";

export interface StackAnnotationCommit extends Omit<
  EngineAnnotationCommit,
  "imageId"
> {
  /** 그린 영상의 스택 위치 */
  index: number;
}

export interface StackViewerProps {
  store: DicomStore;
  series: SeriesGroup;
  /** 0부터 시작하는 현재 위치(제어 컴포넌트) */
  index: number;
  onIndexChange: (index: number) => void;
  tool?: ViewerTool;
  /** 이 시리즈의 주석(숨긴 주석 포함). 현재 영상의 것만 그린다 */
  annotations?: readonly DisplayedAnnotation[];
  selectedAnnotationId?: string;
  onAnnotationCommit?: (commit: StackAnnotationCommit) => void;
  onAnnotationSelect?: (id: string | undefined) => void;
}

const noop = () => undefined;

/**
 * 실제 DICOM 을 Cornerstone StackViewport 로 표시하고, 공식 측정 도구로 그린 주석을 작업 문서와 동기화한다.
 */
export function StackViewer({
  store,
  series,
  index,
  onIndexChange,
  tool = "select",
  annotations = [],
  selectedAnnotationId,
  onAnnotationCommit = noop,
  onAnnotationSelect = noop,
}: StackViewerProps) {
  const images = useStackImageIds(store, series);
  const imageIds = images.status === "ready" ? images.imageIds : undefined;
  const { elementRef, renderState, error, engineInfo, getViewport } =
    useStackViewport(imageIds, index);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [annotationCount, setAnnotationCount] = useState(0);
  const count = series.stack.ordered.length;
  const safeIndex = Math.min(Math.max(index, 0), count - 1);
  const current = series.stack.ordered[safeIndex];
  const instance = series.instances.find(
    (item) => item.sopInstanceUid === current?.sopInstanceUid,
  );
  const failure = images.status === "error" ? images.error : error;
  const plane = useMemo(
    () =>
      current
        ? imagePlaneAt(
            series.instances,
            current.sopInstanceUid,
            current.frameNumber,
          )
        : undefined,
    [series.instances, current],
  );

  const [engineError, setEngineError] = useState<string>();
  useViewerTools(engineInfo, tool, setEngineError);
  const { presentation, invert, rotate, fit, reset } = useViewportPresentation(
    engineInfo,
    element,
    getViewport,
  );

  const onScreen = useMemo(
    () =>
      annotations.filter(
        ({ annotation }) =>
          annotation.reference.sopInstanceUid === current?.sopInstanceUid &&
          annotation.reference.frameNumber === current?.frameNumber,
      ),
    [annotations, current?.sopInstanceUid, current?.frameNumber],
  );

  useAnnotationSync({
    engineInfo,
    element,
    imageId: imageIds?.[safeIndex],
    imageIds,
    displayed: onScreen,
    selectedId: selectedAnnotationId,
    frameOfReferenceUid: instance?.frameOfReferenceUid,
    plane,
    onCommit: ({ imageId, ...commit }) => {
      const at = imageIds?.indexOf(imageId) ?? -1;
      onAnnotationCommit({ ...commit, index: at >= 0 ? at : safeIndex });
    },
    onSelect: onAnnotationSelect,
    onSynced: setAnnotationCount,
    onError: setEngineError,
  });

  const attachElement = useCallback(
    (node: HTMLDivElement | null) => {
      elementRef.current = node;
      setElement(node);
    },
    [elementRef],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-viewport text-viewport-foreground">
      <div className="relative min-h-0 flex-1">
        <div
          ref={attachElement}
          data-testid="stack-viewport"
          data-render-state={failure ? "error" : renderState}
          data-current-index={safeIndex}
          data-annotation-count={annotationCount}
          data-selected-annotation={
            onScreen.some(
              ({ annotation }) => annotation.id === selectedAnnotationId,
            )
              ? selectedAnnotationId
              : ""
          }
          data-inverted={presentation.inverted ? "true" : "false"}
          data-rotation={presentation.rotation}
          data-voi={presentation.voi ?? ""}
          data-tool={tool}
          role="img"
          aria-label={`${seriesLabel(series)} 영상 ${safeIndex + 1} / ${count}`}
          className="absolute inset-0"
          onWheel={(event) => {
            if (count <= 1 || event.deltaY === 0) return;
            onIndexChange(
              Math.min(
                Math.max(safeIndex + Math.sign(event.deltaY), 0),
                count - 1,
              ),
            );
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-0.5 rounded-sm bg-black/70 px-1.5 py-1 text-xs">
          <span>
            {[series.modality, series.seriesDescription]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {instance ? (
            <span>{`${instance.columns} × ${instance.rows}`}</span>
          ) : null}
          {presentation.voi ? <span>{presentation.voi}</span> : null}
        </div>
        <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-0.5 rounded-sm bg-black/70 px-1.5 py-1 text-xs">
          <span>{`영상 ${safeIndex + 1} / ${count}`}</span>
          <span>{pixelSpacingText(instance?.pixelSpacing)}</span>
        </div>
        {renderState !== "rendered" && !failure ? (
          <p
            role="status"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-sm bg-black/70 px-2 py-1 text-xs"
          >
            영상을 불러오는 중…
          </p>
        ) : null}
        {engineError && !failure ? (
          <div className="absolute inset-x-4 top-12">
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden />
              <AlertTitle>측정 도구를 준비하지 못했습니다</AlertTitle>
              <AlertDescription>{engineError}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        {failure ? (
          <div className="absolute inset-x-4 top-12">
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden />
              <AlertTitle>영상을 표시하지 못했습니다</AlertTitle>
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <FrameNavigator
            index={safeIndex}
            count={count}
            onIndexChange={onIndexChange}
          />
        </div>
        <ViewportControls
          inverted={presentation.inverted}
          disabled={!engineInfo}
          onInvert={invert}
          onRotate={rotate}
          onFit={fit}
          onReset={reset}
        />
      </div>
    </div>
  );
}

function pixelSpacingText(
  spacing: readonly [number, number] | undefined,
): string {
  return spacing
    ? `간격 ${spacing[0]} × ${spacing[1]} mm`
    : "보정 정보 없음(px)";
}
