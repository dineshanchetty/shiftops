import { test, expect } from "@playwright/test";

/**
 * Dashboard tests require authentication.
 *
 * To run these tests, set the following environment variables:
 *   TEST_USER_EMAIL=your-test-user@example.com
 *   TEST_USER_PASSWORD=your-test-password
 *
 * Create a test user in Supabase (Authentication > Users) with a completed
 * onboarding (tenant, brands, branch) so the user lands on /app after login.
 */
test.describe("Dashboard", () => {
  test.skip(
    !process.env.TEST_USER_EMAIL,
    "Skipped — set TEST_USER_EMAIL and TEST_USER_PASSWORD to run authenticated tests"
  );

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.locator("#email").fill(process.env.TEST_USER_EMAIL!);
    await page.locator("#password").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  });

  test("Dashboard renders with KPI stat cards", async ({ page }) => {
    await expect(page.getByText("Total Branches")).toBeVisible();
    await expect(page.getByText("Today's Cashups")).toBeVisible();
    await expect(page.getByText("Missing Cashups")).toBeVisible();
    await expect(page.getByText("Monthly Turnover")).toBeVisible();
  });

  test("Sidebar navigation links are present", async ({ page }) => {
    // Desktop viewport — sidebar should be visible
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /roster/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /cashup/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /reports/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /staff/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /settings/i })).toBeVisible();
  });

  test('Page title shows "Dashboard"', async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /dashboard/i })
    ).toBeVisible();
  });
});

test.describe("Dashboard — Mobile", () => {
  test.skip(
    !process.env.TEST_USER_EMAIL,
    "Skipped — set TEST_USER_EMAIL and TEST_USER_PASSWORD to run authenticated tests"
  );

  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(process.env.TEST_USER_EMAIL!);
    await page.locator("#password").fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  });

  test("Mobile bottom tabs render on small viewport", async ({ page }) => {
    // Bottom tabs nav should be visible on mobile
    const bottomNav = page.locator("nav.md\\:hidden");
    await expect(bottomNav).toBeVisible();

    await expect(bottomNav.getByText("Home")).toBeVisible();
    await expect(bottomNav.getByText("Roster")).toBeVisible();
    await expect(bottomNav.getByText("Cashup")).toBeVisible();
    await expect(bottomNav.getByText("More")).toBeVisible();
  });
});
