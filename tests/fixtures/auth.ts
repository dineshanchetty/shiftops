import { test as base, type Page } from "@playwright/test";

/**
 * Test user credentials.
 *
 * To run authenticated tests, create a test user in Supabase and set these
 * environment variables:
 *
 *   TEST_USER_EMAIL=test@example.com
 *   TEST_USER_PASSWORD=testpassword123
 *
 * You can create a test user via the Supabase dashboard (Authentication > Users)
 * or with the Supabase Admin SDK.
 */
export const TEST_USER_EMAIL =
  process.env.TEST_USER_EMAIL || "test@shiftops.local";
export const TEST_USER_PASSWORD =
  process.env.TEST_USER_PASSWORD || "testpassword123";

/** Whether real test credentials are available. */
export const hasTestCredentials = !!process.env.TEST_USER_EMAIL;

/**
 * Fill the login form and submit it.
 * Does NOT wait for navigation — callers should add their own assertions.
 */
export async function loginAsTestUser(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(TEST_USER_EMAIL);
  await page.locator("#password").fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/**
 * Playwright test fixture that automatically logs in before each test.
 *
 * Usage:
 *   import { test } from '../fixtures/auth';
 *   test('my test', async ({ authenticatedPage }) => { ... });
 *
 * Tests using this fixture will be skipped when TEST_USER_EMAIL is not set.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsTestUser(page);
    // Wait for redirect to /app (or wherever the app sends after login)
    await page.waitForURL(/\/app|\/setup/, { timeout: 15_000 });
    await use(page);
  },
});

export { expect } from "@playwright/test";
