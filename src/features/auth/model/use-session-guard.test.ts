import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifySignedOut, useSessionGuard } from "./use-session-guard";
import type { SessionCheck } from "./session-check";

const USER = "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f";
const OTHER = "c9f0f895-fb98-4b91-8c2d-6e5f4a3b2c1d";

function setup(results: SessionCheck[], intervalMs = 60_000) {
  const check = vi.fn(
    async (): Promise<SessionCheck> =>
      results.shift() ?? { status: "ok", userId: USER },
  );
  const onInvalid = vi.fn();
  const hook = renderHook(() =>
    useSessionGuard({ userId: USER, check, onInvalid, intervalMs }),
  );
  return { check, onInvalid, hook };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("useSessionGuard: 이미 열린 화면의 서버 세션 재검증", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("세션이 유효하면 아무것도 하지 않는다", async () => {
    const { check, onInvalid } = setup([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("주기 검사에서 세션이 만료되면 보호 화면을 떠나게 한다(활성 탭)", async () => {
    const { onInvalid } = setup([{ status: "unauthenticated" }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onInvalid).toHaveBeenCalledWith("unauthenticated");
  });

  it("다른 계정으로 바뀌었으면 이전 계정 화면을 유지하지 않는다", async () => {
    const { onInvalid } = setup([{ status: "ok", userId: OTHER }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onInvalid).toHaveBeenCalledWith("user-changed");
  });

  it("탭이 다시 보이거나 창에 포커스가 오면 즉시 다시 검증한다", async () => {
    const { check, onInvalid } = setup([
      { status: "ok", userId: USER },
      { status: "unauthenticated" },
    ]);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(onInvalid).toHaveBeenCalledWith("unauthenticated");
  });

  it("뒤로 가기 캐시(bfcache)에서 복원되면 다시 검증한다", async () => {
    const { check, onInvalid } = setup([{ status: "unauthenticated" }]);
    const event = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith("unauthenticated");
  });

  it("다른 탭의 로그아웃 알림을 받으면 서버 확인 없이도 즉시 떠난다", async () => {
    const { onInvalid } = setup([]);
    const peer = new BroadcastChannel("dicom-annotator:auth");
    try {
      notifySignedOut();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(onInvalid).toHaveBeenCalledWith("signed-out");
    } finally {
      peer.close();
    }
  });

  it("인증 서비스 오류는 로그인 성공으로도 강제 로그아웃으로도 보지 않고 다음 검사에서 다시 확인한다", async () => {
    const { check, onInvalid } = setup([
      { status: "error" },
      { status: "unauthenticated" },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onInvalid).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(check).toHaveBeenCalledTimes(2);
    expect(onInvalid).toHaveBeenCalledWith("unauthenticated");
  });

  it("무효 처리는 한 번만 하고 언마운트 후에는 검사하지 않는다", async () => {
    const { check, onInvalid, hook } = setup([
      { status: "unauthenticated" },
      { status: "unauthenticated" },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(onInvalid).toHaveBeenCalledTimes(1);
    hook.unmount();
    const calls = check.mock.calls.length;
    window.dispatchEvent(new Event("focus"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(check.mock.calls.length).toBe(calls);
  });
});
