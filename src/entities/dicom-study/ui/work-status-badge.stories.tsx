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
/** 서버 목록에서 왔고 이 브라우저 원본을 확인하는 중(최초 HTML) */
export const Checking: Story = {
  args: { status: "checking" },
  play: async ({ canvas }) => expect(canvas.getByText("확인 중")).toBeVisible(),
};
/** 다른 브라우저 작업은 아직 서버에 없으므로 미작업이라고 단정하지 않는다 */
export const Unknown: Story = {
  args: { status: "unknown" },
  play: async ({ canvas }) => {
    const badge = canvas.getByText("이 브라우저 기록 없음");
    await expect(badge).toBeVisible();
    await expect(canvas.queryByText("미작업")).toBeNull();
  },
};
