import { useCallback, useEffect, useRef, useState } from "react";

import type { DicomStore, StoredInstanceRecord } from "../api/types";

import { groupStudies } from "./group-studies";
import type { SeriesGroup, StudyGroup } from "./types";

export interface StudyCatalogState {
  status: "loading" | "ready" | "error";
  studies: StudyGroup[];
  /** 검사 UID → (SOP UID → 원본 digest). 서버 목록과 이 브라우저 원본 비교용 */
  manifest: ReadonlyMap<string, ReadonlyMap<string, string>>;
  error?: string;
  reload: () => Promise<void>;
}

type CatalogSnapshot = Omit<StudyCatalogState, "reload">;

/** 저장소의 모든 영상을 검사·시리즈로 묶어 구독한다. 읽기 실패는 error 상태로 드러낸다. */
export function useStudyCatalog(store: DicomStore): StudyCatalogState {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>({
    status: "loading",
    studies: [],
    manifest: EMPTY_MANIFEST,
  });
  // 늦게 끝난 이전 요청이 최신 결과를 덮어쓰지 않도록 요청 순번을 둔다.
  const requestId = useRef(0);

  const fetchCatalog = useCallback(async (): Promise<
    CatalogSnapshot | undefined
  > => {
    const id = (requestId.current += 1);
    let next: CatalogSnapshot;
    try {
      const records = await store.listInstances();
      next = {
        status: "ready",
        studies: groupStudies(records.map((record) => record.metadata)),
        manifest: toManifest(records),
      };
    } catch (error) {
      next = {
        status: "error",
        studies: [],
        manifest: EMPTY_MANIFEST,
        error: describe(error),
      };
    }
    return id === requestId.current ? next : undefined;
  }, [store]);

  useEffect(() => {
    // 저장소(외부 시스템)를 구독하고 결과를 콜백에서 반영한다.
    void fetchCatalog().then((next) => next && setSnapshot(next));
    return () => {
      requestId.current += 1;
    };
  }, [fetchCatalog]);

  const reload = useCallback(async () => {
    const next = await fetchCatalog();
    if (next) setSnapshot(next);
  }, [fetchCatalog]);

  return { ...snapshot, reload };
}

export interface SeriesStackState {
  status: "loading" | "ready" | "not-found" | "error";
  series?: SeriesGroup;
  error?: string;
}

/** (검사 UID, 시리즈 UID) 의 영상을 불러와 정렬된 스택으로 돌려준다. */
export function useSeriesStack(
  store: DicomStore,
  studyInstanceUid: string,
  seriesInstanceUid: string,
): SeriesStackState {
  const key = `${studyInstanceUid}\u0000${seriesInstanceUid}`;
  const [result, setResult] = useState<{
    key: string;
    state: SeriesStackState;
  }>();

  useEffect(() => {
    let active = true;
    store.listSeriesInstances(studyInstanceUid, seriesInstanceUid).then(
      (records) => {
        if (!active) return;
        const series = groupStudies(records.map((record) => record.metadata))[0]
          ?.series[0];
        setResult({
          key,
          state: series ? { status: "ready", series } : { status: "not-found" },
        });
      },
      (error: unknown) => {
        if (active)
          setResult({
            key,
            state: { status: "error", error: describe(error) },
          });
      },
    );
    return () => {
      active = false;
    };
  }, [store, studyInstanceUid, seriesInstanceUid, key]);

  // 다른 시리즈로 바뀐 직후에는 이전 결과를 보여 주지 않는다.
  return result?.key === key ? result.state : { status: "loading" };
}

const EMPTY_MANIFEST: ReadonlyMap<
  string,
  ReadonlyMap<string, string>
> = new Map();

function toManifest(
  records: readonly StoredInstanceRecord[],
): Map<string, Map<string, string>> {
  const manifest = new Map<string, Map<string, string>>();
  for (const record of records) {
    const study = manifest.get(record.studyInstanceUid) ?? new Map();
    study.set(record.sopInstanceUid, record.contentDigest);
    manifest.set(record.studyInstanceUid, study);
  }
  return manifest;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
