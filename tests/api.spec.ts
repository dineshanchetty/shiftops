import { test, expect } from "@playwright/test";

test.describe("API — Aura endpoints", () => {
  test("POST /api/aura/test-connection responds without server error", async ({
    request,
  }) => {
    const response = await request.post("/api/aura/test-connection", {
      data: { host: "test.example.com", username: "test", password: "test" },
    });
    expect(response.status()).toBeLessThan(500);
  });

  test("POST /api/aura/parse-csv with empty body returns error", async ({
    request,
  }) => {
    const response = await request.post("/api/aura/parse-csv");
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("POST /api/aura/import without proper data returns error", async ({
    request,
  }) => {
    const response = await request.post("/api/aura/import", {
      data: {},
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("API — Billing endpoints", () => {
  test("POST /api/billing/payfast-notify responds", async ({ request }) => {
    const response = await request.post("/api/billing/payfast-notify", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: "payment_status=COMPLETE&pf_payment_id=12345&amount_gross=499.00",
    });
    expect(response.status()).toBeLessThan(500);
  });
});
