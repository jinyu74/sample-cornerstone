import path from "node:path";
import { fileURLToPath } from "node:url";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
      "@tests": path.resolve(dirname, "tests"),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        // 도메인 단위·저장소 통합·컴포넌트 테스트 (jsdom + fake-indexeddb)
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: [
            "src/**/*.test.{ts,tsx}",
            "tests/integration/**/*.test.{ts,tsx}",
          ],
          setupFiles: ["./tests/setup/vitest.setup.ts"],
        },
      },
      {
        // Storybook stories 를 실제 브라우저(chromium)에서 렌더링·상호작용·a11y 검사
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, ".storybook") }),
        ],
        // 테스트 중 의존성 재최적화로 페이지가 다시 로드되지 않도록 미리 포함한다.
        optimizeDeps: {
          include: [
            "@base-ui/react/alert-dialog",
            "@base-ui/react/button",
            "@base-ui/react/dialog",
            "@base-ui/react/input",
            "@base-ui/react/merge-props",
            "@base-ui/react/progress",
            "@base-ui/react/select",
            "@base-ui/react/separator",
            "@base-ui/react/slider",
            "@base-ui/react/switch",
            "@base-ui/react/toggle-group",
            "@base-ui/react/toggle",
            "@base-ui/react/tooltip",
            "@base-ui/react/use-render",
            "dicom-parser",
            "next/link",
            "lucide-react",
            "class-variance-authority",
            "cn",
          ],
        },
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
