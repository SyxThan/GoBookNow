import { test, expect } from "@playwright/test";
import { installVisualFixtures } from "./visual/fixtures";

test("operator logout failure keeps the session and successful retry updates shared navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/vendor/profile", "/vendor/application"]) {
    await installVisualFixtures(page);
    await page.route("**/api/v1/auth/logout", (route) =>
      route.fulfill({ status: 503, json: { message: "Unavailable" } }),
    );
    await page.goto(path);
    const token = await page.evaluate(() =>
      sessionStorage.getItem("gobook.accessToken"),
    );
    await page
      .locator("main")
      .getByRole("button", { name: "Đăng xuất", exact: true })
      .click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Chưa thể đăng xuất.");
    expect(
      await page.evaluate(() => !!sessionStorage.getItem("gobook.accessToken")),
    ).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem("gobook.bookingCheckout.held"))).not.toBeNull();
    await page.route("**/api/v1/auth/logout", (route) =>
      route.fulfill({ status: 204 }),
    );
    await page
      .locator("main")
      .getByRole("button", { name: "Đăng xuất", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("gobook.accessToken")),
      )
      .toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("gobook.bookingCheckout.held"))).toBeNull();
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Đăng ký khách hàng", exact: true }),
    ).toBeVisible();
    await page.route("**/api/v1/auth/login", (route) =>
      route.fulfill({ json: { accessToken: token } }),
    );
    await page
      .locator("main")
      .getByLabel("Email", { exact: true })
      .fill("operator@example.test");
    await page
      .locator("main")
      .getByLabel("Mật khẩu", { exact: true })
      .fill("E2e-Operator-Only-2026");
    await page
      .locator("main")
      .getByRole("button", { name: /^(Đăng nhập|Tiếp tục)$/ })
      .click();
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Tài khoản của bạn", exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
