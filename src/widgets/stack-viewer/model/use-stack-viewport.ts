import { useCallback, useEffect, useRef, useState } from "react";

import { initCornerstone } from "@/shared/viewer";

type Core = Awaited<ReturnType<typeof initCornerstone>>["core"];
type StackViewport = InstanceType<Core["StackViewport"]>;
type RenderingEngine = InstanceType<Core["RenderingEngine"]>;

export type ViewportRenderState =
  "initializing" | "loading" | "rendered" | "error";

/** 엔진 초기화 실패는 특정 요청이 아닌 viewport 전체 오류다 */
const INIT_ERROR_KEY = "__init__";

let engineCounter = 0;

/**
 * Cornerstone StackViewport 수명주기를 관리한다.
 * - 마운트 시 엔진·viewport 생성, 언마운트 시 이벤트·ResizeObserver 해제와 엔진 파괴
 * - imageIds·index 변경을 viewport 에 반영한다
 * - rendered 는 엔진이 실제로 그린 스택·위치가 현재 요청과 같을 때만 참이다(늦게 온 이전 이벤트 무시)
 * - 오류는 요청 키에 묶어 다른 스택·위치로 바꾸면 이전 오류를 보이지 않는다
 */
export function useStackViewport(
  imageIds: readonly string[] | undefined,
  index: number,
) {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<StackViewport | null>(null);
  const requestedKey = useRef<string>("");
  const loadedStackKey = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{
    renderingEngineId: string;
    viewportId: string;
  }>();
  const [renderedKey, setRenderedKey] = useState<string>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();

  // 엔진 생성·정리
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let disposed = false;
    let engine: RenderingEngine | undefined;
    let observer: ResizeObserver | undefined;
    let onRendered: (() => void) | undefined;
    let renderedEvent = "";

    initCornerstone()
      .then(({ core }) => {
        if (disposed) return;
        engineCounter += 1;
        const renderingEngineId = `stack-engine-${engineCounter}`;
        engine = new core.RenderingEngine(renderingEngineId);
        engine.enableElement({
          viewportId: "stack",
          type: core.Enums.ViewportType.STACK,
          element,
          defaultOptions: { background: [0, 0, 0] },
        });
        const viewport = engine.getViewport("stack") as StackViewport;
        viewportRef.current = viewport;
        renderedEvent = core.Enums.Events.IMAGE_RENDERED;
        onRendered = () => setRenderedKey(displayedKey(viewport));
        element.addEventListener(renderedEvent, onRendered);
        observer = new ResizeObserver(() => engine?.resize(true, true));
        observer.observe(element);
        setEngineInfo({ renderingEngineId, viewportId: "stack" });
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!disposed)
          setFailure({ key: INIT_ERROR_KEY, message: describe(reason) });
      });

    return () => {
      disposed = true;
      observer?.disconnect();
      if (onRendered) element.removeEventListener(renderedEvent, onRendered);
      viewportRef.current = null;
      requestedKey.current = "";
      loadedStackKey.current = "";
      engine?.destroy();
      setReady(false);
      setEngineInfo(undefined);
    };
  }, []);

  const stackKey = imageIds?.join("|") ?? "";

  // 스택 교체(새 imageIds) 또는 같은 스택 안 위치 이동
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!ready || !viewport || !imageIds || imageIds.length === 0) return;
    const safeIndex = clamp(index, imageIds.length);
    const key = requestKey(stackKey, safeIndex);
    if (requestedKey.current === key) return;
    requestedKey.current = key;
    const fail = (reason: unknown) => {
      if (viewportRef.current === viewport)
        setFailure({ key, message: describe(reason) });
    };
    if (loadedStackKey.current !== stackKey) {
      loadedStackKey.current = stackKey;
      viewport.setStack([...imageIds], safeIndex).then(() => {
        // 완료 전에 화면을 떠났으면(엔진 파괴) 그리지 않는다.
        if (viewportRef.current === viewport) viewport.render();
      }, fail);
    } else {
      viewport.setImageIdIndex(safeIndex).catch(fail);
    }
  }, [ready, stackKey, index, imageIds]);

  const currentKey =
    imageIds && imageIds.length > 0
      ? requestKey(stackKey, clamp(index, imageIds.length))
      : "";
  const error =
    failure && (failure.key === INIT_ERROR_KEY || failure.key === currentKey)
      ? failure.message
      : undefined;
  const renderState: ViewportRenderState = error
    ? "error"
    : !ready
      ? "initializing"
      : currentKey !== "" && renderedKey === currentKey
        ? "rendered"
        : "loading";

  /** 도구·주석 hook 이 쓰는 현재 viewport(엔진이 준비된 동안만) */
  const getViewport = useCallback(() => viewportRef.current, []);

  return {
    elementRef,
    renderState,
    error,
    engineInfo: ready ? engineInfo : undefined,
    getViewport,
  };
}

function requestKey(stackKey: string, index: number): string {
  return `${stackKey}#${index}`;
}

/**
 * 엔진이 실제로 픽셀을 표시 중인 스택·위치. setImageIdIndex 는 로딩 전에 currentImageIdIndex 를 먼저 바꾸므로
 * 로딩·표시가 끝난 영상(getCornerstoneImage)의 imageId 로 위치를 찾는다.
 */
function displayedKey(viewport: StackViewport): string {
  const imageIds = viewport.getImageIds();
  const shown = viewport.getCornerstoneImage()?.imageId;
  const index = shown === undefined ? -1 : imageIds.indexOf(shown);
  return index < 0 ? "" : requestKey(imageIds.join("|"), index);
}

function clamp(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count - 1);
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
