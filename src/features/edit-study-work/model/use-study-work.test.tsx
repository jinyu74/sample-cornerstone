import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createStudyWork,
  type StudyWork,
  type StudyWorkStore,
  WorkStoreError,
} from "@/entities/study-work";

import { useStudyWork } from "./use-study-work";

const NOW = new Date("2026-11-02T10:00:00.000Z");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 저장 호출과 완료 시점을 테스트가 제어하는 저장소 대역 */
function controllableStore(initial?: StudyWork) {
  const saves: { work: StudyWork; done: ReturnType<typeof deferred<void>> }[] =
    [];
  const load = deferred<StudyWork | undefined>();
  const store: StudyWorkStore = {
    getWork: vi.fn(() => load.promise),
    listWorks: vi.fn(),
    saveWork: vi.fn((work: StudyWork) => {
      const done = deferred<void>();
      saves.push({ work, done });
      return done.promise;
    }),
    close: vi.fn(),
  };
  return {
    store,
    saves,
    finishLoad: () => load.resolve(initial),
    failLoad: (error: unknown) => load.reject(error),
  };
}

const existing = (): StudyWork => ({
  ...createStudyWork("2.25.1", NOW.toISOString()),
  revision: 7,
  annotations: [
    {
      id: "a1",
      tool: "arrow",
      reference: {
        studyInstanceUid: "2.25.1",
        seriesInstanceUid: "2.25.2",
        sopInstanceUid: "2.25.3",
      },
      imagePoints: [
        [1, 1],
        [2, 2],
      ],
      note: "기존 주석",
      visible: true,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
  ],
});

const options = (store: StudyWorkStore) => ({
  store,
  studyInstanceUid: "2.25.1",
  autosaveDelayMs: 20,
  now: () => NOW,
});

describe("useStudyWork 복원과 자동 저장 (S6-1, S6-4, S4-5)", () => {
  it("복원 중에는 편집을 받지 않고 아무것도 저장하지 않으며, 복원 후 기존 주석을 그대로 보여 준다", async () => {
    const { store, finishLoad } = controllableStore(existing());
    const { result } = renderHook(() => useStudyWork(options(store)));

    expect(result.current.status).toBe("loading");
    let rejected: unknown;
    act(() => {
      rejected = result.current.dispatch({
        type: "work/complete",
        completed: true,
      });
    });
    expect(rejected).toEqual({
      ok: false,
      error: "작업 결과를 아직 불러오는 중입니다",
    });

    await act(async () => finishLoad());
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(result.current.status).toBe("ready");
    expect(result.current.work?.annotations.map((item) => item.note)).toEqual([
      "기존 주석",
    ]);
    expect(result.current.saveState).toBe("saved");
    expect(store.saveWork).not.toHaveBeenCalled();
  });

  it("복원 실패 시 오류 상태로 편집·저장을 막아 빈 결과로 기존 결과를 덮어쓰지 않는다", async () => {
    const { store, failLoad } = controllableStore();
    const { result } = renderHook(() => useStudyWork(options(store)));

    await act(async () =>
      failLoad(new WorkStoreError("unavailable", "IndexedDB 사용 불가")),
    );
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(result.current.status).toBe("error");
    expect(result.current.loadError).toBe("IndexedDB 사용 불가");
    expect(
      result.current.dispatch({ type: "work/complete", completed: true }),
    ).toEqual({
      ok: false,
      error: "작업 결과를 불러오지 못해 편집할 수 없습니다",
    });
    expect(store.saveWork).not.toHaveBeenCalled();
  });

  it("저장된 결과가 없으면 기본 문서로 시작하고 편집 전에는 저장하지 않는다", async () => {
    const { store, finishLoad } = controllableStore(undefined);
    const { result } = renderHook(() => useStudyWork(options(store)));

    await act(async () => finishLoad());
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(result.current.work?.revision).toBe(0);
    expect(result.current.saveState).toBe("saved");
    expect(store.saveWork).not.toHaveBeenCalled();
  });

  it("편집하면 unsaved → 지연 후 자동 저장 → saved", async () => {
    const { store, saves, finishLoad } = controllableStore(existing());
    const { result } = renderHook(() => useStudyWork(options(store)));
    await act(async () => finishLoad());

    act(() => {
      result.current.dispatch({ type: "work/complete", completed: true });
    });
    expect(result.current.saveState).toBe("unsaved");

    await waitFor(() => expect(saves).toHaveLength(1));
    await waitFor(() => expect(result.current.saveState).toBe("saving"));
    expect(saves[0]!.work).toMatchObject({ completed: true, revision: 8 });
    await act(async () => saves[0]!.done.resolve());

    expect(result.current.saveState).toBe("saved");
  });

  it("저장 중 새 편집이 생기면 이전 저장 완료를 saved 로 보지 않고, 저장을 순서대로 이어서 최신 revision 을 저장한다", async () => {
    const { store, saves, finishLoad } = controllableStore(existing());
    const { result } = renderHook(() => useStudyWork(options(store)));
    await act(async () => finishLoad());

    act(() => {
      result.current.dispatch({ type: "work/complete", completed: true });
    });
    await waitFor(() => expect(saves).toHaveLength(1));
    act(() => {
      result.current.dispatch({
        type: "annotation/update",
        id: "a1",
        patch: { note: "최신 메모" },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(saves).toHaveLength(1);
    await act(async () => saves[0]!.done.resolve());
    expect(result.current.saveState).not.toBe("saved");

    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]!.work).toMatchObject({ revision: 9 });
    expect(saves[1]!.work.annotations[0]!.note).toBe("최신 메모");
    await act(async () => saves[1]!.done.resolve());
    expect(result.current.saveState).toBe("saved");
  });

  it("저장 실패는 failed 와 이유로 표시하고 편집 내용을 유지하며 수동 저장으로 다시 시도한다", async () => {
    const { store, saves, finishLoad } = controllableStore(existing());
    const { result } = renderHook(() => useStudyWork(options(store)));
    await act(async () => finishLoad());

    act(() => {
      result.current.dispatch({
        type: "annotation/update",
        id: "a1",
        patch: { note: "실패할 메모" },
      });
    });
    await waitFor(() => expect(saves).toHaveLength(1));
    await act(async () =>
      saves[0]!.done.reject(
        new WorkStoreError("quota-exceeded", "저장 용량 부족"),
      ),
    );

    expect(result.current.saveState).toBe("failed");
    expect(result.current.saveError).toBe("저장 용량 부족");
    expect(result.current.work?.annotations[0]!.note).toBe("실패할 메모");

    let manual!: Promise<boolean>;
    act(() => {
      manual = result.current.saveNow();
    });
    await waitFor(() => expect(saves).toHaveLength(2));
    await act(async () => saves[1]!.done.resolve());
    expect(await manual).toBe(true);
    expect(result.current.saveState).toBe("saved");
  });

  it("실행 취소 후 저장은 이전 내용을 새 revision 으로 저장해 stale 로 거부되지 않는다", async () => {
    const { store, saves, finishLoad } = controllableStore(existing());
    const { result } = renderHook(() => useStudyWork(options(store)));
    await act(async () => finishLoad());

    act(() => {
      result.current.dispatch({ type: "annotation/delete", id: "a1" });
    });
    await waitFor(() => expect(saves).toHaveLength(1));
    await act(async () => saves[0]!.done.resolve());
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.work?.annotations).toHaveLength(1);
    expect(result.current.canRedo).toBe(true);
    await waitFor(() => expect(saves).toHaveLength(2));

    expect(saves[1]!.work.revision).toBe(9);
    expect(saves[1]!.work.annotations).toHaveLength(1);
  });

  it("저장하지 않은 채 화면을 떠나면 마지막 편집을 저장한다", async () => {
    const { store, saves, finishLoad } = controllableStore(existing());
    const { result, unmount } = renderHook(() =>
      useStudyWork({ ...options(store), autosaveDelayMs: 10_000 }),
    );
    await act(async () => finishLoad());
    act(() => {
      result.current.dispatch({
        type: "annotation/update",
        id: "a1",
        patch: { note: "떠나기 직전" },
      });
    });

    unmount();

    expect(saves).toHaveLength(1);
    expect(saves[0]!.work.annotations[0]!.note).toBe("떠나기 직전");
  });
});
