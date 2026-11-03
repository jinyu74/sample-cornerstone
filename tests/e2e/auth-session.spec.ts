import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { readLocalStatus } from "../../scripts/auth/local-supabase";
import { UID } from "../fixtures/dicom/scenarios";

import {
  drag,
  e2eUser,
  importGroups,
  login,
  logout,
  openSeries,
  results,
  viewport,
} from "./helpers";

// 이 파일은 로그인하지 않은 브라우저에서 시작해 실제 로컬 Auth 로 로그인한다.
test.use({ storageState: { cookies: [], origins: [] } });

const VIEWER = `/studies/${UID.studyA}?series=${UID.seriesSingle}`;

function expectNoStore(headers: Record<string, string>) {
  expect(headers["cache-control"]).toContain("no-store");
}

async function authCookies(context: BrowserContext) {
  return (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith("sb-"),
  );
}

test.describe("로그인·세션", () => {
  test("정상 로그인 → next(쿼리 포함) 복귀 → 새로고침 유지 → 로그아웃 후 직접 URL 차단", async ({
    page,
  }) => {
    await login(page, "a", VIEWER);
    await expect(page).toHaveURL(VIEWER);
    await page.reload();
    await expect(page).toHaveURL(VIEWER);
    await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();

    await logout(page);
    await expect(page.getByRole("status")).toHaveText("로그아웃했습니다.");
    expect(await authCookies(page.context())).toHaveLength(0);
    await page.goto(VIEWER);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(viewport(page)).toHaveCount(0);
  });

  test("잘못된 비밀번호는 성공으로 표시하지 않고 세션 쿠키를 만들지 않는다", async ({
    page,
  }) => {
    const user = await e2eUser("a");
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(`${user.password}-wrong`);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "올바르지 않습니다" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(await authCookies(page.context())).toHaveLength(0);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });

  test("외부 next 는 무시하고 기본 경로로, 인코딩된 정상 내부 경로는 그대로 돌아간다", async ({
    page,
  }) => {
    await login(page, "a", "//evil.example/steal");
    await expect(page).toHaveURL("/");
    await logout(page);

    const encoded = `/studies/${UID.studyA}?series=${encodeURIComponent(UID.seriesSingle)}&q=%ED%95%9C`;
    await login(page, "a", encoded);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
      encoded,
    );
  });

  test("공개 가입 API 는 Auth 서버에서 거부된다(가입 화면도 없음)", async ({
    request,
  }) => {
    const status = readLocalStatus();
    const response = await request.post(`${status.apiUrl}/auth/v1/signup`, {
      headers: { apikey: status.publishableKey },
      data: {
        email: `signup-probe-${Date.now()}@example.test`,
        password: "Probe-password-1234",
      },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error_code).toBe("signup_disabled");
  });

  test("위조한 세션 쿠키는 서버에서 인증되지 않는다", async ({
    page,
    browser,
  }) => {
    await login(page, "a");
    const names = (await authCookies(page.context())).map((c) => c.name);
    expect(names.length).toBeGreaterThan(0);

    const forged = await browser.newContext();
    await forged.addCookies(
      names.map((name) => ({
        name,
        value: `base64-${Buffer.from('{"access_token":"forged.jwt.value","refresh_token":"x"}').toString("base64url")}`,
        domain: "127.0.0.1",
        path: "/",
      })),
    );
    const response = await forged.request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/login");
    const session = await forged.request.get("/auth/session");
    expect(session.status()).toBe(401);
    expectNoStore(session.headers());
    await forged.close();
  });

  test("로그아웃 후 복사해 둔 이전 쿠키를 다시 보내도 서버(getUser)가 인증하지 않는다", async ({
    page,
    browser,
  }) => {
    await login(page, "a");
    const copied = await authCookies(page.context());
    await logout(page);

    const replay = await browser.newContext();
    await replay.addCookies(copied);
    const session = await replay.request.get("/auth/session");
    expect(session.status()).toBe(401);
    const replayPage = await replay.newPage();
    await replayPage.goto("/");
    await expect(replayPage).toHaveURL(/\/login/);
    await expect(replayPage.getByTestId("dicom-file-input")).toHaveCount(0);
    await replay.close();
  });

  test("인증 응답은 리다이렉트·성공·401·로그아웃·거부 모든 분기에서 no-store 다", async ({
    page,
  }) => {
    const anon = page.request;
    expectNoStore((await anon.get("/login")).headers());
    expectNoStore((await anon.get("/auth/session")).headers());

    await login(page, "a");
    const request = page.context().request;
    const list = await request.get("/");
    expect(list.status()).toBe(200);
    expectNoStore(list.headers());
    const session = await request.get("/auth/session");
    expect(session.status()).toBe(200);
    expect((await session.json()).userId).toBe((await e2eUser("a")).id);
    expectNoStore(session.headers());
    const loginWhileSignedIn = await request.get("/login?next=/", {
      maxRedirects: 0,
    });
    expect([303, 307]).toContain(loginWhileSignedIn.status());
    expectNoStore(loginWhileSignedIn.headers());

    // 다른 출처에서 보낸 로그아웃(CSRF)은 거부하고 세션을 유지한다
    const csrf = await request.post("/auth/sign-out", {
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(csrf.status()).toBe(403);
    expectNoStore(csrf.headers());
    // 같은 host 라도 port 가 다르면 다른 출처다
    const otherPort = new URL(page.url());
    otherPort.port = "9";
    const portCsrf = await request.post("/auth/sign-out", {
      headers: { origin: otherPort.origin },
      maxRedirects: 0,
    });
    expect(portCsrf.status()).toBe(403);
    expect((await request.get("/auth/session")).status()).toBe(200);

    const signOut = await request.post("/auth/sign-out", {
      headers: { origin: new URL(page.url()).origin },
      maxRedirects: 0,
    });
    expect(signOut.status()).toBe(303);
    expect(signOut.headers().location).toMatch(/^\/login\?signed_out=1$/);
    expectNoStore(signOut.headers());
  });
});

test.describe("열린 화면·다른 탭·뒤로 가기", () => {
  async function openTwoTabs(page: Page) {
    await login(page, "a");
    const second = await page.context().newPage();
    await second.goto("/");
    await expect(
      second.getByRole("heading", { name: "검사 목록" }),
    ).toBeVisible();
    return second;
  }

  test("한 탭에서 로그아웃하면 다른 탭의 보호 화면도 즉시 로그인으로 바뀐다", async ({
    page,
  }) => {
    const second = await openTwoTabs(page);
    await logout(page);
    await expect(second).toHaveURL(/\/login\?next=/, { timeout: 10_000 });
    await expect(second.getByTestId("dicom-file-input")).toHaveCount(0);
  });

  test("세션이 사라진 뒤 이미 열린 활성 탭도 포커스·재표시 시 서버 재검증으로 로그인으로 바뀐다", async ({
    page,
  }) => {
    await login(page, "a");
    await expect(
      page.getByRole("heading", { name: "검사 목록" }),
    ).toBeVisible();
    // 다른 경로(만료·다른 기기 로그아웃 등)로 세션 쿠키가 사라진 상황
    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(/\/login\?next=%2F/, { timeout: 10_000 });
  });

  test("로그아웃 뒤 뒤로 가기로 보호 화면이 다시 보이지 않는다", async ({
    page,
  }) => {
    await login(page, "a");
    await expect(
      page.getByRole("heading", { name: "검사 목록" }),
    ).toBeVisible();
    await logout(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByTestId("dicom-file-input")).toHaveCount(0);
  });
});

test.describe("계정별 브라우저 저장소", () => {
  test("A 가 가져온 원본·결과는 같은 브라우저의 B 목록·뷰어·직접 UID 접근에 없고, A 로 돌아오면 복원된다", async ({
    page,
  }) => {
    await login(page, "a");
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    await page.getByRole("button", { name: "길이" }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await expect(results(page)).toHaveCount(1);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("저장됨")).toBeVisible();
    await logout(page);

    await login(page, "b");
    await expect(
      page.getByRole("heading", { name: "검사 목록" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /studyA|검사/ })).toHaveCount(
      0,
    );
    await expect(page.getByText(UID.studyA)).toHaveCount(0);
    await page.goto(VIEWER);
    await expect(viewport(page)).toHaveCount(0);
    await expect(results(page)).toHaveCount(0);
    await logout(page);

    await login(page, "a");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    await expect(results(page)).toHaveCount(1);
    await expect(viewport(page)).toHaveAttribute("data-annotation-count", "1");
  });

  test("저장 전에 바로 로그아웃해도(문서 전체 이동) 마지막 편집을 먼저 저장한 뒤 나간다", async ({
    page,
  }) => {
    await login(page, "a");
    await importGroups(page, "single");
    await openSeries(page, UID.studyA, UID.seriesSingle);
    await page.getByRole("button", { name: "길이" }).click();
    await drag(page, [0.35, 0.5], [0.65, 0.5]);
    await expect(results(page)).toHaveCount(1);
    // 자동 저장(1.5초)을 기다리지 않고 즉시 로그아웃
    await logout(page);

    await login(page, "a", VIEWER);
    await expect(viewport(page)).toHaveAttribute(
      "data-render-state",
      "rendered",
      { timeout: 30_000 },
    );
    await expect(results(page)).toHaveCount(1);
  });

  test("로그인 이전의 익명 저장소는 계정에 옮겨지거나 지워지지 않는다", async ({
    page,
  }) => {
    await page.goto("/login");
    // 이전 버전이 쓰던 익명 공용 저장소에 표식을 남긴다
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("dicom-annotator", 2);
          request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore("instances", { keyPath: "sopInstanceUid" });
            db.createObjectStore("files", { keyPath: "sopInstanceUid" });
            db.createObjectStore("works", { keyPath: "studyInstanceUid" });
          };
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("works", "readwrite");
            tx.objectStore("works").put({
              studyInstanceUid: "legacy-marker",
              revision: 1,
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          request.onerror = () => reject(request.error);
        }),
    );

    await login(page, "a");
    await expect(
      page.getByRole("heading", { name: "검사 목록" }),
    ).toBeVisible();
    await expect(page.getByText("legacy-marker")).toHaveCount(0);

    const preserved = await page.evaluate(
      () =>
        new Promise<unknown>((resolve, reject) => {
          const request = indexedDB.open("dicom-annotator");
          request.onsuccess = () => {
            const db = request.result;
            const get = db
              .transaction("works")
              .objectStore("works")
              .get("legacy-marker");
            get.onsuccess = () => {
              db.close();
              resolve(get.result);
            };
            get.onerror = () => reject(get.error);
          };
          request.onerror = () => reject(request.error);
        }),
    );
    expect(preserved).toMatchObject({ studyInstanceUid: "legacy-marker" });
  });
});
