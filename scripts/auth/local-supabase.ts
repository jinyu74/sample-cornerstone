/**
 * 로컬 Supabase(개발·테스트 전용) 관리 도구.
 * - 서비스 비밀키는 `supabase status` 에서 실행 중에만 읽고 파일·로그에 남기지 않는다.
 * - 로컬 주소(127.0.0.1·localhost·::1)가 아니면 어떤 관리 작업도 하지 않는다.
 * - 계정 비밀번호는 출력하지 않고 권한 0600 파일에만 쓴다.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLocalSupabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("로컬 Supabase 주소가 아닙니다(주소 형식 오류)");
  }
  if (parsed.protocol !== "http:" || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "로컬 Supabase 주소가 아니므로 관리 작업을 하지 않습니다(원격 프로젝트 보호)",
    );
  }
}

export interface LocalSupabaseStatus {
  apiUrl: string;
  publishableKey: string;
  /** 관리(admin) API 전용. 브라우저·Next 서버 설정에 넣지 않는다. */
  secretKey: string;
}

export function parseSupabaseStatus(text: string): LocalSupabaseStatus {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "로컬 Supabase 상태를 읽지 못했습니다. `mise exec -- supabase start` 로 먼저 실행하세요",
    );
  }
  const apiUrl = raw.API_URL;
  const publishableKey = raw.PUBLISHABLE_KEY ?? raw.ANON_KEY;
  const secretKey = raw.SECRET_KEY ?? raw.SERVICE_ROLE_KEY;
  if (
    typeof apiUrl !== "string" ||
    typeof publishableKey !== "string" ||
    typeof secretKey !== "string"
  ) {
    throw new Error(
      "로컬 Supabase 가 실행 중이 아닙니다. `mise exec -- supabase start` 로 먼저 실행하세요",
    );
  }
  return { apiUrl, publishableKey, secretKey };
}

export function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

/** 실행 중인 로컬 스택의 연결 정보(값을 출력하지 않는다) */
export function readLocalStatus(cwd = process.cwd()): LocalSupabaseStatus {
  let text: string;
  try {
    text = execFileSync("supabase", ["status", "-o", "json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    text = "";
  }
  const status = parseSupabaseStatus(text);
  assertLocalSupabaseUrl(status.apiUrl);
  return status;
}

const OWNED_KEYS = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"] as const;

/**
 * Next 서버가 읽는 로컬 설정(.env.local, git 제외)에서 이 스크립트가 소유한 키만 갱신한다.
 * 다른 설정·주석·빈 줄·순서는 그대로 두고, 없는 키는 끝에 한 번만 추가한다.
 * 서비스 비밀키는 쓰지 않는다. 파일 권한은 0600 으로 맞춘다.
 */
export async function writeEnvLocal(
  status: LocalSupabaseStatus,
  file = path.join(process.cwd(), ".env.local"),
): Promise<string> {
  const values: Record<(typeof OWNED_KEYS)[number], string> = {
    SUPABASE_URL: status.apiUrl,
    SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
  };
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  const written = new Set<string>();
  const merged: string[] = [];
  for (const line of lines) {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      line,
    )?.[1];
    const owned = OWNED_KEYS.find((name) => name === key);
    if (!owned) {
      merged.push(line);
    } else if (!written.has(owned)) {
      // 같은 키가 여러 번 있으면 첫 위치만 갱신하고 나머지 중복은 지운다
      merged.push(`${owned}=${values[owned]}`);
      written.add(owned);
    }
  }
  for (const name of OWNED_KEYS)
    if (!written.has(name)) merged.push(`${name}=${values[name]}`);
  await writeFile(file, `${merged.join("\n")}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}

/**
 * 계정 비밀번호 파일 경로. 이메일을 그대로 파일명으로 쓰지 않고 인코딩해
 * `/`·`\\`·`..`·숨김 파일 이름이 되지 않게 하며, 결과가 지정 폴더 바로 아래인지 확인한다.
 */
export function secretFilePath(directory: string, email: string): string {
  const encoded = encodeURIComponent(email.trim().toLowerCase())
    .replace(/\./g, "%2E")
    .replace(/\*/g, "%2A");
  const base = path.resolve(directory);
  const file = path.join(base, `user-${encoded}.txt`);
  if (path.dirname(file) !== base) {
    throw new Error("비밀번호 파일 경로가 지정한 폴더를 벗어납니다");
  }
  return file;
}

/** 관리자 경로(admin API)로 이메일 계정을 만들거나 비밀번호를 바꾼다. 공개 가입 API 는 쓰지 않는다. */
export async function upsertLocalUser(
  status: LocalSupabaseStatus,
  email: string,
  password: string,
): Promise<{ id: string; created: boolean }> {
  assertLocalSupabaseUrl(status.apiUrl);
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const normalized = email.trim().toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`계정 목록 조회 실패: ${error.message}`);
    const found = data.users.find((user) => user.email === normalized);
    if (found) {
      const { error: updateError } = await admin.auth.admin.updateUserById(
        found.id,
        { password },
      );
      if (updateError)
        throw new Error(`비밀번호 변경 실패: ${updateError.message}`);
      return { id: found.id, created: false };
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`계정 생성 실패: ${error?.message ?? "알 수 없음"}`);
  return { id: data.user.id, created: true };
}

/** 비밀번호를 권한 0600 파일에 쓴다(출력하지 않는다) */
export async function writeSecretFile(
  file: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, content, { mode: 0o600 });
  await chmod(file, 0o600);
}
