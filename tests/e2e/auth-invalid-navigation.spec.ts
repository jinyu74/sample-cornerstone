import { expect, type Page, test } from "@playwright/test";

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

test("메모를 입력하는 중(포커스 유지) 세션이 끝나도 입력한 메모가 저장돼 다시 로그인하면 복원된다", async ({
  page,
}) => {
  await login(page, "a");
  await importGroups(page, "single");
  await openSeries(page, UID.studyA, UID.seriesSingle);
  page.on("dialog", (dialog) => void dialog.dismiss());

  await page.getByRole("button", { name: "길이" }).click();
  await drag(page, [0.35, 0.5], [0.65, 0.5]);
  await expect(results(page)).toHaveCount(1);
  await results(page).first().click();
  const note = page.getByRole("textbox", { name: "메모" });
  await note.fill("세션 종료 직전 메모");
  await expect(note).toBeFocused();

  // 입력 칸 포커스를 유지한 채 세션이 사라지고 창 포커스로 재검증된다
  await page.context().clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(viewport(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("textbox", { name: "메모" })).toHaveCount(0);

  await login(page, "a", `/studies/${UID.studyA}?series=${UID.seriesSingle}`);
  await expect(viewport(page)).toHaveAttribute(
    "data-render-state",
    "rendered",
    { timeout: 30_000 },
  );
  await results(page).first().click();
  await expect(page.getByRole("textbox", { name: "메모" })).toHaveValue(
    "세션 종료 직전 메모",
  );
});

/** 좁은 화면: 결과를 선택하면 영상으로 이동하며 Sheet 가 닫히므로, 선택 후 다시 열어 편집기를 쓴다 */
async function openSelectedResultSheet(page: Page) {
  await page.getByRole("button", { name: "작업 결과 열기" }).click();
  await page
    .getByRole("dialog", { name: "작업 결과" })
    .getByRole("list", { name: "작업 결과" })
    .getByRole("listitem")
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "작업 결과" })).toHaveCount(0);
  await page.getByRole("button", { name: "작업 결과 열기" }).click();
  const sheet = page.getByRole("dialog", { name: "작업 결과" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("모바일 결과 Sheet(Portal)에서 메모를 입력하는 중 세션이 끝나도 메모가 저장돼 다시 로그인하면 복원된다", async ({
  page,
}) => {
  await login(page, "a");
  await importGroups(page, "single");
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeries(page, UID.studyA, UID.seriesSingle);
  page.on("dialog", (dialog) => void dialog.dismiss());

  await page.getByRole("button", { name: "길이" }).click();
  await drag(page, [0.35, 0.5], [0.65, 0.5]);
  const sheet = await openSelectedResultSheet(page);
  const note = sheet.getByRole("textbox", { name: "메모" });
  await note.fill("모바일 시트 메모");
  await expect(note).toBeFocused();

  // Sheet 의 메모 입력 칸에 포커스를 유지한 채 세션이 사라지고 창 포커스로 재검증된다
  await page.context().clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(viewport(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("textbox", { name: "메모" })).toHaveCount(0);

  await login(page, "a", `/studies/${UID.studyA}?series=${UID.seriesSingle}`);
  await expect(viewport(page)).toHaveAttribute(
    "data-render-state",
    "rendered",
    { timeout: 30_000 },
  );
  const reopened = await openSelectedResultSheet(page);
  await expect(reopened.getByRole("textbox", { name: "메모" })).toHaveValue(
    "모바일 시트 메모",
  );
});
