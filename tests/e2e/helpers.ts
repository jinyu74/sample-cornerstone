import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

export const FIXTURES = path.join(import.meta.dirname, ".fixtures");

export async function fixtureFiles(group: string): Promise<string[]> {
  const dir = path.join(FIXTURES, group);
  return (await readdir(dir)).map((name) => path.join(dir, name));
}

export async function importGroups(page: Page, ...groups: string[]) {
  await page.goto("/");
  const files = (await Promise.all(groups.map(fixtureFiles))).flat();
  await page.getByTestId("dicom-file-input").setInputFiles(files);
  await expect(
    page.getByRole("status").filter({ hasText: "가져오기 완료" }),
  ).toBeVisible();
}

export function viewport(page: Page): Locator {
  return page.getByTestId("stack-viewport");
}

export async function openSeries(
  page: Page,
  studyUid: string,
  seriesUid: string,
) {
  await page.goto(`/studies/${studyUid}?series=${seriesUid}`);
  await expect(viewport(page)).toHaveAttribute(
    "data-render-state",
    "rendered",
    { timeout: 30_000 },
  );
}

export async function waitRendered(page: Page) {
  await expect(viewport(page)).toHaveAttribute(
    "data-render-state",
    "rendered",
    { timeout: 30_000 },
  );
}

/** viewport 안 비율 좌표(0~1)를 화면 좌표로 바꾼다 */
export async function viewportPoint(page: Page, x: number, y: number) {
  const box = (await viewport(page).boundingBox())!;
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}

export async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
  steps = 8,
) {
  const start = await viewportPoint(page, ...from);
  const end = await viewportPoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

export async function click(page: Page, at: [number, number]) {
  const point = await viewportPoint(page, ...at);
  await page.mouse.click(point.x, point.y);
}

/** 작업 결과 목록 항목 */
export function results(page: Page): Locator {
  return page.getByRole("list", { name: "작업 결과" }).getByRole("listitem");
}

export async function setPoint(
  page: Page,
  index: number,
  column: number,
  row: number,
) {
  for (const [axis, value] of [
    ["열", column],
    ["행", row],
  ] as const) {
    const input = page.getByRole("spinbutton", { name: `점 ${index} ${axis}` });
    await input.fill(String(value));
    await input.press("Enter");
  }
}

export async function expectSaved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "저장됨" }),
  ).toBeVisible({ timeout: 10_000 });
}

/** 영상 영역(가운데 정사각형) 비율 좌표의 평균 밝기 0~255 */
export async function brightness(
  page: Page,
  region: { x0: number; y0: number; x1: number; y1: number },
) {
  return viewport(page).evaluate((element, r) => {
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
    const data = context.getImageData(
      Math.round(left + r.x0 * size),
      Math.round(top + r.y0 * size),
      Math.max(1, Math.round((r.x1 - r.x0) * size)),
      Math.max(1, Math.round((r.y1 - r.y0) * size)),
    ).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return sum / (data.length / 4);
  }, region);
}

/** viewport canvas 전체 기준 비율 좌표(영상 밖 여백 포함)의 평균 밝기 0~255 */
export async function canvasBrightness(
  page: Page,
  region: { x0: number; y0: number; x1: number; y1: number },
) {
  return viewport(page).evaluate((element, r) => {
    const source = element.querySelector("canvas");
    if (!source) throw new Error("canvas 없음");
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext("2d")!;
    context.drawImage(source, 0, 0);
    const data = context.getImageData(
      Math.round(r.x0 * copy.width),
      Math.round(r.y0 * copy.height),
      Math.max(1, Math.round((r.x1 - r.x0) * copy.width)),
      Math.max(1, Math.round((r.y1 - r.y0) * copy.height)),
    ).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return sum / (data.length / 4);
  }, region);
}

/** global-setup 이 만든 테스트 계정(비밀번호는 출력하지 않는다) */
export interface E2EUser {
  email: string;
  password: string;
  id: string;
}

export async function e2eUser(which: "a" | "b"): Promise<E2EUser> {
  const file = path.join(
    import.meta.dirname,
    "..",
    "..",
    ".local",
    "e2e",
    "users.json",
  );
  const users = JSON.parse(await readFile(file, "utf8")) as Record<
    string,
    E2EUser
  >;
  return users[which]!;
}

/** 로그인 화면에서 실제 Auth 로 로그인한다 */
export async function login(page: Page, which: "a" | "b", next = "/") {
  const user = await e2eUser(which);
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  const origin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  // 로그인 전후 같은 출처(scheme·host·port)여야 쿠키·탭 간 알림이 이어진다
  expect(new URL(page.url()).origin).toBe(origin);
  return user;
}

/** 로그아웃 버튼으로 서버 로그아웃 후 로그인 화면까지 기다린다 */
export async function logout(page: Page) {
  const origin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "로그아웃" }).click();
  await page.waitForURL(/\/login\?signed_out=1/);
  expect(new URL(page.url()).origin).toBe(origin);
}
