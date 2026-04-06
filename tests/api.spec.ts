import { test, expect } from "@playwright/test";

/**
 * API endpoint tests.
 *
 * These tests use Playwright's request API to directly call backend endpoints
 * without needing a browser. They verify basic request/response behavior.
 */
test.describe("API — Aura endpoints", () => {
  test("POST /api/aura/test-connection returns JSON", async ({ request }) => {
    const response = await request.post("/api/aura/test-connection", {
      data: {},
    });

    // Should return a JSON response (may be 200 or 401 depending on auth)
    const contentType = response.headers()["content-type"] || "";
    expect(contentType).toContain("application/json");
  });

  test("POST /api/aura/parse-csv with empty body returns error", async ({
    request,
  }) => {
    const response = await request.post("/api/aura/parse-csv", {
      data: {},
    });

    // Without a CSV payload, should return an error status
    const status = response.status();
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/aura/import without auth returns 401/error", async ({
    request,
  }) => {
    const response = await request.post("/api/aura/import", {
      data: {},
    });

    const status = response.status();
    // Should be 401 Unauthorized or another error code
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

test.describe("API — Billing endpoints", () => {
  test("POST /api/billing/payfast-notify returns 200", async ({ request }) => {
    const response = await request.post("/api/billing/payfast-notify", {
      data: {
        payment_status: "COMPLETE",
        m_payment_id: "test-123",
        pf_payment_id: "test-456",
        amount_gross: "100.00",
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // PayFast notify endpoint should return 200 (it ACKs the webhook)
    expect(response.status()).toBe(200);
  });
});
