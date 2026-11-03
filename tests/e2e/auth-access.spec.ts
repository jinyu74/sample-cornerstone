import { expect, test } from "@playwright/test";

/**
 * 시나리오 1: 비로그인 상태의 직접 URL 접근은 보호 화면을 렌더링하지 않고 로그인으로 보낸다.
 * 서버 진입점에서 막는지(응답 자체가 리다이렉트인지)와 화면 결과를 함께 확인한다.
 */

// 로그인하지 않은 브라우저
test.use({ storageState: { cookies: [], origins: [] } });

const STUDY =
  "/studies/1.2.826.0.1.3680043.8.498.1?series=1.2.826.0.1.3680043.8.498.2";

test.describe("비로그인 접근 제어", () => {
  test("목록(/) 직접 요청은 서버에서 로그인으로 리다이렉트하고 캐시하지 않는다", async ({
    request,
  }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect([303, 307]).toContain(response.status());
    // 서버 내부 주소(localhost 등)로 출처를 바꾸지 않는 같은 출처 상대 경로
    expect(response.headers().location).toMatch(/^\/login\?/);
    const location = new URL(response.headers().location!, "http://x");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain("dicom-file-input");
  });

  test("뷰어 직접 요청도 원래 경로(쿼리 포함)를 next 로 담아 로그인으로 보낸다", async ({
    request,
  }) => {
    const response = await request.get(STUDY, { maxRedirects: 0 });
    expect([303, 307]).toContain(response.status());
    expect(response.headers().location).toMatch(/^\/login\?/);
    const location = new URL(response.headers().location!, "http://x");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(STUDY);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("브라우저로 열면 로그인 화면만 보이고 목록·뷰어 요소가 없다", async ({
    page,
  }) => {
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveURL(`${origin}/login?next=%2F`);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.getByTestId("dicom-file-input")).toHaveCount(0);

    await page.goto(STUDY);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByTestId("stack-viewport")).toHaveCount(0);
    // 공개 가입 진입점이 없다
    await expect(page.getByRole("link", { name: /가입|sign up/i })).toHaveCount(
      0,
    );
  });
});
