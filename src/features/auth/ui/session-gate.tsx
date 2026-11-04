"use client";

import { type ReactNode, useRef } from "react";

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
 * 보호 화면에서 포커스를 가진 입력을 blur 한다. 입력 칸은 보통 blur 때 값을 검증·반영하므로
 * (예: 메모·좌표 편집) 강제 제거 전에 그 경로를 동기로 실행해 입력 중인 값을 잃지 않는다.
 * 잘못된 값은 각 입력의 검증에서 걸러진다. 특정 기능을 알지 않는 일반 DOM 처리다.
 * focused 는 보호 화면의 React 트리(Portal 포함)에서 마지막으로 포커스를 받은 요소다.
 */
function commitFocusedInput(focused: HTMLElement | null): void {
  if (focused && focused.ownerDocument.activeElement === focused)
    focused.blur();
}

/**
 * 보호 화면 전체를 감싼다. 세션이 끝나면 입력 중인 값을 먼저 반영(blur)한 뒤 보호 화면 대신
 * 로그인 안내를 렌더링한다(상태·이탈 순서는 useSessionEnd). 보호 화면을 치우면 미저장 확인도 해제된다.
 */
export function SessionGate({
  children,
  check = checkSession,
  beforeLeave,
  navigate = replaceLocation,
  leaveTimeoutMs,
}: SessionGateProps) {
  const user = useSessionUser();
  // React 이벤트는 Portal(모바일 Sheet 등)을 거쳐도 React 트리로 전파되므로 DOM 위치와 무관하게 기억된다
  const lastFocused = useRef<HTMLElement | null>(null);
  const ended = useSessionEnd({
    userId: user.id,
    check,
    beforeLeave,
    navigate,
    leaveTimeoutMs,
    beforeEnd: () => commitFocusedInput(lastFocused.current),
  });
  if (ended) return <SessionEndedNotice {...ended} />;
  // 레이아웃에 영향을 주지 않는 경계(display: contents): 보호 화면(Portal 포함)의 포커스만 기억한다
  return (
    <div
      className="contents"
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement)
          lastFocused.current = event.target;
      }}
    >
      {children}
    </div>
  );
}
