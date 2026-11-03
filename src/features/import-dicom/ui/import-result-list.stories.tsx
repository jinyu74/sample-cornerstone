import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ImportResultList } from "./import-result-list";

const meta = {
  title: "features/import-dicom/ImportResultList",
  component: ImportResultList,
} satisfies Meta<typeof ImportResultList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { phase: "idle" },
  play: async ({ canvas }) => expect(canvas.queryByRole("status")).toBeNull(),
};

export const Running: Story = {
  args: { phase: "running", progress: { completed: 3, total: 6 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "가져오는 중 3 / 6",
    );
    await expect(
      canvas.getByRole("progressbar", { name: "가져오기 진행률" }),
    ).toHaveAttribute("aria-valuenow", "3");
  },
};

export const AllImported: Story = {
  args: {
    phase: "done",
    progress: { completed: 2, total: 2 },
    report: {
      summary: { imported: 2, duplicate: 0, conflict: 0, failed: 0 },
      results: [
        { fileName: "a.dcm", status: "imported" },
        { fileName: "b.dcm", status: "imported" },
      ],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "가져오기 완료: 저장 2 · 중복 0 · 충돌 0 · 실패 0 (이 브라우저에만 저장)",
    );
    await expect(
      canvas.queryByRole("list", { name: "가져오기 결과" }),
    ).toBeNull();
  },
};

export const WithProblems: Story = {
  args: {
    phase: "done",
    progress: { completed: 4, total: 4 },
    report: {
      summary: { imported: 1, duplicate: 1, conflict: 1, failed: 1 },
      results: [
        { fileName: "ok.dcm", status: "imported" },
        { fileName: "again.dcm", status: "duplicate" },
        { fileName: "changed.dcm", status: "conflict" },
        { fileName: "fake.dcm", status: "failed", reason: "not-dicom" },
      ],
    },
  },
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "가져오기 결과" });
    const items = list.querySelectorAll("li");
    await expect(items).toHaveLength(3);
    await expect(list).toHaveTextContent("fake.dcm");
    await expect(list).toHaveTextContent("DICOM 파일이 아닙니다");
    await expect(list).toHaveTextContent("기존 파일을 유지했습니다");
    await expect(list).not.toHaveTextContent("ok.dcm");
  },
};

export const StorageFailure: Story = {
  args: {
    phase: "done",
    progress: { completed: 1, total: 1 },
    report: {
      summary: { imported: 0, duplicate: 0, conflict: 0, failed: 1 },
      results: [
        {
          fileName: "big.dcm",
          status: "failed",
          reason: "storage-quota-exceeded",
        },
      ],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("list", { name: "가져오기 결과" }),
    ).toHaveTextContent("브라우저 저장 용량이 부족해 저장하지 못했습니다");
  },
};
