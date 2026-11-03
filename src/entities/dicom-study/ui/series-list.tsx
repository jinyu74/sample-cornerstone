import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import type { SeriesGroup } from "../model/types";

export interface SeriesListProps {
  series: readonly SeriesGroup[];
  selectedSeriesUid?: string;
  onSelect: (seriesInstanceUid: string) => void;
  /** 실제 영상으로 그린 썸네일(엔진은 상위 계층이 제공한다) */
  renderThumbnail?: (series: SeriesGroup) => ReactNode;
}

export function seriesLabel(series: SeriesGroup): string {
  const name =
    series.seriesDescription ?? `시리즈 ${series.seriesNumber ?? "?"}`;
  return `${name} · ${series.frameCount}장`;
}

/** 작업 화면 왼쪽 시리즈 목록. 선택 항목은 aria-current 와 강조선으로 표시한다. */
export function SeriesList({
  series,
  selectedSeriesUid,
  onSelect,
  renderThumbnail,
}: SeriesListProps) {
  return (
    <nav aria-label="시리즈" className="flex flex-col gap-3">
      <h2 className="px-1 text-base font-semibold">시리즈</h2>
      {series.length === 0 ? (
        <p className="px-1 text-muted-foreground">시리즈가 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {series.map((item) => {
            const selected = item.seriesInstanceUid === selectedSeriesUid;
            return (
              <li key={item.seriesInstanceUid}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(item.seriesInstanceUid)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected && "border-brand bg-accent text-accent-foreground",
                  )}
                >
                  {renderThumbnail ? (
                    <span className="shrink-0">{renderThumbnail(item)}</span>
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {seriesLabel(item)}
                    </span>
                    {item.modality ? (
                      <span className="text-xs text-muted-foreground">
                        {item.modality}
                      </span>
                    ) : null}
                  </span>
                  {item.seriesNumber !== undefined ? (
                    <span className="text-xs text-muted-foreground">
                      {item.seriesNumber}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
