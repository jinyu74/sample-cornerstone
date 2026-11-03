import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UploadIcon } from "lucide-react";
import { expect, fn } from "storybook/test";

import { Button } from "./button";
import { Spinner } from "./spinner";

const meta = {
  title: "shared/ui/Button",
  component: Button,
  args: { children: "파일 가져오기", onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "파일 가져오기" }),
    );
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
export const Outline: Story = {
  args: { variant: "outline", children: "폴더 선택" },
};
export const Ghost: Story = {
  args: { variant: "ghost", children: "검사 목록" },
};
export const Destructive: Story = {
  args: { variant: "destructive", children: "삭제" },
};
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <UploadIcon data-icon="inline-start" aria-hidden />
        파일 가져오기
      </>
    ),
  },
};
export const Loading: Story = {
  args: {
    disabled: true,
    children: (
      <>
        <Spinner data-icon="inline-start" />
        가져오는 중
      </>
    ),
  },
  play: async ({ canvas }) => expect(canvas.getByRole("button")).toBeDisabled(),
};
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const button = canvas.getByRole("button");
    await expect(button).toBeDisabled();
    button.click();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const Keyboard: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
