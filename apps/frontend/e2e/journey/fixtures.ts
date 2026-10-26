import { test as base, expect } from "@playwright/test";
import { createBrowserHarness } from "../../../backend/dist-browser/test/browser/harness.js";

type Harness = Awaited<ReturnType<typeof createBrowserHarness>>;
type Catalog = Awaited<ReturnType<Harness["catalog"]>>;
type ProviderCapture = {
  posts: number;
  invoice?: string;
  amount?: string;
  currency?: string;
};
export const test = base.extend<
  { catalog: Catalog; provider: ProviderCapture },
  { domain: Harness }
>({
  provider: async ({}, provide) => {
    await provide({ posts: 0 });
  },
  domain: [
    async ({}, provide) => {
      const domain = await createBrowserHarness();
      try {
        await provide(domain);
      } finally {
        await domain.cleanup();
        await domain.close();
      }
    },
    { scope: "worker" },
  ],
  catalog: async ({ domain }, provide) => {
    await domain.reset();
    // Reset before the next test, after Playwright has disposed the previous
    // page/context. Truncating while Next prefetch requests are still active can
    // deadlock with their foreign-key reads. Worker teardown handles the last
    // cleanup after every browser fixture has closed.
    await provide(await domain.catalog());
  },
  page: async ({ page, context, provider }, provide, testInfo) => {
    const frontendErrors: string[] = [];
    const diagnostics: string[] = [];
    // Keep only classifications and paths: never messages, headers, query strings,
    // request bodies, access tokens or signed forms in our diagnostic attachment.
    page.on("pageerror", () =>
      frontendErrors.push("Uncaught frontend exception"),
    );
    page.on("console", (message) => {
      if (message.type() === "error") {
        diagnostics.push("Browser console error");
        frontendErrors.push("Unexpected browser console error");
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        diagnostics.push(
          `HTTP ${response.status()} ${new URL(response.url()).pathname}`,
        );
      }
    });
    page.on("requestfailed", (request) => {
      diagnostics.push(
        `Request failed ${request.method()} ${new URL(request.url()).pathname}`,
      );
    });
    const allowed = new Set([
      process.env.E2E_BASE_URL!,
      process.env.BACKEND_BASE_URL!,
      process.env.VENDOR_E2E_BASE_URL!,
      process.env.ADMIN_E2E_BASE_URL!,
    ]);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (allowed.has(url.origin)) return route.continue();
      if (url.origin === "https://pay-sandbox.sepay.vn") {
        const request = route.request();
        const fields = new URLSearchParams(request.postData() ?? "");
        // A real hosted POST was submitted. Reflect only a local callback link;
        // never export signed fields or forward anything to the provider.
        expect(request.method()).toBe("POST");
        const callback = new URL(fields.get("success_url") ?? "");
        expect(callback.origin).toBe(process.env.E2E_BASE_URL);
        expect(callback.pathname).toBe("/payment/result");
        expect(fields.get("order_invoice_number")).toBeTruthy();
        provider.posts += 1;
        provider.invoice = fields.get("order_invoice_number") ?? undefined;
        provider.amount = fields.get("order_amount") ?? undefined;
        provider.currency = fields.get("currency") ?? undefined;
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="vi"><meta charset="utf-8"><h1>Controlled checkout</h1><a href="${callback.href.replaceAll("&", "&amp;")}">Quay lại GoBook</a></html>`,
        });
        return;
      }
      diagnostics.push(`Blocked external request ${url.hostname}`);
      frontendErrors.push("Unexpected external request");
      await route.abort("blockedbyclient");
    });
    await provide(page);
    await testInfo.attach("sanitized-browser-diagnostics", {
      body:
        diagnostics.concat(frontendErrors).join("\n") ||
        "No browser/network errors",
      contentType: "text/plain",
    });
    expect(
      frontendErrors,
      "No uncaught frontend exceptions or unexpected external calls",
    ).toEqual([]);
  },
});
export { expect };
