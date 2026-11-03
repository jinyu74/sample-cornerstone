import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { Annotation } from "../model/types";

import { AnnotationList, type AnnotationListEntry } from "./annotation-list";

/** 컴포넌트 시연용 합성 주석(실제 측정 아님) */
const annotation = (
  id: string,
  overrides: Partial<Annotation> = {},
): Annotation => ({
  id,
  tool: "length",
  reference: {
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.2",
    sopInstanceUid: "2.25.3",
  },
  imagePoints: [
    [0, 0],
    [3, 4],
  ],
  note: "",
  visible: true,
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
  ...overrides,
});

const entries: AnnotationListEntry[] = [
  {
    annotation: annotation("a1", { labelId: "lesion-nodule", targetId: "t1" }),
    label: {
      id: "lesion-nodule",
      name: "결절",
      color: "#dc2626",
      category: "lesion",
    },
    target: { id: "t1", labelId: "lesion-nodule", name: "결절 1" },
    measurementText: "2.50 mm",
    locationText: "Axial · 영상 3/5",
  },
  {
    annotation: annotation("a2", {
      tool: "arrow",
      note: "확인 필요",
      visible: false,
    }),
    locationText: "Axial · 영상 1/5",
  },
];

const meta = {
  title: "entities/study-work/AnnotationList",
  component: AnnotationList,
  args: { entries, selectedId: "a1", onSelect: fn(), onToggleVisibility: fn() },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof AnnotationList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const list = canvas.getByRole("list", { name: "작업 결과" });
    await expect(list.querySelectorAll("li")).toHaveLength(2);
    const first = canvas.getByRole("button", { name: /결절 1.*2\.50 mm/ });
    await expect(first).toHaveAttribute("aria-current", "true");
    await expect(first).toHaveTextContent("길이 · 2.50 mm");
    await expect(first).toHaveTextContent("Axial · 영상 3/5");

    const memo = canvas.getByRole("button", { name: /확인 필요/ });
    await expect(memo).toHaveTextContent("확인 필요");
    await userEvent.click(memo);
    await expect(args.onSelect).toHaveBeenCalledWith("a2");

    await userEvent.click(
      canvas.getByRole("button", { name: "결절 1 숨기기" }),
    );
    await expect(args.onToggleVisibility).toHaveBeenCalledWith("a1", false);
    await userEvent.click(canvas.getByRole("button", { name: "메모 표시" }));
    await expect(args.onToggleVisibility).toHaveBeenCalledWith("a2", true);
  },
};

export const Empty: Story = {
  args: { entries: [] },
  play: async ({ canvas }) =>
    expect(canvas.getByText("아직 작업 결과가 없습니다")).toBeVisible(),
};
