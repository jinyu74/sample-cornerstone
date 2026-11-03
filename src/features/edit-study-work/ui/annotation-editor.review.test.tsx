import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { Annotation } from "@/entities/study-work";

import { AnnotationEditor } from "./annotation-editor";

it("실행 취소나 JSON 복원으로 같은 주석의 메모가 바뀌면 입력란도 복원된 문서를 표시한다", () => {
  const annotation: Annotation = {
    id: "a1",
    tool: "length",
    reference: {
      studyInstanceUid: "s1",
      seriesInstanceUid: "r1",
      sopInstanceUid: "i1",
    },
    imagePoints: [
      [0, 0],
      [3, 4],
    ],
    note: "편집한 메모",
    visible: true,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:01:00.000Z",
  };
  const props = {
    labels: [],
    targets: [],
    calibrated: false,
    onChange: vi.fn(),
    onCreateTarget: vi.fn(),
    onDelete: vi.fn(),
  };
  const { rerender } = render(
    <AnnotationEditor {...props} annotation={annotation} />,
  );
  expect(screen.getByRole("textbox", { name: "메모" })).toHaveValue(
    "편집한 메모",
  );
  rerender(
    <AnnotationEditor
      {...props}
      annotation={{
        ...annotation,
        note: "이전 메모",
        updatedAt: "2026-11-02T00:00:00.000Z",
      }}
    />,
  );
  expect(screen.getByRole("textbox", { name: "메모" })).toHaveValue(
    "이전 메모",
  );
});
