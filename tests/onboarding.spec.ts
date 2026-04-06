import { test, expect } from "@playwright/test";

test.describe("Onboarding — Setup wizard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/setup");
  });

  test("Setup page renders step 1 (Company Details)", async ({ page }) => {
    // Step indicator shows Company Details as active
    await expect(page.getByText("Company Details")).toBeVisible();

    // Step 1 form heading
    await expect(
      page.getByRole("heading", { name: /company details/i })
    ).toBeVisible();

    // Fields present
    await expect(page.locator("#companyName")).toBeVisible();
    await expect(page.locator("#slug")).toBeVisible();

    // Next button
    await expect(
      page.getByRole("button", { name: /next/i })
    ).toBeVisible();
  });

  test("Step 1 validates required company name", async ({ page }) => {
    // Submit with empty company name
    await page.getByRole("button", { name: /next/i }).click();

    await expect(
      page.locator("text=Company name is required")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Step 1 auto-generates slug from company name", async ({ page }) => {
    await page.locator("#companyName").fill("My Restaurant Group");

    // Slug should auto-populate
    const slugInput = page.locator("#slug");
    await expect(slugInput).toHaveValue("my-restaurant-group", {
      timeout: 3_000,
    });
  });

  test("Navigation between steps works (Next/Back)", async ({ page }) => {
    // Fill step 1 and go next
    await page.locator("#companyName").fill("Test Company");
    await page.getByRole("button", { name: /next/i }).click();

    // Should be on step 2 — "Add Brands" heading visible
    await expect(
      page.getByRole("heading", { name: /add brands/i })
    ).toBeVisible({ timeout: 5_000 });

    // Click Back to return to step 1
    await page.getByRole("button", { name: /back/i }).click();
    await expect(
      page.getByRole("heading", { name: /company details/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Step 2 requires at least one brand", async ({ page }) => {
    // Navigate to step 2
    await page.locator("#companyName").fill("Test Company");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(
      page.getByRole("heading", { name: /add brands/i })
    ).toBeVisible({ timeout: 5_000 });

    // Try to proceed without adding a brand
    await page.getByRole("button", { name: /next/i }).click();

    await expect(
      page.locator("text=Add at least one brand to continue")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Step 3 requires branch name and brand selection", async ({
    page,
  }) => {
    // Navigate through step 1
    await page.locator("#companyName").fill("Test Company");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2 — add a brand
    await page.locator("#brandName").fill("Test Brand");
    await page.getByRole("button", { name: /add brand/i }).click();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3 — should show First Branch heading
    await expect(
      page.getByRole("heading", { name: /first branch/i })
    ).toBeVisible({ timeout: 5_000 });

    // Submit without filling required fields
    await page.getByRole("button", { name: /next/i }).click();

    await expect(
      page.locator("text=Branch name is required")
    ).toBeVisible({ timeout: 5_000 });
  });
});
