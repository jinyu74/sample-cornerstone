import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  generatePassword,
  readLocalStatus,
  upsertLocalUser,
} from "../../scripts/auth/local-supabase";

import { clearCatalog } from "./support";

/** 앱 Route Handler 를 거치지 않는 공개 RPC 도 메타데이터 계약을 지켜야 한다. */
const payload = () => ({
  studyInstanceUid: "2.25.9701",
  studyDescription: "Synthetic input review",
  series: [
    {
      seriesInstanceUid: "2.25.9702",
      instances: [
        { sopInstanceUid: "2.25.9703", contentDigest: "1".padStart(64, "0") },
      ],
    },
  ],
});

let client: SupabaseClient;
let admin: SupabaseClient;
let owner: string;

beforeAll(async () => {
  const status = readLocalStatus();
  const email = "db-review-input@example.test";
  const password = generatePassword();
  owner = (await upsertLocalUser(status, email, password)).id;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  client = createClient(status.apiUrl, status.publishableKey, options);
  admin = createClient(status.apiUrl, status.secretKey, options);
  const login = await client.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  await clearCatalog(admin, [owner]);
  const valid = await client.rpc("sync_catalog_study", {
    p_expected_owner: owner,
    p_study: payload(),
  });
  expect(valid.error).toBeNull();
});

beforeEach(async () => clearCatalog(admin, [owner]));
afterAll(async () => {
  if (admin && owner) await clearCatalog(admin, [owner]);
});

describe("직접 RPC 입력 검증", () => {
  it.each([
    [
      "검사의 픽셀 필드",
      (p: ReturnType<typeof payload>) =>
        Object.assign(p, { pixelData: "AAAA" }),
    ],
    [
      "시리즈의 알 수 없는 필드",
      (p: ReturnType<typeof payload>) =>
        Object.assign(p.series[0]!, { bytes: [1, 2] }),
    ],
    [
      "영상의 파일 필드",
      (p: ReturnType<typeof payload>) =>
        Object.assign(p.series[0]!.instances[0]!, { file: "AAAA" }),
    ],
    [
      "문자열 대신 객체",
      (p: ReturnType<typeof payload>) =>
        Object.assign(p, { studyDescription: { text: "bad" } }),
    ],
  ])("%s는 거부하고 레코드를 남기지 않는다", async (_name, mutate) => {
    const invalid = payload();
    mutate(invalid);
    const { error } = await client.rpc("sync_catalog_study", {
      p_expected_owner: owner,
      p_study: invalid,
    });
    expect(error?.code).toBe("22023");
    const rows = await client
      .from("catalog_studies")
      .select("study_instance_uid");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });
});
