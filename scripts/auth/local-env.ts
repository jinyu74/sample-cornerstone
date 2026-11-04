/**
 * 실행 중인 로컬 Supabase 연결 정보를 .env.local 에 쓴다(값은 출력하지 않는다).
 * 사용: mise exec -- pnpm auth:local-env
 */
import { readLocalStatus, writeEnvLocal } from "./local-supabase";

const file = await writeEnvLocal(readLocalStatus());
console.log(`로컬 Supabase 연결 설정을 썼습니다: ${file}`);
