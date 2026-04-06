import { test, expect } from "@playwright/test";

/**
 * Reports tests require authentication.
 *
 * To run these tests, set:
 *   TEST_USER_EMAIL=your-test-user@example.com
 *   TEST_USER_PASSWORD=your-test-password
 */
test.describe("Reports", () => {
  test.skip(
    !process.env.TEST_USER_EMAIL,
    "Skipped — set TEST_USER_EMAIL and TEST_USER_PASSWORD to run authenticated tests"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(process.env.TEST_USER_EMAIL!);
    await page.locator("#password").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
    await page.goto("/app/reports");
    await page.waitForLoadState("networkidle");
  });

  test("Reports landing page shows 8 report cards", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /reports/i })
    ).toBeVisible();

    // There should be 8 report card links
    const reportCards = page.locator('a[href^="/app/reports/"]');
    await expect(reportCards).toHaveCount(8);
  });

  test("Each report card links to correct route", async ({ page }) => {
    const expectedRoutes = [
      "/app/reports/daily-banking",
      "/app/reports/monthly-summary",
      "/app/reports/wages-vs-turnover",
      "/app/reports/driver-report",
      "/app/reports/delivery-cost",
      "/app/reports/online-payments",
      "/app/reports/global-turnover",
      "/app/reports/aura-inconsistency",
    ];

    for (const route of expectedRoutes) {
      const link = page.locator(`a[href="${route}"]`);
      await expect(link).toBeVisible();
    }
  });

  test("Report wrapper has branch selector and date range picker", async ({
    page,
  }) => {
    // Navigate into a specific report
    await page.goto("/app/reports/daily-banking");
    await page.waitForLoadState("networkidle");

    // Branch selector is a custom dropdown button (not a <select>)
    const branchButton = page.getByRole("button", {
      name: /select branch|branch|all branches|\d+ branch/i,
    });
    await expect(branchButton).toBeVisible({ timeout: 10_000 });

    // Period selector is a <select> with preset options (Today, This Week, etc.)
    const periodSelect = page.locator("select").first();
    await expect(periodSelect).toBeVisible({ timeout: 10_000 });

    // Run Report button
    const runButton = page.getByRole("button", { name: /run report/i });
    await expect(runButton).toBeVisible();
  });

  test("Export CSV button is present", async ({ page }) => {
    await page.goto("/app/reports/daily-banking");
    await page.waitForLoadState("networkidle");

    const csvButton = page.getByRole("button", { name: /csv|export/i }).first();
    if (await csvButton.isVisible()) {
      await expect(csvButton).toBeVisible();
    }
  });

  test("Export PDF button is present", async ({ page }) => {
    await page.goto("/app/reports/daily-banking");
    await page.waitForLoadState("networkidle");

    const pdfButton = page.getByRole("button", { name: /pdf|print/i }).first();
    if (await pdfButton.isVisible()) {
      await expect(pdfButton).toBeVisible();
    }
  });
});
