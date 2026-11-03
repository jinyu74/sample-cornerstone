import { Badge } from "@/shared/ui/badge";
import { Progress } from "@/shared/ui/progress";

import {
  describeImportResult,
  describeImportSummary,
} from "../lib/describe-result";
import type { ImportStatus } from "../model/types";
import type { DicomImportState } from "../model/use-dicom-import";

export type ImportResultListProps = Pick<
  DicomImportState,
  "phase" | "progress" | "report"
>;

const STATUS_BADGE: Record<
  Exclude<ImportStatus, "imported">,
  { label: string; variant: "secondary" | "warning" | "destructive" }
> = {
  duplicate: { label: "중복", variant: "secondary" },
  conflict: { label: "충돌", variant: "warning" },
  failed: { label: "실패", variant: "destructive" },
};

/** 가져오기 진행률과 결과. 성공 파일은 요약만, 문제 있는 파일은 이유와 함께 나열한다. */
export function ImportResultList({
  phase,
  progress,
  report,
}: ImportResultListProps) {
  if (phase === "idle") return null;

  const problems =
    report?.results.filter((result) => result.status !== "imported") ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-4">
      <div role="status" className="flex flex-col gap-2">
        {phase === "running" ? (
          <>
            <p className="font-medium">
              가져오는 중 {progress?.completed ?? 0} / {progress?.total ?? 0}
            </p>
            <Progress
              aria-label="가져오기 진행률"
              value={progress?.completed ?? 0}
              max={progress?.total ?? 1}
            />
          </>
        ) : report ? (
          <p className="font-medium">{describeImportSummary(report.summary)}</p>
        ) : null}
      </div>
      {problems.length > 0 ? (
        <ul
          aria-label="가져오기 결과"
          className="flex max-h-60 flex-col gap-1.5 overflow-y-auto"
        >
          {problems.map((result, index) => {
            const badge =
              STATUS_BADGE[result.status as Exclude<ImportStatus, "imported">];
            return (
              <li
                key={`${result.fileName}-${index}`}
                className="flex items-start gap-2"
              >
                <Badge variant={badge.variant}>{badge.label}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="font-medium break-all">
                    {result.fileName}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {describeImportResult(result)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
