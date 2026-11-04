import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { UID } from "../fixtures/dicom/scenarios";

import { AUTH_STATE } from "./auth-paths";
import {
  brightness,
  canvasBrightness,
  click,
  drag,
  expectSaved,
  importGroups,
  openSeries,
  results,
  setPoint,
  viewport,
  waitRendered,
} from "./helpers";

const LEFT = { x0: 0.3, y0: 0.4, x1: 0.45, y1: 0.6 };
/** 영상 전체 평균 밝기(표시 방향과 무관). 표식 8×8/32×32 의 단계 차이 ≈ 255 × 0.2 / 16 ≈ 3.2 */
const WHOLE = { x0: 0, y0: 0, x1: 1, y1: 1 };

test.describe("측정·라벨·저장·복원", () => {
  test("길이 측정 → 좌표 편집(mm) → 라벨·대상·메모 → 새로고침 후 같은 영상에 복원", async ({
    page,
  }) => {
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);

    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await expect(results(page)).toHaveCount(1);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "1");

    await setPoint(page, 1, 0, 0);
    await setPoint(page, 2, 10, 0);
    // PixelSpacing 0.5mm → 10 px × 0.5 = 5mm
    await expect(page.getByText("5.00 mm").first()).toBeVisible();

    await page.getByRole("combobox", { name: "라벨" }).click();
    await page.getByRole("option", { name: "결절" }).click();
    await page.getByRole("button", { name: "새 대상" }).click();
    await page.getByRole("textbox", { name: "메모" }).fill("합성 영상 측정");
    await page.getByRole("textbox", { name: "메모" }).blur();
    await expect(results(page).first()).toContainText("결절 1");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expectSaved(page);

    await page.reload();
    await waitRendered(page);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText("결절 1");
    await expect(results(page).first()).toContainText("길이 · 5.00 mm");
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "1");
    await results(page).first().getByRole("button").first().click();
    await expect(page.getByRole("textbox", { name: "메모" })).toHaveValue(
      "합성 영상 측정",
    );

    // 기존 길이의 두 번째 핸들(10,0)을 (20,0) 으로 끌어 옮기고 저장·새로고침 후 좌표를 확인한다.
    await page.getByRole("button", { name: "선택" }).click();
    const box = (await viewport(page).boundingBox())!;
    const size = Math.min(box.width, box.height);
    const toScreen = (column: number, row: number) => ({
      x: box.x + (box.width - size) / 2 + ((column + 0.5) / 32) * size,
      y: box.y + (box.height - size) / 2 + ((row + 0.5) / 32) * size,
    });
    const from = toScreen(10, 0);
    const to = toScreen(20, 0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    const column = page.getByRole("spinbutton", { name: "점 2 열" });
    await expect
      .poll(async () => Number(await column.inputValue()))
      .toBeGreaterThan(19.5);
    expect(Number(await column.inputValue())).toBeLessThan(20.5);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expectSaved(page);
    await page.reload();
    await waitRendered(page);
    await results(page).first().getByRole("button").first().click();
    const restored = Number(
      await page.getByRole("spinbutton", { name: "점 2 열" }).inputValue(),
    );
    expect(restored).toBeGreaterThan(19.5);
    expect(restored).toBeLessThan(20.5);
  });

  test("PixelSpacing 이 없는 영상은 px 단위와 안내를 표시한다", async ({
    page,
  }) => {
    await importGroups(page, "uncalibrated");
    await openSeries(page, UID.studyB, UID.seriesStudyB);

    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await setPoint(page, 1, 0, 0);
    await setPoint(page, 2, 3, 4);

    await expect(results(page).first()).toContainText("길이 · 5.00 px");
    await expect(
      page.getByText(
        "PixelSpacing 이 없거나 유효하지 않아 픽셀 단위로 표시합니다.",
      ),
    ).toBeVisible();
  });

  test("각도·타원·윤곽·화살표 메모를 공식 도구로 그린다", async ({ page }) => {
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);

    await page.getByRole("button", { name: "각도" }).click();
    await click(page, [0.3, 0.3]);
    await click(page, [0.4, 0.45]);
    await click(page, [0.5, 0.3]);
    await expect(results(page)).toHaveCount(1);

    await page.getByRole("button", { name: "타원" }).click();
    await drag(page, [0.45, 0.6], [0.55, 0.7]);
    await expect(results(page)).toHaveCount(2);

    await page.getByRole("button", { name: "윤곽" }).click();
    const path: [number, number][] = [
      [0.6, 0.3],
      [0.7, 0.3],
      [0.7, 0.4],
      [0.6, 0.4],
      [0.6, 0.301],
    ];
    const box = (await viewport(page).boundingBox())!;
    await page.mouse.move(
      box.x + box.width * path[0]![0],
      box.y + box.height * path[0]![1],
    );
    await page.mouse.down();
    for (const [x, y] of path.slice(1))
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y, {
        steps: 6,
      });
    await page.mouse.up();
    await expect(results(page)).toHaveCount(3);

    await page.getByRole("button", { name: "메모" }).click();
    await drag(page, [0.3, 0.7], [0.4, 0.8]);
    await expect(results(page)).toHaveCount(4);

    const text =
      (await page.getByRole("list", { name: "작업 결과" }).textContent()) ?? "";
    expect(text).toMatch(/각도 · \d+\.\d{2}°/);
    expect(text).toMatch(/타원 · \d+\.\d{2} mm²/);
    expect(text).toMatch(/윤곽 · \d+\.\d{2} mm²/);
    expect(text).toContain("메모");
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "4");
  });

  test("삭제·실행 취소·다시 실행·숨김이 저장·복원 후에도 유지되고 삭제한 주석은 부활하지 않는다", async ({
    page,
  }) => {
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.7], [0.65, 0.7]);
    await expect(results(page)).toHaveCount(2);

    await page.getByRole("button", { name: "삭제" }).click();
    await expect(results(page)).toHaveCount(1);
    await page.getByRole("button", { name: "실행 취소" }).click();
    await expect(results(page)).toHaveCount(2);
    await page.getByRole("button", { name: "다시 실행" }).click();
    await expect(results(page)).toHaveCount(1);

    await results(page)
      .first()
      .getByRole("button", { name: /숨기기/ })
      .click();
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "0");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expectSaved(page);

    await page.reload();
    await waitRendered(page);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText("(숨김)");
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "0");
  });

  test("결과를 선택하면 해당 영상 위치로 이동하고 주석을 강조한다", async ({
    page,
  }) => {
    await importGroups(page, "stack");
    await openSeries(page, UID.studyA, UID.seriesStack);
    const slider = page.getByRole("slider", { name: "슬라이스 위치" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("frame-position")).toHaveText("3 / 5");
    await waitRendered(page);
    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await expect(results(page)).toContainText(["영상 3/5"]);

    await slider.focus();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("frame-position")).toHaveText("1 / 5");
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "0");

    await results(page).first().getByRole("button").first().click();
    await expect(page.getByTestId("frame-position")).toHaveText("3 / 5");
    await waitRendered(page);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "1");
    await expect(viewport(page)).toHaveAttribute(
      "data-selected-annotation",
      /.+/,
    );
  });

  test("작업 결과가 생기면 검사 목록이 작업 중, 완료 표시하면 완료로 바뀌고, 저장 전 화면을 떠나도 유실하지 않는다", async ({
    page,
  }) => {
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    // 자동 저장 지연 전에 바로 떠난다.
    await page.getByRole("link", { name: "검사 목록" }).click();

    await expect(page.getByRole("table", { name: "검사 목록" })).toContainText(
      "작업 중",
    );

    await openSeries(page, UID.studyA, UID.seriesSingle);
    await expect(results(page)).toHaveCount(1);
    await page.getByRole("switch", { name: "완료 표시" }).click();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expectSaved(page);
    await page.getByRole("link", { name: "검사 목록" }).click();
    await expect(page.getByRole("table", { name: "검사 목록" })).toContainText(
      "완료",
    );
  });

  test("결과 JSON 을 내보내 새 브라우저 저장소에서 같은 원본을 가져온 뒤 복원하고, 다른 검사 결과는 거부한다", async ({
    page,
    browser,
  }) => {
    await importGroups(page, "stack");
    await openSeries(page, UID.studyA, UID.seriesStack);
    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await setPoint(page, 1, 0, 0);
    await setPoint(page, 2, 10, 0);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "결과 내보내기 (JSON)" }).click();
    const file = await (await download).path();
    const exported = JSON.parse(await readFile(file, "utf8"));
    expect(exported).toMatchObject({
      containsPixelData: false,
      schemaVersion: 1,
      studyInstanceUid: UID.studyA,
    });

    // 같은 계정으로 로그인했지만 브라우저 저장소(IndexedDB)가 비어 있는 새 브라우저
    const fresh = await browser.newContext({ storageState: AUTH_STATE });
    const other = await fresh.newPage();
    await importGroups(other, "stack", "uncalibrated");
    await openSeries(other, UID.studyA, UID.seriesStack);
    await expect(results(other)).toHaveCount(0);
    await other.getByTestId("result-json-input").setInputFiles(file);
    await other
      .getByRole("alertdialog")
      .getByRole("button", { name: "가져오기" })
      .click();
    await expect(results(other)).toHaveCount(1);
    await expect(results(other).first()).toContainText("길이 · 7.00 mm");

    await openSeries(other, UID.studyB, UID.seriesStudyB);
    await other.getByTestId("result-json-input").setInputFiles(file);
    await other
      .getByRole("alertdialog")
      .getByRole("button", { name: "가져오기" })
      .click();
    // Next.js 경로 안내(__next-route-announcer__)도 role=alert 이므로 결과 오류 알림으로 좁힌다.
    await expect(
      other.getByRole("alert").filter({ hasText: "가져오지 않았습니다" }),
    ).toContainText("다른 검사");
    await expect(results(other)).toHaveCount(0);
    await fresh.close();
  });
});

test.describe("시리즈·멀티프레임 참조 연결", () => {
  test("멀티프레임 2번 프레임 주석을 다른 시리즈에서 선택하면 정확한 시리즈·프레임으로 돌아오고, 저장·새로고침 후에도 섞이지 않는다", async ({
    page,
  }) => {
    await importGroups(page, "single", "multiframe");
    await openSeries(page, UID.studyA, UID.seriesMultiSpatial);
    const slider = page.getByRole("slider", { name: "슬라이스 위치" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("frame-position")).toHaveText("2 / 3");
    await waitRendered(page);
    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await expect(results(page)).toContainText([
      "Enhanced multiframe · 영상 2/3",
    ]);

    // 다른 시리즈: 주석이 섞이지 않는다.
    await page
      .getByRole("navigation", { name: "시리즈" })
      .getByRole("button", { name: /Single image/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`series=${UID.seriesSingle}`));
    await waitRendered(page);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "0");

    // 결과 선택 → 멀티프레임 시리즈 2번 프레임
    await results(page).first().getByRole("button").first().click();
    await expect(page).toHaveURL(
      new RegExp(`series=${UID.seriesMultiSpatial}`),
    );
    await expect(page.getByTestId("frame-position")).toHaveText("2 / 3");
    await waitRendered(page);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "1");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expectSaved(page);

    // 새로고침: 다른 시리즈로 열어도 결과를 선택하면 같은 프레임으로 복귀한다.
    await openSeries(page, UID.studyA, UID.seriesSingle);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "0");
    await results(page).first().getByRole("button").first().click();
    await expect(page).toHaveURL(
      new RegExp(`series=${UID.seriesMultiSpatial}`),
    );
    await expect(page.getByTestId("frame-position")).toHaveText("2 / 3");
    await waitRendered(page);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "1");
    for (const index of [1, 3]) {
      await slider.focus();
      await page.keyboard.press(index === 1 ? "Home" : "End");
      await expect(page.getByTestId("frame-position")).toHaveText(
        `${index} / 3`,
      );
      await waitRendered(page);
      await expect(viewport(page)).toHaveAttribute(
        "data-annotation-count",
        "0",
      );
    }
  });
});

test.describe("viewport 조작·MR 스택·썸네일·모바일", () => {
  test("반전·회전·밝기대비·화면 맞춤·초기화가 실제 영상에 적용된다", async ({
    page,
  }) => {
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    expect(await brightness(page, LEFT)).toBeLessThan(30);

    await page.getByRole("button", { name: "반전" }).click();
    await expect(viewport(page)).toHaveAttribute("data-inverted", "true");
    await expect.poll(() => brightness(page, LEFT)).toBeGreaterThan(220);

    await page.getByRole("button", { name: "90° 회전" }).click();
    await expect(viewport(page)).toHaveAttribute("data-rotation", "90");

    const before = await viewport(page).getAttribute("data-voi");
    await page.getByRole("button", { name: "밝기·대비" }).click();
    await drag(page, [0.5, 0.5], [0.7, 0.6]);
    await expect(viewport(page)).not.toHaveAttribute("data-voi", before!);

    await page.getByRole("button", { name: "초기화" }).click();
    await expect(viewport(page)).toHaveAttribute("data-inverted", "false");
    await expect(viewport(page)).toHaveAttribute("data-rotation", "0");
    await expect(viewport(page)).toHaveAttribute("data-voi", before!);
    await expect.poll(() => brightness(page, LEFT)).toBeLessThan(30);
  });

  test("이동·확대는 실제 표시를 바꾸고 화면 맞춤으로 원래 표시로 돌아온다", async ({
    page,
  }) => {
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    // 영상은 가운데 정사각형, 좌우 여백은 검다. 영상 오른쪽 절반은 밝다.
    const MARGIN = { x0: 0.94, y0: 0.45, x1: 0.97, y1: 0.55 };
    const RIGHT_INNER = { x0: 0.6, y0: 0.45, x1: 0.62, y1: 0.55 };
    expect(await canvasBrightness(page, MARGIN)).toBeLessThan(10);
    expect(await canvasBrightness(page, RIGHT_INNER)).toBeGreaterThan(220);

    await page.getByRole("button", { name: "이동" }).click();
    await drag(page, [0.5, 0.5], [0.75, 0.5]);
    await expect
      .poll(() => canvasBrightness(page, RIGHT_INNER))
      .toBeLessThan(30);

    await page.getByRole("button", { name: "화면 맞춤" }).click();
    await expect
      .poll(() => canvasBrightness(page, RIGHT_INNER))
      .toBeGreaterThan(220);

    await page.getByRole("button", { name: "확대" }).click();
    await drag(page, [0.5, 0.3], [0.5, 0.9], 20);
    await expect
      .poll(() => canvasBrightness(page, MARGIN))
      .toBeGreaterThan(200);

    await page.getByRole("button", { name: "화면 맞춤" }).click();
    await expect.poll(() => canvasBrightness(page, MARGIN)).toBeLessThan(10);
  });

  test("합성 MR 시상면 스택을 MR 로 표시하고 위치 순서로 정렬하며 결과를 복원한다", async ({
    page,
  }) => {
    await importGroups(page, "mr");
    await expect(page.getByRole("table", { name: "검사 목록" })).toContainText(
      "MR",
    );
    await openSeries(page, UID.studyMr, UID.seriesMrStack);
    await expect(page.getByTestId("frame-position")).toHaveText("1 / 4");
    const markers = [await brightness(page, WHOLE)];
    const slider = page.getByRole("slider", { name: "슬라이스 위치" });
    for (const index of [2, 3, 4]) {
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByTestId("frame-position")).toHaveText(
        `${index} / 4`,
      );
      await waitRendered(page);
      markers.push(await brightness(page, WHOLE));
    }
    for (let i = 1; i < markers.length; i += 1)
      expect(markers[i]!).toBeGreaterThan(markers[i - 1]! + 2);

    await page.getByRole("button", { name: "길이", exact: true }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expectSaved(page);
    await page.reload();
    await waitRendered(page);
    await expect(results(page)).toContainText(["영상 4/4"]);
  });

  test("시리즈 목록에 실제 영상으로 그린 썸네일을 표시한다", async ({
    page,
  }) => {
    await importGroups(page, "single", "stack");
    await openSeries(page, UID.studyA, UID.seriesStack);
    const thumbnails = page.getByTestId("series-thumbnail");
    await expect(thumbnails).toHaveCount(2);
    await expect(thumbnails.first()).toHaveAttribute("data-state", "rendered", {
      timeout: 30_000,
    });
    const lit = await thumbnails
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const context = copy.getContext("2d")!;
        context.drawImage(canvas, 0, 0);
        const data = context.getImageData(0, 0, copy.width, copy.height).data;
        let bright = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i]! > 200) bright += 1;
        return bright;
      });
    expect(lit).toBeGreaterThan(10);
  });

  test("좁은 화면에서는 시리즈·작업 결과 패널을 Sheet 로 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await importGroups(page, "stack");
    await openSeries(page, UID.studyA, UID.seriesStack);

    await expect(page.getByRole("navigation", { name: "시리즈" })).toBeHidden();
    await page.getByRole("button", { name: "시리즈 열기" }).click();
    const seriesSheet = page.getByRole("dialog", { name: "시리즈" });
    await expect(
      seriesSheet.getByRole("navigation", { name: "시리즈" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "작업 결과 열기" }).click();
    await expect(page.getByRole("dialog", { name: "작업 결과" })).toBeVisible();
  });
});
