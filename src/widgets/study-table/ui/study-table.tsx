import { FileUpIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import { type StudyListItem, WorkStatusBadge } from "@/entities/dicom-study";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { buttonVariants } from "@/shared/ui/button";
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

export interface StudyTableProps {
  status: "loading" | "ready" | "error";
  items: readonly StudyListItem[];
  error?: string;
  /** 저장된 검사는 있지만 필터 결과가 비었을 때 true */
  filtered?: boolean;
  getStudyHref: (studyInstanceUid: string) => string;
}

export function StudyTable({
  status,
  items,
  error,
  filtered = false,
  getStudyHref,
}: StudyTableProps) {
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
  if (status === "error") {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>로컬 저장소를 읽지 못했습니다</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (items.length === 0) {
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
    <div className="overflow-hidden rounded-md border">
      <Table aria-label="검사 목록">
        <TableHeader className="bg-sidebar">
          <TableRow>
            <TableHead className="px-4">검사 날짜</TableHead>
            <TableHead>검사 식별자</TableHead>
            <TableHead>Modality</TableHead>
            <TableHead>시리즈</TableHead>
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
                <WorkStatusBadge status={item.workStatus} />
              </TableCell>
              <TableCell className="pr-4 text-right">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
