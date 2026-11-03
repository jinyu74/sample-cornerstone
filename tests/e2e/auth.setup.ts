import { expect, test as setup } from "@playwright/test";

import { AUTH_STATE } from "./auth-paths";
import { login } from "./helpers";

setup("계정 A 로 실제 로그인한 상태를 저장한다", async ({ page }) => {
  await login(page, "a");
  await expect(page.getByRole("heading", { name: "검사 목록" })).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE });
});
