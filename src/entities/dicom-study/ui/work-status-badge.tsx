import { Badge } from "@/shared/ui/badge";

import type { ListWorkStatus } from "../model/types";

const PRESENTATION: Record<
  ListWorkStatus,
  { label: string; variant: "secondary" | "warning" | "success" | "outline" }
> = {
  untouched: { label: "미작업", variant: "secondary" },
  "in-progress": { label: "작업 중", variant: "warning" },
  done: { label: "완료", variant: "success" },
  checking: { label: "확인 중", variant: "outline" },
  // 작업 결과는 기록한 브라우저에만 있다. 다른 브라우저 작업을 미작업이라 단정하지 않는다.
  unknown: { label: "이 브라우저 기록 없음", variant: "outline" },
};

export interface WorkStatusBadgeProps {
  status: ListWorkStatus;
}

export function WorkStatusBadge({ status }: WorkStatusBadgeProps) {
  const { label, variant } = PRESENTATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}
