export interface ConnectionLifecycle {
  /** 닫힌 뒤에는 새 작업을 받지 않는다 */
  readonly closed: boolean;
  /** 진행 중 작업으로 등록해 실행한다. 닫힘 판정은 호출하는 쪽에서 먼저 한다. */
  track<T>(operation: () => Promise<T>): Promise<T>;
  /** 즉시 닫는다 */
  close(): void;
  /**
   * 진행 중 작업과, 그 작업이 끝난 직후 이어서 요청한 작업(직렬 저장 flush)이 모두 끝난 뒤 닫는다.
   * 작업이 비면 다음 매크로태스크까지 기다려 같은 마이크로태스크 체인의 후속 작업을 받아 준다.
   */
  closeWhenIdle(): void;
}

export function createConnectionLifecycle(
  onClose: () => void,
): ConnectionLifecycle {
  let state: "open" | "draining" | "closed" = "open";
  let inflight = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function finish() {
    clearTimeout(timer);
    state = "closed";
    onClose();
  }

  function scheduleIdleClose() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (state === "draining" && inflight === 0) finish();
    }, 0);
  }

  return {
    get closed() {
      return state === "closed";
    },
    async track(operation) {
      inflight += 1;
      clearTimeout(timer);
      try {
        return await operation();
      } finally {
        inflight -= 1;
        if (state === "draining" && inflight === 0) scheduleIdleClose();
      }
    },
    close() {
      if (state !== "closed") finish();
    },
    closeWhenIdle() {
      if (state !== "open") return;
      state = "draining";
      if (inflight === 0) scheduleIdleClose();
    },
  };
}
