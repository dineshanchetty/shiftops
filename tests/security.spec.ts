import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// ─── Unauthenticated redirect tests ────────────────────────────────────────

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
  test(`Unauthenticated users are redirected from ${route} to /login`, async ({
    page,
  }) => {
    const response = await page.goto(`${BASE_URL}${route}`);
    // Should redirect to login
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
    // Should include redirect param
    expect(page.url()).toContain("redirect=");
  });
}

// ─── Security headers tests ───────────────────────────────────────────────

test("Security headers are present on responses", async ({ request }) => {
  const response = await request.get(`${BASE_URL}/login`);

  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-xss-protection"]).toBe("1; mode=block");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin"
  );
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
  expect(response.headers()["content-security-policy"]).toContain(
    "default-src 'self'"
  );
});

// ─── API route authentication tests ───────────────────────────────────────

test("API routes return error for unauthenticated requests", async ({
  request,
}) => {
  // Common API patterns — adjust if your API routes differ
  const apiRoutes = ["/api/branches", "/api/staff", "/api/roster"];

  for (const route of apiRoutes) {
    const response = await request.get(`${BASE_URL}${route}`);
    // Should return 401 or redirect (3xx)
    const status = response.status();
    expect(
      status === 401 || status === 403 || (status >= 300 && status < 400),
      `Expected ${route} to reject unauthenticated request, got ${status}`
    ).toBe(true);
  }
});

// ─── PayFast notify endpoint tests ────────────────────────────────────────

test("/api/billing/payfast-notify accepts POST only", async ({ request }) => {
  // GET should be rejected
  const getResponse = await request.get(
    `${BASE_URL}/api/billing/payfast-notify`
  );
  expect(getResponse.status()).not.toBe(200);

  // POST should be accepted (may return 400 for missing body, but not 405)
  const postResponse = await request.post(
    `${BASE_URL}/api/billing/payfast-notify`,
    {
      data: {},
    }
  );
  // POST should not return 405 Method Not Allowed
  expect(postResponse.status()).not.toBe(405);
});
