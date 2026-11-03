import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { StudyListItem } from "@/entities/dicom-study";

import { StudyTable } from "./study-table";

/** 컴포넌트 시연용 합성 행(실제 검사 아님) */
const items: StudyListItem[] = [
  {
    studyInstanceUid: "2.25.1",
    studyDate: "20261102",
    displayDate: "2026.11.02",
    identifier: "SYN-CT-001",
    modalities: ["CT"],
    seriesCount: 3,
    workStatus: "in-progress",
  },
  {
    studyInstanceUid: "2.25.2",
    displayDate: "—",
    identifier: "SYN-MR-001",
    modalities: ["MR", "SR"],
    seriesCount: 1,
    workStatus: "untouched",
  },
];

const meta = {
  title: "widgets/StudyTable",
  component: StudyTable,
  args: {
    status: "ready",
    items,
    getStudyHref: (uid: string) => `/studies/${uid}`,
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
