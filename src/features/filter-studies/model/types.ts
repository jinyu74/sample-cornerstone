import type { WorkStatus } from "@/entities/dicom-study";

export type WorkStatusFilter = WorkStatus | "all";

export interface StudyFilter {
  query: string;
  status: WorkStatusFilter;
}
