"use client";

import { LogOutIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

import { useSessionUser } from "../model/session-user-context";

export const SIGN_OUT_ENDPOINT = "/auth/sign-out";

/**
 * 서버 로그아웃(POST)으로 문서 전체를 이동한다. 이전 계정의 메모리 상태가 남지 않고,
 * React 정리(cleanup)가 실행된다고 가정하지 않으므로 저장은 호출 전에 끝내야 한다.
 * 다른 탭 알림은 POST 가 끝나 로그인 화면에 도착한 뒤 SignedOutNotifier 가 보낸다
 * (POST 전에 알리면 같은 탭의 SessionGuard 이동이 POST 를 취소할 수 있다).
 */
export function submitSignOut(): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = SIGN_OUT_ENDPOINT;
  form.hidden = true;
  document.body.append(form);
  form.submit();
}

export interface AccountMenuProps {
  /**
   * 로그아웃 전에 화면이 할 일(저장하지 않은 변경 저장 등). false 면 로그아웃하지 않는다
   * (화면이 사용자 확인을 받은 뒤 submitSignOut 으로 직접 이동할 수 있다).
   */
  confirmSignOut?: () => Promise<boolean>;
}

/** 현재 계정과 로그아웃 */
export function AccountMenu({ confirmSignOut }: AccountMenuProps) {
  const user = useSessionUser();
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    let proceed = false;
    try {
      proceed = confirmSignOut ? await confirmSignOut() : true;
    } finally {
      if (!proceed) setPending(false);
    }
    if (!proceed) return;
    form.submit();
  };

  return (
    <form
      method="post"
      action={SIGN_OUT_ENDPOINT}
      onSubmit={(event) => void onSubmit(event)}
      className="flex items-center gap-2"
    >
      <span
        className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline-block"
        title={user.email ?? undefined}
      >
        {user.email ?? "로그인됨"}
      </span>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <Spinner aria-hidden /> : <LogOutIcon aria-hidden />}
        {pending ? "로그아웃 중…" : "로그아웃"}
      </Button>
    </form>
  );
}
