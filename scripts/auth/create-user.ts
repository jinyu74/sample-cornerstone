/**
 * 로컬 Supabase 에 관리자 경로로 로그인 계정을 만든다(이미 있으면 비밀번호를 새로 정한다).
 * 비밀번호는 출력하지 않고 .local/auth/user-<인코딩된 이메일>.txt (권한 0600) 에만 쓴다.
 * 사용: mise exec -- pnpm auth:create-user reader@example.test
 */
import path from "node:path";

import {
  generatePassword,
  readLocalStatus,
  secretFilePath,
  upsertLocalUser,
  writeSecretFile,
} from "./local-supabase";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("사용법: pnpm auth:create-user <이메일>");
  process.exit(1);
}

const status = readLocalStatus();
const password = generatePassword();
const { created } = await upsertLocalUser(status, email, password);
const file = secretFilePath(path.join(process.cwd(), ".local", "auth"), email);
await writeSecretFile(file, `${password}\n`);
console.log(
  `${created ? "계정을 만들었습니다" : "기존 계정의 비밀번호를 새로 정했습니다"}: ${email}`,
);
console.log(`비밀번호 파일(권한 0600, 출력하지 않음): ${file}`);
