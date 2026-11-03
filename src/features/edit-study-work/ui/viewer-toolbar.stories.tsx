import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import type { ViewerTool } from "@/shared/viewer";

import { ViewerToolbar } from "./viewer-toolbar";

const meta = {
  title: "features/edit-study-work/ViewerToolbar",
  component: ViewerToolbar,
  args: {
    tool: "select",
    onToolChange: fn(),
    canUndo: true,
    canRedo: false,
    onUndo: fn(),
    onRedo: fn(),
    saveState: "saved",
    onSave: fn(),
  },
  render: function Render(args) {
    const [tool, setTool] = useState<ViewerTool>(args.tool);
    return (
      <ViewerToolbar
        {...args}
        tool={tool}
        onToolChange={(next) => {
          setTool(next);
          args.onToolChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof ViewerToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const tools = canvas.getByRole("group", { name: "도구" });
    await expect(tools).toBeVisible();
    for (const name of [
      "선택",
      "이동",
      "확대",
      "밝기·대비",
      "길이",
      "각도",
      "타원",
      "윤곽",
      "메모",
    ]) {
      await expect(canvas.getByRole("button", { name })).toBeVisible();
    }
    await expect(canvas.getByRole("button", { name: "선택" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "길이" }));
    await expect(args.onToolChange).toHaveBeenLastCalledWith("length");
    await expect(canvas.getByRole("button", { name: "길이" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(canvas.getByRole("button", { name: "실행 취소" }));
    await expect(args.onUndo).toHaveBeenCalledTimes(1);
    await expect(
      canvas.getByRole("button", { name: "다시 실행" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("status")).toHaveTextContent("저장됨");
    await userEvent.click(canvas.getByRole("button", { name: "저장" }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

export const KeyboardToolSwitch: Story = {
  play: async ({ canvas, args, userEvent }) => {
    canvas.getByRole("button", { name: "선택" }).focus();
    await userEvent.keyboard("{ArrowRight}{Enter}");
    await expect(args.onToolChange).toHaveBeenLastCalledWith("pan");
  },
};

export const Unsaved: Story = {
  args: { saveState: "unsaved" },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status")).toHaveTextContent("저장되지 않은 변경"),
};

export const Saving: Story = {
  args: { saveState: "saving" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("저장 중");
    await expect(canvas.getByRole("button", { name: "저장" })).toBeDisabled();
  },
};

export const SaveFailed: Story = {
  args: { saveState: "failed", saveError: "브라우저 저장 용량이 부족합니다" },
  play: async ({ canvas }) => {
    const status = canvas.getByRole("status");
    await expect(status).toHaveTextContent("저장 실패");
    await expect(status).toHaveTextContent("브라우저 저장 용량이 부족합니다");
    await expect(canvas.getByRole("button", { name: "저장" })).toBeEnabled();
  },
};

export const Disabled: Story = {
  args: { disabled: true, canUndo: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "길이" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "저장" })).toBeDisabled();
  },
};
