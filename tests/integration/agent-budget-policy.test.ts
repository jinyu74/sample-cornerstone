import { describe, expect, it } from "vitest";

import {
  canWakeSupervisor,
  decideBudget,
  parseClaudeUsage,
  parseCodexUsage,
} from "../../scripts/agent-budget-policy";

const now = Date.parse("2026-11-02T09:47:39Z");
const reset = Date.parse("2026-11-02T12:49:00Z");

describe("에이전트 사용량 감시 정책", () => {
  it("재개 후 검수자는 대기 중이고 자신의 한도에도 여유가 있을 때만 깨운다", () => {
    const windows = [{ name: "Codex 300m", usedPercent: 20, resetsAt: reset }];
    expect(canWakeSupervisor("idle", false, windows)).toBe(true);
    expect(canWakeSupervisor("done", false, windows)).toBe(true);
    expect(canWakeSupervisor("working", false, windows)).toBe(false);
    expect(canWakeSupervisor("blocked", false, windows)).toBe(false);
    expect(canWakeSupervisor("idle", true, windows)).toBe(false);
    expect(canWakeSupervisor("idle", false, [])).toBe(false);
    expect(
      canWakeSupervisor("idle", false, [{ ...windows[0]!, usedPercent: 91 }]),
    ).toBe(false);
  });
  it("Claude의 실제 사용량 창만 읽고 비용·캐시 비율은 한도로 해석하지 않는다", () => {
    expect(
      parseClaudeUsage(
        `Prompt cache: 99% of input tokens\nCurrent session\n████ 76% used\nResets 9:49pm (Asia/Seoul)\nCurrent week (all models)\n██ 11% used\nResets Nov 4 at 8:59pm (Asia/Seoul)`,
        now,
      ),
    ).toEqual([
      { name: "Current session", usedPercent: 76, resetsAt: reset },
      {
        name: "Current week (all models)",
        usedPercent: 11,
        resetsAt: Date.parse("2026-11-04T11:59:00Z"),
      },
    ]);
  });

  it("자정을 지난 세션 reset과 다음 해 주간 reset을 계산한다", () => {
    const time = Date.parse("2026-12-31T14:00:00Z");
    const windows = parseClaudeUsage(
      "Current session\n91% used\nResets 1:00am (Asia/Seoul)\nCurrent week (all models)\n95% used\nResets Jan 2 at 12:00pm (Asia/Seoul)",
      time,
    );
    expect(windows.map((window) => window.resetsAt)).toEqual([
      Date.parse("2026-12-31T16:00:00Z"),
      Date.parse("2027-01-02T03:00:00Z"),
    ]);
  });

  it("UI에서 한도를 읽을 수 없으면 성공한 관측으로 취급하지 않는다", () => {
    expect(() =>
      parseClaudeUsage("Prompt cache: 99%\nEsc to cancel", now),
    ).toThrow();
    expect(
      parseClaudeUsage("Current session\n91% used\nResets unknown", now)[0]!
        .resetsAt,
    ).toBeNull();
  });

  it("Codex 공식 응답의 usedPercent와 Unix 초 reset을 읽는다", () => {
    expect(
      parseCodexUsage({
        rateLimits: {
          primary: {
            usedPercent: 9,
            windowDurationMins: 300,
            resetsAt: 1793630655,
          },
          secondary: null,
        },
      }),
    ).toEqual([
      { name: "Codex 300m", usedPercent: 9, resetsAt: 1793630655000 },
    ]);
    expect(() => parseCodexUsage({})).toThrow();
  });

  it("90% 초과(잔여10%미만)에만 중단하고 모든 초과 창의 reset을 기다린다", () => {
    expect(
      decideBudget(
        [{ name: "session", usedPercent: 90, resetsAt: reset }],
        undefined,
        now,
      ),
    ).toEqual({ action: "continue" });
    expect(
      decideBudget(
        [
          { name: "session", usedPercent: 90.1, resetsAt: reset },
          { name: "weekly", usedPercent: 95, resetsAt: reset + 1000 },
        ],
        undefined,
        now,
      ),
    ).toEqual({ action: "pause", resetsAt: reset + 1000 });
  });

  it("reset 전이나 초과 상태가 계속되면 재개하지 않는다", () => {
    const paused = { pausedAt: now, resetsAt: reset };
    expect(
      decideBudget(
        [{ name: "session", usedPercent: 2, resetsAt: reset + 10000 }],
        paused,
        reset - 1,
      ),
    ).toEqual({ action: "wait" });
    expect(
      decideBudget(
        [{ name: "session", usedPercent: 95, resetsAt: reset }],
        paused,
        reset + 1,
      ).action,
    ).not.toBe("resume");
  });

  it("reset 이후 실제 새 관측에서 사용량이 낮아졌을 때 재개한다", () => {
    expect(
      decideBudget(
        [{ name: "session", usedPercent: 1, resetsAt: reset + 5 * 3600000 }],
        { pausedAt: now, resetsAt: reset },
        reset + 1000,
      ),
    ).toEqual({ action: "resume" });
  });

  it("reset 시각을 모르면 중단하되 추측해서 재개하지 않는다", () => {
    expect(
      decideBudget(
        [{ name: "session", usedPercent: 91, resetsAt: null }],
        undefined,
        now,
      ),
    ).toEqual({ action: "pause", resetsAt: null });
    expect(
      decideBudget(
        [{ name: "session", usedPercent: 1, resetsAt: reset }],
        { pausedAt: now, resetsAt: null },
        reset + 1000,
      ),
    ).toEqual({ action: "wait" });
  });
});
