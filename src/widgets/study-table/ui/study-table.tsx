import { FileUpIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import { OriginalsBadge, WorkStatusBadge } from "@/entities/dicom-study";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button, buttonVariants } from "@/shared/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty";
import { Spinner } from "@/shared/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

import type { StudyTableRow } from "../model/types";

import { ServerOriginalsCell } from "./server-originals-cell";
import { SyncCell } from "./sync-cell";

export interface StudyTableProps {
  /** 이 브라우저 저장소 읽기 상태. 보여 줄 행(서버 목록 등)이 있으면 loading 이어도 행을 그린다 */
  status: "loading" | "ready" | "error";
  items: readonly StudyTableRow[];
  error?: string;
  /** 저장된 검사는 있지만 필터 결과가 비었을 때 true */
  filtered?: boolean;
  getStudyHref: (studyInstanceUid: string) => string;
  /** 이 브라우저 원본의 메타데이터를 서버 목록에 반영(처음·다시 시도) */
  onSync?: (studyInstanceUid: string) => void;
  /** 이 브라우저에 없는 원본을 다시 가져오기 */
  onImportOriginals?: () => void;
  /** 그 검사의 이 브라우저 원본을 서버 비공개 폴더에 보관(사용자가 누를 때만) */
  onUploadOriginals?: (studyInstanceUid: string) => void;
  /** 그 검사의 서버 보관 원본을 이 브라우저로 불러오기 */
  onDownloadOriginals?: (studyInstanceUid: string) => void;
}

/** 서버 기록과 맞든 아니든 이 브라우저에 원본이 있으면 열 수 있다 */
const hasLocalOriginals = (row: StudyTableRow) =>
  row.originals.kind !== "checking" &&
  row.originals.kind !== "unreadable" &&
  row.localOriginals > 0;

const needsOriginals = (row: StudyTableRow) =>
  row.originals.kind === "missing" || row.originals.kind === "partial";

export function StudyTable({
  status,
  items,
  error,
  filtered = false,
  getStudyHref,
  onSync,
  onImportOriginals,
  onUploadOriginals,
  onDownloadOriginals,
}: StudyTableProps) {
  const alert =
    status === "error" ? (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>로컬 저장소를 읽지 못했습니다</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : null;

  if (items.length === 0) {
    if (status === "loading") {
      return (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-md border py-12 text-muted-foreground"
        >
          <Spinner aria-hidden role="presentation" />
          검사 목록을 불러오는 중
        </div>
      );
    }
    if (alert) return alert;
    return (
      <Empty className="rounded-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {filtered ? (
              <SearchXIcon aria-hidden />
            ) : (
              <FileUpIcon aria-hidden />
            )}
          </EmptyMedia>
          <EmptyTitle>
            {filtered
              ? "조건에 맞는 검사가 없습니다"
              : "가져온 검사가 없습니다"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "검색어나 작업 상태 필터를 바꿔 보세요."
              : "DICOM 파일을 가져오면 이 브라우저에 저장되어 여기에 표시됩니다."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alert}
      <div className="overflow-x-auto rounded-md border">
        <Table aria-label="검사 목록">
          <TableHeader className="bg-sidebar">
            <TableRow>
              <TableHead className="px-4">검사 날짜</TableHead>
              <TableHead>검사 식별자</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>시리즈</TableHead>
              <TableHead>이 브라우저 원본</TableHead>
              <TableHead>서버 목록</TableHead>
              <TableHead>서버 원본</TableHead>
              <TableHead>작업 상태</TableHead>
              <TableHead className="w-24 pr-4">
                <span className="sr-only">동작</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.studyInstanceUid}>
                <TableCell className="px-4 py-3">{item.displayDate}</TableCell>
                <TableCell className="max-w-64 truncate">
                  {item.identifier}
                </TableCell>
                <TableCell>{item.modalities.join(", ") || "—"}</TableCell>
                <TableCell>{item.seriesCount}개</TableCell>
                <TableCell>
                  <OriginalsBadge
                    status={item.originals}
                    localCount={item.localOriginals}
                  />
                </TableCell>
                <TableCell>
                  <SyncCell
                    sync={item.sync}
                    identifier={item.identifier}
                    onSync={
                      onSync ? () => onSync(item.studyInstanceUid) : undefined
                    }
                  />
                </TableCell>
                <TableCell>
                  <ServerOriginalsCell
                    identifier={item.identifier}
                    status={item.serverOriginals}
                    uploadable={item.uploadableOriginals}
                    downloadable={item.downloadableOriginals}
                    disabled={
                      item.originals.kind === "checking" ||
                      item.originals.kind === "unreadable"
                    }
                    onUpload={
                      onUploadOriginals
                        ? () => onUploadOriginals(item.studyInstanceUid)
                        : undefined
                    }
                    onDownload={
                      onDownloadOriginals
                        ? () => onDownloadOriginals(item.studyInstanceUid)
                        : undefined
                    }
                  />
                </TableCell>
                <TableCell>
                  <WorkStatusBadge status={item.workStatus} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex justify-end gap-2">
                    {needsOriginals(item) && onImportOriginals ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${item.identifier} 원본 가져오기`}
                        onClick={onImportOriginals}
                      >
                        원본 가져오기
                      </Button>
                    ) : null}
                    {hasLocalOriginals(item) ? (
                      <Link
                        href={getStudyHref(item.studyInstanceUid)}
                        aria-label={`${item.identifier} 검사 열기`}
                        className={buttonVariants({
                          variant: "accent-outline",
                          size: "sm",
                        })}
                      >
                        열기
                      </Link>
                    ) : item.originals.kind === "checking" ? (
                      <Button
                        variant="accent-outline"
                        size="sm"
                        disabled
                        aria-label={`${item.identifier} 검사 열기`}
                      >
                        열기
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
