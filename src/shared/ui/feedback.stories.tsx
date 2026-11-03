import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileUpIcon, TriangleAlertIcon } from "lucide-react";
import { expect } from "storybook/test";

import { Alert, AlertDescription, AlertTitle } from "./alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";
import { Separator } from "./separator";
import { Spinner } from "./spinner";

/** 상태 표시 primitive 모음: Alert, Empty, Spinner, Separator */
const meta = { title: "shared/ui/Feedback" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AlertDestructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>로컬 저장소를 읽지 못했습니다</AlertTitle>
      <AlertDescription>브라우저 설정을 확인하세요.</AlertDescription>
    </Alert>
  ),
  play: async ({ canvas }) =>
    expect(canvas.getByRole("alert")).toHaveTextContent(
      "로컬 저장소를 읽지 못했습니다",
    ),
};

export const AlertDefault: Story = {
  render: () => (
    <Alert>
      <AlertTitle>로컬 저장</AlertTitle>
      <AlertDescription>
        영상과 결과는 이 브라우저에만 저장됩니다.
      </AlertDescription>
    </Alert>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileUpIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>가져온 검사가 없습니다</EmptyTitle>
        <EmptyDescription>DICOM 파일을 가져오세요.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
  play: async ({ canvas }) =>
    expect(canvas.getByText("가져온 검사가 없습니다")).toBeVisible(),
};

export const Loading: Story = {
  render: () => <Spinner />,
  play: async ({ canvas }) =>
    expect(canvas.getByRole("status", { name: "불러오는 중" })).toBeVisible(),
};

export const Separators: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-2">
      <span>검사 목록</span>
      <Separator orientation="vertical" />
      <span>시리즈</span>
    </div>
  ),
};
