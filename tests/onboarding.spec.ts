import { test, expect } from "@playwright/test";

test.describe("Onboarding — Setup wizard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/setup");
  });

  test("Setup page renders step 1 (Company Details)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Company Details" })).toBeVisible();
    await expect(page.locator("#companyName")).toBeVisible();
    await expect(page.locator("#slug")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  });

  test("Step 1 validates required company name", async ({ page }) => {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Company name is required")).toBeVisible({ timeout: 3_000 });
  });

  test("Step 1 auto-generates slug from company name", async ({ page }) => {
    await page.locator("#companyName").fill("My Restaurant Group");
    await expect(page.locator("#slug")).toHaveValue("my-restaurant-group", { timeout: 3_000 });
  });

  test("Navigation between steps works (Next/Back)", async ({ page }) => {
    await page.locator("#companyName").fill("Test Co");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Add Brands" })).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Company Details" })).toBeVisible({ timeout: 3_000 });
  });

  test("Step 2 requires at least one brand", async ({ page }) => {
    await page.locator("#companyName").fill("Test Co");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Add Brands" })).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Add at least one brand")).toBeVisible({ timeout: 3_000 });
  });

  test("Step 3 requires branch name and brand selection", async ({ page }) => {
    await page.locator("#companyName").fill("Test Co");
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator("#brandName").fill("Test Brand");
    await page.getByRole("button", { name: "Add Brand" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "First Branch" })).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Branch name is required")).toBeVisible({ timeout: 3_000 });
  });
});
