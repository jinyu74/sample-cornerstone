import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { DEFAULT_LABELS } from "@/entities/study-work";

import { LabelManager } from "./label-manager";

const meta = {
  title: "features/edit-study-work/LabelManager",
  component: LabelManager,
  args: {
    labels: [...DEFAULT_LABELS],
    onAdd: fn<(label: unknown) => string | null>(() => null),
    onUpdate: fn<(id: string, patch: unknown) => string | null>(() => null),
  },
} satisfies Meta<typeof LabelManager>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AddLabel: Story = {
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "라벨 관리" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "라벨 관리",
      }),
    );
    await waitFor(() =>
      expect(dialog.getByRole("list", { name: "라벨 목록" })).toBeVisible(),
    );
    await expect(dialog.getByRole("textbox", { name: "간 이름" })).toHaveValue(
      "간",
    );

    await userEvent.type(
      dialog.getByRole("textbox", { name: "새 라벨 이름" }),
      "혈관",
    );
    await userEvent.click(dialog.getByRole("button", { name: "장기" }));
    await expect(dialog.getByRole("button", { name: "장기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(dialog.getByRole("button", { name: "라벨 추가" }));
    await expect(args.onAdd).toHaveBeenCalledWith({
      name: "혈관",
      category: "organ",
      color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
    });
    await expect(
      dialog.getByRole("textbox", { name: "새 라벨 이름" }),
    ).toHaveValue("");
  },
};

export const RejectsInvalid: Story = {
  args: {
    onAdd: fn<(label: unknown) => string | null>(
      () => "같은 분류에 같은 이름의 라벨이 있습니다",
    ),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "라벨 관리" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "라벨 관리",
      }),
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: "새 라벨 이름" }),
      "간",
    );
    await userEvent.click(dialog.getByRole("button", { name: "라벨 추가" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent(
      "같은 분류에 같은 이름의 라벨이 있습니다",
    );
  },
};

export const RenameLabel: Story = {
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "라벨 관리" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "라벨 관리",
      }),
    );
    const name = dialog.getByRole("textbox", { name: "간 이름" });
    await userEvent.clear(name);
    await userEvent.type(name, "간 실질{Enter}");
    await expect(args.onUpdate).toHaveBeenCalledWith("organ-liver", {
      name: "간 실질",
    });
    await userEvent.keyboard("{Escape}");
    // 닫힌 Dialog 는 퇴장 애니메이션이 끝날 때까지 data-closed 상태로 남을 수 있다.
    await waitFor(() => {
      const closing = within(canvasElement.ownerDocument.body).queryByRole(
        "dialog",
      );
      expect(closing === null || closing.hasAttribute("data-closed")).toBe(
        true,
      );
    });
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("button", { name: "라벨 관리" })).toBeDisabled(),
};
