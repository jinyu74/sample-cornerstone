import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, type Mock, waitFor } from "storybook/test";

import { ImportDropZone } from "./import-drop-zone";

const meta = {
  title: "features/import-dicom/ImportDropZone",
  component: ImportDropZone,
  args: { onFiles: fn() },
} satisfies Meta<typeof ImportDropZone>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const zone = canvas.getByRole("region", { name: "DICOM 파일 놓기 영역" });
    await expect(zone).toHaveTextContent("DICOM 파일을 여기에 놓으세요");
    await expect(zone).toHaveTextContent(
      "여러 파일이나 폴더를 한 번에 가져올 수 있습니다.",
    );
    await expect(zone).toHaveAttribute("data-dragging", "false");
  },
};

export const DropFiles: Story = {
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("region", { name: "DICOM 파일 놓기 영역" });
    const file = new File(["x"], "dropped.dcm");
    // 스크립트로 만든 DataTransfer 는 신뢰되지 않은 이벤트에서 내용을 읽을 수 없으므로
    // 브라우저 드롭과 같은 형태(files, 항목 API 없음)의 dataTransfer 를 이벤트에 붙인다.
    const dropEvent = (type: "dragover" | "drop") => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { files: [file], items: [], types: ["Files"] },
      });
      return event;
    };
    fireEvent(zone, dropEvent("dragover"));
    await expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent(zone, dropEvent("drop"));
    const onFiles = args.onFiles as Mock;
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    const [[received]] = onFiles.mock.calls as [[File[]]];
    await expect(received.map((item) => item.name)).toEqual(["dropped.dcm"]);
    await expect(zone).toHaveAttribute("data-dragging", "false");
  },
};

/** 폴더 항목 읽기가 거부되면(권한·읽기 오류) 사용자에게 실패를 표시하고 파일을 넘기지 않는다. */
export const DropReadError: Story = {
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("region", { name: "DICOM 파일 놓기 영역" });
    const deniedFolder = {
      isFile: false,
      isDirectory: true,
      name: "locked",
      createReader: () => ({
        readEntries: (_resolve: unknown, reject: (error: unknown) => void) =>
          reject(
            new DOMException(
              "A requested file or directory could not be found",
              "NotFoundError",
            ),
          ),
      }),
    };
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [],
        items: [{ kind: "file", webkitGetAsEntry: () => deniedFolder }],
        types: ["Files"],
      },
    });
    fireEvent(zone, drop);

    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(
      "놓은 파일이나 폴더를 읽지 못했습니다",
    );
    await expect(alert).toHaveTextContent("NotFoundError");
    await expect(args.onFiles).not.toHaveBeenCalled();
  },
};

export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("region", { name: "DICOM 파일 놓기 영역" });
    await expect(zone).toHaveTextContent("가져오는 중입니다…");
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["x"], "x"));
    fireEvent.drop(zone, { dataTransfer });
    await expect(args.onFiles).not.toHaveBeenCalled();
  },
};
