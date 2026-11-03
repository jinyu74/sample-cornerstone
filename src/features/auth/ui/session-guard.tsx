"use client";

import { checkSession } from "../api/check-session";
import { useSessionUser } from "../model/session-user-context";
import { useSessionGuard } from "../model/use-session-guard";

/**
 * 보호 화면에 두어, 세션이 만료·로그아웃·계정 변경되면 문서 전체를 로그인으로 바꾼다.
 * (클라이언트 이동이 아닌 전체 이동이라 이전 계정의 영상 캐시·화면 상태가 메모리에 남지 않는다)
 */
export function SessionGuard() {
  const user = useSessionUser();
  useSessionGuard({
    userId: user.id,
    check: () => checkSession(),
    onInvalid: () => {
      const here = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(here)}`);
    },
  });
  return null;
}
