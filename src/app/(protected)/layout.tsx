import type { ReactNode } from "react";

import { SessionGuard, SessionUserProvider } from "@/features/auth";
import { requireUser } from "@/shared/auth/server";

import { UserStorageProvider } from "../providers/user-storage-provider";

/**
 * 로그인한 계정만 들어오는 화면 묶음.
 * - 서버에서 Auth 서버로 계정을 확인한 뒤(requireUser) 그 계정 ID 의 브라우저 저장소만 연다.
 * - 같은 계정의 화면 이동에서는 레이아웃·저장소 연결이 유지되고, 계정이 바뀌면 key 로 전체를 새로 만든다.
 * - 레이아웃은 화면 이동마다 다시 실행되지 않으므로 각 페이지도 requireUser 로 다시 확인한다.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  return (
    <SessionUserProvider user={user}>
      <SessionGuard />
      <UserStorageProvider key={user.id} userId={user.id}>
        {children}
      </UserStorageProvider>
    </SessionUserProvider>
  );
}
