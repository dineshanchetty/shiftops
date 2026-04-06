import { test, expect } from "@playwright/test";

/**
 * Settings tests require authentication.
 *
 * To run these tests, set:
 *   TEST_USER_EMAIL=your-test-user@example.com
 *   TEST_USER_PASSWORD=your-test-password
 */
test.describe("Settings", () => {
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
    await page.goto("/app/settings");
    await page.waitForLoadState("networkidle");
  });

  test("Settings page renders with cards", async ({ page }) => {
    // PageShell renders an h1 with "Settings"
    await expect(
      page.getByRole("heading", { level: 1, name: /settings/i })
    ).toBeVisible({ timeout: 10_000 });

    // Should show setting card titles (rendered as h3 by CardTitle)
    await expect(page.getByRole("heading", { name: "Branch Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Billing & Plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aura Integration" })).toBeVisible();
  });

  test("Branch settings card links to /app/settings/branches", async ({
    page,
  }) => {
    const branchLink = page.locator('a[href="/app/settings/branches"]');
    await expect(branchLink).toBeVisible();
  });

  test("Billing card links to /app/settings/billing", async ({ page }) => {
    const billingLink = page.locator('a[href="/app/settings/billing"]');
    await expect(billingLink).toBeVisible();
  });

  test("Billing page shows pricing table with 3 plans", async ({ page }) => {
    await page.goto("/app/settings/billing");
    await page.waitForLoadState("networkidle");

    // The billing page should show 3 plan cards (starter, growth, enterprise)
    await expect(page.getByText(/starter/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/growth/i).first()).toBeVisible();
    await expect(page.getByText(/enterprise/i).first()).toBeVisible();
  });

  test("Aura mapping page renders", async ({ page }) => {
    await page.goto("/app/settings/aura-mapping");
    await page.waitForLoadState("networkidle");

    // The page should show the Aura Field Mapping heading
    await expect(
      page.getByRole("heading", { name: /aura field mapping/i })
    ).toBeVisible({ timeout: 10_000 });

    // Content may show field mapper or a loading/error state depending on RLS
    // Just verify the page rendered within the app shell
    const hasSidebar = await page.locator("text=Dashboard").isVisible().catch(() => false);
    expect(hasSidebar).toBe(true);
  });
});
