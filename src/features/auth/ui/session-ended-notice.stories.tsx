import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SessionEndedNotice } from "./session-ended-notice";

const meta = {
  title: "features/auth/SessionEndedNotice",
  component: SessionEndedNotice,
  args: { reason: "unauthenticated", loginHref: "/login?next=%2Fstudies%2F1" },
} satisfies Meta<typeof SessionEndedNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Expired: Story = {
  play: async ({ canvas, userEvent }) => {
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent("세션이 만료되었습니다");
    const link = canvas.getByRole("link", { name: "로그인 화면으로 이동" });
    await expect(link).toHaveAttribute("href", "/login?next=%2Fstudies%2F1");
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};

export const UserChanged: Story = {
  args: { reason: "user-changed" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "다른 계정으로 바뀌었습니다",
    );
  },
};

export const SignedOut: Story = {
  args: { reason: "signed-out" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "다른 탭에서 로그아웃했습니다",
    );
  },
};
