import { describe, expect, it } from "vitest";

import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
} from "./history";

describe("편집 이력 (S5-6 실행 취소·다시 실행)", () => {
  it("undo 는 이전 상태, redo 는 되돌린 상태를 돌려주고 새 편집은 redo 를 지운다", () => {
    let history = createHistory("A");
    history = pushHistory(history, "B");
    history = pushHistory(history, "C");
    expect(history.present).toBe("C");

    history = undo(history);
    expect(history.present).toBe("B");
    expect(canRedo(history)).toBe(true);

    history = redo(history);
    expect(history.present).toBe("C");

    history = undo(undo(history));
    expect(history.present).toBe("A");
    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBe(history);

    history = pushHistory(history, "D");
    expect(canRedo(history)).toBe(false);
    expect(redo(history)).toBe(history);
  });

  it("이력은 제한 개수까지만 보관한다", () => {
    let history = createHistory(0, 3);
    for (let i = 1; i <= 5; i += 1) history = pushHistory(history, i);

    expect(history.past).toEqual([2, 3, 4]);
  });
});
