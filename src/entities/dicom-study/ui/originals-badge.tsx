import { Badge } from "@/shared/ui/badge";

import type { OriginalsView } from "../model/catalog-compare";

export interface OriginalsBadgeProps {
  status: OriginalsView;
  /** 이 브라우저에 실제로 있는 이 검사의 원본 수(서버 기록에 없는 것 포함) */
  localCount?: number;
}

function present(
  status: OriginalsView,
  localCount: number,
): {
  label: string;
  variant: "secondary" | "warning" | "success" | "destructive" | "outline";
} {
  switch (status.kind) {
    case "checking":
      return { label: "원본 확인 중", variant: "outline" };
    case "complete":
      return { label: "원본 있음", variant: "success" };
    case "partial":
      return {
        label: `일부 원본 ${status.present}/${status.total}`,
        variant: "warning",
      };
    case "missing":
      // 서버 기록의 영상은 없어도 이 브라우저에 미반영 원본이 있으면 "원본 없음"이 아니다
      return localCount > 0
        ? {
            label: `서버 영상 0/${status.total} · 이 브라우저 ${localCount}개`,
            variant: "warning",
          }
        : { label: "원본 없음", variant: "secondary" };
    case "mismatch":
      return {
        label: `내용 불일치 ${status.mismatched}개`,
        variant: "destructive",
      };
    case "unreadable":
      return { label: "원본 확인 실패", variant: "destructive" };
  }
}

/** 서버 목록 검사의 원본이 이 브라우저에 있는지(있음·일부·없음·불일치, 서버 미반영 로컬 원본) */
export function OriginalsBadge({
  status,
  localCount = 0,
}: OriginalsBadgeProps) {
  const { label, variant } = present(status, localCount);
  return <Badge variant={variant}>{label}</Badge>;
}
