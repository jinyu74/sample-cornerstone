import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { ResultTransfer } from "./result-transfer";

const meta = {
  title: "features/transfer-results/ResultTransfer",
  component: ResultTransfer,
  args: {
    onExport: fn(),
    onImport: fn<(text: string) => string[] | null>(() => null),
  },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof ResultTransfer>;
export default meta;
type Story = StoryObj<typeof meta>;

const file = (text: string) =>
  new File([text], "result.json", { type: "application/json" });

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByText(
        "결과는 이 기기(브라우저)에 저장됩니다. JSON 에는 원본 픽셀이 없습니다.",
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "결과 내보내기 (JSON)" }),
    );
    await expect(args.onExport).toHaveBeenCalledTimes(1);
    await expect(
      canvas.getAllByRole("button", { name: /가져오기/ }),
    ).toHaveLength(1);
  },
};

export const ImportConfirmed: Story = {
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    await userEvent.upload(
      canvas.getByTestId("result-json-input"),
      file('{"ok":true}'),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("alertdialog", { name: "작업 결과를 바꿀까요?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "가져오기" }));
    await expect(args.onImport).toHaveBeenCalledWith('{"ok":true}');
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "작업 결과를 가져왔습니다",
    );
  },
};

export const ImportCancelled: Story = {
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    await userEvent.upload(canvas.getByTestId("result-json-input"), file("{}"));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("alertdialog", { name: "작업 결과를 바꿀까요?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "취소" }));
    await expect(args.onImport).not.toHaveBeenCalled();
  },
};

export const ImportRejected: Story = {
  args: {
    onImport: fn<(text: string) => string[] | null>(() => [
      "다른 검사의 결과입니다",
      "주석 a1: 라벨 x 이 없습니다",
    ]),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(canvas.getByTestId("result-json-input"), file("{}"));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "가져오기" }));
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent("가져오지 않았습니다");
    await expect(alert).toHaveTextContent("다른 검사의 결과입니다");
    await expect(alert).toHaveTextContent("주석 a1: 라벨 x 이 없습니다");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "결과 내보내기 (JSON)" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "결과 가져오기 (JSON)" }),
    ).toBeDisabled();
  },
};
