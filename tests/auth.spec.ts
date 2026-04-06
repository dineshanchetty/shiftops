import { test, expect } from "@playwright/test";

test.describe("Authentication — Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("Login page renders with email and password fields", async ({
    page,
  }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.locator("#email").fill("invalid@example.com");
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for error message to appear
    const errorBanner = page.locator(".text-red-600").first();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
  });

  test("Login page has link to signup", async ({ page }) => {
    const signupLink = page.getByRole("link", { name: /sign up/i });
    await expect(signupLink).toBeVisible();
    await expect(signupLink).toHaveAttribute("href", "/signup");
  });
});

test.describe("Authentication — Signup", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
  });

  test("Signup page renders with all required fields", async ({ page }) => {
    await expect(page.locator("#fullName")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create account/i })
    ).toBeVisible();
  });

  test("Signup with mismatched passwords shows error", async ({ page }) => {
    await page.locator("#fullName").fill("Test User");
    await page.locator("#email").fill("test@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#confirmPassword").fill("differentpassword");
    await page.getByRole("button", { name: /create account/i }).click();

    // Zod refine error for mismatched passwords
    const errorText = page.locator("text=Passwords do not match");
    await expect(errorText).toBeVisible({ timeout: 5_000 });
  });

  test("Signup page has link to login", async ({ page }) => {
    const loginLink = page.getByRole("link", { name: /sign in/i });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", "/login");
  });
});

test.describe("Authentication — Route protection", () => {
  test("Unauthenticated user redirected from /app to /login", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("Unauthenticated user redirected from /app/roster to /login", async ({
    page,
  }) => {
    await page.goto("/app/roster");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
