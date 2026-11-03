import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { type Annotation, DEFAULT_LABELS } from "@/entities/study-work";

import { AnnotationEditor } from "./annotation-editor";

/** 컴포넌트 시연용 합성 주석 */
const base: Annotation = {
  id: "a1",
  tool: "length",
  reference: {
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.2",
    sopInstanceUid: "2.25.3",
  },
  imagePoints: [
    [0, 0],
    [3, 4],
  ],
  note: "",
  visible: true,
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

const meta = {
  title: "features/edit-study-work/AnnotationEditor",
  component: AnnotationEditor,
  args: {
    annotation: base,
    labels: [...DEFAULT_LABELS],
    targets: [{ id: "t1", labelId: "lesion-nodule", name: "결절 1" }],
    measurementText: "2.50 mm",
    calibrated: true,
    onChange: fn(),
    onCreateTarget: fn(),
    onDelete: fn(),
  },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: function Render(args) {
    const [annotation, setAnnotation] = useState(args.annotation);
    return (
      <AnnotationEditor
        {...args}
        annotation={annotation}
        onChange={(patch) => {
          setAnnotation((current) => ({ ...current, ...patch }));
          args.onChange(patch);
        }}
      />
    );
  },
} satisfies Meta<typeof AnnotationEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditCoordinatesAndNote: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "선택한 주석 편집" }),
    ).toBeVisible();
    await expect(canvas.getByText("2.50 mm")).toBeVisible();

    const column = canvas.getByRole("spinbutton", { name: "점 2 열" });
    await userEvent.clear(column);
    await userEvent.type(column, "10{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({
      imagePoints: [
        [0, 0],
        [10, 4],
      ],
    });

    const row = canvas.getByRole("spinbutton", { name: "점 2 행" });
    await userEvent.clear(row);
    await userEvent.tab();
    await expect(
      canvas.getByText("좌표는 유한한 숫자여야 합니다"),
    ).toBeVisible();
    await expect(row).toHaveAttribute("aria-invalid", "true");

    const note = canvas.getByRole("textbox", { name: "메모" });
    await userEvent.type(note, "최대 직경");
    await userEvent.tab();
    await expect(args.onChange).toHaveBeenLastCalledWith({ note: "최대 직경" });
  },
};

export const ChooseLabelAndTarget: Story = {
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "라벨" }));
    await userEvent.click(await body.findByRole("option", { name: "결절" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({
      labelId: "lesion-nodule",
      targetId: undefined,
    });
    await waitFor(() => expect(canvas.getByText("병변")).toBeVisible());

    await userEvent.click(canvas.getByRole("combobox", { name: "대상" }));
    await userEvent.click(await body.findByRole("option", { name: "결절 1" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ targetId: "t1" });

    await userEvent.click(canvas.getByRole("button", { name: "새 대상" }));
    await expect(args.onCreateTarget).toHaveBeenCalledWith("lesion-nodule");
  },
};

export const TargetNeedsLabel: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "대상" })).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "새 대상" }),
    ).toBeDisabled();
  },
};

export const VisibilityAndDelete: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const toggle = canvas.getByRole("switch", { name: "표시" });
    await expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenLastCalledWith({ visible: false });
    await userEvent.click(canvas.getByRole("button", { name: "삭제" }));
    await expect(args.onDelete).toHaveBeenCalledTimes(1);
  },
};

export const Uncalibrated: Story = {
  args: { measurementText: "5.00 px", calibrated: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("5.00 px")).toBeVisible();
    await expect(
      canvas.getByText(
        "PixelSpacing 이 없거나 유효하지 않아 픽셀 단위로 표시합니다.",
      ),
    ).toBeVisible();
  },
};

export const ContourIsNotSegmentation: Story = {
  args: {
    annotation: {
      ...base,
      tool: "contour",
      imagePoints: [
        [0, 0],
        [4, 0],
        [4, 4],
      ],
    },
    measurementText: "8.00 px² · 둘레 13.66 px",
    calibrated: false,
  },
  play: async ({ canvas }) =>
    expect(
      canvas.getByText("2D 윤곽 주석입니다. 픽셀·복셀 분할 마스크가 아닙니다."),
    ).toBeVisible(),
};
