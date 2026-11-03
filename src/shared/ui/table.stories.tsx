import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = { title: "shared/ui/Table", component: Table } satisfies Meta<
  typeof Table
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>합성 예시</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>검사 날짜</TableHead>
          <TableHead>Modality</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>2026.11.02</TableCell>
          <TableCell>CT</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("table", { name: "합성 예시" }),
    ).toBeVisible();
    await expect(canvas.getAllByRole("row")).toHaveLength(2);
  },
};
