import type { Metadata } from "next";

import { ViewerWorkspacePage } from "@/views/viewer-workspace";

export const metadata: Metadata = { title: "영상 작업 · DICOM 작업실" };

export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyUid: string }>;
  searchParams: Promise<{ series?: string | string[] }>;
}) {
  const { studyUid } = await params;
  const { series } = await searchParams;
  return (
    <ViewerWorkspacePage
      studyInstanceUid={decodeURIComponent(studyUid)}
      seriesInstanceUid={typeof series === "string" ? series : undefined}
    />
  );
}
