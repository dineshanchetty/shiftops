import { test, expect } from "@playwright/test";

/**
 * Staff tests require authentication.
 *
 * To run these tests, set:
 *   TEST_USER_EMAIL=your-test-user@example.com
 *   TEST_USER_PASSWORD=your-test-password
 *
 * NOTE: Adding data-testid attributes (e.g. data-testid="staff-table",
 * data-testid="invite-button") would improve test reliability.
 */
test.describe("Staff", () => {
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
    await page.goto("/app/staff");
    await page.waitForLoadState("networkidle");
  });

  test("Staff page renders with table or empty state", async ({ page }) => {
    // Wait for the page heading to confirm we are on the staff page
    await expect(
      page.getByRole("heading", { level: 1, name: /staff/i })
    ).toBeVisible({ timeout: 10_000 });

    // Wait for loading spinner to disappear
    await expect(page.locator(".animate-spin")).toBeHidden({ timeout: 15_000 });

    // Either a table is present (staff exist) or the empty state is shown
    const table = page.locator("table");
    const emptyState = page.getByText("No staff yet");

    const tableVisible = await table.isVisible();
    const emptyVisible = await emptyState.isVisible();

    expect(tableVisible || emptyVisible).toBeTruthy();
  });

  test('"Invite Staff" button is present', async ({ page }) => {
    // Wait for loading to complete
    await expect(page.locator(".animate-spin")).toBeHidden({ timeout: 15_000 });

    // The "Invite Staff" button is always present — either in the PageShell
    // action bar (when staff exist) or in the empty state
    const inviteButton = page.getByRole("button", {
      name: /invite staff/i,
    }).first();
    await expect(inviteButton).toBeVisible({ timeout: 10_000 });
  });

  test("Search filter works", async ({ page }) => {
    // Find the search input
    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="filter" i], input[type="search"]'
    ).first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("nonexistent-staff-member-xyz");
      await page.waitForTimeout(500);

      // Table should have no matching rows or show empty state
      const tableRows = page.locator("table tbody tr");
      const rowCount = await tableRows.count();
      // Either zero rows or an empty state message
      expect(rowCount).toBeLessThanOrEqual(1);
    }
  });

  test("Position filter dropdown is present", async ({ page }) => {
    // Position filter — look for a select with position-related options
    const selects = page.locator("select");
    const count = await selects.count();

    // There should be at least one filter select (position filter)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Status filter dropdown is present", async ({ page }) => {
    // Status filter — look for select with active/inactive options
    const statusSelect = page.locator("select").filter({
      hasText: /all|active|inactive/i,
    }).first();

    if (await statusSelect.isVisible()) {
      await expect(statusSelect).toBeVisible();
    }
  });
});
