export interface UsageWindow {
  name: string;
  usedPercent: number;
  resetsAt: number | null;
}

export interface PauseState {
  pausedAt: number;
  resetsAt: number | null;
}

export type BudgetDecision =
  | { action: "continue" | "wait" | "resume" }
  | { action: "pause"; resetsAt: number | null };

export function canWakeSupervisor(
  status: string,
  paused: boolean,
  windows: readonly UsageWindow[],
): boolean {
  return (
    (status === "idle" || status === "done") &&
    !paused &&
    windows.length > 0 &&
    windows.every((window) => window.usedPercent <= 90)
  );
}

export function parseClaudeUsage(text: string, now: number): UsageWindow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const windows: UsageWindow[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const name = lines[i]!;
    if (!/^Current (session|week\b)/.test(name)) continue;
    let usedPercent: number | undefined;
    let resetText = "";
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]!;
      if (/^Current (session|week\b)/.test(line)) break;
      const usage = /(\d+(?:\.\d+)?)%\s+used/.exec(line);
      if (usage) usedPercent = Number(usage[1]);
      if (line.startsWith("Resets ")) {
        resetText = line.slice(7);
        break;
      }
    }
    if (usedPercent !== undefined && usedPercent >= 0 && usedPercent <= 100) {
      windows.push({
        name,
        usedPercent,
        resetsAt: parseKoreanReset(resetText, now),
      });
    }
  }
  if (!windows.some((window) => window.name === "Current session"))
    throw new Error("Claude 사용량 UI를 읽지 못했습니다");
  return windows;
}

export function parseCodexUsage(value: unknown): UsageWindow[] {
  if (!isRecord(value)) throw new Error("Codex 사용량 응답 없음");
  const limits = value.rateLimits;
  if (!isRecord(limits)) throw new Error("Codex rateLimits 없음");
  const windows: UsageWindow[] = [];
  for (const name of ["primary", "secondary"]) {
    const window = limits[name];
    if (!isRecord(window)) continue;
    const usedPercent = window.usedPercent;
    if (
      typeof usedPercent !== "number" ||
      !Number.isFinite(usedPercent) ||
      usedPercent < 0 ||
      usedPercent > 100
    )
      continue;
    windows.push({
      name: `Codex ${String(window.windowDurationMins)}m`,
      usedPercent,
      resetsAt:
        typeof window.resetsAt === "number" && Number.isFinite(window.resetsAt)
          ? window.resetsAt * 1000
          : null,
    });
  }
  if (windows.length === 0) throw new Error("Codex 사용량 창 없음");
  return windows;
}

export function decideBudget(
  windows: readonly UsageWindow[],
  paused: PauseState | undefined,
  now: number,
): BudgetDecision {
  if (windows.length === 0) throw new Error("사용량 관측 없음");
  const exceeded = windows.filter((window) => window.usedPercent > 90);
  if (paused) {
    if (paused.resetsAt === null || now < paused.resetsAt)
      return { action: "wait" };
    if (exceeded.length === 0) return { action: "resume" };
    return { action: "wait" };
  }
  if (exceeded.length === 0) return { action: "continue" };
  return {
    action: "pause",
    resetsAt: exceeded.some((window) => window.resetsAt === null)
      ? null
      : Math.max(...exceeded.map((window) => window.resetsAt!)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 이 작업의 Claude UI 시간대는 Asia/Seoul이다. 알 수 없는 형식은 추측하지 않는다. */
function parseKoreanReset(text: string, now: number): number | null {
  if (text.includes("(") && !text.includes("(Asia/Seoul)")) return null;
  const clock = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(text);
  if (!clock) return null;
  const rawHour = Number(clock[1]);
  const minute = Number(clock[2] ?? 0);
  if (rawHour < 1 || rawHour > 12 || minute > 59) return null;
  const hour = (rawHour % 12) + (clock[3]!.toLowerCase() === "pm" ? 12 : 0);
  const korea = new Date(now + 9 * 3600000);
  let year = korea.getUTCFullYear();
  let month = korea.getUTCMonth();
  let day = korea.getUTCDate();
  const explicit =
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/.exec(
      text,
    );
  if (explicit) {
    month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(explicit[1]!);
    day = Number(explicit[2]);
  }
  let result = Date.UTC(year, month, day, hour - 9, minute);
  if (result <= now) {
    if (explicit) {
      year += 1;
      result = Date.UTC(year, month, day, hour - 9, minute);
    } else result += 24 * 3600000;
  }
  return result;
}
