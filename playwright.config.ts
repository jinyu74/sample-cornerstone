import { defineConfig, devices } from "@playwright/test";

/**
 * E2E_MODE=prod(기본): 프로덕션 빌드 후 next start 로 검증한다.
 * E2E_MODE=dev: next dev(Turbopack 개발 서버)로 같은 흐름을 검증한다.
 */
const MODE = process.env.E2E_MODE === "dev" ? "dev" : "prod";
const PORT = Number(process.env.E2E_PORT ?? (MODE === "dev" ? 3200 : 3100));

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
    { name: `chromium-${MODE}`, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command:
      MODE === "dev"
        ? `pnpm exec next dev -p ${PORT} -H 127.0.0.1`
        : // E2E_SKIP_BUILD=1 이면 방금 검증한 빌드를 재사용한다(미리보기 서버가 같은 .next 를 쓰는 동안 재빌드 방지).
          `${process.env.E2E_SKIP_BUILD === "1" ? "" : "pnpm build && "}pnpm exec next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
