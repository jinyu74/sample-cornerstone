/**
 * 실제 로컬 Supabase(Auth·Data API)로 RLS 를 검증하는 테스트 지원.
 * - 전용 합성 계정(db-reader-a/b@example.test)만 만들고, 그 계정의 catalog 자료만 지운다.
 * - 비밀번호는 실행마다 새로 만들고 메모리에만 둔다(출력·파일 저장 없음).
 * - 서비스 비밀키는 계정 준비·정리에만 쓰며 앱 코드에는 들어가지 않는다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  generatePassword,
  readLocalStatus,
  upsertLocalUser,
  type LocalSupabaseStatus,
} from "../../scripts/auth/local-supabase";

export const DB_TEST_EMAILS = {
  a: "db-reader-a@example.test",
  b: "db-reader-b@example.test",
} as const;

export const CATALOG_TABLES = [
  "catalog_instances",
  "catalog_series",
  "catalog_studies",
] as const;
export const CATALOG_RELATIONS = [
  ...CATALOG_TABLES,
  "catalog_study_summaries",
] as const;

const NO_PERSIST = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

export interface DbTestUser {
  id: string;
  client: SupabaseClient;
}

export interface DbTestContext {
  status: LocalSupabaseStatus;
  anon: SupabaseClient;
  admin: SupabaseClient;
  a: DbTestUser;
  b: DbTestUser;
}

async function signIn(
  status: LocalSupabaseStatus,
  email: string,
): Promise<DbTestUser> {
  const password = generatePassword();
  const { id } = await upsertLocalUser(status, email, password);
  const client = createClient(status.apiUrl, status.publishableKey, NO_PERSIST);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`테스트 계정 로그인 실패: ${error.message}`);
  return { id, client };
}

export async function setupDbTest(): Promise<DbTestContext> {
  const status = readLocalStatus();
  return {
    status,
    anon: createClient(status.apiUrl, status.publishableKey, NO_PERSIST),
    admin: createClient(status.apiUrl, status.secretKey, NO_PERSIST),
    a: await signIn(status, DB_TEST_EMAILS.a),
    b: await signIn(status, DB_TEST_EMAILS.b),
  };
}

/** 합성 계정 owner 의 catalog 행만 지운다(검사 삭제가 시리즈·영상으로 이어진다) */
export async function clearCatalog(
  admin: SupabaseClient,
  ownerIds: readonly string[],
): Promise<void> {
  const { error } = await admin
    .from("catalog_studies")
    .delete()
    .in("owner_id", [...ownerIds]);
  if (error) throw new Error(`테스트 자료 정리 실패: ${error.message}`);
}
