import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { SeriesGroup } from "../model/types";

import { SeriesList } from "./series-list";

/** 컴포넌트 시연용 합성 시리즈(실제 영상 아님) */
function series(
  uid: string,
  seriesNumber: number,
  description: string | undefined,
  frameCount: number,
): SeriesGroup {
  return {
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: uid,
    seriesNumber,
    seriesDescription: description,
    modality: "CT",
    instances: [],
    instanceCount: frameCount,
    frameCount,
    stack: { ordered: [], method: "spatial", warnings: [] },
  };
}

const meta = {
  title: "entities/dicom-study/SeriesList",
  component: SeriesList,
  args: {
    onSelect: fn(),
    series: [
      series("2.25.10", 1, "Axial", 120),
      series("2.25.11", 2, undefined, 1),
    ],
    selectedSeriesUid: "2.25.10",
  },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
} satisfies Meta<typeof SeriesList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const nav = canvas.getByRole("navigation", { name: "시리즈" });
    await expect(nav).toBeVisible();
    const selected = canvas.getByRole("button", { name: /Axial · 120장/ });
    await expect(selected).toHaveAttribute("aria-current", "true");
    const other = canvas.getByRole("button", { name: /시리즈 2 · 1장/ });
    await expect(other).not.toHaveAttribute("aria-current");
    await userEvent.click(other);
    await expect(args.onSelect).toHaveBeenCalledWith("2.25.11");
  },
};

export const KeyboardSelection: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: /Axial/ })).toHaveFocus();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("2.25.11");
  },
};

export const Empty: Story = {
  args: { series: [], selectedSeriesUid: undefined },
  play: async ({ canvas }) =>
    expect(canvas.getByText("시리즈가 없습니다")).toBeVisible(),
};

export const WithThumbnails: Story = {
  args: {
    renderThumbnail: (item) => (
      <span
        data-testid={`thumb-${item.seriesInstanceUid}`}
        className="block size-14 rounded-sm bg-viewport"
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("thumb-2.25.10")).toBeVisible();
    await expect(canvas.getByTestId("thumb-2.25.11")).toBeVisible();
  },
};
