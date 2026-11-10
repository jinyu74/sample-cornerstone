import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ImportActions, type ImportActionsHandle } from "./import-actions";

describe("ImportActions 핸들", () => {
  it("다른 곳(원본 없는 목록 행)에서 같은 파일 선택을 열 수 있다", () => {
    const ref = createRef<ImportActionsHandle>();
    render(<ImportActions ref={ref} onFiles={vi.fn()} folderSupported />);
    const input = screen.getByTestId("dicom-file-input");
    const click = vi.spyOn(input, "click");
    ref.current!.openFilePicker();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("가져오는 중이면 열지 않는다", () => {
    const ref = createRef<ImportActionsHandle>();
    render(<ImportActions ref={ref} onFiles={vi.fn()} busy folderSupported />);
    const click = vi.spyOn(screen.getByTestId("dicom-file-input"), "click");
    ref.current!.openFilePicker();
    expect(click).not.toHaveBeenCalled();
  });
});
