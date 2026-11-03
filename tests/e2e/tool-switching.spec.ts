import { expect, test } from "@playwright/test";

import { UID } from "../fixtures/dicom/scenarios";

import {
  canvasBrightness,
  click,
  drag,
  importGroups,
  openSeries,
  results,
  viewport,
} from "./helpers";

test("확대 사용 후 길이 도구로 바꾸면 왼쪽 드래그로 길이를 그린다", async ({
  page,
}) => {
  await importGroups(page, "single");
  await openSeries(page, UID.studyA, UID.seriesSingle);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await drag(page, [0.5, 0.4], [0.5, 0.6]);
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await page.getByRole("button", { name: "길이", exact: true }).click();
  await drag(page, [0.35, 0.5], [0.65, 0.5]);
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).first()).toContainText("길이");
});

for (const previous of ["확대", "이동"]) {
  for (const next of ["각도", "타원", "윤곽", "메모"]) {
    test(`${previous} 사용 후 ${next} 도구로 바꾸면 해당 주석을 생성한다`, async ({
      page,
    }) => {
      await importGroups(page, "single");
      await openSeries(page, UID.studyA, UID.seriesSingle);
      await page.getByRole("button", { name: previous, exact: true }).click();
      await drag(page, [0.5, 0.4], [0.5, 0.6]);
      await page
        .getByRole("button", { name: "화면 맞춤", exact: true })
        .click();
      await page.getByRole("button", { name: next, exact: true }).click();
      if (next === "각도") {
        await click(page, [0.3, 0.3]);
        await click(page, [0.4, 0.45]);
        await click(page, [0.5, 0.3]);
      } else if (next === "윤곽") {
        const box = (await viewport(page).boundingBox())!;
        await page.mouse.move(
          box.x + box.width * 0.4,
          box.y + box.height * 0.4,
        );
        await page.mouse.down();
        for (const [x, y] of [
          [0.6, 0.4],
          [0.6, 0.6],
          [0.4, 0.6],
          [0.4, 0.401],
        ]) {
          await page.mouse.move(
            box.x + box.width * x!,
            box.y + box.height * y!,
            { steps: 6 },
          );
        }
        await page.mouse.up();
      } else {
        await drag(page, [0.4, 0.4], [0.6, 0.6]);
      }
      await expect(results(page)).toHaveCount(1);
      await expect(results(page).first()).toContainText(next);
    });
  }
}

test("확대 이후 선택·밝기대비·이동으로 바꾸면 각 도구의 동작으로 전환한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await importGroups(page, "single");
  await openSeries(page, UID.studyA, UID.seriesSingle);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await drag(page, [0.5, 0.4], [0.5, 0.6]);
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await page.getByRole("button", { name: "선택", exact: true }).click();
  const canvas = viewport(page).locator("canvas");
  const before = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  await drag(page, [0.5, 0.3], [0.5, 0.8]);
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(before);

  await page.getByRole("button", { name: "밝기·대비", exact: true }).click();
  const voi = await viewport(page).getAttribute("data-voi");
  await drag(page, [0.5, 0.5], [0.7, 0.6]);
  await expect(viewport(page)).not.toHaveAttribute("data-voi", voi!);

  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.getByRole("button", { name: "이동", exact: true }).click();
  await drag(page, [0.5, 0.5], [0.75, 0.5]);
  await expect
    .poll(() =>
      canvasBrightness(page, { x0: 0.6, y0: 0.45, x1: 0.62, y1: 0.55 }),
    )
    .toBeLessThan(30);
  await page.getByRole("button", { name: "길이", exact: true }).click();
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await drag(page, [0.35, 0.5], [0.65, 0.5]);
  await expect(results(page)).toHaveCount(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/herdr-tool-switching-fixed.png" });
});
