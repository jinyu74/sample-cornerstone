import { useEffect, useState } from "react";

import type { DicomStore, SeriesGroup } from "@/entities/dicom-study";
import {
  frameImageId,
  registerDicomFile,
  releaseDicomFiles,
} from "@/shared/viewer";

export type StackImageIdsState =
  | { status: "loading" }
  | { status: "ready"; imageIds: string[] }
  | { status: "error"; error: string };

/**
 * 시리즈 스택 순서대로 원본 파일을 저장소에서 읽어 Cornerstone 에 등록하고 imageId 목록을 만든다.
 * 스택 순번이 아닌 SOP Instance UID(+frame)로 파일을 찾는다.
 * 등록한 파일은 화면을 떠날 때, 중간에 실패할 때, 화면을 떠난 뒤 늦게 등록이 끝날 때 모두 해제한다.
 */
export function useStackImageIds(
  store: DicomStore,
  series: SeriesGroup,
): StackImageIdsState {
  const [state, setState] = useState<{
    series: SeriesGroup;
    value: StackImageIdsState;
  }>();

  useEffect(() => {
    let active = true;
    const registered: string[] = [];
    let imageIds: string[] = [];
    let released = false;

    const releaseAll = () => {
      if (released) return;
      released = true;
      void releaseDicomFiles([...registered], imageIds);
    };

    void (async () => {
      const bySop = new Map<string, string>();
      for (const item of series.stack.ordered) {
        if (bySop.has(item.sopInstanceUid)) continue;
        const bytes = await store.getFile(item.sopInstanceUid);
        if (!active) return;
        if (!bytes)
          throw new Error(
            `원본 파일이 로컬 저장소에 없습니다: ${item.sopInstanceUid}`,
          );
        const baseId = await registerDicomFile(bytes);
        if (!active) {
          // 정리가 이미 끝난 뒤 등록이 완료됐다: 이 파일은 바로 해제한다.
          void releaseDicomFiles([baseId], []);
          return;
        }
        registered.push(baseId);
        bySop.set(item.sopInstanceUid, baseId);
      }
      imageIds = series.stack.ordered.map((item) =>
        frameImageId(bySop.get(item.sopInstanceUid)!, item.frameNumber),
      );
      setState({ series, value: { status: "ready", imageIds } });
    })().catch((error: unknown) => {
      if (!active) return;
      releaseAll();
      setState({
        series,
        value: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });

    return () => {
      active = false;
      releaseAll();
    };
  }, [store, series]);

  return state?.series === series ? state.value : { status: "loading" };
}
