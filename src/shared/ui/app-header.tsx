import { SquareIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Separator } from "./separator";

export interface AppHeaderProps {
  /** 로고 오른쪽 탐색·제목 영역 */
  children?: ReactNode;
  /** 오른쪽 끝 동작 영역 */
  actions?: ReactNode;
}

/** 모든 화면 공통 상단 막대. 로컬 전용 작업 공간임을 항상 표시한다. */
export function AppHeader({ children, actions }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 rounded-md text-base font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SquareIcon
          aria-hidden
          className="text-brand size-5"
          strokeWidth={2.5}
        />
        DICOM 작업실
      </Link>
      {children ? (
        <>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex min-w-0 items-center gap-3">{children}</div>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          로컬 작업 공간
        </span>
        {actions}
      </div>
    </header>
  );
}
