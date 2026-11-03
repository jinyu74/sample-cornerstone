import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  applyWorkAction,
  canRedo,
  canUndo,
  createHistory,
  createStudyWork,
  type History,
  pushHistory,
  redo,
  type StudyWork,
  type StudyWorkStore,
  undo,
  type WorkAction,
  type WorkActionResult,
} from "@/entities/study-work";

export interface UseStudyWorkOptions {
  store: StudyWorkStore;
  studyInstanceUid: string;
  autosaveDelayMs?: number;
  now?: () => Date;
}

export type SaveState = "saved" | "unsaved" | "saving" | "failed";

export interface StudyWorkState {
  status: "loading" | "ready" | "error";
  loadError?: string;
  work?: StudyWork;
  saveState: SaveState;
  saveError?: string;
  dispatch: (action: WorkAction) => WorkActionResult;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** 대기 중인 변경을 즉시 저장한다. 모두 저장되면 true */
  saveNow: () => Promise<boolean>;
}

interface View {
  status: "loading" | "ready" | "error";
  loadError?: string;
  history?: History<StudyWork>;
  saveState: SaveState;
  saveError?: string;
}

/**
 * 검사 하나의 편집 세션. 검사가 바뀌면 새 세션을 만들고, 이전 세션의 늦은 저장은
 * 그 검사 UID 로만 쓰며 현재 화면 상태를 바꾸지 않는다.
 */
interface Session {
  store: StudyWorkStore;
  studyInstanceUid: string;
  status: View["status"];
  history?: History<StudyWork>;
  savedRevision: number;
  maxRevision: number;
  saving?: Promise<boolean>;
  timer?: ReturnType<typeof setTimeout>;
}

const defaultNow = () => new Date();
const LOADING_VIEW: View = { status: "loading", saveState: "saved" };

/**
 * 검사 작업 결과의 복원·편집·실행 취소·자동 저장을 관리한다.
 * - 복원이 끝나기 전이나 복원에 실패하면 편집·저장을 막아 빈 문서로 기존 결과를 덮어쓰지 않는다.
 * - 저장은 세션마다 한 번에 하나씩 순서대로 수행하고, 저장 중 생긴 편집은 이어서 저장한다.
 * - revision 은 항상 증가한다(실행 취소한 상태도 새 revision 으로 저장해 stale 거부를 피한다).
 * - 검사(studyInstanceUid)·저장소가 바뀌거나 화면을 떠나면 저장하지 않은 변경을 그 세션의 검사로 저장한다.
 */
export function useStudyWork({
  store,
  studyInstanceUid,
  autosaveDelayMs = 1500,
  now = defaultNow,
}: UseStudyWorkOptions): StudyWorkState {
  const [view, setView] = useState<{ session?: Session; value: View }>({
    value: LOADING_VIEW,
  });
  const sessionRef = useRef<Session | undefined>(undefined);

  /** 현재 세션일 때만 화면 상태를 바꾼다 */
  const publish = useCallback((session: Session, patch: Partial<View>) => {
    if (sessionRef.current !== session) return;
    setView((previous) =>
      previous.session === session
        ? { session, value: { ...previous.value, ...patch } }
        : { session, value: { ...LOADING_VIEW, ...patch } },
    );
  }, []);

  const flush = useCallback(
    (session: Session): Promise<boolean> => {
      if (session.saving) return session.saving;
      // finally 가 동기로 실행될 수 있으므로 Promise 참조는 holder 로 비교한다.
      const holder: { promise?: Promise<boolean>; settled: boolean } = {
        settled: false,
      };
      const promise = (async () => {
        try {
          for (;;) {
            const latest = session.history?.present;
            if (!latest || latest.revision <= session.savedRevision) break;
            publish(session, { saveState: "saving", saveError: undefined });
            try {
              await session.store.saveWork(latest);
              session.savedRevision = Math.max(
                session.savedRevision,
                latest.revision,
              );
            } catch (error) {
              publish(session, {
                saveState: "failed",
                saveError:
                  error instanceof Error ? error.message : String(error),
              });
              return false;
            }
          }
          publish(session, { saveState: "saved", saveError: undefined });
          return true;
        } finally {
          holder.settled = true;
          if (holder.promise && session.saving === holder.promise)
            session.saving = undefined;
        }
      })();
      // 저장할 것이 없어 즉시 끝난 경우 완료된 Promise 를 진행 중 저장으로 남기지 않는다.
      holder.promise = promise;
      if (!holder.settled) session.saving = promise;
      return promise;
    },
    [publish],
  );

  const createDefaultWork = useEffectEvent((uid: string) =>
    createStudyWork(uid, now().toISOString()),
  );

  // 세션 생성·복원·정리
  useEffect(() => {
    const session: Session = {
      store,
      studyInstanceUid,
      status: "loading",
      savedRevision: 0,
      maxRevision: 0,
    };
    // 화면 상태는 세션이 다르면 loading 으로 파생되므로 여기서 동기 setState 하지 않는다.
    sessionRef.current = session;

    store.getWork(studyInstanceUid).then(
      (stored) => {
        if (sessionRef.current !== session) return;
        const work = stored ?? createDefaultWork(studyInstanceUid);
        session.status = "ready";
        session.savedRevision = work.revision;
        session.maxRevision = work.revision;
        session.history = createHistory(work);
        publish(session, {
          status: "ready",
          history: session.history,
          saveState: "saved",
        });
      },
      (error: unknown) => {
        if (sessionRef.current !== session) return;
        session.status = "error";
        publish(session, {
          status: "error",
          loadError: error instanceof Error ? error.message : String(error),
        });
      },
    );

    return () => {
      clearTimeout(session.timer);
      if (sessionRef.current === session) sessionRef.current = undefined;
      const latest = session.history?.present;
      if (
        session.status === "ready" &&
        latest &&
        latest.revision > session.savedRevision
      )
        void flush(session);
    };
  }, [store, studyInstanceUid, flush, publish]);

  /** 현재 props 와 같은 검사의 준비된 세션 */
  const readySession = (): Session | undefined => {
    const session = sessionRef.current;
    return session &&
      session.studyInstanceUid === studyInstanceUid &&
      session.store === store
      ? session
      : undefined;
  };

  const commit = (session: Session, history: History<StudyWork>) => {
    session.history = history;
    publish(session, { history, saveState: "unsaved" });
    clearTimeout(session.timer);
    session.timer = setTimeout(() => void flush(session), autosaveDelayMs);
  };

  const withNextRevision = (session: Session, work: StudyWork): StudyWork => {
    session.maxRevision += 1;
    return { ...work, revision: session.maxRevision };
  };

  const dispatch = (action: WorkAction): WorkActionResult => {
    const session = readySession();
    if (!session || session.status === "loading")
      return { ok: false, error: "작업 결과를 아직 불러오는 중입니다" };
    if (session.status === "error" || !session.history) {
      return {
        ok: false,
        error: "작업 결과를 불러오지 못해 편집할 수 없습니다",
      };
    }
    const result = applyWorkAction(
      session.history.present,
      action,
      now().toISOString(),
    );
    if (!result.ok) return result;
    const work = withNextRevision(session, result.work);
    commit(session, pushHistory(session.history, work));
    return { ok: true, work };
  };

  const move = (step: typeof undo) => {
    const session = readySession();
    if (!session || session.status !== "ready" || !session.history) return;
    const moved = step(session.history);
    if (moved === session.history) return;
    commit(session, {
      ...moved,
      present: withNextRevision(session, moved.present),
    });
  };

  const saveNow = () => {
    const session = readySession();
    if (!session || session.status !== "ready") return Promise.resolve(false);
    clearTimeout(session.timer);
    return flush(session);
  };

  // 다른 검사로 바뀐 직후(새 세션 effect 전)에는 이전 검사 결과를 보여 주지 않는다.
  const current =
    view.session &&
    view.session.studyInstanceUid === studyInstanceUid &&
    view.session.store === store
      ? view.value
      : LOADING_VIEW;
  const history = current.history;
  return {
    status: current.status,
    loadError: current.loadError,
    work: history?.present,
    saveState: current.saveState,
    saveError: current.saveError,
    dispatch,
    undo: () => move(undo),
    redo: () => move(redo),
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    saveNow,
  };
}
