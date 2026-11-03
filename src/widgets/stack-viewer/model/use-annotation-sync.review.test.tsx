import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

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

it("생성뿐 아니라 기존 주석 핸들 수정도 작업 문서에 전달한다", async () => {
  const listen = vi.spyOn(mocks.target, "addEventListener");
  const commit = vi.fn();
  renderHook(() =>
    useAnnotationSync({
      engineInfo: { renderingEngineId: "engine", viewportId: "stack" },
      element: null,
      imageId: "dicomfile:1",
      imageIds: ["dicomfile:1"],
      displayed: [],
      selectedId: undefined,
      frameOfReferenceUid: undefined,
      plane: {
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        pixelSpacing: [1, 1],
      },
      onCommit: commit,
      onSelect: vi.fn(),
      onSynced: vi.fn(),
    }),
  );
  await waitFor(() =>
    expect(listen).toHaveBeenCalledWith("completed", expect.any(Function)),
  );
  const annotation = {
    annotationUID: "a1",
    metadata: { toolName: "Length", referencedImageId: "dicomfile:1" },
    data: {
      handles: {
        points: [
          [1, 2, 0],
          [3, 4, 0],
        ],
      },
    },
  };
  act(() => {
    mocks.target.dispatchEvent(
      new CustomEvent("completed", { detail: { annotation } }),
    );
  });
  expect(commit).toHaveBeenCalledTimes(1);
  commit.mockClear();
  annotation.data.handles.points = [
    [2, 3, 0],
    [4, 5, 0],
  ];
  act(() => {
    mocks.target.dispatchEvent(
      new CustomEvent("modified", {
        detail: { annotation, changeType: "HandlesUpdated" },
      }),
    );
  });
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "a1",
      imagePoints: [
        [2, 3],
        [4, 5],
      ],
    }),
  );
});
