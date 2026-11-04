import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProtectedShell } from "@/app/providers/protected-shell";
import {
  type Annotation,
  createIndexedDbWorkStore,
  createStudyWork,
  type StudyWork,
  useStudyWorkStore,
} from "@/entities/study-work";
import { AnnotationEditor, useStudyWork } from "@/features/edit-study-work";
import { userDatabaseName } from "@/shared/storage";

/**
 * PR #4 재리뷰 P2: 메모(또는 좌표)를 입력하는 중(포커스 유지)에 세션이 끝나면 SessionGate 가 보호 화면을
 * 강제로 치운다. blur 없이 입력 칸이 사라지면 draft 가 작업 모델에 반영되지 않아 마지막 메모가 유실된다.
 * 요구: 보호 화면 차단은 유지하면서, 입력 중인 유효한 값은 기존 commit·검증 경로로 그 계정 모델에 먼저 반영한다.
 */
vi.mock("server-only", () => ({}));
const checkSession = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/api/check-session", () => ({
  SESSION_ENDPOINT: "/auth/session",
  checkSession,
}));

let run = 0;
function userId() {
  run += 1;
  return `8f14e45f-ceea-4e7a-9b1c-${run.toString(16).padStart(12, "0")}`;
}

const NOW = "2026-11-04T00:00:00.000Z";
const annotation: Annotation = {
  id: "a1",
  tool: "length",
  reference: {
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.2",
    sopInstanceUid: "2.25.3",
  },
  imagePoints: [
    [1, 1],
    [11, 1],
  ],
  note: "기존 메모",
  visible: true,
  createdAt: NOW,
  updatedAt: NOW,
};

async function seed(id: string): Promise<void> {
  const store = createIndexedDbWorkStore({
    databaseName: userDatabaseName(id),
  });
  const work: StudyWork = {
    ...createStudyWork("2.25.1", NOW),
    annotations: [annotation],
    revision: 1,
  };
  await store.saveWork(work);
  store.close();
}

async function stored(id: string): Promise<Annotation | undefined> {
  const store = createIndexedDbWorkStore({
    databaseName: userDatabaseName(id),
  });
  try {
    return (await store.getWork("2.25.1"))?.annotations[0];
  } finally {
    store.close();
  }
}

/** 실제 작업 편집 hook 과 편집기를 계정 저장소에 연결한 뷰어 결과 패널 대역 */
function Editor() {
  const work = useStudyWork({
    store: useStudyWorkStore(),
    studyInstanceUid: "2.25.1",
    autosaveDelayMs: 60_000,
  });
  const current = work.work?.annotations[0];
  if (work.status !== "ready" || !current) return <p>불러오는 중</p>;
  return (
    <AnnotationEditor
      annotation={current}
      labels={work.work!.labels}
      targets={work.work!.targets}
      calibrated
      onChange={(patch) =>
        work.dispatch({ type: "annotation/update", id: current.id, patch })
      }
      onCreateTarget={() => undefined}
      onDelete={() => undefined}
    />
  );
}

async function endSession() {
  checkSession.mockResolvedValue({ status: "unauthenticated" });
  await act(async () => {
    // 창 포커스로 재검증(입력 칸의 포커스는 그대로 유지된다)
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("세션 종료 시 입력 중인 값의 처리", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  afterEach(() => {
    consoleError?.mockRestore();
    checkSession.mockReset();
  });

  it.each([false, true])(
    "포커스가 남은 메모 입력은 보호 화면을 치우기 전에 그 계정 모델에 반영·저장된다 (Portal=%s)",
    async (portal) => {
      consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const id = userId();
      await seed(id);
      checkSession.mockResolvedValue({ status: "ok", userId: id });
      render(
        <ProtectedShell user={{ id, email: "a@example.test" }}>
          {portal ? createPortal(<Editor />, document.body) : <Editor />}
        </ProtectedShell>,
      );
      const note = await screen.findByLabelText("메모");
      await userEvent.clear(note);
      await userEvent.type(note, "세션 종료 직전 메모");
      expect(note).toHaveFocus();

      await endSession();

      // 보호 화면 차단은 유지된다
      expect(screen.queryByLabelText("메모")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "세션이 만료되었습니다",
      );
      await waitFor(async () =>
        expect((await stored(id))?.note).toBe("세션 종료 직전 메모"),
      );
    },
  );

  it("포커스가 남은 잘못된 좌표 입력은 검증에 막혀 저장되지 않고 이전 좌표가 유지된다", async () => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = userId();
    await seed(id);
    checkSession.mockResolvedValue({ status: "ok", userId: id });
    render(
      <ProtectedShell user={{ id, email: "a@example.test" }}>
        <Editor />
      </ProtectedShell>,
    );
    const column = await screen.findByRole("spinbutton", { name: "점 1 열" });
    await userEvent.clear(column);
    expect(column).toHaveFocus();

    await endSession();

    expect(screen.queryByRole("spinbutton", { name: "점 1 열" })).toBeNull();
    // 정리 대기(최대 3초) 뒤에도 저장 좌표는 그대로다
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await stored(id))?.imagePoints).toEqual(annotation.imagePoints);
  });
});
