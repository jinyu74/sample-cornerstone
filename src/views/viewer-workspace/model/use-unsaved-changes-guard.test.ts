import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useUnsavedChangesGuard", () => {
  it("저장하지 않은 변경이 있으면 문서 이탈 전에 브라우저 확인을 요청한다", () => {
    const { rerender, unmount } = renderHook(
      ({ unsaved }) => useUnsavedChangesGuard(unsaved),
      { initialProps: { unsaved: true } },
    );
    expect(unload()).toBe(true);
    rerender({ unsaved: false });
    expect(unload()).toBe(false);
    unmount();
  });

  it("저장을 마쳤거나 사용자가 확인한 이탈(로그아웃 등)은 release 후 다시 묻지 않는다", () => {
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));
    result.current.release();
    expect(unload()).toBe(false);
    unmount();
  });
});
