import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta = {
  title: "shared/ui/ToggleGroup",
  component: ToggleGroup,
  args: {
    "aria-label": "작업 상태",
    defaultValue: ["all"],
    onValueChange: fn(),
  },
  render: (args) => (
    <ToggleGroup {...args}>
      <ToggleGroupItem value="all">전체</ToggleGroupItem>
      <ToggleGroupItem value="done">완료</ToggleGroupItem>
    </ToggleGroup>
  ),
} satisfies Meta<typeof ToggleGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "완료" }));
    await expect(args.onValueChange).toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "완료" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};
export const Outline: Story = { args: { variant: "outline", spacing: 0 } };
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("button", { name: "완료" })).toBeDisabled(),
};
