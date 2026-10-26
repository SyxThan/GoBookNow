import { test, expect } from "@playwright/test";
import { ids, service, installVisualFixtures } from "./visual/fixtures";

for (const width of [1440, 375]) {
  test(`archived service deletion preserves history messaging and returns to catalog (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    await installVisualFixtures(page);
    let deleted = false;
    await page.route(
      `**/api/v1/vendor/services/${ids.service}`,
      async (route) => {
        if (route.request().method() === "DELETE") {
          deleted = true;
          await route.fulfill({ status: 204 });
        } else {
          await route.fulfill({ json: { ...service, status: "ARCHIVED" } });
        }
      },
    );
    await page.goto(`/vendor/services/${ids.service}`);
    await page
      .getByRole("button", { name: "Xóa dịch vụ", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "Lịch sử đặt chỗ, vé và thanh toán vẫn được giữ nguyên.",
    );
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(812);
    await page.screenshot({
      path: testInfo.outputPath(`delete-dialog-${width}.png`),
    });
    await dialog
      .getByRole("button", { name: "Xác nhận xóa", exact: true })
      .click();
    await expect(page).toHaveURL(/\/vendor\/services$/);
    expect(deleted).toBe(true);
  });
}

test("published services explain why archive and delete are unavailable", async ({
  page,
}) => {
  await installVisualFixtures(page);
  await page.goto(`/vendor/services/${ids.service}`);
  await expect(
    page.getByText("Hãy ẩn dịch vụ đang mở bán trước khi lưu trữ hoặc xóa."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xóa dịch vụ", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Lưu trữ", exact: true }),
  ).toBeDisabled();
});
