import type { CatalogInstancePayload } from "./catalog-metadata";

/** 서버 목록에 있는 검사의 원본이 이 브라우저에 있는지 */
export type OriginalsStatus =
  | { kind: "complete"; total: number }
  | { kind: "partial"; present: number; total: number }
  | { kind: "missing"; total: number }
  | { kind: "mismatch"; mismatched: number; present: number; total: number };

/** 화면 표시용: 비교 결과 + 아직 확인 전(최초 HTML)·로컬 읽기 실패 */
export type OriginalsView =
  OriginalsStatus | { kind: "checking" } | { kind: "unreadable" };

export interface CatalogComparison {
  originals: OriginalsStatus;
  /** 이 브라우저에만 있고 서버 목록에 없는 영상 수 */
  unsynced: number;
}

/**
 * 서버 목록의 영상(SOP UID·digest)과 이 브라우저 원본(SOP UID → digest)을 비교한다.
 * 같은 UID 의 내용이 다르면 불일치를 가장 먼저 알린다. 서버가 비어 있으면(로컬 전용 검사) 로컬 전체를 기준으로 한다.
 */
export function compareCatalogStudy(
  server: readonly CatalogInstancePayload[],
  local: ReadonlyMap<string, string>,
): CatalogComparison {
  const serverDigests = new Map(
    server.map((instance) => [instance.sopInstanceUid, instance.contentDigest]),
  );
  let unsynced = 0;
  for (const sop of local.keys()) if (!serverDigests.has(sop)) unsynced += 1;
  if (serverDigests.size === 0)
    return { originals: { kind: "complete", total: local.size }, unsynced };

  const total = serverDigests.size;
  let present = 0;
  let mismatched = 0;
  for (const [sop, digest] of serverDigests) {
    const own = local.get(sop);
    if (own === undefined) continue;
    if (own === digest) present += 1;
    else mismatched += 1;
  }
  const originals: OriginalsStatus =
    mismatched > 0
      ? { kind: "mismatch", mismatched, present, total }
      : present === total
        ? { kind: "complete", total }
        : present === 0
          ? { kind: "missing", total }
          : { kind: "partial", present, total };
  return { originals, unsynced };
}
