import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SaveStatus } from "./save-status";

const meta = {
  title: "features/edit-study-work/SaveStatus",
  component: SaveStatus,
} satisfies Meta<typeof SaveStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Saved: Story = {
  args: { state: "saved" },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status")).toHaveTextContent("저장됨"),
};
export const Unsaved: Story = {
  args: { state: "unsaved" },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status")).toHaveTextContent("저장되지 않은 변경"),
};
export const Saving: Story = {
  args: { state: "saving" },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status")).toHaveTextContent("저장 중"),
};
export const Failed: Story = {
  args: { state: "failed", error: "IndexedDB 사용 불가" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("저장 실패");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "IndexedDB 사용 불가",
    );
  },
};
