import type { StudyListItem } from "@/entities/dicom-study";

import type { StudyFilter } from "./types";

/** 검색어(날짜·식별자·설명·modality 부분 일치)와 작업 상태로 검사 목록을 거른다. 순서는 유지한다. */
export function filterStudies(
  items: readonly StudyListItem[],
  filter: StudyFilter,
): StudyListItem[] {
  const query = filter.query.trim().toLocaleLowerCase("ko");
  return items.filter((item) => {
    if (filter.status !== "all" && item.workStatus !== filter.status)
      return false;
    if (!query) return true;
    const haystack = [
      item.displayDate,
      item.studyDate,
      item.identifier,
      item.description,
      ...item.modalities,
    ];
    return haystack.some((value) =>
      value?.toLocaleLowerCase("ko").includes(query),
    );
  });
}
