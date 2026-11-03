import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AppHeader } from "./app-header";
import { Button } from "./button";

const meta = {
  title: "shared/AppHeader",
  component: AppHeader,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const banner = canvas.getByRole("banner");
    await expect(banner).toBeVisible();
    const home = canvas.getByRole("link", { name: "DICOM 작업실" });
    await expect(home).toHaveAttribute("href", "/");
    await expect(canvas.getByText("로컬 작업 공간")).toBeVisible();
  },
};

export const WithNavigationAndActions: Story = {
  args: {
    children: <span className="font-semibold">Synthetic study</span>,
    actions: <Button variant="outline">동작</Button>,
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Synthetic study")).toBeVisible();
    await userEvent.tab();
    await expect(
      canvas.getByRole("link", { name: "DICOM 작업실" }),
    ).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "동작" })).toHaveFocus();
  },
};
