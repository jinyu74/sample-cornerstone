import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import {
  createStudyWork,
  type StudyWork,
  type StudyWorkStore,
} from "@/entities/study-work";

import { useStudyWork } from "./use-study-work";

const timestamp = "2026-11-02T10:00:00.000Z";
const now = () => new Date(timestamp);

function createStore(): StudyWorkStore {
  return {
    getWork: vi.fn().mockResolvedValue(createStudyWork("2.25.1", timestamp)),
    listWorks: vi.fn().mockResolvedValue([]),
    saveWork: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
}

it("변경 없는 수동 저장 후에도 다음 편집을 정상 저장한다", async () => {
  const store = createStore();
  const { result } = renderHook(() =>
    useStudyWork({
      store,
      studyInstanceUid: "2.25.1",
      now,
      autosaveDelayMs: 10000,
    }),
  );
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(async () => {
    expect(await result.current.saveNow()).toBe(true);
  });
  act(() => {
    result.current.dispatch({ type: "work/complete", completed: true });
  });
  await act(async () => {
    await result.current.saveNow();
  });
  expect(store.saveWork).toHaveBeenCalledTimes(1);
  expect(result.current.saveState).toBe("saved");
});

it("검사 변경 직후에는 이전 검사 결과를 숨기고 새 검사 복원 전 편집을 막는다", async () => {
  const store = createStore();
  store.getWork = vi.fn((uid: string) =>
    uid === "2.25.1"
      ? Promise.resolve(createStudyWork(uid, timestamp))
      : new Promise<StudyWork | undefined>(() => undefined),
  );
  const { result, rerender } = renderHook(
    ({ uid }) => useStudyWork({ store, studyInstanceUid: uid, now }),
    { initialProps: { uid: "2.25.1" } },
  );
  await waitFor(() => expect(result.current.status).toBe("ready"));
  rerender({ uid: "2.25.2" });
  expect(result.current.status).toBe("loading");
  expect(result.current.work).toBeUndefined();
  expect(
    result.current.dispatch({ type: "work/complete", completed: true }).ok,
  ).toBe(false);
});
