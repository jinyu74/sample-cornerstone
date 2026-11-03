import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { FrameNavigator } from "./frame-navigator";

const meta = {
  title: "widgets/stack-viewer/FrameNavigator",
  component: FrameNavigator,
  args: { index: 0, count: 5, onIndexChange: fn() },
  render: function Render(args) {
    const [index, setIndex] = useState(args.index);
    return (
      <div className="bg-viewport p-4">
        <FrameNavigator
          {...args}
          index={index}
          onIndexChange={(next) => {
            setIndex(next);
            args.onIndexChange(next);
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof FrameNavigator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MultiFrame: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByTestId("frame-position")).toHaveTextContent(
      "1 / 5",
    );
    await expect(
      canvas.getByRole("button", { name: "이전 영상" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "다음 영상" }));
    await expect(args.onIndexChange).toHaveBeenLastCalledWith(1);
    await expect(canvas.getByTestId("frame-position")).toHaveTextContent(
      "2 / 5",
    );

    const slider = canvas.getByRole("slider", { name: "슬라이스 위치" });
    await expect(slider).toHaveAttribute("aria-valuetext", "영상 2 / 5");
    slider.focus();
    await userEvent.keyboard("{End}");
    await expect(args.onIndexChange).toHaveBeenLastCalledWith(4);
    await expect(
      canvas.getByRole("button", { name: "다음 영상" }),
    ).toBeDisabled();
  },
};

export const SingleImage: Story = {
  args: { count: 1 },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("frame-position")).toHaveTextContent(
      "1 / 1",
    );
    await expect(canvas.queryByRole("slider")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "다음 영상" }),
    ).toBeNull();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "다음 영상" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("slider", { name: "슬라이스 위치" }),
    ).toBeDisabled();
  },
};
