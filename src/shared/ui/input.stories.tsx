import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Input } from "./input";

const meta = {
  title: "shared/ui/Input",
  component: Input,
  args: {
    "aria-label": "검사 검색",
    placeholder: "검사 날짜·식별자로 검색",
    type: "search",
  },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("searchbox", { name: "검사 검색" });
    await userEvent.type(input, "CT");
    await expect(input).toHaveValue("CT");
  },
};
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("searchbox")).toBeDisabled(),
};
export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "잘못된 값" },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("searchbox")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
};
