import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Badge } from "./badge";

const meta = {
  title: "shared/ui/Badge",
  component: Badge,
  args: { children: "CT" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => expect(canvas.getByText("CT")).toBeVisible(),
};
export const Secondary: Story = {
  args: { variant: "secondary", children: "미작업" },
};
export const Warning: Story = {
  args: { variant: "warning", children: "작업 중" },
};
export const Success: Story = {
  args: { variant: "success", children: "완료" },
};
export const Outline: Story = {
  args: { variant: "outline", children: "로컬" },
};
export const Destructive: Story = {
  args: { variant: "destructive", children: "실패" },
};
