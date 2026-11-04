import { defineConfig, devices } from "@playwright/test";

import { readLocalStatus } from "./scripts/auth/local-supabase";
import { AUTH_STATE } from "./tests/e2e/auth-paths";

/**
 * E2E_MODE=prod(기본): 프로덕션 빌드 후 next start 로 검증한다.
 * E2E_MODE=dev: next dev(Turbopack 개발 서버)로 같은 흐름을 검증한다.
 */
const MODE = process.env.E2E_MODE === "dev" ? "dev" : "prod";
const PORT = Number(process.env.E2E_PORT ?? (MODE === "dev" ? 3200 : 3100));

/**
 * 실제 로컬 Supabase Auth 로 로그인한다(테스트 우회 없음). 스택이 없으면 여기서 명확히 실패한다.
 * Next 서버에는 공개 키만 넘기고 서비스 비밀키는 global-setup 의 계정 준비에서만 쓴다.
 */
const supabase = readLocalStatus();

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: `test-results/e2e-${MODE}`,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // 계정 A 로 실제 로그인해 쿠키를 저장한다(기존 영상 흐름 E2E 가 사용)
    {
      name: `auth-setup-${MODE}`,
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: `chromium-${MODE}`,
      dependencies: [`auth-setup-${MODE}`],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
    },
  ],
  webServer: {
    command:
      MODE === "dev"
        ? `pnpm exec next dev -p ${PORT} -H 127.0.0.1`
        : // E2E_SKIP_BUILD=1 이면 방금 검증한 빌드를 재사용한다(미리보기 서버가 같은 .next 를 쓰는 동안 재빌드 방지).
          `${process.env.E2E_SKIP_BUILD === "1" ? "" : "pnpm build && "}pnpm exec next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: {
      SUPABASE_URL: supabase.apiUrl,
      SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    },
    timeout: 300_000,
  },
});
