import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { UID } from "../fixtures/dicom/scenarios";

const FIXTURES = path.join(import.meta.dirname, ".fixtures");

/** 콘솔 오류와 실패한 요청을 모은다(검증 근거). */
function watchPage(page: Page) {
  const errors: string[] = [];
  const wasm: { url: string; status: number }[] = [];
  const workers: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("response", (response) => {
    if (response.url().endsWith(".wasm"))
      wasm.push({ url: response.url(), status: response.status() });
  });
  return { errors, wasm, workers };
}

async function importGroup(page: Page, group: string) {
  await page.goto("/");
  const fs = await import("node:fs/promises");
  const dir = path.join(FIXTURES, group);
  const files = (await fs.readdir(dir)).map((name) => path.join(dir, name));
  await page.getByTestId("dicom-file-input").setInputFiles(files);
  // 목록 다시 읽기("검사 목록을 불러오는 중")도 role=status 이므로 가져오기 결과 상태로 좁힌다.
  await expect(
    page.getByRole("status").filter({ hasText: "가져오기 완료" }),
  ).toBeVisible();
}

async function openSeries(page: Page, studyUid: string, seriesUid: string) {
  await page.goto(`/studies/${studyUid}?series=${seriesUid}`);
  const viewport = page.getByTestId("stack-viewport");
  await expect(viewport).toHaveAttribute("data-render-state", "rendered", {
    timeout: 30_000,
  });
  return viewport;
}

/**
 * 뷰포트 canvas 에서 영상 영역(가운데 정사각형, 합성 영상은 정사각형) 기준 비율 좌표의
 * 평균 밝기(0~255)를 읽는다.
 */
async function brightness(
  page: Page,
  region: { x0: number; y0: number; x1: number; y1: number },
) {
  return page.getByTestId("stack-viewport").evaluate((element, r) => {
    const source = element.querySelector("canvas");
    if (!source) throw new Error("canvas 없음");
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext("2d")!;
    context.drawImage(source, 0, 0);
    const size = Math.min(copy.width, copy.height);
    const left = (copy.width - size) / 2;
    const top = (copy.height - size) / 2;
    const x = Math.round(left + r.x0 * size);
    const y = Math.round(top + r.y0 * size);
    const w = Math.max(1, Math.round((r.x1 - r.x0) * size));
    const h = Math.max(1, Math.round((r.y1 - r.y0) * size));
    const data = context.getImageData(x, y, w, h).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return sum / (data.length / 4);
  }, region);
}

const LEFT = { x0: 0.3, y0: 0.4, x1: 0.45, y1: 0.6 };
const RIGHT = { x0: 0.6, y0: 0.4, x1: 0.75, y1: 0.6 };
/** ctStack 의 슬라이스 표식 블록(왼쪽 위 8x8 / 32x32) */
const MARKER = { x0: 0.05, y0: 0.05, x1: 0.2, y1: 0.2 };

test("단일 비압축 DICOM 을 가져와 실제 픽셀로 렌더링하고 슬라이스 탐색을 숨긴다", async ({
  page,
}) => {
  const watch = watchPage(page);
  await importGroup(page, "single");

  await openSeries(page, UID.studyA, UID.seriesSingle);

  expect(await brightness(page, LEFT)).toBeLessThan(30);
  expect(await brightness(page, RIGHT)).toBeGreaterThan(220);
  await expect(page.getByRole("slider", { name: "슬라이스 위치" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("frame-position")).toHaveText("1 / 1");
  expect(watch.workers.length).toBeGreaterThan(0);
  expect(watch.errors).toEqual([]);
});

test("다중 파일 CT 스택을 위치 순서로 표시하고 슬라이더로 이동한다", async ({
  page,
}) => {
  const watch = watchPage(page);
  await importGroup(page, "stack");

  await openSeries(page, UID.studyA, UID.seriesStack);
  await expect(page.getByTestId("frame-position")).toHaveText("1 / 5");
  const markers = [await brightness(page, MARKER)];
  const slider = page.getByRole("slider", { name: "슬라이스 위치" });
  for (let index = 2; index <= 5; index += 1) {
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("frame-position")).toHaveText(`${index} / 5`);
    await expect(page.getByTestId("stack-viewport")).toHaveAttribute(
      "data-render-state",
      "rendered",
    );
    markers.push(await brightness(page, MARKER));
  }

  // 슬라이스 k 의 표식 값은 k*800 이므로 위치 순서대로면 밝기가 단조 증가한다.
  for (let i = 1; i < markers.length; i += 1)
    expect(markers[i]!).toBeGreaterThan(markers[i - 1]! + 10);
  expect(watch.errors).toEqual([]);
});

test("JPEG-LS 압축 영상을 Worker 의 WASM 코덱으로 디코딩해 렌더링한다", async ({
  page,
}) => {
  const watch = watchPage(page);
  await importGroup(page, "jpegls");

  await openSeries(page, UID.studyA, UID.seriesJpegLs);

  expect(await brightness(page, LEFT)).toBeLessThan(30);
  expect(await brightness(page, RIGHT)).toBeGreaterThan(220);
  expect(watch.workers.length).toBeGreaterThan(0);
  expect(
    watch.wasm.some(
      (entry) => entry.url.includes("charls") && entry.status === 200,
    ),
  ).toBe(true);
  expect(watch.errors).toEqual([]);
});

test("공간 멀티프레임 파일 1개를 프레임 3개 스택으로 위치 순서대로 표시한다", async ({
  page,
}) => {
  await importGroup(page, "multiframe");

  await openSeries(page, UID.studyA, UID.seriesMultiSpatial);
  await expect(page.getByTestId("frame-position")).toHaveText("1 / 3");

  // 프레임 위치 z=[10,0,5] → 표시 순서는 프레임 2,3,1. 왼쪽 값은 (프레임번호-1)*1000.
  const left = [await brightness(page, LEFT)];
  const slider = page.getByRole("slider", { name: "슬라이스 위치" });
  for (const index of [2, 3]) {
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("frame-position")).toHaveText(`${index} / 3`);
    await expect(page.getByTestId("stack-viewport")).toHaveAttribute(
      "data-render-state",
      "rendered",
    );
    left.push(await brightness(page, LEFT));
  }
  expect(left[0]!).toBeGreaterThan(40);
  expect(left[1]!).toBeGreaterThan(left[0]! + 30);
  expect(left[2]!).toBeLessThan(15);
});

test("새로고침 후에도 IndexedDB 의 원본으로 같은 영상을 다시 렌더링한다", async ({
  page,
}) => {
  await importGroup(page, "single");
  await openSeries(page, UID.studyA, UID.seriesSingle);

  await page.reload();

  await expect(page.getByTestId("stack-viewport")).toHaveAttribute(
    "data-render-state",
    "rendered",
    {
      timeout: 30_000,
    },
  );
  expect(await brightness(page, RIGHT)).toBeGreaterThan(220);
});

test("DICOM 이 아닌 파일은 이름과 실패 이유를 표시하고 서버 업로드로 표시하지 않는다", async ({
  page,
}) => {
  await importGroup(page, "invalid");

  const results = page.getByRole("list", { name: "가져오기 결과" });
  await expect(results).toContainText("fake.dcm");
  await expect(results).toContainText("DICOM 파일이 아닙니다");
  await expect(page.getByText(/업로드 완료/)).toHaveCount(0);
  const fontFamily = await page
    .locator("body")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain("Apple SD Gothic Neo");
  expect(fontFamily).toContain("sans-serif");
});

test("Chromium 에서는 폴더 선택을 지원하고 가져오기가 끝나면 버튼이 다시 활성화된다", async ({
  page,
}) => {
  await importGroup(page, "single");

  await expect(
    page.getByRole("button", { name: "폴더 선택", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "파일 가져오기", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("dicom-folder-input")).toHaveAttribute(
    "webkitdirectory",
    "",
  );
});
