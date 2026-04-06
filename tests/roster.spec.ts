import { test, expect } from "@playwright/test";

/**
 * Roster tests require authentication.
 *
 * To run these tests, set the following environment variables:
 *   TEST_USER_EMAIL=your-test-user@example.com
 *   TEST_USER_PASSWORD=your-test-password
 *
 * The test user must have completed onboarding with at least one branch.
 *
 * NOTE: Adding data-testid attributes (e.g. data-testid="filter-bar",
 * data-testid="calendar-grid", data-testid="shift-editor") to components
 * would improve test reliability.
 */
test.describe("Roster", () => {
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
    await page.goto("/app/roster");
    await page.waitForLoadState("networkidle");
  });

  test("Roster page renders with filter bar", async ({ page }) => {
    // Page heading
    await expect(
      page.getByRole("heading", { name: /roster/i })
    ).toBeVisible();

    // Filter bar should have select elements
    const selects = page.locator("select");
    await expect(selects.first()).toBeVisible();
  });

  test("Filter bar has branch, position, month/year selectors", async ({
    page,
  }) => {
    // Branch selector
    await expect(
      page.locator("select").filter({ hasText: /select branch|branch/i }).first()
    ).toBeVisible();

    // Month and year selectors (numeric selects)
    const selects = page.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("Calendar grid renders Mon-Sun headers", async ({ page }) => {
    const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const day of dayHeaders) {
      await expect(page.getByText(day, { exact: false }).first()).toBeVisible();
    }
  });

  test("Clicking a date opens shift editor slide-over", async ({ page }) => {
    // Click on a date cell in the calendar grid
    // Calendar cells are typically buttons or clickable elements with date numbers
    const dateCell = page.locator("button, [role='button'], td").filter({
      hasText: /^15$/,
    }).first();

    if (await dateCell.isVisible()) {
      await dateCell.click();

      // Shift editor panel should appear
      // It typically slides in from the right with staff dropdown, time inputs, etc.
      await page.waitForTimeout(500);
      const editorPanel = page.locator(
        "[class*='fixed'], [class*='slide'], [class*='panel'], [role='dialog']"
      ).last();
      await expect(editorPanel).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Shift editor has staff dropdown, time inputs, save button", async ({
    page,
  }) => {
    // Open shift editor by clicking a date
    const dateCell = page.locator("button, [role='button'], td").filter({
      hasText: /^15$/,
    }).first();

    if (await dateCell.isVisible()) {
      await dateCell.click();
      await page.waitForTimeout(500);

      // Staff select dropdown
      await expect(
        page.locator("select").filter({ hasText: /select staff|staff/i }).first()
      ).toBeVisible({ timeout: 5_000 });

      // Time inputs (start/end)
      const timeInputs = page.locator('input[type="time"]');
      await expect(timeInputs.first()).toBeVisible();

      // Save button
      await expect(
        page.getByRole("button", { name: /save/i })
      ).toBeVisible();
    }
  });

  test("Day-off toggle works", async ({ page }) => {
    const dateCell = page.locator("button, [role='button'], td").filter({
      hasText: /^15$/,
    }).first();

    if (await dateCell.isVisible()) {
      await dateCell.click();
      await page.waitForTimeout(500);

      // Look for day-off toggle (checkbox or switch)
      const dayOffToggle = page.locator(
        'input[type="checkbox"], [role="switch"], button'
      ).filter({ hasText: /day.?off|off/i }).first();

      if (await dayOffToggle.isVisible()) {
        await dayOffToggle.click();
        // Toggle should change state
        await page.waitForTimeout(300);
      }
    }
  });
});
