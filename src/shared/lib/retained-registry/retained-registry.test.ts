import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRetainedRegistry } from "./retained-registry";

interface Resource {
  key: string;
  disposed: boolean;
}

function setup() {
  const created: Resource[] = [];
  const registry = createRetainedRegistry<string, Resource>({
    create: (key) => {
      const resource = { key, disposed: false };
      created.push(resource);
      return resource;
    },
    dispose: (resource) => {
      resource.disposed = true;
    },
  });
  return { registry, created };
}

describe("createRetainedRegistry: 키별 공유 자원과 지연 정리", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("같은 키는 같은 자원을, 다른 키는 다른 자원을 준다", () => {
    const { registry } = setup();
    expect(registry.get("a")).toBe(registry.get("a"));
    expect(registry.get("a")).not.toBe(registry.get("b"));
  });

  it("마지막 해제 후 같은 틱의 정리(자식 언마운트 저장 등)가 끝난 뒤에 정리한다", () => {
    const { registry } = setup();
    const resource = registry.get("a");
    const release = registry.retain("a");
    release();
    // 같은 동기 구간에서는 아직 정리되지 않아 남은 작업을 시작할 수 있다
    expect(resource.disposed).toBe(false);
    vi.runAllTimers();
    expect(resource.disposed).toBe(true);
    expect(registry.get("a")).not.toBe(resource);
  });

  it("해제 직후 다시 보유하면(StrictMode 재마운트) 정리하지 않고 같은 자원을 유지한다", () => {
    const { registry } = setup();
    const resource = registry.get("a");
    registry.retain("a")();
    const release = registry.retain("a");
    vi.runAllTimers();
    expect(resource.disposed).toBe(false);
    expect(registry.get("a")).toBe(resource);
    release();
    vi.runAllTimers();
    expect(resource.disposed).toBe(true);
  });

  it("여러 보유자가 있으면 모두 해제될 때까지 유지한다", () => {
    const { registry } = setup();
    const resource = registry.get("a");
    const r1 = registry.retain("a");
    const r2 = registry.retain("a");
    r1();
    vi.runAllTimers();
    expect(resource.disposed).toBe(false);
    r2();
    vi.runAllTimers();
    expect(resource.disposed).toBe(true);
  });

  it("해제 함수를 두 번 불러도 보유 수가 음수가 되지 않는다", () => {
    const { registry } = setup();
    const resource = registry.get("a");
    const r1 = registry.retain("a");
    const r2 = registry.retain("a");
    r1();
    r1();
    vi.runAllTimers();
    expect(resource.disposed).toBe(false);
    r2();
    vi.runAllTimers();
    expect(resource.disposed).toBe(true);
  });

  it("한 키의 정리가 다른 키 자원에 영향을 주지 않는다", () => {
    const { registry } = setup();
    const a = registry.get("a");
    const b = registry.get("b");
    const releaseB = registry.retain("b");
    registry.retain("a")();
    vi.runAllTimers();
    expect(a.disposed).toBe(true);
    expect(b.disposed).toBe(false);
    releaseB();
  });
});
