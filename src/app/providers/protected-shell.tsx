"use client";

import type { ReactNode } from "react";

import { SessionGate, SessionUserProvider } from "@/features/auth";
import type { SessionUser } from "@/shared/auth";

import {
  UserStorageProvider,
  waitForUserStorageReleased,
} from "./user-storage-provider";

/**
 * 보호 화면 조립(클라이언트): 서버가 검증한 계정 → 세션 Gate → 그 계정의 브라우저 저장소.
 * 세션이 끝나면 Gate 가 보호 화면(저장소 포함)을 먼저 치우고, 저장소가 진행 중 저장을 마치고
 * 닫힐 때까지 기다린 뒤 로그인으로 이동한다.
 */
export function ProtectedShell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return (
    <SessionUserProvider user={user}>
      <SessionGate beforeLeave={() => waitForUserStorageReleased(user.id)}>
        <UserStorageProvider key={user.id} userId={user.id}>
          {children}
        </UserStorageProvider>
      </SessionGate>
    </SessionUserProvider>
  );
}
