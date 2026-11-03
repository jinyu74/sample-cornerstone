import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { WorkStatusBadge } from "./work-status-badge";

const meta = {
  title: "entities/dicom-study/WorkStatusBadge",
  component: WorkStatusBadge,
} satisfies Meta<typeof WorkStatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Untouched: Story = {
  args: { status: "untouched" },
  play: async ({ canvas }) => expect(canvas.getByText("미작업")).toBeVisible(),
};
export const InProgress: Story = {
  args: { status: "in-progress" },
  play: async ({ canvas }) => expect(canvas.getByText("작업 중")).toBeVisible(),
};
export const Done: Story = {
  args: { status: "done" },
  play: async ({ canvas }) => expect(canvas.getByText("완료")).toBeVisible(),
};
