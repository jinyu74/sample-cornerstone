import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStackViewport } from "./use-stack-viewport";

const RENDERED = "CORNERSTONE_IMAGE_RENDERED";

/** Cornerstone 엔진 대역: 요청과 그리기 완료를 테스트에서 직접 제어한다. */
class FakeViewport {
  element: HTMLElement;
  imageIds: string[] = [];
  index = 0;
  render = vi.fn();
  pendingStack:
    { resolve: () => void; reject: (error: Error) => void } | undefined;
  constructor(element: HTMLElement) {
    this.element = element;
  }
  setStack(imageIds: string[], index: number) {
    return new Promise<string>((resolve, reject) => {
      this.pendingStack = {
        resolve: () => {
          this.imageIds = imageIds;
          this.index = index;
          this.displayedIndex = index;
          resolve(imageIds[index]!);
        },
        reject,
      };
    });
  }
  /** 표시가 끝난(픽셀이 준비된) 영상 위치. 엔진처럼 요청 즉시가 아니라 로딩 완료 후 바뀐다 */
  displayedIndex = 0;
  pendingIndex: (() => void) | undefined;
  delayIndex = false;
  setImageIdIndex(index: number) {
    this.index = index;
    if (!this.delayIndex) {
      this.displayedIndex = index;
      return Promise.resolve(this.imageIds[index]!);
    }
    return new Promise<string>((resolve) => {
      this.pendingIndex = () => {
        this.displayedIndex = index;
        resolve(this.imageIds[index]!);
      };
    });
  }
  getCornerstoneImage() {
    return { imageId: this.imageIds[this.displayedIndex]! };
  }
  getImageIds() {
    return this.imageIds;
  }
  getCurrentImageIdIndex() {
    return this.index;
  }
  /** 현재 상태가 그려졌다고 알린다 */
  emitRendered() {
    this.element.dispatchEvent(new CustomEvent(RENDERED));
  }
}

const engines: FakeEngine[] = [];
class FakeEngine {
  viewport: FakeViewport | undefined;
  destroyed = false;
  destroy = vi.fn(() => {
    this.destroyed = true;
  });
  resize = vi.fn();
  constructor() {
    engines.push(this);
  }
  enableElement({ element }: { element: HTMLElement }) {
    this.viewport = new FakeViewport(element);
  }
  getViewport() {
    return this.viewport;
  }
}

vi.mock("@/shared/viewer", () => ({
  initCornerstone: async () => ({
    core: {
      RenderingEngine: FakeEngine,
      Enums: {
        ViewportType: { STACK: "stack" },
        Events: { IMAGE_RENDERED: RENDERED },
      },
    },
  }),
}));

const observers: { disconnect: ReturnType<typeof vi.fn> }[] = [];
beforeEach(() => {
  engines.length = 0;
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor() {
        observers.push(this);
      }
    },
  );
});

let latest: ReturnType<typeof useStackViewport>;
const capture = (state: ReturnType<typeof useStackViewport>) => {
  latest = state;
};
function Harness({ imageIds, index }: { imageIds?: string[]; index: number }) {
  const state = useStackViewport(imageIds, index);
  const { elementRef } = state;
  useEffect(() => capture(state));
  return <div ref={elementRef} />;
}

async function mounted(imageIds: string[] | undefined, index = 0) {
  const view = render(<Harness imageIds={imageIds} index={index} />);
  await waitFor(() => expect(engines[0]?.viewport).toBeDefined());
  return { view, viewport: () => engines[0]!.viewport! };
}

describe("useStackViewport 수명주기", () => {
  it("요청한 스택이 실제로 그려진 뒤에만 rendered 가 된다", async () => {
    const { viewport } = await mounted(["a", "b"]);
    await waitFor(() => expect(viewport().pendingStack).toBeDefined());
    expect(latest.renderState).toBe("loading");

    await act(async () => viewport().pendingStack!.resolve());
    expect(viewport().render).toHaveBeenCalledTimes(1);
    act(() => viewport().emitRendered());

    expect(latest.renderState).toBe("rendered");
  });

  it("이전 위치의 render 이벤트를 새 위치 완료로 오인하지 않는다", async () => {
    const { view, viewport } = await mounted(["a", "b"]);
    await waitFor(() => expect(viewport().pendingStack).toBeDefined());
    await act(async () => viewport().pendingStack!.resolve());

    view.rerender(<Harness imageIds={["a", "b"]} index={1} />);
    // 엔진이 아직 0번 영상을 그리고 있는 상태에서 이벤트가 온다.
    const realIndex = viewport().displayedIndex;
    viewport().displayedIndex = 0;
    act(() => viewport().emitRendered());
    expect(latest.renderState).toBe("loading");

    viewport().displayedIndex = realIndex;
    act(() => viewport().emitRendered());
    expect(latest.renderState).toBe("rendered");
  });

  it("setStack 완료 전에 화면을 떠나면 파괴된 엔진에 render 를 호출하지 않는다", async () => {
    const { view, viewport } = await mounted(["a"]);
    await waitFor(() => expect(viewport().pendingStack).toBeDefined());
    const pending = viewport().pendingStack!;
    const stale = viewport();

    view.unmount();
    expect(engines[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());

    expect(stale.render).not.toHaveBeenCalled();
  });

  it("화면을 떠난 뒤의 render 이벤트에 반응하지 않는다(리스너 해제)", async () => {
    const { view, viewport } = await mounted(["a"]);
    const stale = viewport();
    const before = latest;

    view.unmount();
    stale.emitRendered();

    expect(latest).toBe(before);
  });

  it("오류가 난 스택에서 정상 스택으로 바꾸면 이전 오류를 보이지 않는다", async () => {
    const { view, viewport } = await mounted(["broken"]);
    await waitFor(() => expect(viewport().pendingStack).toBeDefined());
    await act(async () =>
      viewport().pendingStack!.reject(new Error("디코딩 실패")),
    );
    expect(latest.renderState).toBe("error");
    expect(latest.error).toBe("디코딩 실패");

    viewport().pendingStack = undefined;
    view.rerender(<Harness imageIds={["ok"]} index={0} />);
    await waitFor(() => expect(viewport().pendingStack).toBeDefined());

    expect(latest.error).toBeUndefined();
    expect(latest.renderState).toBe("loading");
    await act(async () => viewport().pendingStack!.resolve());
    act(() => viewport().emitRendered());
    expect(latest.renderState).toBe("rendered");
  });

  it("새 위치 요청 직후(엔진 index 는 바뀌었지만 픽셀 로딩 전) 이전 픽셀의 render 이벤트로 rendered 가 되지 않는다", async () => {
    const { view, viewport } = await mounted(["a", "b"]);
    await waitFor(() => expect(viewport().pendingStack).toBeDefined());
    await act(async () => viewport().pendingStack!.resolve());
    act(() => viewport().emitRendered());
    expect(latest.renderState).toBe("rendered");

    viewport().delayIndex = true;
    view.rerender(<Harness imageIds={["a", "b"]} index={1} />);
    await waitFor(() => expect(viewport().pendingIndex).toBeDefined());
    // 엔진은 currentImageIdIndex 를 먼저 1 로 바꾸지만 아직 0번 픽셀을 표시한다.
    expect(viewport().index).toBe(1);
    act(() => viewport().emitRendered());
    expect(latest.renderState).toBe("loading");

    await act(async () => viewport().pendingIndex!());
    act(() => viewport().emitRendered());
    expect(latest.renderState).toBe("rendered");
  });
});
