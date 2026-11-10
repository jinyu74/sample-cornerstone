import type { CatalogInstancePayload } from "./catalog-metadata";

/** 서버 목록 한 검사(서버 → 클라이언트 최소 DTO). owner·내부 시각은 담지 않는다 */
export interface CatalogStudySummary {
  studyInstanceUid: string;
  studyDate?: string;
  studyDescription?: string;
  studyId?: string;
  accessionNumber?: string;
  modalities: string[];
  seriesCount: number;
  /** 서버 목록의 시리즈 UID(이 브라우저 원본의 시리즈와 합집합을 셀 때 쓴다) */
  seriesInstanceUids: string[];
  instanceCount: number;
  /** 원본 유무 비교용 (SOP UID, digest) */
  instances: CatalogInstancePayload[];
}

/** 서버 목록 조회 결과(클라이언트로 넘기는 형태). 장애는 빈 목록이 아니라 unavailable 이다 */
export type CatalogListResult =
  | { status: "ready"; studies: CatalogStudySummary[] }
  | { status: "unavailable" };
