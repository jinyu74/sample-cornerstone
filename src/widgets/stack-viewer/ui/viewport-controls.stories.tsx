import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { ViewportControls } from "./viewport-controls";

const meta = {
  title: "widgets/stack-viewer/ViewportControls",
  component: ViewportControls,
  args: {
    inverted: false,
    onInvert: fn(),
    onRotate: fn(),
    onFit: fn(),
    onReset: fn(),
  },
  decorators: [(Story) => <div className="bg-viewport p-3">{Story()}</div>],
} satisfies Meta<typeof ViewportControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const group = canvas.getByRole("group", { name: "화면 조작" });
    await expect(group).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "반전" }));
    await expect(args.onInvert).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("button", { name: "반전" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(canvas.getByRole("button", { name: "90° 회전" }));
    await userEvent.click(canvas.getByRole("button", { name: "화면 맞춤" }));
    await userEvent.click(canvas.getByRole("button", { name: "초기화" }));
    await expect(args.onRotate).toHaveBeenCalledTimes(1);
    await expect(args.onFit).toHaveBeenCalledTimes(1);
    await expect(args.onReset).toHaveBeenCalledTimes(1);
  },
};

export const Inverted: Story = {
  args: { inverted: true },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("button", { name: "반전" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("button", { name: "초기화" })).toBeDisabled(),
};
