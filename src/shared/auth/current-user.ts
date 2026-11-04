import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createServerSupabase } from "@/shared/api/supabase/server";
import { LOGIN_PATH, safeNextPath } from "@/shared/lib/navigation";

import { classifyUserLookupError } from "./classify-auth-error";
import type { SessionUser } from "./session-user";

/** 인증 서비스에 연결하지 못해 로그인 여부를 확인할 수 없음. 성공으로 보지 않는다. */
export class AuthServiceError extends Error {
  override name = "AuthServiceError";
}

/**
 * 현재 요청의 사용자를 Auth 서버에 확인한다(getUser: 서명·만료·세션 폐기 확인).
 * 쿠키의 세션 객체(getSession)는 신뢰하지 않는다. 한 렌더링 안에서는 결과를 재사용한다.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // 설정 누락(SupabaseConfigError)·Next 의 동적 렌더링 신호(cookies)는 감싸지 않고 그대로 전파한다.
  const supabase = await createServerSupabase();
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    throw new AuthServiceError("로그인 상태를 확인할 수 없습니다", {
      cause: error,
    });
  }
  const { data, error } = result;
  if (error) {
    if (classifyUserLookupError(error) === "unauthenticated") return null;
    throw new AuthServiceError("로그인 상태를 확인할 수 없습니다", {
      cause: error,
    });
  }
  return { id: data.user.id, email: data.user.email ?? null };
});

export function loginPath(nextPath = "/"): string {
  const next = safeNextPath(nextPath);
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

/** 보호 화면의 서버 진입점 검사. 로그인하지 않았으면 로그인으로 보낸다. */
export async function requireUser(nextPath = "/"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(nextPath));
  return user;
}
