import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAnnotationSync } from "./use-annotation-sync";

const mocks = vi.hoisted(() => ({ target: new EventTarget() }));

vi.mock("@/shared/viewer", () => ({
  initCornerstone: async () => ({
    core: { eventTarget: mocks.target },
    tools: {
      Enums: {
        Events: {
          ANNOTATION_COMPLETED: "completed",
          ANNOTATION_MODIFIED: "modified",
          ANNOTATION_SELECTION_CHANGE: "selection",
        },
      },
    },
  }),
}));

const plane = {
  imagePositionPatient: [0, 0, 0] as const,
  imageOrientationPatient: [1, 0, 0, 0, 1, 0] as const,
  pixelSpacing: [1, 1] as const,
};

function setup(element: HTMLElement | null = null) {
  const commit = vi.fn();
  const listen = vi.spyOn(mocks.target, "addEventListener");
  renderHook(() =>
    useAnnotationSync({
      engineInfo: { renderingEngineId: "engine", viewportId: "stack" },
      element,
      imageId: "dicomfile:1",
      imageIds: ["dicomfile:1"],
      displayed: [],
      selectedId: undefined,
      frameOfReferenceUid: undefined,
      plane,
      onCommit: commit,
      onSelect: vi.fn(),
      onSynced: vi.fn(),
    }),
  );
  return { commit, listen };
}

const length = (id: string, points: number[][]) => ({
  annotationUID: id,
  metadata: { toolName: "Length", referencedImageId: "dicomfile:1" },
  data: { handles: { points } },
});

const fire = (type: string, detail: unknown) =>
  act(() => {
    mocks.target.dispatchEvent(new CustomEvent(type, { detail }));
  });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useAnnotationSync 엔진 → 문서 편집 반영", () => {
  it("계산·동기화 이벤트(StatsUpdated 등)는 문서 편집으로 반영하지 않는다", async () => {
    const { commit, listen } = setup();
    await waitFor(() =>
      expect(listen).toHaveBeenCalledWith("modified", expect.any(Function)),
    );
    const annotation = length("a1", [
      [1, 1, 0],
      [2, 2, 0],
    ]);
    fire("completed", { annotation });
    commit.mockClear();

    for (const changeType of [
      "StatsUpdated",
      "InitialSetup",
      "Interaction",
      "MetadataReferenceModified",
      undefined,
    ]) {
      fire("modified", { annotation, changeType });
    }

    expect(commit).not.toHaveBeenCalled();
  });

  it("그리는 중(아직 완료되지 않은) 새 주석의 HandlesUpdated 는 반영하지 않고 완료 때만 추가한다", async () => {
    const { commit, listen } = setup();
    await waitFor(() =>
      expect(listen).toHaveBeenCalledWith("modified", expect.any(Function)),
    );
    const drawing = length("new", [
      [1, 1, 0],
      [5, 1, 0],
    ]);

    fire("modified", { annotation: drawing, changeType: "HandlesUpdated" });
    expect(commit).not.toHaveBeenCalled();
    fire("completed", { annotation: drawing });

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("포인터를 누른 채 핸들을 끄는 동안의 수정은 모았다가 포인터를 뗄 때 한 번만 반영한다", async () => {
    const element = document.createElement("div");
    const { commit, listen } = setup(element);
    await waitFor(() =>
      expect(listen).toHaveBeenCalledWith("modified", expect.any(Function)),
    );
    const annotation = length("a1", [
      [1, 1, 0],
      [2, 2, 0],
    ]);
    fire("completed", { annotation });
    commit.mockClear();

    act(() => {
      element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    for (const x of [3, 4, 5]) {
      annotation.data.handles.points = [
        [1, 1, 0],
        [x, 2, 0],
      ];
      fire("modified", { annotation, changeType: "HandlesUpdated" });
    }
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a1",
        imagePoints: [
          [1, 1],
          [5, 2],
        ],
      }),
    );
  });
});
