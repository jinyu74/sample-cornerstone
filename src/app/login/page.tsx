import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthServiceError, getCurrentUser } from "@/shared/auth/server";
import { safeNextPath } from "@/shared/lib/navigation";
import { LoginPage } from "@/views/login";

export const metadata: Metadata = { title: "로그인 · DICOM 작업실" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; signed_out?: string }>;
}) {
  const { next, signed_out: signedOut } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : undefined);

  let user = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // 인증 서비스 오류만: 로그인 상태로 보지 않고 폼을 보여 준다(제출 시 오류를 알린다).
    // 그 밖의 오류(설정 누락·Next 내부 신호)는 그대로 전파한다.
    if (!(error instanceof AuthServiceError)) throw error;
  }
  if (user) redirect(target);

  return <LoginPage next={target} signedOut={signedOut === "1"} />;
}
