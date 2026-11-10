import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import type { StudyTableRow } from "../model/types";

import { StudyTable } from "./study-table";

/** 컴포넌트 시연용 합성 행(실제 검사 아님) */
const base = {
  studyDate: "20261102",
  displayDate: "2026.11.02",
  modalities: ["CT"],
  seriesCount: 3,
};
const local: StudyTableRow = {
  ...base,
  studyInstanceUid: "2.25.1",
  identifier: "SYN-CT-001",
  workStatus: "in-progress",
  originals: { kind: "complete", total: 3 },
  localOriginals: 3,
  sync: { kind: "synced" },
  serverOriginals: { kind: "summary", stored: 3, total: 3 },
  uploadableOriginals: 0,
  downloadableOriginals: 0,
};
const other: StudyTableRow = {
  studyInstanceUid: "2.25.2",
  displayDate: "—",
  identifier: "SYN-MR-001",
  modalities: ["MR", "SR"],
  seriesCount: 1,
  workStatus: "untouched",
  originals: { kind: "complete", total: 1 },
  localOriginals: 1,
  sync: { kind: "synced" },
  serverOriginals: { kind: "summary", stored: 0, total: 1 },
  uploadableOriginals: 1,
  downloadableOriginals: 0,
};
const row = (overrides: Partial<StudyTableRow>): StudyTableRow => ({
  ...local,
  ...overrides,
});

const meta = {
  title: "widgets/StudyTable",
  component: StudyTable,
  args: {
    status: "ready",
    items: [local, other],
    getStudyHref: (uid: string) => `/studies/${uid}`,
    onSync: fn(),
    onImportOriginals: fn(),
    onUploadOriginals: fn(),
    onDownloadOriginals: fn(),
  },
} satisfies Meta<typeof StudyTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const table = canvas.getByRole("table", { name: "검사 목록" });
    await expect(table).toBeVisible();
    // 시각 검수 회귀: 브라우저 기본 serif(Times) 가 아니라 한국어 시스템 sans 스택을 쓴다.
    await expect(getComputedStyle(table).fontFamily).toContain(
      "Apple SD Gothic Neo",
    );
    await expect(getComputedStyle(table).fontFamily).toContain("sans-serif");
    for (const header of [
      "검사 날짜",
      "검사 식별자",
      "Modality",
      "시리즈",
      "이 브라우저 원본",
      "서버 목록",
      "서버 원본",
      "작업 상태",
    ]) {
      await expect(
        canvas.getByRole("columnheader", { name: header }),
      ).toBeVisible();
    }
    const rows = canvas.getAllByRole("row");
    await expect(rows).toHaveLength(3);
    await expect(rows[1]).toHaveTextContent("2026.11.02");
    await expect(rows[1]).toHaveTextContent("3개");
    await expect(rows[1]).toHaveTextContent("작업 중");
    await expect(rows[1]).toHaveTextContent("원본 있음");
    await expect(rows[1]).toHaveTextContent("반영됨");
    await expect(rows[2]).toHaveTextContent("MR, SR");
    const open = canvas.getByRole("link", { name: "SYN-CT-001 검사 열기" });
    await expect(open).toHaveAttribute("href", "/studies/2.25.1");
    // 시각 검수 회귀: 테두리 있는 보조 버튼으로 보여야 한다(클래스 충돌로 투명 테두리 금지).
    await expect(getComputedStyle(open).borderTopColor).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    await userEvent.tab();
    await expect(open).toHaveFocus();
  },
};

/** 최초 HTML(서버 목록): 이 브라우저 원본·작업 상태는 아직 모른다. 열린다고 표시하지 않는다 */
export const CheckingLocal: Story = {
  args: {
    items: [
      row({
        workStatus: "checking",
        localOriginals: 0,
        originals: { kind: "checking" },
        sync: { kind: "checking" },
      }),
    ],
  },
  play: async ({ canvas }) => {
    const [, first] = canvas.getAllByRole("row");
    await expect(first).toHaveTextContent("원본 확인 중");
    await expect(canvas.queryByRole("link", { name: /검사 열기/ })).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "SYN-CT-001 검사 열기" }),
    ).toBeDisabled();
  },
};

/** 같은 계정의 새 브라우저: 서버 검사 정보는 보이지만 원본이 없다 */
export const ServerOnlyMissing: Story = {
  args: {
    items: [
      row({
        workStatus: "unknown",
        localOriginals: 0,
        originals: { kind: "missing", total: 3 },
        sync: { kind: "synced" },
      }),
    ],
  },
  play: async ({ canvas, args, userEvent }) => {
    const [, first] = canvas.getAllByRole("row");
    await expect(first).toHaveTextContent("원본 없음");
    await expect(first).toHaveTextContent("이 브라우저 기록 없음");
    await expect(first).not.toHaveTextContent("미작업");
    await expect(canvas.queryByRole("link", { name: /검사 열기/ })).toBeNull();
    const reimport = canvas.getByRole("button", {
      name: "SYN-CT-001 원본 가져오기",
    });
    await userEvent.tab();
    await expect(reimport).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onImportOriginals).toHaveBeenCalledTimes(1);
  },
};

export const PartialOriginals: Story = {
  args: {
    items: [
      row({
        originals: { kind: "partial", present: 1, total: 3 },
        localOriginals: 1,
      }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("일부 원본 1/3")).toBeVisible();
    // 있는 원본은 열 수 있고, 없는 원본도 다시 가져올 수 있다
    await expect(
      canvas.getByRole("link", { name: "SYN-CT-001 검사 열기" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "SYN-CT-001 원본 가져오기" }),
    ).toBeVisible();
  },
};

/** 새 브라우저에서 서버 기록에 없는 영상만 가져왔고 반영이 실패한 경우: 원본 없음으로 보이지 않고 열 수 있다 */
export const LocalOriginalsNotOnServer: Story = {
  args: {
    items: [
      row({
        workStatus: "untouched",
        originals: { kind: "missing", total: 1 },
        localOriginals: 1,
        sync: { kind: "failed", reason: "unavailable" },
      }),
    ],
  },
  play: async ({ canvas }) => {
    const [, first] = canvas.getAllByRole("row");
    await expect(first).toHaveTextContent("서버 영상 0/1 · 이 브라우저 1개");
    await expect(first).not.toHaveTextContent("원본 없음");
    await expect(first).toHaveTextContent("미작업");
    await expect(
      canvas.getByRole("link", { name: "SYN-CT-001 검사 열기" }),
    ).toHaveAttribute("href", "/studies/2.25.1");
  },
};

export const MismatchedOriginals: Story = {
  args: {
    items: [
      row({
        originals: { kind: "mismatch", mismatched: 1, present: 2, total: 3 },
      }),
    ],
  },
  play: async ({ canvas }) =>
    expect(canvas.getByText("내용 불일치 1개")).toBeVisible(),
};

/** 기존 계정 로컬 검사(서버 미반영)는 숨기지 않고 명시적으로 반영할 수 있다 */
export const Unsynced: Story = {
  args: { items: [row({ sync: { kind: "unsynced", count: 3 } })] },
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByText("미반영 3개")).toBeVisible();
    const button = canvas.getByRole("button", {
      name: "SYN-CT-001 서버 목록에 반영",
    });
    await userEvent.click(button);
    await expect(args.onSync).toHaveBeenCalledWith("2.25.1");
  },
};

export const Syncing: Story = {
  args: { items: [row({ sync: { kind: "syncing" } })] },
  play: async ({ canvas }) => {
    const [, first] = canvas.getAllByRole("row");
    await expect(within(first!).getByRole("status")).toHaveTextContent(
      "반영 중",
    );
    await expect(
      canvas.queryByRole("button", { name: /서버 목록에 반영|다시 시도/ }),
    ).toBeNull();
  },
};

export const SyncFailedRetry: Story = {
  args: {
    items: [row({ sync: { kind: "failed", reason: "network" } })],
  },
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByText("서버 반영 실패")).toBeVisible();
    await expect(
      canvas.getByText("네트워크 오류. 원본은 이 브라우저에 그대로 있습니다."),
    ).toBeVisible();
    const retry = canvas.getByRole("button", { name: "SYN-CT-001 다시 시도" });
    retry.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSync).toHaveBeenCalledWith("2.25.1");
  },
};

/** 재시도해도 같은 결과인 실패는 다시 시도 버튼 없이 이유를 알린다 */
export const SyncConflict: Story = {
  args: {
    items: [
      row({
        sync: { kind: "failed", reason: "conflict", conflict: "instance" },
      }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "서버 기록과 같은 UID 의 내용이 달라 반영하지 않았습니다.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /다시 시도/ }),
    ).toBeNull();
  },
};

export const ServerListUnavailable: Story = {
  args: { items: [row({ sync: { kind: "unknown" } })] },
  play: async ({ canvas }) =>
    expect(canvas.getByText("서버 목록 확인 불가")).toBeVisible(),
};

/** 검사별 서버 원본 보관·불러오기는 그 행의 버튼을 누를 때만 그 검사에 대해 시작한다 */
export const ServerOriginalsActions: Story = {
  args: {
    items: [
      row({
        serverOriginals: { kind: "summary", stored: 1, total: 3 },
        uploadableOriginals: 2,
        downloadableOriginals: 0,
      }),
      row({
        studyInstanceUid: "2.25.9",
        identifier: "SYN-NEW-BROWSER",
        localOriginals: 0,
        originals: { kind: "missing", total: 3 },
        workStatus: "unknown",
        serverOriginals: { kind: "summary", stored: 3, total: 3 },
        uploadableOriginals: 0,
        downloadableOriginals: 3,
      }),
    ],
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "SYN-CT-001 서버에 원본 보관" }),
    );
    await expect(args.onUploadOriginals).toHaveBeenCalledWith("2.25.1");
    await userEvent.click(
      canvas.getByRole("button", {
        name: "SYN-NEW-BROWSER 서버에서 원본 불러오기",
      }),
    );
    await expect(args.onDownloadOriginals).toHaveBeenCalledWith("2.25.9");
    await expect(canvas.getByText("보관됨 3/3")).toBeVisible();
  },
};

/** 이 브라우저 원본 확인 전(최초 HTML)에는 보관 수만 보이고 동작은 비활성 */
export const ServerOriginalsChecking: Story = {
  args: {
    items: [
      row({
        workStatus: "checking",
        localOriginals: 0,
        originals: { kind: "checking" },
        sync: { kind: "checking" },
        serverOriginals: { kind: "summary", stored: 3, total: 3 },
        uploadableOriginals: 0,
        downloadableOriginals: 0,
      }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("보관됨 3/3")).toBeVisible();
    await expect(
      canvas.queryByRole("button", {
        name: /서버에서 원본 불러오기|서버에 원본 보관/,
      }),
    ).toBeNull();
  },
};

export const Loading: Story = {
  args: { status: "loading", items: [] },
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status")).toHaveTextContent(
      "검사 목록을 불러오는 중",
    ),
};

export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("가져온 검사가 없습니다")).toBeVisible();
    await expect(
      canvas.getByText(
        "DICOM 파일을 가져오면 이 브라우저에 저장되어 여기에 표시됩니다.",
      ),
    ).toBeVisible();
  },
};

export const NoFilterMatch: Story = {
  args: { items: [], filtered: true },
  play: async ({ canvas }) =>
    expect(canvas.getByText("조건에 맞는 검사가 없습니다")).toBeVisible(),
};

export const Error: Story = {
  args: {
    status: "error",
    items: [],
    error: "이 브라우저에서 IndexedDB 를 사용할 수 없습니다",
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent("로컬 저장소를 읽지 못했습니다");
    await expect(alert).toHaveTextContent("IndexedDB");
  },
};
