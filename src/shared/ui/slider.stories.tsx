import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { Slider } from "./slider";

const meta = {
  title: "shared/ui/Slider",
  component: Slider,
  args: {
    min: 1,
    max: 10,
    defaultValue: [3],
    thumbLabel: "슬라이스 위치",
    getValueText: (value: number) => `영상 ${value} / 10`,
    onValueChange: fn(),
  },
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
} satisfies Meta<typeof Slider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const slider = canvas.getByRole("slider", { name: "슬라이스 위치" });
    await expect(slider).toHaveAttribute("aria-valuetext", "영상 3 / 10");
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(args.onValueChange).toHaveBeenCalled();
    await expect(slider).toHaveAttribute("aria-valuetext", "영상 4 / 10");
  },
};
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => expect(canvas.getByRole("slider")).toBeDisabled(),
};
