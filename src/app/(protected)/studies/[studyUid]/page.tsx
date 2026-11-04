import type { Metadata } from "next";

import { requireUser } from "@/shared/auth/server";
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
  const query =
    typeof series === "string" ? `?series=${encodeURIComponent(series)}` : "";
  await requireUser(
    `/studies/${encodeURIComponent(decodeURIComponent(studyUid))}${query}`,
  );
  return (
    <ViewerWorkspacePage
      studyInstanceUid={decodeURIComponent(studyUid)}
      seriesInstanceUid={typeof series === "string" ? series : undefined}
    />
  );
}
