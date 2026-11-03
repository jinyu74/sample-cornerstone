/** 실행 취소·다시 실행 이력(불변 스냅샷) */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function createHistory<T>(present: T, limit = 100): History<T> {
  return { past: [], present, future: [], limit };
}

/** 새 상태를 기록한다. 다시 실행 목록은 비운다 */
export function pushHistory<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  return {
    ...history,
    past: past.slice(Math.max(0, past.length - history.limit)),
    present: next,
    future: [],
  };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  return {
    ...history,
    past: [...history.past, history.present],
    present: history.future[0]!,
    future: history.future.slice(1),
  };
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;
