import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Browser, Page, Route } from "@playwright/test";

import { UID } from "../fixtures/dicom/scenarios";

import { AUTH_STATE } from "./auth-paths";
import { expect, test } from "./fixtures";
import {
  drag,
  e2eUser,
  fixtureFiles,
  importGroups,
  login,
  logout,
  openSeries,
  results,
} from "./helpers";
import { ORIGINALS_DIR } from "./originals-paths";

/**
 * 이슈 #7: 검사별 "서버에 원본 보관"(사용자가 누를 때만) → 서버 비공개 폴더 → 같은 계정의 새 브라우저에서
 * 파일 선택 없이 "서버에서 원본 불러오기" → 실제 렌더·측정. 작업 결과는 아직 이 브라우저에만 저장된다.
 */
const ORIGINALS = "**/api/originals/instances/**";
const SIGNED_OUT = { cookies: [], origins: [] };

const row = (page: Page, text: string) =>
  page
    .getByRole("table", { name: "검사 목록" })
    .getByRole("row")
    .filter({ hasText: text });

async function newBrowserA(browser: Browser) {
  const context = await browser.newContext({ storageState: AUTH_STATE });
  return { context, page: await context.newPage() };
}

async function serverFiles(which: "a" | "b") {
  const { id } = await e2eUser(which);
  try {
    return await readdir(
      path.join(ORIGINALS_DIR, "v1", "users", id, "instances"),
    );
  } catch {
    return [];
  }
}

/** 원본 API 요청을 기록한다(자동 업로드가 없는지 확인) */
function recordOriginalRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/originals/"))
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return requests;
}

/** 페이지 오류·예상하지 못한 콘솔 오류는 실패로 본다 */
const watches = new WeakMap<Page, { errors: string[]; expected: RegExp[] }>();
function expectConsoleError(page: Page, pattern: RegExp) {
  watches.get(page)!.expected.push(pattern);
}
test.beforeEach(({ page }) => {
  const watch = { errors: [] as string[], expected: [] as RegExp[] };
  watches.set(page, watch);
  page.on("pageerror", (error) =>
    watch.errors.push(`pageerror: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = `${message.text()} @ ${message.location().url}`;
    if (!watch.expected.some((pattern) => pattern.test(text)))
      watch.errors.push(`console: ${text}`);
  });
});
test.afterEach(({ page }) => {
  expect(watches.get(page)?.errors ?? []).toEqual([]);
});

test("가져오기만으로는 원본을 서버에 보내지 않고, 보관 전에는 보관됨으로 보이지 않는다", async ({
  page,
}) => {
  const requests = recordOriginalRequests(page);
  await importGroups(page, "stack");
  const target = row(page, "SYN-ACC");
  await expect(target).toContainText("반영됨", { timeout: 15_000 });
  await expect(target).toContainText("서버 원본 없음");
  await expect(target).not.toContainText("보관됨");
  await page.reload();
  await expect(row(page, "SYN-ACC")).toContainText("서버 원본 없음");
  expect(requests).toEqual([]);
  expect(await serverFiles("a")).toEqual([]);
});

test("검사별 보관 버튼 → 같은 계정의 새 브라우저에서 파일 선택 없이 불러와 실제 렌더·측정한다", async ({
  page,
  browser,
}) => {
  await importGroups(page, "single");
  const target = row(page, "SYN-ACC");
  await target.getByRole("button", { name: /서버에 원본 보관/ }).click();
  await expect(target).toContainText("보관됨 1/1", { timeout: 15_000 });
  expect(await serverFiles("a")).toHaveLength(1);

  const fresh = await newBrowserA(browser);
  await fresh.page.goto("/");
  const remote = row(fresh.page, "SYN-ACC");
  await expect(remote).toContainText("원본 없음");
  await expect(remote).toContainText("보관됨 1/1");
  await expect(remote.getByRole("link", { name: /검사 열기/ })).toHaveCount(0);
  await remote.getByRole("button", { name: /서버에서 원본 불러오기/ }).click();
  await expect(remote).toContainText("원본 있음", { timeout: 15_000 });
  await expect(
    fresh.page.getByText(/작업 결과.*이 브라우저에만/).first(),
  ).toBeVisible();

  await openSeries(fresh.page, UID.studyA, UID.seriesSingle);
  await fresh.page.getByRole("button", { name: "길이", exact: true }).click();
  await drag(fresh.page, [0.35, 0.5], [0.65, 0.5]);
  await expect(results(fresh.page)).toHaveCount(1);
  await fresh.context.close();
});

test("10MB 를 넘는 원본도 Proxy 에서 잘리지 않고 그대로 보관·복원된다", async ({
  page,
  browser,
}) => {
  const [file] = await fixtureFiles("large");
  const original = await readFile(file!);
  expect(original.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  await importGroups(page, "large");
  const target = row(page, "SYN-LARGE");
  await target.getByRole("button", { name: /서버에 원본 보관/ }).click();
  await expect(target).toContainText("보관됨 1/1", { timeout: 30_000 });
  const digest = createHash("sha256").update(original).digest("hex");
  expect(await serverFiles("a")).toEqual([`2.25.470001.${digest}.dcm`]);

  const fresh = await newBrowserA(browser);
  await fresh.page.goto("/");
  const remote = row(fresh.page, "SYN-LARGE");
  await remote.getByRole("button", { name: /서버에서 원본 불러오기/ }).click();
  await expect(remote).toContainText("원본 있음", { timeout: 30_000 });
  await fresh.context.close();
});

test("보관 중 일부 요청이 실패하면 보관 실패와 진행 수를 보이고, 다시 보관하면 멱등하게 끝난다", async ({
  page,
}) => {
  await importGroups(page, "stack");
  let count = 0;
  await page.route(ORIGINALS, (route) => {
    count += 1;
    return count === 2 ? route.abort("failed") : route.continue();
  });
  expectConsoleError(
    page,
    /^Failed to load resource: net::ERR_FAILED @ .*\/api\/originals\/instances\//,
  );
  const target = row(page, "SYN-ACC");
  await target.getByRole("button", { name: /서버에 원본 보관/ }).click();
  await expect(target).toContainText("보관 실패 1/5", { timeout: 15_000 });
  await expect(target).not.toContainText("보관됨 5/5");
  await page.unroute(ORIGINALS);
  await target.getByRole("button", { name: /다시 보관/ }).click();
  await expect(target).toContainText("보관됨 5/5", { timeout: 15_000 });
  expect(await serverFiles("a")).toHaveLength(5);
});

test("불러오기 중 일부가 실패하면 받은 것만 이 브라우저에 있고 없는 영상이 열린다고 표시하지 않는다", async ({
  page,
  browser,
}) => {
  await importGroups(page, "stack");
  const target = row(page, "SYN-ACC");
  await target.getByRole("button", { name: /서버에 원본 보관/ }).click();
  await expect(target).toContainText("보관됨 5/5", { timeout: 15_000 });

  const fresh = await newBrowserA(browser);
  let count = 0;
  await fresh.page.route(ORIGINALS, (route) => {
    count += 1;
    return count === 3
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ status: "storage-unavailable" }),
        })
      : route.continue();
  });
  await fresh.page.goto("/");
  const remote = row(fresh.page, "SYN-ACC");
  await remote.getByRole("button", { name: /서버에서 원본 불러오기/ }).click();
  await expect(remote).toContainText("불러오기 실패 2/5", { timeout: 15_000 });
  await expect(remote).toContainText("일부 원본 2/5");
  await fresh.context.close();
});

test("A 의 불러오기가 늦게 끝나도 B 로그인 뒤 B 목록·B 저장소에 A 원본이 생기지 않고, B 세션으로 A 를 기대한 요청은 거부된다", async ({
  page,
  browser,
}) => {
  await importGroups(page, "single");
  const target = row(page, "SYN-ACC");
  await target.getByRole("button", { name: /서버에 원본 보관/ }).click();
  await expect(target).toContainText("보관됨 1/1", { timeout: 15_000 });
  const a = await e2eUser("a");

  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const other = await context.newPage();
  await login(other, "a");
  let held!: Route;
  const waiting = new Promise<void>((resolve) => {
    void other.route(ORIGINALS, (route) => {
      held = route;
      resolve();
    });
  });
  await row(other, "SYN-ACC")
    .getByRole("button", { name: /서버에서 원본 불러오기/ })
    .click();
  await waiting;
  await logout(other);
  await login(other, "b");
  await held.continue().catch(() => undefined);
  await other.goto("/");
  await expect(other.getByText("가져온 검사가 없습니다")).toBeVisible();

  const response = await other.request.get(
    `/api/originals/instances/${encodeURIComponent("2.25.400001")}`,
    {
      headers: { "x-expected-user-id": a.id, "sec-fetch-site": "same-origin" },
    },
  );
  expect(response.status()).toBe(409);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const html = await (await other.request.get("/")).text();
  expect(html).not.toContain(UID.studyA);
  expect(html).not.toContain(ORIGINALS_DIR);
  await context.close();
});

const AUTH_COOKIE = "sb-dicom-annotator-auth-token";
const CHUNK = 3180;
const digestOf = (value: string) =>
  createHash("sha256").update(value).digest("hex");

interface SessionCookie {
  refresh_token: string;
  expires_at: number;
  [key: string]: unknown;
}

/** 브라우저 컨텍스트의 Supabase 세션 쿠키(청크 포함)를 읽는다. 토큰 값은 출력하지 않는다 */
async function readSession(page: Page): Promise<SessionCookie> {
  const cookies = (await page.context().cookies()).filter(
    (cookie) =>
      cookie.name === AUTH_COOKIE || cookie.name.startsWith(`${AUTH_COOKIE}.`),
  );
  const ordered = cookies.sort((a, b) => {
    const index = (name: string) => Number(name.split(".").at(-1)) || 0;
    return index(a.name) - index(b.name);
  });
  const raw = ordered.map((cookie) => cookie.value).join("");
  const json = raw.startsWith("base64-")
    ? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")
    : decodeURIComponent(raw);
  return JSON.parse(json) as SessionCookie;
}

/** 같은 형식(base64-·청크)으로 세션 쿠키를 다시 쓴다 */
async function writeSession(page: Page, session: SessionCookie) {
  const context = page.context();
  const origin = new URL(page.url());
  const existing = (await context.cookies()).filter(
    (cookie) =>
      cookie.name === AUTH_COOKIE || cookie.name.startsWith(`${AUTH_COOKIE}.`),
  );
  const template = existing[0]!;
  await context.clearCookies({
    name: new RegExp(`^${AUTH_COOKIE}(\\.\\d+)?$`),
  });
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const parts =
    value.length <= CHUNK
      ? [{ name: AUTH_COOKIE, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
          name: `${AUTH_COOKIE}.${i}`,
          value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        }));
  await context.addCookies(
    parts.map((part) => ({
      ...part,
      domain: origin.hostname,
      path: "/",
      sameSite: template.sameSite,
      httpOnly: template.httpOnly,
      secure: template.secure,
      expires: template.expires,
    })),
  );
}

test("SDK 세션 만료 정보(expires_at)를 지난 값으로 바꿔 유도한 쿠키 갱신: Proxy 를 거치지 않는 원본 GET·PUT 이 refresh_token 으로 갱신하고 새 쿠키를 브라우저에 반영한다(실제 JWT 자연 만료 검증 아님)", async ({
  page,
}) => {
  const [file] = await fixtureFiles("single");
  const bytes = await readFile(file!);
  await importGroups(page, "single");
  const target = row(page, "SYN-ACC");
  await target.getByRole("button", { name: /서버에 원본 보관/ }).click();
  await expect(target).toContainText("보관됨 1/1", { timeout: 15_000 });
  const a = await e2eUser("a");
  const url = `/api/originals/instances/${encodeURIComponent("2.25.400001")}`;

  for (const method of ["GET", "PUT"] as const) {
    const before = await readSession(page);
    const now = Math.floor(Date.now() / 1000);
    // 합성 계정 A 의 이 브라우저 컨텍스트만 바꾼다(계정·Auth 서버 만료 설정은 그대로)
    await writeSession(page, { ...before, expires_at: now - 120 });

    const response =
      method === "GET"
        ? await page.context().request.get(url, {
            headers: {
              "x-expected-user-id": a.id,
              "sec-fetch-site": "same-origin",
            },
          })
        : await page.context().request.put(url, {
            headers: {
              "content-type": "application/dicom",
              "x-expected-user-id": a.id,
              origin: new URL(page.url()).origin,
            },
            data: bytes,
          });
    expect(response.status(), method).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    if (method === "GET")
      expect(
        createHash("sha256")
          .update(await response.body())
          .digest("hex"),
      ).toBe(createHash("sha256").update(bytes).digest("hex"));
    else
      expect(await response.json()).toMatchObject({ status: "already-stored" });
    const setCookie = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value.split("=")[0]);
    expect(
      setCookie.some((name) => name?.startsWith(AUTH_COOKIE)),
      method,
    ).toBe(true);

    const after = await readSession(page);
    expect(digestOf(after.refresh_token), method).not.toBe(
      digestOf(before.refresh_token),
    );
    expect(after.expires_at, method).toBeGreaterThan(now);
  }
});
