import { test, expect } from "@playwright/test";

// Read-only staging smoke: no credentials, fixture writes, DB access, IPN or cleanup.
test("Customer discovery and registration pages are available", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Đăng ký khách hàng" }),
  ).toBeVisible();
  await page.goto("/services");
  await expect(
    page.getByRole("heading", {
      name: "Tìm đúng trải nghiệm cho lịch trình của bạn.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();
});
