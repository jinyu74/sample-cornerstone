import { useEffect, useState } from "react";

import type { StudyWorkStore } from "../api/types";

import type { WorkStatus } from "./types";
import { deriveWorkStatus } from "./work-document";

export interface WorkStatusesState {
  status: "loading" | "ready" | "error";
  statuses: ReadonlyMap<string, WorkStatus>;
  error?: string;
}

/** 검사별 작업 상태(미작업·작업 중·완료). 결과를 읽지 못하면 오류로 알린다(미작업으로 숨기지 않음) */
export function useWorkStatuses(
  store: StudyWorkStore,
  refreshKey: unknown,
): WorkStatusesState {
  const [state, setState] = useState<WorkStatusesState>({
    status: "loading",
    statuses: new Map(),
  });
  useEffect(() => {
    let active = true;
    store.listWorks().then(
      (works) => {
        if (active) {
          setState({
            status: "ready",
            statuses: new Map(
              works.map((work) => [
                work.studyInstanceUid,
                deriveWorkStatus(work),
              ]),
            ),
          });
        }
      },
      (error: unknown) => {
        if (active)
          setState({
            status: "error",
            statuses: new Map(),
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [store, refreshKey]);
  return state;
}
