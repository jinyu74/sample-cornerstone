import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import type { SessionCheck } from "../model/session-check";
import { SessionUserProvider } from "../model/session-user-context";

import { SessionGate } from "./session-gate";

const A = "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f";
const B = "c9f0f895-fb98-4b91-8c2d-6e5f4a3b2c1d";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function setup({
  result,
  beforeLeave,
  leaveTimeoutMs,
}: {
  result: SessionCheck;
  beforeLeave?: () => Promise<void>;
  leaveTimeoutMs?: number;
}) {
  const order: string[] = [];
  function Protected() {
    useEffect(() => () => void order.push("protected-cleanup"), []);
    return <p>보호된 영상</p>;
  }
  const navigate = vi.fn((href: string) => void order.push(`navigate ${href}`));
  render(
    <SessionUserProvider user={{ id: A, email: "a@example.test" }}>
      <SessionGate
        check={async () => result}
        beforeLeave={
          beforeLeave &&
          (async () => {
            order.push("before-leave");
            await beforeLeave();
          })
        }
        navigate={navigate}
        leaveTimeoutMs={leaveTimeoutMs}
      >
        <Protected />
      </SessionGate>
    </SessionUserProvider>,
  );
  return { order, navigate };
}

async function focus() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SessionGate: 세션이 무효가 되면 보호 화면을 먼저 치우고(fail-closed) 정리 후 이동한다", () => {
  it("세션이 유효하면 보호 화면을 그대로 보여 준다", async () => {
    const { navigate } = setup({ result: { status: "ok", userId: A } });
    await focus();
    expect(screen.getByText("보호된 영상")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "만료",
      { status: "unauthenticated" } as SessionCheck,
      "세션이 만료되었습니다",
    ],
    [
      "계정 변경",
      { status: "ok", userId: B } as SessionCheck,
      "다른 계정으로 바뀌었습니다",
    ],
  ])(
    "%s: 보호 화면 정리 → 저장소 정리 완료 대기 → 로그인으로 이동",
    async (_name, result, title) => {
      const storage = deferred();
      const { order, navigate } = setup({
        result,
        beforeLeave: () => storage.promise,
      });
      await focus();

      expect(screen.queryByText("보호된 영상")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(title);
      expect(
        screen.getByRole("link", { name: "로그인 화면으로 이동" }),
      ).toHaveAttribute("href", "/login?next=%2F");
      // 정리가 끝나기 전에는 이동하지 않는다(저장 중 문서 이동으로 쓰기가 끊기지 않게)
      expect(order).toEqual(["protected-cleanup", "before-leave"]);
      expect(navigate).not.toHaveBeenCalled();

      await act(async () => storage.resolve());
      expect(navigate).toHaveBeenCalledWith("/login?next=%2F");
      expect(order.at(-1)).toBe("navigate /login?next=%2F");
    },
  );

  it("정리가 끝나지 않거나 실패해도 정해진 시간 뒤에는 이동하고 보호 화면은 계속 닫혀 있다", async () => {
    vi.useFakeTimers();
    try {
      const { navigate } = setup({
        result: { status: "unauthenticated" },
        beforeLeave: () => new Promise<void>(() => undefined),
        leaveTimeoutMs: 3_000,
      });
      await focus();
      expect(navigate).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("보호된 영상")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("정리가 실패(reject)해도 보호 화면은 닫힌 채 바로 이동한다", async () => {
    const { navigate } = setup({
      result: { status: "unauthenticated" },
      beforeLeave: () => Promise.reject(new Error("저장소 닫기 실패")),
    });
    await focus();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("보호된 영상")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "세션이 만료되었습니다",
    );
  });

  it("기본 설정에서 끝나지 않는 정리는 3초 전에는 이동하지 않고 3초가 지나면 이동하며, 그동안 보호 화면은 닫혀 있다", async () => {
    vi.useFakeTimers();
    try {
      const { navigate } = setup({
        result: { status: "unauthenticated" },
        beforeLeave: () => new Promise<void>(() => undefined),
      });
      await focus();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_999);
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.queryByText("보호된 영상")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "세션이 만료되었습니다",
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("보호된 영상")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("보호 화면 안에서 포커스를 가진 입력을 치우기 전에 blur 해 기존 commit 경로를 먼저 실행한다", async () => {
    const order: string[] = [];
    function Protected() {
      useEffect(() => () => void order.push("protected-cleanup"), []);
      return (
        <input
          aria-label="메모"
          defaultValue="입력 중"
          onBlur={(event) => order.push(`commit ${event.currentTarget.value}`)}
        />
      );
    }
    render(
      <SessionUserProvider user={{ id: A, email: "a@example.test" }}>
        <SessionGate
          check={async () => ({ status: "unauthenticated" })}
          navigate={() => undefined}
        >
          <Protected />
        </SessionGate>
        <input aria-label="보호 화면 밖" />
      </SessionUserProvider>,
    );
    screen.getByLabelText("메모").focus();
    await focus();
    expect(order).toEqual(["commit 입력 중", "protected-cleanup"]);
    expect(screen.queryByLabelText("메모")).toBeNull();
  });

  it("보호 화면 밖에 포커스가 있으면 건드리지 않는다", async () => {
    const outsideBlur = vi.fn();
    render(
      <SessionUserProvider user={{ id: A, email: "a@example.test" }}>
        <SessionGate
          check={async () => ({ status: "unauthenticated" })}
          navigate={() => undefined}
        >
          <p>보호된 영상</p>
        </SessionGate>
        <input aria-label="보호 화면 밖" onBlur={outsideBlur} />
      </SessionUserProvider>,
    );
    screen.getByLabelText("보호 화면 밖").focus();
    await focus();
    expect(outsideBlur).not.toHaveBeenCalled();
    expect(screen.queryByText("보호된 영상")).toBeNull();
  });

  it("이동이 일어나지 않아도(취소) 보호 화면이 되살아나지 않는다", async () => {
    const { navigate } = setup({ result: { status: "unauthenticated" } });
    await focus();
    await focus();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("보호된 영상")).toBeNull();
    expect(
      screen.getByRole("link", { name: "로그인 화면으로 이동" }),
    ).toBeVisible();
  });
});
