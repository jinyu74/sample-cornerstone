"use client";

import { useEffect, useRef } from "react";

import { notifySignedOut } from "../model/use-session-guard";

/**
 * 서버 로그아웃이 끝나 로그인 화면(?signed_out=1)에 도착한 뒤 같은 브라우저의 다른 탭에 알린다.
 * 이 탭은 이미 보호 화면을 떠났으므로 다른 탭의 SessionGuard 만 로그인으로 이동한다.
 */
export function SignedOutNotifier(): null {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    notifySignedOut();
  }, []);
  return null;
}
