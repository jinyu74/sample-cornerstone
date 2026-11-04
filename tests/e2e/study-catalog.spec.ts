import type { Browser, Page, Request, Route } from "@playwright/test";

import { UID } from "../fixtures/dicom/scenarios";

import { AUTH_STATE } from "./auth-paths";
import { expect, test } from "./fixtures";
import { fixtureFiles, importGroups, login, logout } from "./helpers";

/**
 * 이슈 #5: 계정별 서버 목록(메타데이터·RLS)과 SSR.
 * 원본·작업 결과는 계정별 IndexedDB 에만 있고 서버에는 목록용 메타데이터만 간다.
 */
const SYNC = "**/api/catalog/sync";
/** 프로젝트 기본(계정 A 로그인 쿠키)을 물려받지 않는 빈 브라우저 */
const SIGNED_OUT = { cookies: [], origins: [] };
const ACCESSION = "SYN-ACC";
/** 서버로 보내도 되는 키(허용 목록) */
const ALLOWED_KEYS = new Set([
  "expectedUserId",
  "study",
  "studyInstanceUid",
  "studyDate",
  "studyDescription",
  "studyId",
  "accessionNumber",
  "series",
  "seriesInstanceUid",
  "modality",
  "seriesNumber",
  "seriesDescription",
  "instances",
  "sopInstanceUid",
  "contentDigest",
]);

function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) => [
      key,
      ...keys(child),
    ]);
  return [];
}

const studyRow = (page: Page) =>
  page.getByRole("table", { name: "검사 목록" }).getByRole("row").filter({
    hasText: ACCESSION,
  });

async function expectSynced(page: Page) {
  await expect(studyRow(page)).toContainText("반영됨", { timeout: 15_000 });
}

/** 같은 계정(A)의 새 브라우저: IndexedDB 는 비어 있다 */
async function newBrowserA(browser: Browser, javaScriptEnabled = true) {
  const context = await browser.newContext({
    storageState: AUTH_STATE,
    javaScriptEnabled,
  });
  return { context, page: await context.newPage() };
}

/** 첫 동기화 요청을 붙잡아 두고(서버로 보내지 않음) 풀어 줄 수 있게 한다 */
async function holdFirstSync(page: Page) {
  const held = new Promise<Route>((resolve) => {
    let first = true;
    void page.route(SYNC, async (route) => {
      if (!first) return route.continue();
      first = false;
      resolve(route);
    });
  });
  const release = async () => {
    const route = await held;
    await route.continue().catch(() => undefined);
  };
  return { held, release };
}

/** 페이지 오류·콘솔 오류는 숨기지 않고 실패로 본다(개발 서버 스트림 경고와 실제 화면 오류를 구분) */
interface ConsoleWatch {
  errors: string[];
  /** 이 테스트가 일부러 만든 실패에 대한 브라우저 리소스 로그만 등록한다 */
  expected: RegExp[];
}
const watches = new WeakMap<Page, ConsoleWatch>();
function expectConsoleError(page: Page, pattern: RegExp) {
  watches.get(page)!.expected.push(pattern);
}
test.beforeEach(({ page }) => {
  const watch: ConsoleWatch = { errors: [], expected: [] };
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

test("가져온 검사는 목록용 메타데이터만 서버에 반영되고(픽셀·환자 ID 없음), JS 없이도 최초 HTML 에 그 계정 행이 있다", async ({
  page,
  browser,
  request,
}) => {
  const bodies: string[] = [];
  const posts: Request[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") posts.push(req);
    if (req.url().endsWith("/api/catalog/sync"))
      bodies.push(req.postData() ?? "");
  });
  await importGroups(page, "stack");
  await expectSynced(page);

  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(16 * 1024);
    expect(body).not.toContain("DICM");
    expect(body).not.toContain("SYN-0001");
    const unknown = keys(JSON.parse(body)).filter(
      (key) => !ALLOWED_KEYS.has(key),
    );
    expect(unknown).toEqual([]);
  }
  // 어떤 요청 본문도 원본 파일 크기만큼 크지 않다(업로드 없음)
  for (const req of posts)
    expect(req.postDataBuffer()?.byteLength ?? 0).toBeLessThan(16 * 1024);

  // JS 를 끈 새 브라우저: 서버가 만든 HTML 에 행이 있다(하이드레이션 뒤 fetch 아님)
  const noJs = await newBrowserA(browser, false);
  await noJs.page.goto("/");
  await expect(studyRow(noJs.page)).toBeVisible();
  await expect(studyRow(noJs.page)).toContainText("원본 확인 중");
  await noJs.context.close();

  // 서버 HTTP 응답 자체에 행이 있고, 사용자별 응답은 캐시하지 않는다
  const response = await request.get("/", {
    headers: { cookie: await cookieHeader(page) },
  });
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"] ?? "";
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("public");
  // next dev 는 페이지 응답의 Cache-Control 을 no-store 로 덮어쓴다. 배포 형태(prod)에서는 Proxy 값 그대로다
  if (process.env.E2E_MODE !== "dev") expect(cacheControl).toContain("private");
  const html = await response.text();
  expect(html).toContain(ACCESSION);
  expect(html).toContain(UID.studyA);
});

test("B 의 서버 응답·목록에는 A 의 서버 목록이 없다", async ({
  page,
  browser,
}) => {
  await importGroups(page, "single");
  await expectSynced(page);

  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const other = await context.newPage();
  await login(other, "b");
  await expect(other.getByRole("heading", { name: "검사 목록" })).toBeVisible();
  await expect(other.getByText("가져온 검사가 없습니다")).toBeVisible();
  const html = await (
    await other.request.get("/", {
      headers: { cookie: await cookieHeader(other) },
    })
  ).text();
  expect(html).not.toContain(UID.studyA);
  expect(html).not.toContain(ACCESSION);
  await context.close();
});

test("같은 계정의 새 브라우저: 서버 검사는 원본 없음으로 보이고 열기 대신 원본 가져오기를 주며, 작업 상태를 미작업이라 하지 않는다. 일부만 가져오면 일부 원본", async ({
  page,
  browser,
}) => {
  await importGroups(page, "stack");
  await expectSynced(page);

  const fresh = await newBrowserA(browser);
  await fresh.page.goto("/");
  const row = studyRow(fresh.page);
  await expect(row).toContainText("원본 없음");
  await expect(row).toContainText("이 브라우저 기록 없음");
  await expect(row).not.toContainText("미작업");
  await expect(row.getByRole("link", { name: /검사 열기/ })).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: /원본 가져오기/ }),
  ).toBeVisible();

  const [first] = await fixtureFiles("stack");
  await fresh.page.getByTestId("dicom-file-input").setInputFiles([first!]);
  await expect(row).toContainText("일부 원본 1/5");
  await expect(row.getByRole("link", { name: /검사 열기/ })).toBeVisible();
  // 이미 서버에 있는 영상이므로 다시 반영해도 같은 결과(멱등)이고, 반영 완료 후 닫는다
  await expect(row).toContainText("반영됨");
  await fresh.context.close();
});

test("같은 SOP UID 의 다른 내용은 불일치로 알리고 서버 기록을 덮어쓰지 않는다", async ({
  page,
  browser,
}) => {
  await importGroups(page, "single");
  await expectSynced(page);

  const fresh = await newBrowserA(browser);
  await importGroups(fresh.page, "conflict");
  const row = studyRow(fresh.page);
  await expect(row).toContainText("내용 불일치 1개");
  await expect(row).toContainText(
    "서버 기록과 같은 UID 의 내용이 달라 반영하지 않았습니다.",
  );

  // 새로고침으로 이번 화면의 요청 결과가 사라져도 충돌을 반영 성공으로 바꾸지 않는다
  await fresh.page.reload();
  await expect(row).toContainText("내용 불일치 1개");
  await expect(row).toContainText("서버 반영 실패");
  await expect(row).not.toContainText("반영됨");
  // 이 브라우저의 원본은 그대로 열 수 있다
  await expect(row.getByRole("link", { name: /검사 열기/ })).toBeVisible();
  await fresh.context.close();

  // 원래 브라우저에서는 여전히 같은 내용(전체 원본 있음·반영됨)이다(서버 기록 보존)
  await page.reload();
  await expect(studyRow(page)).toContainText("원본 있음");
  await expect(studyRow(page)).toContainText("반영됨");
});

test("서버 반영이 실패해도 원본은 이 브라우저에서 열리고 성공으로 보이지 않으며, 다시 시도하면 반영된다", async ({
  page,
  browser,
}) => {
  await page.route(SYNC, (route) => route.abort("failed"));
  expectConsoleError(
    page,
    /^Failed to load resource: net::ERR_FAILED @ .*\/api\/catalog\/sync$/,
  );
  await importGroups(page, "single");
  const row = studyRow(page);
  await expect(row).toContainText("서버 반영 실패");
  await expect(row).not.toContainText("반영됨");
  await expect(row.getByRole("link", { name: /검사 열기/ })).toBeVisible();

  await page.unroute(SYNC);
  await row.getByRole("button", { name: /다시 시도/ }).click();
  await expectSynced(page);

  const noJs = await newBrowserA(browser, false);
  await noJs.page.goto("/");
  await expect(studyRow(noJs.page)).toBeVisible();
  await noJs.context.close();
});

test("기존 로컬 검사(서버 미반영)는 숨기지 않고 서버 목록에 반영 버튼으로 명시적으로 반영한다", async ({
  page,
}) => {
  // 이전 버전처럼 서버 반영 없이 가져온 상태를 만든다
  expectConsoleError(
    page,
    /^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\) @ .*\/api\/catalog\/sync$/,
  );
  await page.route(SYNC, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ status: "unavailable" }),
    }),
  );
  await importGroups(page, "single");
  await expect(studyRow(page)).toContainText("서버 반영 실패");
  await page.unroute(SYNC);
  await page.reload();
  const row = studyRow(page);
  await expect(row).toContainText("미반영 1개");
  await row.getByRole("button", { name: /서버 목록에 반영/ }).click();
  await expectSynced(page);
});

test("A 의 반영 요청이 늦게 도착해도 B 로 로그인한 뒤의 B 목록에 A 검사가 생기지 않고, B 세션으로 A 를 기대한 요청은 거부된다", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  const a = await login(page, "a");
  const { held, release } = await holdFirstSync(page);
  await importGroups(page, "single");
  const route = await held;
  const pendingBody = route.request().postData()!;

  await logout(page);
  await login(page, "b");
  await release();

  await page.goto("/");
  await expect(page.getByText("가져온 검사가 없습니다")).toBeVisible();
  const html = await (
    await page.request.get("/", {
      headers: { cookie: await cookieHeader(page) },
    })
  ).text();
  expect(html).not.toContain(UID.studyA);

  // 같은 본문(기대 계정 A)을 B 세션으로 다시 보내도 서버가 거부한다
  expect(JSON.parse(pendingBody).expectedUserId).toBe(a.id);
  const replay = await page.request.post("/api/catalog/sync", {
    headers: {
      "content-type": "application/json",
      origin: new URL(page.url()).origin,
    },
    data: pendingBody,
  });
  expect(replay.status()).toBe(409);
  expect(await replay.json()).toEqual({ status: "account-mismatch" });
  await page.reload();
  await expect(page.getByText("가져온 검사가 없습니다")).toBeVisible();
  await context.close();
});

test("첫 반영이 진행 중일 때 같은 검사에 원본을 더 가져와도 마지막 원본까지 서버 목록에 반영된다", async ({
  page,
  browser,
}) => {
  const { held, release } = await holdFirstSync(page);
  const [first, second] = await fixtureFiles("stack");
  await page.goto("/");
  await page.getByTestId("dicom-file-input").setInputFiles([first!]);
  await held;
  await expect(
    page.getByRole("status").filter({ hasText: "가져오기 완료" }),
  ).toBeVisible();
  await page.getByTestId("dicom-file-input").setInputFiles([second!]);
  await expect(studyRow(page)).toContainText("원본 있음");
  await release();
  await expectSynced(page);

  // 새 브라우저에서 첫 파일만 가져오면 서버에 2개가 모두 있으므로 일부 원본 1/2
  const fresh = await newBrowserA(browser);
  await fresh.page.goto("/");
  await fresh.page.getByTestId("dicom-file-input").setInputFiles([first!]);
  await expect(studyRow(fresh.page)).toContainText("일부 원본 1/2");
  await fresh.context.close();
});

async function cookieHeader(page: Page): Promise<string> {
  return (await page.context().cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}
