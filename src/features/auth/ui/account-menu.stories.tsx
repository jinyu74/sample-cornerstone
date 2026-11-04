import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SessionUserProvider } from "../model/session-user-context";

import { AccountMenu } from "./account-menu";

const meta = {
  title: "features/auth/AccountMenu",
  component: AccountMenu,
  decorators: [
    (Story) => (
      <SessionUserProvider
        user={{
          id: "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f",
          email: "reader@example.test",
        }}
      >
        <div className="flex justify-end">{Story()}</div>
      </SessionUserProvider>
    ),
  ],
} satisfies Meta<typeof AccountMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText("reader@example.test")).toBeVisible();
    const button = canvas.getByRole("button", { name: "로그아웃" });
    // 서버 Route Handler 로 POST 하는 일반 폼(문서 전체 이동)
    const form = canvasElement.querySelector("form")!;
    await expect(form).toHaveAttribute("method", "post");
    await expect(form).toHaveAttribute("action", "/auth/sign-out");
    await userEvent.tab();
    await expect(button).toHaveFocus();
  },
};
