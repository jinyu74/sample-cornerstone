"use client";

import { createContext, type ReactNode, use } from "react";

import type { SessionUser } from "@/shared/auth";

const SessionUserContext = createContext<SessionUser | null>(null);

/** 서버가 검증한 현재 계정 정보(DTO)를 화면에 제공한다. 인증 판단의 근거로 쓰지 않는다. */
export function SessionUserProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return <SessionUserContext value={user}>{children}</SessionUserContext>;
}

export function useSessionUser(): SessionUser {
  const user = use(SessionUserContext);
  if (!user) {
    throw new Error("SessionUserProvider 밖에서는 계정 정보를 쓸 수 없습니다");
  }
  return user;
}
