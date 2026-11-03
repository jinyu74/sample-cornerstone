import { expect, test } from "@playwright/test";

import { UID } from "../fixtures/dicom/scenarios";

import {
  drag,
  importGroups,
  login,
  openSeries,
  results,
  viewport,
} from "./helpers";

// PR #4 리뷰 P1: 세션 무효 뒤 미저장 확인(beforeunload)을 취소해도 이전 계정 화면을 계속 쓸 수 없어야 한다.
test.use({ storageState: { cookies: [], origins: [] } });

test("세션이 무효가 된 뒤 뷰어의 미저장 확인을 취소해도 보호 화면이 남지 않고 로그인으로 이동할 수 있다", async ({
  page,
}) => {
  await login(page, "a");
  await importGroups(page, "single");
  await openSeries(page, UID.studyA, UID.seriesSingle);

  // 브라우저의 "사이트에서 나가시겠습니까?" 확인을 사용자가 취소한다
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    // 진단: 실제 브라우저 확인이 떴고 취소했는지 기록한다
    console.log(`[dialog] ${dialog.type()} → dismiss`);
    void dialog.dismiss();
  });

  await page.getByRole("button", { name: "길이" }).click();
  await drag(page, [0.35, 0.5], [0.65, 0.5]);
  await expect(results(page)).toHaveCount(1);

  // 자동 저장(1.5초) 전에 세션이 사라지고 탭이 다시 활성화된 상황
  await page.context().clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  // 이전 계정의 영상·결과 화면은 남지 않는다
  await expect(viewport(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(results(page)).toHaveCount(0);
  // 로그인 화면에 도착했거나, 이동이 막혔다면 로그인으로 가는 안내가 있다
  await expect(
    page
      .getByRole("heading", { name: "로그인" })
      .or(page.getByRole("link", { name: "로그인 화면으로 이동" })),
  ).toBeVisible();

  // 다시 포커스해도 보호 화면이 되살아나지 않는다
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(viewport(page)).toHaveCount(0);

  // 보호 화면을 치우며 시작한 마지막 편집 저장은 이동 전에 끝나 다시 로그인하면 남아 있다
  await login(page, "a", `/studies/${UID.studyA}?series=${UID.seriesSingle}`);
  await expect(viewport(page)).toHaveAttribute(
    "data-render-state",
    "rendered",
    { timeout: 30_000 },
  );
  await expect(results(page)).toHaveCount(1);
});
