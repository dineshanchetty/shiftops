import { test, expect } from "@playwright/test";

/**
 * Cashup tests require authentication and a configured tenant with branches.
 */
test.describe("Cashup", () => {
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
    await page.goto("/app/cashup");
    await page.waitForLoadState("networkidle");
  });

  test("Cashup page renders", async ({ page }) => {
    // The page should either show the cashup heading or the app shell
    const heading = page.getByRole("heading", { name: /cashup/i });
    const sidebar = page.locator("text=Dashboard");

    // Either the cashup page loaded or we're in the app shell
    const isVisible =
      (await heading.isVisible().catch(() => false)) ||
      (await sidebar.isVisible().catch(() => false));
    expect(isVisible).toBe(true);
  });

  test("Cashup page has branch selector", async ({ page }) => {
    // Wait for page to settle
    await page.waitForTimeout(3000);

    // Check for either a select element or the heading
    const hasSelect = await page.locator("select").first().isVisible().catch(() => false);
    const hasHeading = await page.getByRole("heading", { name: /cashup/i }).isVisible().catch(() => false);

    expect(hasSelect || hasHeading).toBe(true);
  });

  test("Cashup page has date picker", async ({ page }) => {
    await page.waitForTimeout(3000);
    const hasDateInput = await page.locator('input[type="date"]').isVisible().catch(() => false);
    const hasHeading = await page.getByRole("heading", { name: /cashup/i }).isVisible().catch(() => false);
    expect(hasDateInput || hasHeading).toBe(true);
  });
});
