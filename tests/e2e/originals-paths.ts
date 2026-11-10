import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";

/** E2E 실행 전용 서버 원본 루트의 접두사(이 형식의 폴더만 다룬다) */
export const ORIGINALS_PREFIX = path.resolve(".local", "e2e", "originals-");

/**
 * 이번 E2E 실행의 서버 원본 저장 루트와 실행별 토큰. 3000 미리보기의 `.local/dicom-originals` 와 분리한다.
 * 설정 파일이 워커에서 다시 평가돼도 같은 값을 쓰도록 환경변수로 고정한다.
 * 환경변수로 루트를 받았다는 것만으로는 소유권이 생기지 않는다(claimOriginalsRoot 가 새로 만든 경우만 소유).
 */
export const ORIGINALS_DIR =
  (process.env.E2E_ORIGINALS_DIR ??= `${ORIGINALS_PREFIX}${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`);
const TOKEN = (process.env.E2E_ORIGINALS_TOKEN ??=
  randomBytes(16).toString("hex"));
/**
 * 이번 실행의 생성 성공 기록(claim nonce). 토큰은 환경변수로 이어받을 수 있으므로 토큰 일치만으로는
 * 소유로 보지 않는다. claim 이 루트를 실제로 새로 만든 경우에만 새 nonce 를 만들어 여기와 표식에 남기고,
 * 워커·teardown 은 이 값을 이어받는다.
 */
const CLAIM_ENV = "E2E_ORIGINALS_CLAIM";
/** 소유 표식(저장소가 쓰는 v1/ 밖) */
const OWNER_MARKER = path.join(ORIGINALS_DIR, ".e2e-run-owner");

/**
 * 이번 실행이 루트를 직접 새로 만들고 실행별 토큰 표식을 남긴다.
 * 루트가 이미 있으면(이전 실행·사용자 폴더) 실패하며 소유권을 주장하지 않는다.
 */
export async function claimOriginalsRoot(): Promise<void> {
  // 이어받은(이전 실행의) 생성 기록은 버린다. 이번 생성에 성공해야만 다시 생긴다.
  delete process.env[CLAIM_ENV];
  if (!ORIGINALS_DIR.startsWith(ORIGINALS_PREFIX))
    throw new Error("E2E 원본 루트 형식이 아닙니다");
  await mkdir(path.dirname(ORIGINALS_DIR), { recursive: true });
  await mkdir(ORIGINALS_DIR, { mode: 0o700 }); // 이미 있으면 EEXIST
  const handle = await open(
    OWNER_MARKER,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  const claim = randomBytes(16).toString("hex");
  try {
    await handle.writeFile(`${TOKEN}\n${claim}`);
  } finally {
    await handle.close();
  }
  process.env[CLAIM_ENV] = claim;
}

/** 루트가 이번 실행의 것인지: 형식·실제 폴더·일반 파일 표식·토큰과 이번 생성 기록(claim) 모두 일치 */
export async function ownsOriginalsRoot(): Promise<boolean> {
  if (!ORIGINALS_DIR.startsWith(ORIGINALS_PREFIX)) return false;
  const claim = process.env[CLAIM_ENV];
  if (!claim) return false;
  try {
    const root = await lstat(ORIGINALS_DIR);
    const marker = await lstat(OWNER_MARKER);
    if (!root.isDirectory() || root.isSymbolicLink() || !marker.isFile())
      return false;
    return (await readFile(OWNER_MARKER, "utf8")) === `${TOKEN}\n${claim}`;
  } catch {
    return false;
  }
}

/** 소유한 루트에서만 지정한 합성 계정의 원본 폴더를 지운다(소유하지 않으면 지우지 않고 실패) */
export async function removeOwnedUserDirs(
  userIds: readonly string[],
): Promise<void> {
  if (!(await ownsOriginalsRoot()))
    throw new Error(
      "이번 E2E 실행이 만든 원본 루트가 아니므로 정리하지 않습니다",
    );
  for (const id of userIds) {
    if (!/^[0-9a-zA-Z-]+$/.test(id)) throw new Error("계정 ID 형식이 아닙니다");
    await rm(path.join(ORIGINALS_DIR, "v1", "users", id), {
      recursive: true,
      force: true,
    });
  }
}

/** 소유한 루트만 통째로 지운다 */
export async function removeOwnedOriginalsRoot(): Promise<boolean> {
  if (!(await ownsOriginalsRoot())) return false;
  await rm(ORIGINALS_DIR, { recursive: true, force: true });
  return true;
}
