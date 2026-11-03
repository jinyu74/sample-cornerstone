import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import type { StudyFilter } from "../model/types";

import { StudyFilterBar } from "./study-filter-bar";

const meta = {
  title: "features/filter-studies/StudyFilterBar",
  component: StudyFilterBar,
  args: { value: { query: "", status: "all" }, onChange: fn() },
  render: function Render(args) {
    const [value, setValue] = useState<StudyFilter>(args.value);
    return (
      <StudyFilterBar
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof StudyFilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const search = canvas.getByRole("searchbox", { name: "검사 검색" });
    await userEvent.type(search, "CT");
    await expect(args.onChange).toHaveBeenLastCalledWith({
      query: "CT",
      status: "all",
    });

    const group = canvas.getByRole("group", { name: "작업 상태" });
    await expect(group).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "완료" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({
      query: "CT",
      status: "done",
    });
    await expect(canvas.getByRole("button", { name: "완료" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};

export const KeyboardStatus: Story = {
  play: async ({ canvas, args, userEvent }) => {
    canvas.getByRole("button", { name: "전체" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("button", { name: "미작업" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({
      query: "",
      status: "untouched",
    });
  },
};

export const SelectedStatusCannotBeCleared: Story = {
  args: { value: { query: "", status: "in-progress" } },
  play: async ({ canvas, userEvent }) => {
    const current = canvas.getByRole("button", { name: "작업 중" });
    await userEvent.click(current);
    await expect(current).toHaveAttribute("aria-pressed", "true");
  },
};
