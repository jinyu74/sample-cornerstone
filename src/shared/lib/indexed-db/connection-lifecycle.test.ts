import { describe, expect, it, vi } from "vitest";

import { createConnectionLifecycle } from "./connection-lifecycle";

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ConnectionLifecycle.whenClosed: 실제로 닫힌 시점을 기다린다", () => {
  it("진행 중 작업과 이어지는 작업이 끝나 닫힌 뒤에야 끝난다", async () => {
    const onClose = vi.fn();
    const lifecycle = createConnectionLifecycle(onClose);
    let finish!: () => void;
    const first = lifecycle.track(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const chained = first.then(() => lifecycle.track(async () => "second"));
    lifecycle.closeWhenIdle();

    let closed = false;
    void lifecycle.whenClosed().then(() => (closed = true));
    await macrotask();
    expect(closed).toBe(false);

    finish();
    await expect(chained).resolves.toBe("second");
    await macrotask();
    await macrotask();
    expect(closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("즉시 close 해도 끝나고, 이미 닫혔으면 바로 끝난다", async () => {
    const lifecycle = createConnectionLifecycle(() => undefined);
    lifecycle.close();
    await expect(lifecycle.whenClosed()).resolves.toBeUndefined();
    await expect(lifecycle.whenClosed()).resolves.toBeUndefined();
  });
});
