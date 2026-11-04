import { useCallback, useEffect, useRef, useState } from "react";

import {
  type CatalogSyncOutcome,
  type CatalogSyncRequest,
  type DicomStore,
  projectCatalogStudy,
} from "@/entities/dicom-study";

import { postCatalogStudy } from "../api/post-catalog-study";

import type { CatalogSyncState } from "./types";

export interface UseCatalogSyncOptions {
  /** 이 화면(계정별 저장소)의 계정. 요청의 기대 계정으로 보내 계정 변경 뒤 도착을 서버가 거부하게 한다 */
  userId: string;
  store: DicomStore;
  submit?: (request: CatalogSyncRequest) => Promise<CatalogSyncOutcome>;
  /** 한 번 이상 반영에 성공한 뒤 서버 목록을 다시 읽는다(예: router.refresh) */
  onSynced?: () => void;
}

export interface CatalogSyncApi {
  /** 이 화면에서 시도한 검사의 반영 상태. 시도하지 않은 검사는 없다 */
  states: ReadonlyMap<string, CatalogSyncState>;
  /** 검사들의 메타데이터를 이 브라우저 원본에서 다시 읽어 차례로 반영한다(멱등, 재시도에도 사용) */
  syncStudies: (studyInstanceUids: readonly string[]) => Promise<void>;
}

interface Session {
  userId: string;
}

interface StudyRun {
  dirty: boolean;
  /** 끝나면 반영 성공 여부 */
  done: Promise<boolean>;
  finish: (synced: boolean) => void;
}

const EMPTY: ReadonlyMap<string, CatalogSyncState> = new Map();

/**
 * 검사 목록용 메타데이터 동기화. 원본·작업 결과는 보내지 않고 이 브라우저 원본에서 목록용 값만 투영한다.
 * 실패해도 원본은 그대로이며 실패 사유를 남긴다. 화면이 사라지거나 계정이 바뀐 뒤 끝난 요청은
 * 상태와 서버 목록 새로 고침에 반영하지 않는다.
 */
export function useCatalogSync({
  userId,
  store,
  submit = postCatalogStudy,
  onSynced,
}: UseCatalogSyncOptions): CatalogSyncApi {
  const [state, setState] = useState<{
    userId: string;
    states: ReadonlyMap<string, CatalogSyncState>;
  }>({ userId, states: EMPTY });
  const session = useRef<Session | null>(null);
  /** 진행 중인 검사별 작업. 진행 중에 다시 요청되면 dirty 로 표시해 끝난 뒤 최신 원본을 다시 확인한다 */
  const running = useRef(new Map<string, StudyRun>());

  useEffect(() => {
    const current: Session = { userId };
    session.current = current;
    return () => {
      if (session.current === current) session.current = null;
    };
  }, [userId]);

  const syncStudies = useCallback(
    async (studyInstanceUids: readonly string[]) => {
      const owner = session.current;
      if (!owner) return;
      const alive = () => session.current === owner;
      const update = (uid: string, next: CatalogSyncState) => {
        if (!alive()) return;
        setState((previous) => {
          const base =
            previous.userId === owner.userId ? previous.states : EMPTY;
          const states = new Map(base);
          states.set(uid, next);
          return { userId: owner.userId, states };
        });
      };

      const waits: Promise<boolean>[] = [];
      const fresh: { uid: string; run: StudyRun }[] = [];
      for (const uid of new Set(studyInstanceUids)) {
        const key = `${owner.userId}\u0000${uid}`;
        const existing = running.current.get(key);
        if (existing) {
          existing.dirty = true;
          waits.push(existing.done);
          continue;
        }
        let finish!: (synced: boolean) => void;
        const run: StudyRun = {
          dirty: true,
          done: new Promise<boolean>((resolve) => (finish = resolve)),
          finish: (synced) => {
            running.current.delete(key);
            finish(synced);
          },
        };
        running.current.set(key, run);
        update(uid, { kind: "syncing" });
        fresh.push({ uid, run });
      }

      let synced = false;
      for (const { uid, run } of fresh) {
        let ok = false;
        try {
          ok = await runStudy(uid, run);
        } finally {
          run.finish(ok);
        }
        if (ok) synced = true;
      }
      // 다른 호출이 진행 중인 검사는 그 작업(최신 원본 재확인 포함)이 끝날 때까지 기다린다
      await Promise.all(waits);
      if (synced && alive()) onSynced?.();

      /** dirty 가 남아 있는 동안 최신 원본을 읽어, 마지막으로 보낸 내용과 다를 때만 보낸다 */
      async function runStudy(uid: string, run: StudyRun): Promise<boolean> {
        let sent: string | undefined;
        while (run.dirty) {
          run.dirty = false;
          if (!alive()) return false;
          let records;
          try {
            records = await store.listInstances();
          } catch {
            update(uid, { kind: "failed", reason: "local-read" });
            return false;
          }
          const chunks = projectCatalogStudy(uid, records);
          if (chunks.length === 0) {
            update(uid, { kind: "failed", reason: "local-read" });
            return false;
          }
          const snapshot = JSON.stringify(chunks);
          if (snapshot === sent) continue;
          for (const study of chunks) {
            if (!alive()) return false;
            let outcome: CatalogSyncOutcome;
            try {
              outcome = await submit({ expectedUserId: owner!.userId, study });
            } catch {
              update(uid, { kind: "failed", reason: "network" });
              return false;
            }
            if (outcome.status === "conflict") {
              update(uid, {
                kind: "failed",
                reason: "conflict",
                conflict: outcome.kind,
              });
              return false;
            }
            if (outcome.status !== "synced") {
              update(uid, { kind: "failed", reason: outcome.status });
              return false;
            }
          }
          sent = snapshot;
        }
        if (!alive()) return false;
        update(uid, { kind: "synced" });
        return true;
      }
    },
    [store, submit, onSynced],
  );

  return {
    states: state.userId === userId ? state.states : EMPTY,
    syncStudies,
  };
}
