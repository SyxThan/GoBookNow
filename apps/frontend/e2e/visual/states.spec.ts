import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ids, installVisualFixtures, portalPath } from "./fixtures";

async function accessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  // Axe/reload can retain scroll. Capture sticky headers at the initial page position.
  await page.evaluate(() => window.scrollTo(0, 0));
}
async function dialogFits(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox(),
    viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.y).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width + 3).toBeLessThanOrEqual(viewport.width - 8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 12);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await accessible(page);
}

test.beforeEach(async ({ page }) => {
  await installVisualFixtures(page);
});

test("QR dialog: keyboard focus, Escape, restore and 320px fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const require = createRequire(
    resolve(process.cwd(), "../backend/package.json"),
  );
  const png = await (
    require("qrcode") as { toBuffer: (text: string) => Promise<Buffer> }
  ).toBuffer("VISUAL-ONLY-NOT-A-VALID-TICKET");
  await page.route("**/api/v1/tickets/*/qr", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.goto(`/bookings/${ids.booking}`);
  const trigger = page.getByRole("button", {
    name: "Xem mã QR GBT-VISUAL-1",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("img", { name: "Mã QR vé GBT-VISUAL-1" }),
  ).toBeVisible();
  await dialogFits(page);
  await expect(page).toHaveScreenshot("qr-dialog-320.png");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Cancellation preview: fees, scroll and explicit confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/bookings/${ids.booking}`);
  await page.getByRole("button", { name: "Hủy đặt chỗ", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("400.000 ₫", { exact: true }),
  ).toBeVisible();
  await dialogFits(page);
  await expect(page).toHaveScreenshot("cancellation-dialog-320.png");
  await page
    .getByRole("button", { name: "Xác nhận hủy", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Xác nhận hủy", exact: true }),
  ).toBeInViewport();
  await expect(page).toHaveScreenshot("cancellation-actions-320.png");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Dedicated voucher and slot forms keep actions reachable on a 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const [name, path, button] of [
    ["voucher-form-320", "/admin/vouchers/new", "Lưu ưu đãi"],
    ["slot-form-320", `/vendor/services/${ids.service}/slots/new`, "Lưu lịch"],
  ]) {
    await page.goto(portalPath(path));
    const save = page.getByRole("button", { name: button, exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const field of await page.locator("form .input").all()) {
      const bounds = await field.evaluate((element) => {
        const control = element.getBoundingClientRect();
        const container = element.closest("label")!.getBoundingClientRect();
        return {
          left: control.left,
          right: control.right,
          containerLeft: container.left,
          containerRight: container.right,
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(bounds.containerLeft - 1);
      expect(bounds.right).toBeLessThanOrEqual(bounds.containerRight + 1);
    }
    const header = page.locator(".portal-topbar");
    const brand = await header.getByRole("link").first().boundingBox();
    const logout = await header
      .getByRole("button", { name: "Đăng xuất", exact: true })
      .boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(logout!.x);
    await accessible(page);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  }
});
test("Admin application details and profile editing have accessible labels", async ({
  page,
}) => {
  await page.goto(portalPath(`/admin/vendor-applications/${ids.application}`));
  await expect(
    page.getByRole("button", { name: "Phê duyệt đối tác", exact: true }),
  ).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("admin-application-selected.png", {
    fullPage: true,
  });
  await page.goto(portalPath("/vendor/profile"));
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
  await accessible(page);
  await expect(page).toHaveScreenshot("vendor-profile-edit.png", {
    fullPage: true,
  });
});

test("Network error, empty search, pending payment and expired payment remain distinct", async ({
  page,
}) => {
  await page.route("**/api/v1/services?**", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.goto("/services");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("search-error.png", { fullPage: true });
  await page.route("**/api/v1/services?**", (route) =>
    route.fulfill({
      json: { items: [], page: 1, limit: 12, total: 0, totalPages: 0 },
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Không có dịch vụ phù hợp với bộ lọc."),
  ).toBeVisible();
  await accessible(page);
  await page.route(`**/api/v1/payments/${ids.payment}`, (route) =>
    route.fulfill({
      json: {
        id: ids.payment,
        status: "PENDING",
        amount: "500000",
        currency: "VND",
        booking: { id: ids.booking, status: "PENDING_PAYMENT" },
        expiresAt: "2099-10-25T12:10:00Z",
      },
    }),
  );
  await page.goto(`/payment/result?paymentId=${ids.payment}&return=success`);
  await expect(
    page.getByRole("heading", {
      name: "Đang xác nhận thanh toán",
      exact: true,
    }),
  ).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("payment-pending.png", {
    fullPage: true,
  });
  await page.route(`**/api/v1/payments/${ids.payment}`, (route) =>
    route.fulfill({
      json: {
        id: ids.payment,
        status: "EXPIRED",
        amount: "500000",
        currency: "VND",
        booking: { id: ids.booking, status: "EXPIRED" },
        expiresAt: "2020-01-01T00:00:00Z",
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Phiên thanh toán đã hết hạn",
      exact: true,
    }),
  ).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("payment-expired.png", {
    fullPage: true,
  });
});

test("Mobile menu traps focus and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Mở menu" });
  await trigger.click();
  await dialogFits(page);
  await expect(page).toHaveScreenshot("mobile-menu.png");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("Portal drawer supports keyboard close and navigation on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/vendor/dashboard", "/admin/transactions"]) {
    await page.goto(portalPath(path));
    const trigger = page.getByRole("button", {
      name: "Mở điều hướng",
      exact: true,
    });
    await trigger.click();
    await dialogFits(page);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole("dialog").getByRole("link").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(portalPath(path));
    const links = page.getByRole("complementary").getByRole("link");
    await page
      .getByRole("link", { name: "Bỏ qua điều hướng", exact: true })
      .focus();
    for (
      let index = 0;
      index < 10 &&
      !(await links
        .first()
        .evaluate((element) => element === document.activeElement));
      index++
    )
      await page.keyboard.press("Tab");
    await expect(links.first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(links.nth(1)).toBeFocused();
    const destination = await links.nth(1).getAttribute("href");
    const expected = new URL(destination!, page.url()).href;
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(expected);
    await accessible(page);
    await page.setViewportSize({ width: 375, height: 812 });
  }
});

test("Backend role response prevents protected Admin content from mounting", async ({
  page,
}) => {
  let operationalRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/v1/admin/"))
      operationalRequests++;
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: { id: ids.user, roles: ["CUSTOMER"], profile: null },
    }),
  );
  await page.goto(portalPath("/admin/transactions"));
  await expect(
    page.getByRole("heading", { name: "Bạn chưa có quyền truy cập" }),
  ).toBeVisible();
  expect(operationalRequests).toBe(0);
  await accessible(page);
  await expect(page).toHaveScreenshot("admin-permission-denied.png", {
    fullPage: true,
  });
});

test("Vendor resource error can retry into an honest empty state", async ({
  page,
}) => {
  await page.route("**/api/v1/vendor/services?**", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Service temporarily unavailable." },
    }),
  );
  await page.goto(portalPath("/vendor/services"));
  await expect(
    page.getByRole("heading", { name: "Chưa thể mở nội dung này" }),
  ).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("vendor-resource-error.png", {
    fullPage: true,
  });
  await page.route("**/api/v1/vendor/services?**", (route) =>
    route.fulfill({
      json: { items: [], page: 1, total: 0, totalPages: 0, limit: 12 },
    }),
  );
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dành chỗ cho trải nghiệm đầu tiên" }),
  ).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("vendor-resource-empty.png", {
    fullPage: true,
  });
});
