import { test as base } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  readLocalStatus,
  type LocalSupabaseStatus,
} from "../../scripts/auth/local-supabase";

import { e2eUser } from "./helpers";

export { expect } from "@playwright/test";

let status: LocalSupabaseStatus | undefined;

/**
 * 합성 E2E 계정 A·B 의 서버 목록(catalog) 행만 지운다.
 * 서버 DB 는 브라우저 컨텍스트와 달리 테스트 사이에 남으므로 테스트마다 같은 출발점을 만든다.
 * 다른 계정·Auth 세션·볼륨은 건드리지 않는다. 서비스 비밀키는 이 정리에만 쓴다.
 */
export async function resetServerCatalog(): Promise<void> {
  status ??= readLocalStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const owners = [(await e2eUser("a")).id, (await e2eUser("b")).id];
  const { error } = await admin
    .from("catalog_studies")
    .delete()
    .in("owner_id", owners);
  if (error) throw new Error(`E2E 서버 목록 정리 실패: ${error.message}`);
}

/** 모든 E2E 가 쓰는 test: 시작 전에 합성 계정의 서버 목록을 비운다 */
export const test = base.extend<{ cleanServerCatalog: void }>({
  cleanServerCatalog: [
    async ({}, use) => {
      await resetServerCatalog();
      await use();
    },
    { auto: true },
  ],
});
