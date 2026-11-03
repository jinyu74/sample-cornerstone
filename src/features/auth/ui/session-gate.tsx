"use client";

import type { ReactNode } from "react";

import { checkSession } from "../api/check-session";
import type { SessionCheck } from "../model/session-check";
import { useSessionEnd } from "../model/use-session-end";
import { useSessionUser } from "../model/session-user-context";

import { SessionEndedNotice } from "./session-ended-notice";

export { LEAVE_TIMEOUT_MS } from "../model/use-session-end";

export interface SessionGateProps {
  children: ReactNode;
  check?: () => Promise<SessionCheck>;
  /** 보호 화면을 치운 뒤 문서 이동 전에 기다릴 정리(최대 3초, 실패해도 차단 유지) */
  beforeLeave?: () => Promise<void>;
  navigate?: (href: string) => void;
  leaveTimeoutMs?: number;
}

const replaceLocation = (href: string) => window.location.replace(href);

/**
 * 보호 화면 전체를 감싼다. 세션이 끝나면 보호 화면 대신 로그인 안내를 렌더링한다
 * (상태·이탈 순서는 useSessionEnd). 보호 화면을 치우면 미저장 확인(beforeunload)도 해제된다.
 */
export function SessionGate({
  children,
  check = checkSession,
  beforeLeave,
  navigate = replaceLocation,
  leaveTimeoutMs,
}: SessionGateProps) {
  const user = useSessionUser();
  const ended = useSessionEnd({
    userId: user.id,
    check,
    beforeLeave,
    navigate,
    leaveTimeoutMs,
  });
  if (ended) return <SessionEndedNotice {...ended} />;
  return children;
}
