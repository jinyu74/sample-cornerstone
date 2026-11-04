import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignedOutNotifier } from "./signed-out-notifier";

afterEach(() => vi.restoreAllMocks());

describe("SignedOutNotifier: 서버 로그아웃이 끝난 뒤(로그인 화면 도착) 다른 탭에 알린다", () => {
  it("한 번만 로그아웃 완료를 알린다", () => {
    const posted = vi.spyOn(BroadcastChannel.prototype, "postMessage");
    const view = render(<SignedOutNotifier />);
    view.rerender(<SignedOutNotifier />);
    expect(posted).toHaveBeenCalledTimes(1);
    expect(posted).toHaveBeenCalledWith({ type: "signed-out" });
  });
});
