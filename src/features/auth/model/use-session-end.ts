"use client";

import { useEffect, useEffectEvent, useState } from "react";

import type { SessionCheck } from "./session-check";
import { type InvalidReason, useSessionGuard } from "./use-session-guard";

/** 보호 화면을 치운 뒤 정리(계정 저장소의 진행 중·직렬 저장)를 기다리는 최대 시간 */
export const LEAVE_TIMEOUT_MS = 3_000;

export interface SessionEnd {
  reason: InvalidReason;
  /** 로그인 화면 주소(현재 경로를 next 로 담는다) */
  loginHref: string;
}

export interface UseSessionEndOptions {
  userId: string;
  check: () => Promise<SessionCheck>;
  /** 문서 이동 전에 기다릴 정리. 실패하거나 leaveTimeoutMs 를 넘기면 기다리지 않고 이동한다. */
  beforeLeave?: () => Promise<void>;
  navigate: (href: string) => void;
  leaveTimeoutMs?: number;
}

/**
 * 세션 종료 상태와 이탈 순서를 관리한다.
 * 1) 세션 무효(만료·계정 변경·다른 탭 로그아웃)를 감지하면 종료 상태를 기록한다(되돌리지 않는다).
 *    화면은 이 상태로 보호 콘텐츠를 즉시 치운다(fail-closed, 이동 성공 여부와 무관).
 * 2) 보호 콘텐츠가 언마운트된 커밋 뒤에 정리(beforeLeave)를 기다린다. 최대 leaveTimeoutMs.
 *    정리가 실패해도 종료 상태는 유지되며 바로 이동한다.
 * 3) 로그인 화면으로 이동한다. 이동이 취소돼도 종료 상태는 남아 보호 콘텐츠가 되살아나지 않는다.
 */
export function useSessionEnd({
  userId,
  check,
  beforeLeave,
  navigate,
  leaveTimeoutMs = LEAVE_TIMEOUT_MS,
}: UseSessionEndOptions): SessionEnd | undefined {
  const [ended, setEnded] = useState<SessionEnd>();

  useSessionGuard({
    userId,
    check,
    onInvalid: (reason) => {
      const here = `${window.location.pathname}${window.location.search}`;
      setEnded({
        reason,
        loginHref: `/login?next=${encodeURIComponent(here)}`,
      });
    },
  });

  /** 정리 완료(또는 제한 시간)를 기다렸다가 이동한다. 돌려준 함수로 취소한다. */
  const leaveAfterCleanup = useEffectEvent((href: string) => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, leaveTimeoutMs);
    });
    const settled = (beforeLeave?.() ?? Promise.resolve()).catch(
      () => undefined,
    );
    void Promise.race([settled, timeout]).then(() => {
      clearTimeout(timer);
      if (!cancelled) navigate(href);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  const loginHref = ended?.loginHref;
  useEffect(() => {
    if (!loginHref) return;
    return leaveAfterCleanup(loginHref);
  }, [loginHref]);

  return ended;
}
