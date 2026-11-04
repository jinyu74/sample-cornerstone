import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionUserProvider } from "../model/session-user-context";

import { AccountMenu } from "./account-menu";

const user = {
  id: "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f",
  email: "reader@example.test",
};

function setup(confirmSignOut?: () => Promise<boolean>) {
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "submit")
    .mockImplementation(() => undefined);
  render(
    <SessionUserProvider user={user}>
      <AccountMenu confirmSignOut={confirmSignOut} />
    </SessionUserProvider>,
  );
  return { submit };
}

afterEach(() => vi.restoreAllMocks());

describe("AccountMenu 로그아웃: 문서 전체 이동 전에 화면의 저장을 기다린다", () => {
  it("확인 함수가 없으면 바로 서버 로그아웃(POST)으로 이동한다", async () => {
    const { submit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it("화면이 저장을 마칠 때까지 이동하지 않고, 저장 후 이동한다", async () => {
    let finish!: (ok: boolean) => void;
    const confirm = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    const { submit } = setup(confirm);
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "로그아웃 중…" })).toBeDisabled();
    finish(true);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it("저장에 실패해 화면이 이동을 막으면 로그아웃하지 않는다", async () => {
    const { submit } = setup(async () => false);
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "로그아웃" })).toBeEnabled(),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("서버 로그아웃(POST)이 끝나기 전에는 같은 탭·다른 탭에 로그아웃을 알리지 않는다", async () => {
    const posted = vi.spyOn(BroadcastChannel.prototype, "postMessage");
    const { submit } = setup(async () => true);
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(posted).not.toHaveBeenCalled();
  });
});
