import { test, expect } from "@playwright/test";

const protectedRoutes = [
  "/app",
  "/app/roster",
  "/app/cashup",
  "/app/aura-upload",
  "/app/reports",
  "/app/staff",
  "/app/settings",
  "/app/settings/branches",
  "/app/settings/billing",
];

for (const route of protectedRoutes) {
  test(`Unauthenticated users cannot access ${route}`, async ({ page }) => {
    const response = await page.goto(route);
    const status = response?.status() ?? 0;
    const url = page.url();

    // Should either redirect to /login OR return 404/error (not render the actual page content)
    const isRedirected = url.includes("/login");
    const isBlocked = status === 404 || status >= 300;

    expect(isRedirected || isBlocked).toBe(true);
  });
}

test("Security headers are present on responses", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("API routes reject non-POST methods", async ({ request }) => {
  const getResponse = await request.get("/api/aura/test-connection");
  expect(getResponse.status()).toBeGreaterThanOrEqual(400);
});
