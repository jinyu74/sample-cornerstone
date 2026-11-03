import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { Annotation } from "@/entities/study-work";

import type { EngineAnnotationSpec } from "../lib/annotation-mapping";

import { useAnnotationSync } from "./use-annotation-sync";

const mocks = vi.hoisted(() => ({
  target: new EventTarget(),
  entries: [] as EngineAnnotationSpec["base"][],
}));
vi.mock("@/shared/viewer", () => ({
  initCornerstone: async () => ({
    core: {
      eventTarget: mocks.target,
      getRenderingEngine: () => ({
        getViewport: () => ({ render: () => undefined }),
      }),
    },
    tools: {
      Enums: {
        Events: {
          ANNOTATION_COMPLETED: "completed",
          ANNOTATION_MODIFIED: "modified",
          ANNOTATION_SELECTION_CHANGE: "selection",
        },
      },
      LengthTool: {
        createAnnotation: (value: EngineAnnotationSpec["base"]) => value,
      },
      annotation: {
        state: {
          getAllAnnotations: () => mocks.entries,
          addAnnotation: (value: EngineAnnotationSpec["base"]) => {
            mocks.entries.push(value);
          },
          removeAnnotation: (id: string) => {
            mocks.entries = mocks.entries.filter(
              (item) => item.annotationUID !== id,
            );
          },
        },
        selection: {
          setAnnotationSelected: vi.fn(),
          deselectAnnotation: vi.fn(),
        },
      },
    },
  }),
}));

it("작업 화면을 떠나면 동기화 계층이 등록한 엔진 주석도 해제한다", async () => {
  const annotation: Annotation = {
    id: "a1",
    tool: "length",
    reference: {
      studyInstanceUid: "s1",
      seriesInstanceUid: "r1",
      sopInstanceUid: "i1",
    },
    imagePoints: [
      [1, 1],
      [2, 2],
    ],
    note: "",
    visible: true,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
  const { unmount } = renderHook(() =>
    useAnnotationSync({
      engineInfo: { renderingEngineId: "engine", viewportId: "stack" },
      element: document.createElement("div"),
      imageId: "dicomfile:1",
      imageIds: ["dicomfile:1"],
      displayed: [{ annotation, textLines: ["길이"] }],
      selectedId: undefined,
      frameOfReferenceUid: undefined,
      plane: {
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        pixelSpacing: [1, 1],
      },
      onCommit: vi.fn(),
      onSelect: vi.fn(),
      onSynced: vi.fn(),
    }),
  );
  await waitFor(() => expect(mocks.entries).toHaveLength(1));
  unmount();
  expect(mocks.entries).toHaveLength(0);
});
