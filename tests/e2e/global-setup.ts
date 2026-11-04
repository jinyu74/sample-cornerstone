import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  generatePassword,
  readLocalStatus,
  upsertLocalUser,
  writeSecretFile,
} from "../../scripts/auth/local-supabase";
import {
  ctStack,
  jpegLsImage,
  multiframeSpatial,
  mrStack,
  nonDicom,
  otherStudyImage,
  singleImage,
} from "../fixtures/dicom/scenarios";

export const FIXTURE_DIR = path.join(import.meta.dirname, ".fixtures");
/** 테스트 계정 비밀번호(실행마다 새로 생성, 권한 0600, git 제외) */
export const E2E_USERS_FILE = path.join(
  import.meta.dirname,
  "..",
  "..",
  ".local",
  "e2e",
  "users.json",
);
export const E2E_EMAILS = {
  a: "e2e-reader-a@example.test",
  b: "e2e-reader-b@example.test",
} as const;

/**
 * E2E 준비
 * 1) 로컬 Supabase 에 관리자 경로(admin API)로 테스트 계정 A·B 를 만든다(공개 가입 아님).
 * 2) 업로드할 합성 DICOM 파일을 디스크에 쓴다(실제 환자 데이터 아님).
 */
export default async function globalSetup() {
  const status = readLocalStatus();
  const users: Record<string, { email: string; password: string; id: string }> =
    {};
  for (const [key, email] of Object.entries(E2E_EMAILS)) {
    const password = generatePassword();
    const { id } = await upsertLocalUser(status, email, password);
    users[key] = { email, password, id };
  }
  await writeSecretFile(E2E_USERS_FILE, JSON.stringify(users));

  await rm(FIXTURE_DIR, { recursive: true, force: true });
  const groups = {
    single: [await singleImage()],
    stack: await ctStack(),
    jpegls: [await jpegLsImage()],
    multiframe: [await multiframeSpatial()],
    invalid: [nonDicom()],
    mr: await mrStack(),
    uncalibrated: [await otherStudyImage()],
  };
  for (const [group, files] of Object.entries(groups)) {
    const dir = path.join(FIXTURE_DIR, group);
    await mkdir(dir, { recursive: true });
    for (const file of files)
      await writeFile(path.join(dir, file.name), file.bytes);
  }
}
