import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "shared/ui/Card",
  component: Card,
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>제목</h2>
        </CardTitle>
        <CardDescription>설명 문구</CardDescription>
      </CardHeader>
      <CardContent>본문</CardContent>
      <CardFooter>바닥글</CardFooter>
    </Card>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "제목" })).toBeVisible();
    await expect(canvas.getByText("설명 문구")).toBeVisible();
    await expect(canvas.getByText("본문")).toBeVisible();
  },
};
