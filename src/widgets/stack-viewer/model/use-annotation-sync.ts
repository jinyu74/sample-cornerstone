import { useEffect, useEffectEvent, useRef } from "react";

import type { Annotation, AnnotationTool } from "@/entities/study-work";
import {
  type ImagePlane,
  imageToWorld,
  type ImagePoint,
  worldToImage,
} from "@/shared/lib/geometry";
import { initCornerstone } from "@/shared/viewer";

import {
  ENGINE_TOOL_NAMES,
  fromEngineAnnotation,
  toEngineAnnotation,
} from "../lib/annotation-mapping";

import { annotationTextLines } from "./use-viewer-tools";

const ENGINE_NAMES = new Set(Object.values(ENGINE_TOOL_NAMES));

export interface DisplayedAnnotation {
  annotation: Annotation;
  /** 캔버스에 표시할 측정값·메모 문구 */
  textLines: string[];
}

export interface EngineAnnotationCommit {
  id: string;
  tool: AnnotationTool;
  imagePoints: ImagePoint[];
  /** 그린 영상의 imageId (스택 위치 확인용) */
  imageId: string;
}

interface SyncOptions {
  engineInfo: { renderingEngineId: string; viewportId: string } | undefined;
  element: HTMLElement | null;
  /** 현재 표시 중인 영상 */
  imageId: string | undefined;
  /** 이 스택의 모든 imageId. 이 범위의 엔진 주석만 관리한다 */
  imageIds: readonly string[] | undefined;
  displayed: readonly DisplayedAnnotation[];
  selectedId: string | undefined;
  frameOfReferenceUid: string | undefined;
  /** 현재 영상의 유효한 평면 기하. 있으면 DICOM 규약의 도메인 변환을 쓴다 */
  plane: ImagePlane | undefined;
  onCommit: (commit: EngineAnnotationCommit) => void;
  onSelect: (id: string | undefined) => void;
  /** 동기화 후 엔진에 있는 주석 수(검증·표시용) */
  onSynced: (count: number) => void;
  /** 엔진 처리 실패(뷰어 오류로 표시) */
  onError?: (message: string) => void;
}

/**
 * 작업 문서를 기준으로 현재 영상의 엔진 주석을 다시 그린다(숨긴 주석은 그리지 않는다).
 * 사용자가 그리거나 핸들을 옮겨 완료하면(ANNOTATION_COMPLETED) 엔진 world 좌표를 이미지 좌표로 바꿔 알린다.
 */
export function useAnnotationSync({
  engineInfo,
  element,
  imageId,
  imageIds,
  displayed,
  selectedId,
  frameOfReferenceUid,
  plane,
  onCommit,
  onSelect,
  onSynced,
  onError,
}: SyncOptions) {
  const commit = useEffectEvent(onCommit);
  const select = useEffectEvent(onSelect);
  const synced = useEffectEvent(onSynced);
  const report = useEffectEvent((error: unknown) =>
    onError?.(error instanceof Error ? error.message : String(error)),
  );
  /** 완료 이벤트 시점의 현재 영상 평면(다른 영상이면 사용하지 않는다) */
  const currentPlane = useEffectEvent((referenced: string) =>
    referenced === imageId ? plane : undefined,
  );
  const stackIds = imageIds?.join("|");

  /** 문서에 이미 있는 주석인지(그리는 중인 새 주석과 구분) */
  const isInDocument = useEffectEvent((id: string) =>
    displayed.some(({ annotation }) => annotation.id === id),
  );

  // 엔진 이벤트 구독
  useEffect(() => {
    if (!engineInfo || !stackIds) return;
    const inStack = new Set(stackIds.split("|"));
    /** 완료(Completed)로 문서에 보낸 주석. 이후 HandlesUpdated 는 기존 주석 편집이다 */
    const completedIds = new Set<string>();
    /** 포인터를 누른 동안 모은 핸들 수정(포인터를 뗄 때 한 번만 반영) */
    const pending = new Map<string, EngineAnnotation>();
    let pointerDown = false;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    initCornerstone()
      .then(({ core, tools }) => {
        if (disposed) return;
        const send = (engineAnnotation: EngineAnnotation) => {
          const referenced = engineAnnotation.metadata.referencedImageId;
          if (
            !referenced ||
            !inStack.has(referenced) ||
            !ENGINE_NAMES.has(engineAnnotation.metadata.toolName)
          )
            return;
          let mapped: ReturnType<typeof fromEngineAnnotation> = null;
          try {
            mapped = fromEngineAnnotation(engineAnnotation, (world) =>
              toImageCoords(core, referenced, world, currentPlane(referenced)),
            );
          } catch {
            // 좌표를 영상에 대응시킬 수 없으면 결과로 저장하지 않는다.
            mapped = null;
          }
          if (mapped) commit({ ...mapped, imageId: referenced });
        };
        const flush = () => {
          const edits = [...pending.values()];
          pending.clear();
          for (const edit of edits) send(edit);
        };
        const onCompleted = (event: Event) => {
          const engineAnnotation = (
            event as CustomEvent<{ annotation: EngineAnnotation }>
          ).detail.annotation;
          if (engineAnnotation.annotationUID) {
            completedIds.add(engineAnnotation.annotationUID);
            pending.delete(engineAnnotation.annotationUID);
          }
          send(engineAnnotation);
        };
        const onModified = (event: Event) => {
          const { annotation: engineAnnotation, changeType } = (
            event as CustomEvent<{
              annotation: EngineAnnotation;
              changeType?: string;
            }>
          ).detail;
          // 사용자의 기하 편집(HandlesUpdated)만 반영한다. 통계·초기 설정·상호작용 등은 무시해 루프를 막는다.
          if (
            changeType !== "HandlesUpdated" ||
            !engineAnnotation.annotationUID
          )
            return;
          const id = engineAnnotation.annotationUID;
          if (!completedIds.has(id) && !isInDocument(id)) return;
          if (pointerDown) pending.set(id, engineAnnotation);
          else send(engineAnnotation);
        };
        const onSelectionChange = (event: Event) => {
          const selection =
            (event as CustomEvent<{ selection?: string[] }>).detail.selection ??
            [];
          select(selection[0]);
        };
        const onPointerDown = () => {
          pointerDown = true;
        };
        const onPointerUp = () => {
          if (!pointerDown) return;
          pointerDown = false;
          flush();
        };
        const { Events } = tools.Enums;
        core.eventTarget.addEventListener(
          Events.ANNOTATION_COMPLETED,
          onCompleted,
        );
        core.eventTarget.addEventListener(
          Events.ANNOTATION_MODIFIED,
          onModified,
        );
        core.eventTarget.addEventListener(
          Events.ANNOTATION_SELECTION_CHANGE,
          onSelectionChange,
        );
        element?.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        cleanup = () => {
          core.eventTarget.removeEventListener(
            Events.ANNOTATION_COMPLETED,
            onCompleted,
          );
          core.eventTarget.removeEventListener(
            Events.ANNOTATION_MODIFIED,
            onModified,
          );
          core.eventTarget.removeEventListener(
            Events.ANNOTATION_SELECTION_CHANGE,
            onSelectionChange,
          );
          element?.removeEventListener("pointerdown", onPointerDown);
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerUp);
        };
      })
      .catch((error: unknown) => {
        if (!disposed) report(error);
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [engineInfo, stackIds, element]);

  // 이 인스턴스가 엔진에 등록한 주석(소유권). 다른 뷰어나 그리는 중인 주석은 지우지 않는다.
  const owned = useRef(new Set<string>());
  const toolsRef = useRef<Tools | undefined>(undefined);

  // 문서 → 엔진 동기화
  useEffect(() => {
    if (!engineInfo || !element || !imageId || !stackIds) return;
    const inStack = new Set(stackIds.split("|"));
    const documentIds = new Set(
      displayed.map(({ annotation }) => annotation.id),
    );
    let disposed = false;
    initCornerstone()
      .then(({ core, tools }) => {
        if (disposed) return;
        toolsRef.current = tools;
        const { state, selection } = tools.annotation;
        // 이전에 등록한 주석과, 사용자가 그려 문서에 들어간(같은 UID) 엔진 주석을 지우고 문서 기준으로 다시 그린다.
        for (const existing of state.getAllAnnotations() as EngineAnnotation[]) {
          const uid = existing.annotationUID;
          const ours =
            uid !== undefined &&
            (owned.current.has(uid) ||
              (documentIds.has(uid) &&
                existing.metadata.referencedImageId !== undefined &&
                inStack.has(existing.metadata.referencedImageId)));
          if (ours) state.removeAnnotation(uid);
        }
        owned.current.clear();
        let count = 0;
        for (const { annotation, textLines } of displayed) {
          if (!annotation.visible) continue;
          const spec = toEngineAnnotation(annotation, {
            imageId,
            frameOfReferenceUid,
            selected: annotation.id === selectedId,
            toWorld: (point) => toWorldCoords(core, imageId, point, plane),
          });
          const points =
            spec.base.data.contour?.polyline ?? spec.base.data.handles.points;
          if (points.some((point) => !point.every(Number.isFinite))) continue;
          const created = toolClass(tools, spec.toolName).createAnnotation(
            spec.base,
          ) as unknown as EngineAnnotation;
          annotationTextLines.set(created.data, textLines);
          state.addAnnotation(created as never, element as HTMLDivElement);
          owned.current.add(annotation.id);
          count += 1;
        }
        if (selectedId && owned.current.has(selectedId)) {
          selection.setAnnotationSelected(selectedId, true, false);
        }
        core
          .getRenderingEngine(engineInfo.renderingEngineId)
          ?.getViewport(engineInfo.viewportId)
          ?.render();
        synced(count);
      })
      .catch((error: unknown) => {
        if (!disposed) report(error);
      });
    return () => {
      disposed = true;
    };
  }, [
    engineInfo,
    element,
    imageId,
    stackIds,
    displayed,
    selectedId,
    frameOfReferenceUid,
    plane,
  ]);

  // 화면을 떠나거나 스택이 바뀌면 이 인스턴스가 등록한 주석과 선택을 정리한다.
  useEffect(() => {
    const registry = owned.current;
    return () => {
      const tools = toolsRef.current;
      if (!tools) return;
      for (const uid of registry) {
        if (tools.annotation.selection.isAnnotationSelected?.(uid))
          tools.annotation.selection.deselectAnnotation(uid);
        tools.annotation.state.removeAnnotation(uid);
      }
      registry.clear();
    };
  }, [engineInfo, stackIds]);
}

type Tools = Awaited<ReturnType<typeof initCornerstone>>["tools"];

interface EngineAnnotation {
  annotationUID?: string;
  metadata: { toolName: string; referencedImageId?: string };
  data: object & {
    handles?: { points?: readonly (readonly number[])[] };
    contour?: { polyline?: readonly (readonly number[])[] };
  };
}

function toolClass(tools: Tools, toolName: string) {
  switch (toolName) {
    case "Length":
      return tools.LengthTool;
    case "Angle":
      return tools.AngleTool;
    case "EllipticalROI":
      return tools.EllipticalROITool;
    case "PlanarFreehandROI":
      return tools.PlanarFreehandROITool;
    default:
      return tools.ArrowAnnotateTool;
  }
}

type Core = Awaited<ReturnType<typeof initCornerstone>>["core"];

/**
 * 작업 문서 이미지 좌표(첫 픽셀 중심 = (0,0)) → 엔진 world.
 * 평면 기하가 유효하면 DICOM 규약의 도메인 변환을 쓴다. 엔진 유틸은 첫 픽셀 중심이 (0.5, 0.5) 이고
 * 비등방 간격에서 행·열 간격 대응이 DICOM 과 다르므로, 기하가 없는 영상(간격 1)에서만 오프셋을 보정해 쓴다.
 */
function toWorldCoords(
  core: Core,
  imageId: string,
  point: ImagePoint,
  plane: ImagePlane | undefined,
) {
  if (plane) return imageToWorld(plane, point);
  const world = core.utilities.imageToWorldCoords(imageId, [
    point[0] + 0.5,
    point[1] + 0.5,
  ]);
  if (!world) return [Number.NaN, Number.NaN, Number.NaN] as const;
  return [world[0], world[1], world[2]] as const;
}

function toImageCoords(
  core: Core,
  imageId: string,
  world: readonly number[],
  plane: ImagePlane | undefined,
): [number, number] {
  const point = [world[0]!, world[1]!, world[2]!] as const;
  if (plane) return worldToImage(plane, point);
  const image = core.utilities.worldToImageCoords(imageId, [
    point[0],
    point[1],
    point[2],
  ]);
  if (!image) throw new RangeError("world 좌표를 영상 좌표로 바꿀 수 없습니다");
  return [image[0] - 0.5, image[1] - 0.5];
}
