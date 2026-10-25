import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ids, installVisualFixtures, routes } from "./fixtures";

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

test("Voucher and slot editors keep all actions reachable on small phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/admin/vouchers");
  await page.getByRole("button", { name: "+ Tạo ưu đãi" }).click();
  await dialogFits(page);
  await page
    .getByRole("button", { name: "Lưu ưu đãi" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Lưu ưu đãi" }),
  ).toBeInViewport();
  await expect(page).toHaveScreenshot("voucher-dialog-320.png");
  await page.keyboard.press("Escape");
  await page.goto(`/vendor/services/${ids.service}/slots`);
  await page.getByRole("button", { name: "+ Thêm lịch", exact: true }).click();
  await dialogFits(page);
  await page.getByRole("button", { name: "Lưu lịch" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Lưu lịch" })).toBeInViewport();
  await expect(page).toHaveScreenshot("slot-dialog-320.png");
});

test("Admin selected application and profile edit have accessible form labels", async ({
  page,
}) => {
  await page.goto("/admin/vendor-applications");
  await page.getByRole("button", { name: /Xưởng Gốm Mùa Nắng/ }).click();
  await expect(
    page.getByRole("button", { name: "Phê duyệt đối tác" }),
  ).toBeVisible();
  await accessible(page);
  await expect(page).toHaveScreenshot("admin-application-selected.png", {
    fullPage: true,
  });
  await page.goto("/vendor/profile");
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
  await expect(page.getByRole("alert")).toBeVisible();
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

test("Tablet and laptop route matrix contains content and hard shadows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const [name, path] of routes) {
      await page.goto(path);
      await page.locator("main h1").waitFor();
      await page.waitForTimeout(120);
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        panels: Array.from(document.querySelectorAll("main .panel")).map(
          (element) => ({
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
          }),
        ),
      }));
      expect(overflow.scroll, `${name} at ${width}px`).toBeLessThanOrEqual(
        overflow.width + 1,
      );
      for (const panel of overflow.panels.filter((panel) => panel.right > 0)) {
        expect(panel.left, `${name}: left edge`).toBeGreaterThanOrEqual(3);
        expect(panel.right + 3, `${name}: hard shadow`).toBeLessThanOrEqual(
          overflow.width,
        );
      }
    }
  }
});
