/**
 * 모델 호출 없이 사용량을 조회하는 로컬 감시기.
 * --once: 조회만, --codex-only: Codex 조회만, --watch: 30초 간격 감시·중단·재개.
 * Herdr/두 CLI와 컴퓨터가 실행 중이어야 한다. 크레딧·대화 초기화는 하지 않는다.
 */
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  canWakeSupervisor,
  decideBudget,
  parseClaudeUsage,
  parseCodexUsage,
  type PauseState,
  type UsageWindow,
} from "./agent-budget-policy";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".local/agent-budgets");
const threadId = "01a19b26-bace-7013-9cc7-7fdfef64a035";
const claudeSession = "835f3cf4-4548-455b-a142-2afc555fc22f";
const rollout =
  "/Users/jinyu/.codex/sessions/2026/11/02/rollout-2026-11-02T16-26-09-01a19b26-bace-7013-9cc7-7fdfef64a035.jsonl";
const targets = { codex: "w4:p1", claude: "opus-worker" } as const;
type Provider = keyof typeof targets;
interface ProviderState {
  paused?: PauseState;
  observedAt?: string;
  windows?: UsageWindow[];
  error?: string;
}
interface MonitorState {
  codex: ProviderState;
  claude: ProviderState;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const log = (event: string, details: unknown) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), event, details }));

async function herdr(...args: string[]): Promise<string> {
  const result = await exec("herdr", args, {
    cwd: root,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout;
}

async function agent(provider: Provider): Promise<Record<string, unknown>> {
  const response: unknown = JSON.parse(
    await herdr("agent", "get", targets[provider]),
  );
  if (
    !record(response) ||
    !record(response.result) ||
    !record(response.result.agent)
  )
    throw new Error("Herdr agent 응답 없음");
  const value = response.result.agent;
  if (provider === "claude") {
    if (
      !record(value.agent_session) ||
      value.agent_session.value !== claudeSession
    )
      throw new Error("Claude 세션이 바뀌어 자동 조작하지 않습니다");
  } else {
    const processInfo: unknown = JSON.parse(
      await herdr("pane", "process-info", "--pane", targets.codex),
    );
    if (
      !record(processInfo) ||
      !record(processInfo.result) ||
      !record(processInfo.result.process_info)
    )
      throw new Error("Codex 프로세스 확인 불가");
    const processes = processInfo.result.process_info.foreground_processes;
    if (
      !Array.isArray(processes) ||
      !processes.some(
        (item: unknown) =>
          record(item) &&
          Array.isArray(item.argv) &&
          item.argv.includes(threadId),
      )
    )
      throw new Error(
        "원래 Codex resume 프로세스가 아니므로 자동 조작하지 않습니다",
      );
  }
  return value;
}

/** 공식 stdio RPC만 사용한다. 인증 파일/토큰을 읽거나 출력하지 않으며 turn을 시작하지 않는다. */
async function codexUsage(): Promise<UsageWindow[]> {
  const result = await new Promise<unknown>((resolve, reject) => {
    const child = spawn("codex", ["app-server"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = readline.createInterface({ input: child.stdout });
    child.stderr.resume();
    let done = false;
    const timer = setTimeout(
      () => finish(new Error("Codex 사용량 조회 시간 초과")),
      15000,
    );
    const send = (value: unknown) =>
      child.stdin.write(`${JSON.stringify(value)}\n`);
    const finish = (error?: Error, value?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      const cleanup = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGTERM");
      }, 1000);
      cleanup.unref();
      if (error) reject(error);
      else resolve(value);
    };
    child.on("error", () => finish(new Error("Codex app-server 실행 실패")));
    child.on("exit", () => {
      if (!done) finish(new Error("Codex app-server가 조회 전에 종료됨"));
    });
    child.stdin.on("error", () => finish(new Error("Codex RPC 입력 실패")));
    lines.on("line", (line) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (!record(message)) return;
      if (message.error) {
        finish(new Error("Codex 사용량 RPC 오류"));
        return;
      }
      if (message.id === 0) {
        send({ method: "initialized", params: {} });
        send({ id: 1, method: "account/rateLimits/read" });
      } else if (message.id === 1) finish(undefined, message.result);
    });
    send({
      id: 0,
      method: "initialize",
      params: {
        clientInfo: {
          name: "herdr_budget_monitor",
          title: "Local agent budget monitor",
          version: "1.0.0",
        },
      },
    });
  });
  return parseCodexUsage(result);
}

async function claudeUsage(): Promise<UsageWindow[]> {
  const current = await agent("claude");
  if (current.agent_status === "blocked" || current.agent_status === "unknown")
    throw new Error(
      "Claude 승인/질문 또는 미확인 상태: UI를 조작하지 않습니다",
    );
  const before = await herdr(
    "agent",
    "read",
    targets.claude,
    "--source",
    "visible",
    "--lines",
    "200",
  );
  if (/Settings\s+Status\s+Config\s+Usage/.test(before))
    throw new Error("사용자가 열어 둔 설정 UI는 조작하지 않습니다");
  const input = before
    .slice(before.lastIndexOf("❯"))
    .split("\n")[0]
    ?.replace(/^❯\s*/, "")
    .trim();
  if (input && !input.startsWith("Try ") && !input.startsWith("Press up"))
    throw new Error("Claude 입력란에 초안이 있어 덮어쓰지 않습니다");
  let opened = false;
  try {
    await herdr("agent", "prompt", targets.claude, "/usage");
    for (let i = 0; i < 16; i += 1) {
      await sleep(500);
      const text = await herdr(
        "agent",
        "read",
        targets.claude,
        "--source",
        "visible",
        "--lines",
        "200",
      );
      if (/Settings\s+Status\s+Config\s+Usage/.test(text)) {
        opened = true;
        try {
          return parseClaudeUsage(text, Date.now());
        } catch {
          /* UI 로딩 중 */
        }
      }
    }
    throw new Error("Claude 사용량 UI 로딩 실패");
  } finally {
    if (opened) {
      const visible = await herdr(
        "agent",
        "read",
        targets.claude,
        "--source",
        "visible",
        "--lines",
        "200",
      );
      if (/Settings\s+Status\s+Config\s+Usage/.test(visible))
        await herdr("agent", "send-keys", targets.claude, "esc");
    }
  }
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(runtime, { recursive: true });
  const target = path.join(runtime, name);
  fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(`${target}.tmp`, target);
}

/** 대화의 공개 사용자/진행 메시지만 저장한다. reasoning·도구 출력·인증 정보는 저장하지 않는다. */
function checkpoint(provider: Provider, state: MonitorState) {
  const bytes = fs.readFileSync(rollout);
  const tail = bytes
    .subarray(Math.max(0, bytes.length - 2 * 1024 * 1024))
    .toString("utf8");
  const messages: { role: string; text: string }[] = [];
  for (const line of tail.split("\n")) {
    try {
      const row: unknown = JSON.parse(line);
      if (!record(row) || row.type !== "response_item" || !record(row.payload))
        continue;
      const item = row.payload;
      if (
        item.type !== "message" ||
        !["user", "assistant"].includes(String(item.role)) ||
        item.channel === "analysis" ||
        !Array.isArray(item.content)
      )
        continue;
      const text = item.content
        .flatMap((entry: unknown) =>
          record(entry) && typeof entry.text === "string" ? [entry.text] : [],
        )
        .join("\n");
      if (text)
        messages.push({ role: String(item.role), text: text.slice(0, 4000) });
    } catch {
      /* tail의 첫 불완전한 행 제외 */
    }
  }
  writeJson("checkpoint.json", {
    at: new Date().toISOString(),
    reason: `${provider} budget pause`,
    threadId,
    targets,
    handoff: "docs/agent-handoff.md",
    state,
    messages: messages.slice(-30),
  });
}

async function stop(
  provider: Provider,
  state: MonitorState,
  resetsAt: number | null,
) {
  const current = await agent(provider);
  if (current.agent_status === "blocked" || current.agent_status === "unknown")
    throw new Error(`${provider} UI 상태 확인이 필요해 자동 응답하지 않습니다`);
  checkpoint(provider, state);
  state[provider].paused = { pausedAt: Date.now(), resetsAt };
  writeJson("state.json", state);
  if (current.agent_status === "working")
    await herdr("agent", "send-keys", targets[provider], "esc");
  log("paused", {
    provider,
    resetsAt,
    checkpoint: path.join(runtime, "checkpoint.json"),
  });
}

async function resume(provider: Provider, state: MonitorState) {
  const current = await agent(provider);
  if (current.agent_status === "blocked" || current.agent_status === "unknown")
    throw new Error(`${provider} 승인/질문 대기: 자동 재개하지 않습니다`);
  if (current.agent_status !== "working") {
    await ensureEmptyInput(provider);
    const prompt =
      provider === "codex"
        ? "사용량 감시기가 한도 재설정 후 실제 잔여량 회복을 확인했습니다. docs/agent-handoff.md와 .local/agent-budgets/checkpoint.json, docs/reviews.md를 읽고 현재 상태를 확인한 뒤 우측 Opus 작업 관리·검수를 재개하세요. 전체 DICOM 앱 범위와 테스트 우선·mise/pnpm·FSD·shadcn/Storybook 규칙을 유지하고, 사용자 결정은 즉시 알려주세요. 대화를 clear하거나 완료로 오인하지 마세요."
        : "사용량 감시기가 한도 재설정 후 실제 사용량 회복을 확인했습니다. docs/agent-handoff.md, AGENTS.md, docs/claude-dicom-task.md와 자신의 최근 진행 기록을 확인하고 중단했던 구현·테스트를 이어가세요. Codex 검수 지적과 회귀 테스트를 유지하며 전체 완료 조건을 충족하세요. 유료 크레딧 활성화·모델 변경으로 우회하지 마세요.";
    await herdr("agent", "prompt", targets[provider], prompt);
  }
  delete state[provider].paused;
  writeJson("state.json", state);
  log("resumed", { provider });
  if (provider === "claude") {
    const supervisor = await agent("codex");
    const supervisorWindows =
      state.codex.error ||
      !state.codex.observedAt ||
      Date.now() - Date.parse(state.codex.observedAt) > 90000
        ? []
        : (state.codex.windows ?? []);
    if (
      canWakeSupervisor(
        String(supervisor.agent_status),
        Boolean(state.codex.paused),
        supervisorWindows,
      )
    ) {
      await ensureEmptyInput("codex");
      await herdr(
        "agent",
        "prompt",
        targets.codex,
        "사용량 감시기가 Claude의 한도 재설정과 실제 회복을 확인하고 opus-worker 구현을 재개했습니다. docs/agent-handoff.md와 .local/agent-budgets/state.json, docs/reviews.md를 읽고 우측 패널의 구현 관리·검수를 이어가세요. 새 사용자 결정이 필요하면 즉시 알리고 전체 DICOM 앱 목표를 계속 완수하세요. 기존 테스트 우선·mise/pnpm·FSD·shadcn/Storybook 규칙과 회귀 테스트를 유지하세요.",
      );
      log("supervisor-woken", { threadId });
    }
  }
}

async function ensureEmptyInput(provider: Provider) {
  const visible = await herdr(
    "agent",
    "read",
    targets[provider],
    "--source",
    "visible",
    "--lines",
    "200",
  );
  const line = visible
    .split("\n")
    .filter((item) => /^[❯›]/.test(item))
    .at(-1);
  const input = line?.replace(/^[❯›]\s*/, "").trim();
  if (
    input &&
    !input.startsWith("Try ") &&
    !input.startsWith("Press up") &&
    input !== "Ask Codex to do anything"
  )
    throw new Error(
      `${provider} 입력 초안을 보존하기 위해 재개 입력을 보류합니다`,
    );
}

async function sample(provider: Provider, state: MonitorState, apply: boolean) {
  try {
    const windows = await (provider === "codex" ? codexUsage() : claudeUsage());
    const entry = state[provider];
    entry.windows = windows;
    entry.observedAt = new Date().toISOString();
    delete entry.error;
    const decision = decideBudget(windows, entry.paused, Date.now());
    log("usage", { provider, windows, decision });
    if (!apply) return;
    writeJson("state.json", state);
    if (decision.action === "pause")
      await stop(provider, state, decision.resetsAt);
    if (decision.action === "resume") await resume(provider, state);
    if (decision.action === "wait" && entry.paused) {
      const current = await agent(provider);
      if (
        current.agent_status === "working" &&
        windows.some((window) => window.usedPercent > 90)
      )
        await herdr("agent", "send-keys", targets[provider], "esc");
    }
  } catch (error) {
    state[provider].error =
      error instanceof Error ? error.message : "사용량 조회 실패";
    if (apply) writeJson("state.json", state);
    log("check-failed", { provider, message: state[provider].error });
  }
}

async function main() {
  if (process.env.HERDR_ENV !== "1")
    throw new Error("Herdr 관리 pane에서 실행해야 합니다");
  const watch = process.argv.includes("--watch");
  const once = process.argv.includes("--once");
  const codexOnly = process.argv.includes("--codex-only");
  if (!watch && !once && !codexOnly)
    throw new Error("--once, --codex-only 또는 --watch를 지정하세요");
  const stateFile = path.join(runtime, "state.json");
  const state: MonitorState =
    watch && fs.existsSync(stateFile)
      ? (JSON.parse(fs.readFileSync(stateFile, "utf8")) as MonitorState)
      : { codex: {}, claude: {} };
  if (!watch) {
    await sample("codex", state, false);
    if (!codexOnly) await sample("claude", state, false);
    return;
  }
  fs.mkdirSync(runtime, { recursive: true });
  const pidFile = path.join(runtime, "monitor.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      /* 오래된 PID */
    }
    if (alive) throw new Error(`감시기가 이미 실행 중입니다(PID ${pid})`);
  }
  fs.writeFileSync(pidFile, String(process.pid));
  const cleanup = () => {
    if (
      fs.existsSync(pidFile) &&
      fs.readFileSync(pidFile, "utf8") === String(process.pid)
    )
      fs.unlinkSync(pidFile);
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  log("started", { pid: process.pid, targets, threadId, intervalSeconds: 30 });
  for (;;) {
    await sample("codex", state, true);
    await sample("claude", state, true);
    await sleep(30000);
  }
}

void main().catch((error: unknown) => {
  log("fatal", error instanceof Error ? error.message : "감시기 실패");
  process.exitCode = 1;
});
