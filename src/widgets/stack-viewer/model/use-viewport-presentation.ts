import { useEffect, useState } from "react";

import { initCornerstone } from "@/shared/viewer";

type Core = Awaited<ReturnType<typeof initCornerstone>>["core"];
type StackViewport = InstanceType<Core["StackViewport"]>;

export interface Presentation {
  inverted: boolean;
  rotation: number;
  /** "WW 4000 / WL 2000" 형식. 영상이 그려지기 전에는 undefined */
  voi?: string;
}

/**
 * 반전·회전·밝기대비(W/L)·화면 맞춤·초기화. 엔진 상태가 바뀌면(VOI·카메라·그리기 이벤트) 화면 표시를 갱신한다.
 */
export function useViewportPresentation(
  engineInfo: { renderingEngineId: string; viewportId: string } | undefined,
  element: HTMLElement | null,
  getViewport: () => StackViewport | null,
) {
  const [presentation, setPresentation] = useState<Presentation>({
    inverted: false,
    rotation: 0,
  });

  useEffect(() => {
    if (!engineInfo || !element) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    initCornerstone()
      .then(({ core }) => {
        if (disposed) return;
        const read = () => {
          const viewport = getViewport();
          if (!viewport) return;
          const properties = viewport.getProperties();
          const range = properties.voiRange;
          const rotation = Math.round(
            (((viewport.getViewPresentation().rotation ?? 0) % 360) + 360) %
              360,
          );
          setPresentation({
            inverted: Boolean(properties.invert),
            rotation,
            voi: range
              ? `WW ${Math.round(range.upper - range.lower)} / WL ${Math.round((range.upper + range.lower) / 2)}`
              : undefined,
          });
        };
        const events = [
          core.Enums.Events.VOI_MODIFIED,
          core.Enums.Events.CAMERA_MODIFIED,
          core.Enums.Events.IMAGE_RENDERED,
        ];
        for (const name of events) element.addEventListener(name, read);
        cleanup = () => {
          for (const name of events) element.removeEventListener(name, read);
        };
      })
      // 초기화 실패는 viewport hook 이 오류로 표시한다(같은 초기화 Promise).
      .catch(() => undefined);
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [engineInfo, element, getViewport]);

  const withViewport = (action: (viewport: StackViewport) => void) => {
    const viewport = getViewport();
    if (!viewport) return;
    action(viewport);
    viewport.render();
  };

  return {
    presentation,
    invert: () =>
      withViewport((viewport) =>
        viewport.setProperties({ invert: !viewport.getProperties().invert }),
      ),
    rotate: () =>
      withViewport((viewport) =>
        viewport.setViewPresentation({
          rotation: ((viewport.getViewPresentation().rotation ?? 0) + 90) % 360,
        }),
      ),
    fit: () => withViewport((viewport) => viewport.resetCamera()),
    reset: () =>
      withViewport((viewport) => {
        viewport.resetProperties();
        viewport.resetCamera();
        viewport.setViewPresentation({ rotation: 0 });
      }),
  };
}
