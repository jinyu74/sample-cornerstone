"use client";

import type { DicomStore, SeriesGroup } from "@/entities/dicom-study";
import { cn } from "@/shared/lib/utils";

import { useSeriesThumbnail } from "../model/use-series-thumbnail";

export interface SeriesThumbnailProps {
  store: DicomStore;
  series: SeriesGroup;
}

/** 실제 DICOM 가운데 영상으로 그린 시리즈 썸네일. 그리지 못하면 빈 검은 칸으로 둔다(가짜 이미지 없음) */
export function SeriesThumbnail({ store, series }: SeriesThumbnailProps) {
  const { canvasRef, state } = useSeriesThumbnail(store, series);
  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={96}
      aria-hidden
      data-testid="series-thumbnail"
      data-state={state}
      className={cn(
        "size-14 rounded-sm bg-viewport",
        state === "loading" && "animate-pulse",
      )}
    />
  );
}
