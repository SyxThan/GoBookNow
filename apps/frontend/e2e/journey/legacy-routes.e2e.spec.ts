import { test, expect } from "./fixtures";
test("Legacy URLs preserve resource IDs and list filters without transferring credentials", async ({
  request,
  page,
  catalog,
}) => {
  const id = catalog.id;
  for (const [oldPath, origin, newPath] of [
    [
      `/vendor/services/${id}/slots`,
      process.env.VENDOR_E2E_BASE_URL!,
      `/services/${id}/slots`,
    ],
    [
      `/vendor/bookings/${id}`,
      process.env.VENDOR_E2E_BASE_URL!,
      `/bookings/${id}`,
    ],
    [
      "/vendor/application",
      process.env.VENDOR_E2E_BASE_URL!,
      "/onboarding/application",
    ],
    [
      `/admin/transactions/${id}`,
      process.env.ADMIN_E2E_BASE_URL!,
      `/transactions/${id}`,
    ],
    ["/vendor", process.env.VENDOR_E2E_BASE_URL!, "/dashboard"],
    ["/admin", process.env.ADMIN_E2E_BASE_URL!, "/vendor-applications"],
  ]) {
    const response = await request.get(
      `${process.env.E2E_BASE_URL}${oldPath}?page=2&status=PENDING&accessToken=must-not-transfer&next=https://untrusted.invalid`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(
      `${origin}${newPath}?page=2&status=PENDING`,
    );
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  const unknown = await request.get(
    `${process.env.E2E_BASE_URL}/vendor/unknown-resource`,
    { maxRedirects: 0 },
  );
  expect(unknown.status()).toBe(404);
  expect(unknown.headers().location).toBeUndefined();
  await page.goto("/");
  await expect(
    page
      .locator('a[href="' + process.env.VENDOR_E2E_BASE_URL + '/start"]')
      .first(),
  ).toBeAttached();
  await expect(
    page.locator('nav[aria-label="Điều hướng chính"]'),
  ).not.toContainText("Quản trị");
});
