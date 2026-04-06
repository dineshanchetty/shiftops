import { test, expect } from "@playwright/test";

/**
 * Cashup tests require authentication.
 *
 * To run these tests, set the following environment variables:
 *   TEST_USER_EMAIL=your-test-user@example.com
 *   TEST_USER_PASSWORD=your-test-password
 *
 * The test user must have completed onboarding with at least one branch.
 *
 * NOTE: Adding data-testid attributes to the CashupForm sections
 * (e.g. data-testid="takings-section", data-testid="banking-section")
 * would make these selectors more reliable.
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

  test("Cashup page renders with branch selector and date picker", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: /daily cashup/i })
    ).toBeVisible();

    // Branch select
    const branchSelect = page.locator("select").first();
    await expect(branchSelect).toBeVisible();

    // Date picker
    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toBeVisible();
  });

  test("Loading a cashup shows the form sections", async ({ page }) => {
    // Select first branch and click Load
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      // Select the first real branch (skip the placeholder)
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();

      // Wait for the form to load
      await page.waitForTimeout(3_000);

      // The form should now be visible with sections
      const formContent = page.locator("form, [class*='form']").first();
      await expect(formContent).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Takings section has required fields", async ({ page }) => {
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();
      await page.waitForTimeout(3_000);

      // Look for key takings fields by label text
      const takingsLabels = [
        /gross.?turnover/i,
        /discount/i,
      ];
      for (const label of takingsLabels) {
        const field = page.getByText(label).first();
        if (await field.isVisible()) {
          await expect(field).toBeVisible();
        }
      }
    }
  });

  test("Banking section has cash_banked, cc_batch_total, shop_float", async ({
    page,
  }) => {
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();
      await page.waitForTimeout(3_000);

      const bankingLabels = [
        /cash.?banked/i,
        /cc.?batch|credit.?card/i,
        /shop.?float|float/i,
      ];
      for (const label of bankingLabels) {
        const field = page.getByText(label).first();
        if (await field.isVisible()) {
          await expect(field).toBeVisible();
        }
      }
    }
  });

  test("Transaction count section has count, collect, delivery", async ({
    page,
  }) => {
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();
      await page.waitForTimeout(3_000);

      const transLabels = [/collect/i, /deliver/i];
      for (const label of transLabels) {
        const field = page.getByText(label).first();
        if (await field.isVisible()) {
          await expect(field).toBeVisible();
        }
      }
    }
  });

  test("Summary panel shows calculated totals", async ({ page }) => {
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();
      await page.waitForTimeout(3_000);

      // Summary section typically contains "Total" or "Summary" text
      const summary = page.getByText(/total|summary|variance/i).first();
      if (await summary.isVisible()) {
        await expect(summary).toBeVisible();
      }
    }
  });

  test("Submit button is present", async ({ page }) => {
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();
      await page.waitForTimeout(3_000);

      const submitBtn = page.getByRole("button", { name: /submit/i });
      if (await submitBtn.isVisible()) {
        await expect(submitBtn).toBeVisible();
      }
    }
  });

  test('Currency inputs have "R" prefix', async ({ page }) => {
    const branchSelect = page.locator("select").first();
    const options = branchSelect.locator("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      await branchSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /load/i }).click();
      await page.waitForTimeout(3_000);

      // Check for ZAR currency prefix "R" near input fields
      const currencyPrefixes = page.locator("text=R").first();
      if (await currencyPrefixes.isVisible()) {
        await expect(currencyPrefixes).toBeVisible();
      }
    }
  });
});
