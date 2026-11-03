"use client";

import { useEffect, useEffectEvent } from "react";

import type { SessionCheck } from "./session-check";

export type InvalidReason = "unauthenticated" | "user-changed" | "signed-out";

const CHANNEL = "dicom-annotator:auth";
const SIGNED_OUT = "signed-out";
export const SESSION_CHECK_INTERVAL_MS = 60_000;

/** 같은 브라우저의 다른 탭에 로그아웃을 알린다 */
export function notifySignedOut(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: SIGNED_OUT });
  channel.close();
}

export interface UseSessionGuardOptions {
  /** 서버가 이 화면을 렌더링할 때 검증한 계정 ID */
  userId: string;
  check: () => Promise<SessionCheck>;
  /** 보호 화면을 떠나야 할 때 한 번 호출된다 */
  onInvalid: (reason: InvalidReason) => void;
  intervalMs?: number;
}

/**
 * 이미 열린 보호 화면이 서버 세션 만료·로그아웃·계정 변경 뒤에도 남지 않도록 다시 검증한다.
 * 검증 시점: 주기(intervalMs), 창 포커스, 탭이 다시 보일 때, bfcache 복원(pageshow persisted),
 * 다른 탭의 로그아웃 알림(즉시 무효). 인증 서비스 오류는 성공으로도 로그아웃으로도 보지 않는다.
 */
export function useSessionGuard({
  userId,
  check,
  onInvalid,
  intervalMs = SESSION_CHECK_INTERVAL_MS,
}: UseSessionGuardOptions): void {
  const runCheck = useEffectEvent(check);
  const invalidate = useEffectEvent(onInvalid);

  useEffect(() => {
    let active = true;
    let done = false;
    let checking = false;

    const leave = (reason: InvalidReason) => {
      if (!active || done) return;
      done = true;
      invalidate(reason);
    };

    const verify = async () => {
      if (!active || done || checking) return;
      checking = true;
      try {
        const result = await runCheck();
        if (result.status === "unauthenticated") leave("unauthenticated");
        else if (result.status === "ok" && result.userId !== userId)
          leave("user-changed");
      } finally {
        checking = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void verify();
    };
    const onFocus = () => void verify();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void verify();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => void verify(), intervalMs);

    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel(CHANNEL);
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === SIGNED_OUT
        )
          leave("signed-out");
      };
    }

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.close();
    };
  }, [userId, intervalMs]);
}
