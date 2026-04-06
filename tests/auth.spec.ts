import { test, expect } from "@playwright/test";

test.describe("Authentication — Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("Login page renders with email and password fields", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText(/sign in/i);
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.locator("#email").fill("invalid@example.com");
    await page.locator("#password").fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Wait for error message — Supabase returns an error for bad credentials
    const errorEl = page.locator(".text-red-600").first();
    await expect(errorEl).toBeVisible({ timeout: 10_000 });
  });

  test("Login page has link to signup", async ({ page }) => {
    const signupLink = page.locator('a[href="/signup"]');
    await expect(signupLink).toBeVisible();
    await expect(signupLink).toHaveText(/sign up/i);
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
    await expect(page.locator('button[type="submit"]')).toHaveText(/create account/i);
  });

  test("Signup with mismatched passwords shows error", async ({ page }) => {
    await page.locator("#fullName").fill("Test User");
    await page.locator("#email").fill("test@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#confirmPassword").fill("differentpassword");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText("Passwords do not match")).toBeVisible({ timeout: 5_000 });
  });

  test("Signup page has link to login", async ({ page }) => {
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveText(/sign in/i);
  });
});

test.describe("Authentication — Route protection", () => {
  test("Unauthenticated user cannot access /app", async ({ page }) => {
    const response = await page.goto("/app");
    // Should either redirect to /login or show 404/error (not render dashboard)
    const url = page.url();
    const status = response?.status() ?? 0;
    const isProtected = url.includes("/login") || status === 404 || status >= 300;
    expect(isProtected).toBe(true);
  });

  test("Unauthenticated user cannot access /app/roster", async ({ page }) => {
    const response = await page.goto("/app/roster");
    const url = page.url();
    const status = response?.status() ?? 0;
    const isProtected = url.includes("/login") || status === 404 || status >= 300;
    expect(isProtected).toBe(true);
  });
});
