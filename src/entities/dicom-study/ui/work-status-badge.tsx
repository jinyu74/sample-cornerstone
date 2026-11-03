import { Badge } from "@/shared/ui/badge";

import type { WorkStatus } from "../model/types";

const PRESENTATION: Record<
  WorkStatus,
  { label: string; variant: "secondary" | "warning" | "success" }
> = {
  untouched: { label: "미작업", variant: "secondary" },
  "in-progress": { label: "작업 중", variant: "warning" },
  done: { label: "완료", variant: "success" },
};

export interface WorkStatusBadgeProps {
  status: WorkStatus;
}

export function WorkStatusBadge({ status }: WorkStatusBadgeProps) {
  const { label, variant } = PRESENTATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}
