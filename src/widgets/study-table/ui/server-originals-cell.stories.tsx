import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { ServerOriginalsCell } from "./server-originals-cell";

/** 검사별 서버 원본 보관 상태와 보관·불러오기 동작(사용자가 누른 검사만 처리) */
const meta = {
  title: "widgets/StudyTable/ServerOriginalsCell",
  component: ServerOriginalsCell,
  args: {
    identifier: "SYN-CT-001",
    status: { kind: "summary", stored: 0, total: 3 },
    uploadable: 3,
    downloadable: 0,
    onUpload: fn(),
    onDownload: fn(),
  },
} satisfies Meta<typeof ServerOriginalsCell>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 아직 보내지 않았으면 보관됨으로 보이지 않고, 누를 때만 보관한다 */
export const NotStored: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByText("서버 원본 없음")).toBeVisible();
    await expect(canvas.queryByText(/보관됨/)).toBeNull();
    const button = canvas.getByRole("button", {
      name: "SYN-CT-001 서버에 원본 보관",
    });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onUpload).toHaveBeenCalledTimes(1);
  },
};

export const Partial: Story = {
  args: { status: { kind: "summary", stored: 1, total: 3 }, uploadable: 2 },
  play: async ({ canvas }) =>
    expect(canvas.getByText("일부 보관 1/3")).toBeVisible(),
};

export const Stored: Story = {
  args: { status: { kind: "summary", stored: 3, total: 3 }, uploadable: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("보관됨 3/3")).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

/** 새 브라우저: 서버에 보관된 원본을 직접 파일 선택 없이 불러온다 */
export const Downloadable: Story = {
  args: {
    status: { kind: "summary", stored: 3, total: 3 },
    uploadable: 0,
    downloadable: 3,
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "SYN-CT-001 서버에서 원본 불러오기" }),
    );
    await expect(args.onDownload).toHaveBeenCalledTimes(1);
  },
};

export const Uploading: Story = {
  args: {
    status: { kind: "running", direction: "upload", done: 1, total: 3 },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("보관 중 1/3");
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const Downloading: Story = {
  args: {
    status: { kind: "running", direction: "download", done: 2, total: 3 },
  },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status")).toHaveTextContent("불러오는 중 2/3"),
};

export const UploadFailedRetry: Story = {
  args: {
    status: {
      kind: "failed",
      direction: "upload",
      reason: "network",
      done: 1,
      total: 3,
    },
  },
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByText("보관 실패 1/3")).toBeVisible();
    await expect(
      canvas.getByText("네트워크 오류. 이 브라우저 원본은 그대로 있습니다."),
    ).toBeVisible();
    const retry = canvas.getByRole("button", { name: "SYN-CT-001 다시 보관" });
    retry.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onUpload).toHaveBeenCalledTimes(1);
  },
};

/** 재시도해도 같은 결과인 실패는 다시 시도 버튼 없이 이유만 알린다 */
export const UploadConflict: Story = {
  args: {
    status: {
      kind: "failed",
      direction: "upload",
      reason: "conflict",
      done: 0,
      total: 1,
    },
    uploadable: 1,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "서버 기록과 같은 UID 의 내용이 달라 보관하지 않았습니다.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /다시 보관/ }),
    ).toBeNull();
  },
};

export const DownloadIntegrityFailed: Story = {
  args: {
    status: {
      kind: "failed",
      direction: "download",
      reason: "integrity",
      done: 0,
      total: 2,
    },
    downloadable: 2,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("불러오기 실패 0/2")).toBeVisible();
    await expect(
      canvas.getByText("받은 내용이 서버 기록과 달라 저장하지 않았습니다."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "SYN-CT-001 다시 불러오기" }),
    ).toBeVisible();
  },
};

export const Unconfigured: Story = {
  args: { status: { kind: "unconfigured" }, uploadable: 3 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("서버 보관 사용 안 함")).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const Unavailable: Story = {
  args: { status: { kind: "unavailable" }, uploadable: 3 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("서버 원본 확인 불가")).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

/** 이 브라우저 원본을 확인하기 전(최초 HTML)에는 동작을 비활성으로 둔다 */
export const Checking: Story = {
  args: { status: { kind: "summary", stored: 1, total: 3 }, disabled: true },
  play: async ({ canvas }) =>
    expect(
      canvas.getByRole("button", { name: "SYN-CT-001 서버에 원본 보관" }),
    ).toBeDisabled(),
};
