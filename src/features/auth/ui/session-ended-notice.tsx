import { LogInIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { buttonVariants } from "@/shared/ui/button";

import type { InvalidReason } from "../model/use-session-guard";

const MESSAGES: Record<InvalidReason, { title: string; description: string }> =
  {
    unauthenticated: {
      title: "세션이 만료되었습니다",
      description: "보안을 위해 작업 화면을 닫았습니다. 다시 로그인하세요.",
    },
    "user-changed": {
      title: "다른 계정으로 바뀌었습니다",
      description:
        "이전 계정의 영상과 결과를 보호하기 위해 작업 화면을 닫았습니다. 다시 로그인하세요.",
    },
    "signed-out": {
      title: "다른 탭에서 로그아웃했습니다",
      description: "작업 화면을 닫았습니다. 계속하려면 다시 로그인하세요.",
    },
  };

export interface SessionEndedNoticeProps {
  reason: InvalidReason;
  /** 로그인 화면 주소(문서 전체 이동) */
  loginHref: string;
}

/** 세션이 끝나 보호 화면을 닫은 뒤 보여 주는 안내. 로그인 이동이 막혀도 이 안내만 남는다. */
export function SessionEndedNotice({
  reason,
  loginHref,
}: SessionEndedNoticeProps) {
  const message = MESSAGES[reason];
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Alert>
          <AlertTitle>{message.title}</AlertTitle>
          <AlertDescription>{message.description}</AlertDescription>
        </Alert>
        {/* 클라이언트 이동이 아닌 문서 전체 이동으로 이전 계정의 메모리 상태를 남기지 않는다 */}
        <a href={loginHref} className={buttonVariants()}>
          <LogInIcon aria-hidden data-icon="inline-start" />
          로그인 화면으로 이동
        </a>
      </div>
    </main>
  );
}
