import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { OriginalsBadge } from "./originals-badge";

/** 서버 목록의 검사 원본이 이 브라우저(IndexedDB)에 있는지 */
const meta = {
  title: "entities/dicom-study/OriginalsBadge",
  component: OriginalsBadge,
} satisfies Meta<typeof OriginalsBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Checking: Story = {
  args: { status: { kind: "checking" } },
  play: async ({ canvas }) =>
    expect(canvas.getByText("원본 확인 중")).toBeVisible(),
};
export const Complete: Story = {
  args: { status: { kind: "complete", total: 3 } },
  play: async ({ canvas }) =>
    expect(canvas.getByText("원본 있음")).toBeVisible(),
};
export const Partial: Story = {
  args: { status: { kind: "partial", present: 1, total: 3 } },
  play: async ({ canvas }) =>
    expect(canvas.getByText("일부 원본 1/3")).toBeVisible(),
};
export const Missing: Story = {
  args: { status: { kind: "missing", total: 3 }, localCount: 0 },
  play: async ({ canvas }) =>
    expect(canvas.getByText("원본 없음")).toBeVisible(),
};
/** 서버 기록의 영상은 없지만 이 브라우저에 서버 미반영 원본이 있다(원본 없음이 아니다) */
export const LocalNotOnServer: Story = {
  args: { status: { kind: "missing", total: 2 }, localCount: 1 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("서버 영상 0/2 · 이 브라우저 1개"),
    ).toBeVisible();
    await expect(canvas.queryByText("원본 없음")).toBeNull();
  },
};
export const Mismatch: Story = {
  args: { status: { kind: "mismatch", mismatched: 1, present: 2, total: 3 } },
  play: async ({ canvas }) =>
    expect(canvas.getByText("내용 불일치 1개")).toBeVisible(),
};
export const Unreadable: Story = {
  args: { status: { kind: "unreadable" } },
  play: async ({ canvas }) =>
    expect(canvas.getByText("원본 확인 실패")).toBeVisible(),
};
