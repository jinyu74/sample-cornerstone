import { useCallback, useEffect, useRef, useState } from "react";

import type { DicomStore } from "@/entities/dicom-study";
import { sha256Hex } from "@/shared/lib/digest";

import {
  getOriginal,
  type GetOriginalResult,
  type OriginalTransferFailure,
  putOriginal,
  type PutOriginalResult,
  type TransferOptions,
} from "../api/originals-client";

export type TransferDirection = "upload" | "download";
/** local-read: 이 브라우저 원본을 읽지 못함, local-write: 받은 원본을 이 브라우저에 저장하지 못함, integrity: 받은 내용이 서버 목록 digest 와 다름 */
export type TransferFailure =
  OriginalTransferFailure | "local-read" | "local-write" | "integrity";

export type OriginalTransferState =
  | {
      kind: "running";
      direction: TransferDirection;
      done: number;
      total: number;
    }
  | { kind: "done"; direction: TransferDirection; done: number; total: number }
  | {
      kind: "failed";
      direction: TransferDirection;
      reason: TransferFailure;
      done: number;
      total: number;
    };

export type SaveOriginalResult =
  "imported" | "duplicate" | "conflict" | "failed";

export interface UseOriginalTransfersOptions {
  userId: string;
  store: DicomStore;
  put?: (
    sop: string,
    bytes: ArrayBuffer,
    userId: string,
    options?: TransferOptions,
  ) => Promise<PutOriginalResult>;
  get?: (
    sop: string,
    userId: string,
    options?: TransferOptions,
  ) => Promise<GetOriginalResult>;
  save: (sop: string, bytes: ArrayBuffer) => Promise<SaveOriginalResult>;
  onChanged?: () => void;
}

export interface OriginalTransfers {
  states: ReadonlyMap<string, OriginalTransferState>;
  upload: (studyInstanceUid: string, sops: readonly string[]) => Promise<void>;
  download: (
    studyInstanceUid: string,
    items: readonly { sopInstanceUid: string; contentDigest: string }[],
  ) => Promise<void>;
}

interface Session {
  userId: string;
  controller: AbortController;
}

const EMPTY: ReadonlyMap<string, OriginalTransferState> = new Map();

/**
 * 검사별 원본 보관(이 브라우저 → 서버)·불러오기(서버 → 이 브라우저). 사용자가 누른 검사만 처리한다.
 * - 영상 단위로 차례로 처리하고 진행률을 보인다. 실패하면 그 자리에서 멈추고 사유를 남긴다(다시 누르면 멱등 재시도).
 * - 불러온 바이트는 서버 목록 digest 와 같을 때만 저장하며, 저장은 화면이 주입한 save(계정별 저장소)가 한다.
 * - 화면이 사라지거나 계정이 바뀌면 진행 중 요청을 취소하고, 이후 결과는 저장·상태·새로 고침에 반영하지 않는다.
 */
export function useOriginalTransfers({
  userId,
  store,
  put = putOriginal,
  get = getOriginal,
  save,
  onChanged,
}: UseOriginalTransfersOptions): OriginalTransfers {
  const [state, setState] = useState<{
    userId: string;
    states: ReadonlyMap<string, OriginalTransferState>;
  }>({ userId, states: EMPTY });
  const session = useRef<Session | null>(null);
  const running = useRef(new Set<string>());

  useEffect(() => {
    const current: Session = { userId, controller: new AbortController() };
    session.current = current;
    return () => {
      current.controller.abort();
      if (session.current === current) session.current = null;
    };
  }, [userId]);

  const run = useCallback(
    async (
      studyInstanceUid: string,
      direction: TransferDirection,
      total: number,
      step: (
        index: number,
        signal: AbortSignal,
        owner: string,
      ) => Promise<TransferFailure | null>,
    ) => {
      const owner = session.current;
      if (!owner) return;
      const key = `${owner.userId}\u0000${studyInstanceUid}`;
      if (running.current.has(key)) return;
      running.current.add(key);
      const alive = () =>
        session.current === owner && !owner.controller.signal.aborted;
      const update = (next: OriginalTransferState) => {
        if (!alive()) return;
        setState((previous) => {
          const states = new Map(
            previous.userId === owner.userId ? previous.states : EMPTY,
          );
          states.set(studyInstanceUid, next);
          return { userId: owner.userId, states };
        });
      };
      let done = 0;
      try {
        update({ kind: "running", direction, done, total });
        for (let index = 0; index < total; index += 1) {
          if (!alive()) return;
          const failure = await step(
            index,
            owner.controller.signal,
            owner.userId,
          );
          if (!alive()) return;
          if (failure) {
            update({ kind: "failed", direction, reason: failure, done, total });
            return;
          }
          done += 1;
          update({ kind: "running", direction, done, total });
        }
        update({ kind: "done", direction, done, total });
      } finally {
        running.current.delete(key);
        if (done > 0 && alive()) onChanged?.();
      }
    },
    [onChanged],
  );

  const upload = useCallback(
    (studyInstanceUid: string, sops: readonly string[]) =>
      run(
        studyInstanceUid,
        "upload",
        sops.length,
        async (index, signal, owner) => {
          let bytes: ArrayBuffer | undefined;
          try {
            bytes = await store.getFile(sops[index]!);
          } catch {
            return "local-read";
          }
          if (!bytes) return "local-read";
          const result = await put(sops[index]!, bytes, owner, { signal });
          return result.status === "stored" ||
            result.status === "already-stored"
            ? null
            : result.status;
        },
      ),
    [run, store, put],
  );

  const download = useCallback(
    (
      studyInstanceUid: string,
      items: readonly { sopInstanceUid: string; contentDigest: string }[],
    ) =>
      run(
        studyInstanceUid,
        "download",
        items.length,
        async (index, signal, owner) => {
          const item = items[index]!;
          const result = await get(item.sopInstanceUid, owner, { signal });
          if (result.status !== "ok") return result.status;
          if (signal.aborted) return "aborted";
          if ((await sha256Hex(result.bytes)) !== item.contentDigest)
            return "integrity";
          if (signal.aborted) return "aborted";
          const saved = await save(item.sopInstanceUid, result.bytes);
          if (saved === "imported" || saved === "duplicate") return null;
          return saved === "conflict" ? "conflict" : "local-write";
        },
      ),
    [run, get, save],
  );

  return {
    states: state.userId === userId ? state.states : EMPTY,
    upload,
    download,
  };
}
