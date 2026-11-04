import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProtectedShell } from "@/app/providers/protected-shell";
import { useUnsavedChangesGuard } from "@/views/viewer-workspace/model/use-unsaved-changes-guard";

/**
 * PR #4 리뷰어 재현 경로:
 * 세션 무효(만료·계정 변경) → SessionGuard 가 문서 이동을 요청 → 뷰어의 미저장 beforeunload 확인을
 * 사용자가 취소(또는 이동이 일어나지 않음) → 보호 화면이 그대로 남고 이후 검사도 멈춘다.
 * 요구: 세션이 무효가 된 뒤에는 이전 계정의 영상·결과 화면을 계속 쓸 수 없어야 한다.
 *
 * jsdom 은 문서 이동을 수행하지 않으므로(location.replace 무시) "이동이 취소되어 화면이 남은" 상황과 같다.
 * 보호 레이아웃(src/app/(protected)/layout.tsx)이 쓰는 ProtectedShell 로 렌더링한다.
 */

// 공개 진입점이 서버 액션(server-only)도 내보내므로 jsdom 에서는 표식 모듈만 비운다.
vi.mock("server-only", () => ({}));

const checkSession = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/api/check-session", () => ({
  SESSION_ENDPOINT: "/auth/session",
  checkSession,
}));

const A = "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f";
const B = "c9f0f895-fb98-4b91-8c2d-6e5f4a3b2c1d";

/** 미저장 편집이 있는 뷰어를 흉내 낸다(실제 뷰어의 beforeunload 확인 hook 사용) */
function UnsavedViewer() {
  useUnsavedChangesGuard(true);
  return <p>계정 A 의 영상과 측정 결과</p>;
}

function renderProtected() {
  // 보호 레이아웃이 렌더링하는 실제 클라이언트 조립(계정 → Gate → 계정 저장소)
  return render(
    <ProtectedShell user={{ id: A, email: "a@example.test" }}>
      <UnsavedViewer />
    </ProtectedShell>,
  );
}

function beforeUnloadBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function focusAndCheck() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("세션 무효 뒤 이동이 취소돼도 이전 계정 화면을 계속 쓸 수 없다", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // jsdom 의 "Not implemented: navigation" 안내를 숨긴다(이동 무시 = 취소된 이동)
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
    checkSession.mockReset();
  });

  it.each([
    ["세션 만료", { status: "unauthenticated" }],
    ["다른 계정으로 변경", { status: "ok", userId: B }],
  ])(
    "%s: 보호 화면을 치우고 로그인 안내만 남기며, 미저장 확인이 로그인 이동을 막지 않는다",
    async (_name, result) => {
      checkSession.mockResolvedValue(result);
      const view = renderProtected();
      expect(
        screen.getByText("계정 A 의 영상과 측정 결과"),
      ).toBeInTheDocument();
      expect(beforeUnloadBlocked()).toBe(true);

      await focusAndCheck();

      expect(screen.queryByText("계정 A 의 영상과 측정 결과")).toBeNull();
      expect(
        screen.getByRole("link", { name: "로그인 화면으로 이동" }),
      ).toHaveAttribute("href", expect.stringMatching(/^\/login\?next=/));
      // 보호 화면이 정리되어 미저장 확인(beforeunload)이 더 이상 로그인 이동을 막지 않는다
      expect(beforeUnloadBlocked()).toBe(false);
      view.unmount();
    },
  );

  it("이동이 일어나지 않아도 이후 포커스에서 다시 보호 화면이 살아나지 않는다", async () => {
    checkSession.mockResolvedValue({ status: "unauthenticated" });
    const view = renderProtected();
    await focusAndCheck();
    await focusAndCheck();
    expect(screen.queryByText("계정 A 의 영상과 측정 결과")).toBeNull();
    view.unmount();
  });
});
