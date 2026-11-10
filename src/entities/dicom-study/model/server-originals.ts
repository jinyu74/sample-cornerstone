import { compareUid } from "./compare-uid";
import type { CatalogStudySummary } from "./catalog-summary";

export interface ServerOriginalsSummary {
  /** 서버 비공개 폴더에 실제로 보관된 영상 수 */
  stored: number;
  /** 서버 목록의 영상 수 */
  total: number;
  /** 이 브라우저에서 서버로 보관할 수 있는 SOP UID(서버 미보관·서버 기록과 같은 내용 또는 서버 목록에 없음) */
  uploadable: string[];
  /** 서버에서 이 브라우저로 불러올 수 있는 SOP UID(서버 보관됨·이 브라우저에 없음) */
  downloadable: string[];
}

/**
 * 서버 목록 영상에 실제 서버 파일 보관 여부를 표시한다. 파일 digest 가 카탈로그 digest 와 같을 때만 stored.
 * 카탈로그에 없는 파일은 목록에 추가하지 않는다(파일만으로 검사를 만들지 않음).
 */
export function markStoredOriginals(
  studies: readonly CatalogStudySummary[],
  stored: ReadonlyMap<string, string>,
): CatalogStudySummary[] {
  return studies.map((study) => ({
    ...study,
    instances: study.instances.map(({ sopInstanceUid, contentDigest }) =>
      stored.get(sopInstanceUid) === contentDigest
        ? { sopInstanceUid, contentDigest, stored: true as const }
        : { sopInstanceUid, contentDigest },
    ),
  }));
}

/** 한 검사의 서버 보관 수와, 이 브라우저 원본(SOP UID → digest) 기준 보관·불러오기 후보 */
export function summarizeServerOriginals(
  server: CatalogStudySummary | undefined,
  local: ReadonlyMap<string, string>,
): ServerOriginalsSummary {
  const instances = server?.instances ?? [];
  const known = new Map(instances.map((item) => [item.sopInstanceUid, item]));
  const uploadable: string[] = [];
  for (const [sop, digest] of local) {
    const remote = known.get(sop);
    if (!remote) uploadable.push(sop);
    else if (!remote.stored && remote.contentDigest === digest)
      uploadable.push(sop);
  }
  const downloadable = instances
    .filter((item) => item.stored && !local.has(item.sopInstanceUid))
    .map((item) => item.sopInstanceUid);
  return {
    stored: instances.filter((item) => item.stored).length,
    total: instances.length,
    uploadable: uploadable.sort(compareUid),
    downloadable: downloadable.sort(compareUid),
  };
}
