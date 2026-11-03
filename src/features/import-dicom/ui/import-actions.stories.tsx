import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { ImportActions } from "./import-actions";

const meta = {
  title: "features/import-dicom/ImportActions",
  component: ImportActions,
  args: { onFiles: fn(), folderSupported: true },
} satisfies Meta<typeof ImportActions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByRole("button", { name: "파일 가져오기" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "폴더 선택" }),
    ).toBeEnabled();
    const files = [new File(["a"], "a.dcm"), new File(["b"], "b")];
    await userEvent.upload(canvas.getByTestId("dicom-file-input"), files);
    await expect(args.onFiles).toHaveBeenCalledWith(files);
  },
};

export const FolderPick: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const input = canvas.getByTestId("dicom-folder-input");
    await expect(input).toHaveAttribute("webkitdirectory");
    const files = [new File(["a"], "a.dcm")];
    await userEvent.upload(input, files);
    await expect(args.onFiles).toHaveBeenCalledWith(files);
  },
};

export const KeyboardOpensPicker: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByTestId<HTMLInputElement>("dicom-file-input");
    let opened = false;
    input.addEventListener("click", (event) => {
      opened = true;
      event.preventDefault();
    });
    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "파일 가져오기" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(opened).toBe(true);
  },
};

export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "파일 가져오기" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "폴더 선택" }),
    ).toBeDisabled();
  },
};

export const FolderUnsupported: Story = {
  args: { folderSupported: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "폴더 선택" }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(
        "이 브라우저는 폴더 선택을 지원하지 않습니다. 파일 가져오기에서 여러 파일을 선택하세요.",
      ),
    ).toBeVisible();
  },
};
