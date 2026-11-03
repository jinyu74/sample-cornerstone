import { useEffect, useRef, useState } from "react";

import type { DicomStore, SeriesGroup } from "@/entities/dicom-study";
import {
  frameImageId,
  initCornerstone,
  registerDicomFile,
  releaseDicomFiles,
} from "@/shared/viewer";

export type ThumbnailState = "loading" | "rendered" | "error";

/** 시리즈 가운데 영상을 실제로 디코딩해 작은 canvas 에 그린다. 화면을 떠나면 등록을 해제한다 */
export function useSeriesThumbnail(store: DicomStore, series: SeriesGroup) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{
    series: SeriesGroup;
    value: ThumbnailState;
  }>();

  useEffect(() => {
    const canvas = canvasRef.current;
    const item =
      series.stack.ordered[Math.floor(series.stack.ordered.length / 2)];
    if (!canvas || !item) return;
    let active = true;
    let baseId: string | undefined;
    const release = (id: string) =>
      void releaseDicomFiles([id], [frameImageId(id, item.frameNumber)]);

    void (async () => {
      const bytes = await store.getFile(item.sopInstanceUid);
      if (!active) return;
      if (!bytes) throw new Error("원본 파일이 없습니다");
      const registered = await registerDicomFile(bytes);
      if (!active) {
        // 화면을 떠난 뒤 등록이 끝났다: 디코딩하지 않고 바로 해제한다.
        release(registered);
        return;
      }
      baseId = registered;
      const { core } = await initCornerstone();
      if (!active) return;
      await core.utilities.loadImageToCanvas({
        canvas,
        imageId: frameImageId(registered, item.frameNumber),
      });
      if (active) setState({ series, value: "rendered" });
    })().catch(() => {
      if (active) setState({ series, value: "error" });
    });

    return () => {
      active = false;
      if (baseId) release(baseId);
    };
  }, [store, series]);

  return {
    canvasRef,
    state:
      state?.series === series ? state.value : ("loading" as ThumbnailState),
  };
}
