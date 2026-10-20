import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("gobook.accessToken", "vendor-e2e-token"));
  await page.route("**/api/v1/vendor/services?**", (route) => route.fulfill({ json: {
    items: [{ id: "11111111-1111-4111-8111-111111111111", title: "Workshop gốm" }],
  } }));
  await page.route("**/api/v1/vendor/bookings?**", (route) => {
    const status = new URL(route.request().url()).searchParams.get("status");
    const search = new URL(route.request().url()).searchParams.get("search");
    const data = status === "CANCELLED" || (search && search !== "GBK-DEMO") ? [] : [{
      bookingId: "22222222-2222-4222-8222-222222222222", bookingCode: "GBK-DEMO",
      status: "CONFIRMED", operationalStatus: "UPCOMING", currency: "VND",
      grossAmount: "500000", discountAmount: "60000", totalAmount: "440000",
      platformFeeAmount: "44000", vendorAmount: "396000", createdAt: "2026-10-20T00:00:00.000Z",
      itemCount: 2, totalQuantity: 2, itemsSummary: [{ serviceId: "11111111-1111-4111-8111-111111111111",
        serviceTitle: "Workshop gốm", startAt: "2026-10-21T00:00:00.000Z",
        endAt: "2026-10-21T02:00:00.000Z", quantity: 2 }],
    }];
    return route.fulfill({ json: { data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } } });
  });
  await page.route("**/api/v1/vendor/bookings/22222222-2222-4222-8222-222222222222", (route) => route.fulfill({ json: {
    bookingId: "22222222-2222-4222-8222-222222222222", bookingCode: "GBK-DEMO",
    status: "CONFIRMED", operationalStatus: "UPCOMING", createdAt: "2026-10-20T00:00:00.000Z",
    currency: "VND", grossAmount: "500000", discountAmount: "60000", netAmount: "440000",
    commissionBps: 1000, platformFeeAmount: "44000", vendorAmount: "396000", commissionCovered: true,
    payment: { status: "SUCCEEDED", amount: "440000", succeededAt: "2026-10-20T00:00:00.000Z" },
    refunds: { succeededAmount: "0", pendingAmount: "0" }, retained: { netAmount: "440000",
      projectedNetAfterPending: "440000", platformFeeAmount: "44000", vendorAmount: "396000" },
    cancellation: null,
    items: [{ id: "item-1", serviceId: "11111111-1111-4111-8111-111111111111", slotId: "slot-1",
      serviceTitle: "Workshop gốm", startAt: "2026-10-21T00:00:00.000Z",
      endAt: "2026-10-21T02:00:00.000Z", quantity: 2, grossAmount: "500000",
      discountAmount: "60000", netAmount: "440000", platformFeeAmount: "44000", vendorAmount: "396000",
      tickets: { issued: 1, checkedIn: 1, voided: 0 } }],
  } }));
  await page.route("**/api/v1/vendor/dashboard/overview?**", (route) => route.fulfill({ json: {
    period: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" },
    bookings: { total: 1, confirmed: 1, cancelled: 0, paid: 1, paidCancelled: 0, cancellationRateBps: 0 },
    financial: { paidRevenue: "440000", succeededRefunds: "0", pendingRefunds: "352000",
      netRetainedRevenue: "440000", estimatedPlatformFee: "44000", estimatedVendorEarnings: "396000",
      commissionCoveredBookingCount: 1, commissionUnknownBookingCount: 0 },
    occupancy: { confirmedQuantity: 7, activeHeldQuantity: 2, totalCapacity: 10, rateBps: 7000 },
    revenueTrend: [{ day: "2026-10-20", paidRevenue: "440000", paymentCount: 1 }],
  } }));
});

test("Vendor can filter Bookings and inspect safe detail", async ({ page }) => {
  await page.goto("/vendor/bookings");
  await expect(page.getByText("GBK-DEMO")).toBeVisible();
  await page.getByRole("tab", { name: "Đã hủy" }).click();
  await expect(page.getByText("Không có Booking nào trong bộ lọc này.")).toBeVisible();
  await page.getByRole("tab", { name: "Sắp diễn ra" }).click();
  await page.getByRole("link", { name: "Xem chi tiết" }).click();
  await expect(page.getByText("1 đã check-in", { exact: false })).toBeVisible();
  await expect(page.getByText("Doanh thu Vendor dự kiến")).toBeVisible();
  await expect(page.getByText("Đã thanh toán cho Vendor")).toHaveCount(0);
});

test("Dashboard labels paid, retained, pending, and occupancy separately", async ({ page }) => {
  await page.goto("/vendor/dashboard");
  await expect(page.getByText("Doanh thu đã thu")).toBeVisible();
  await expect(page.getByText("Doanh thu giữ lại sau hoàn tiền")).toBeVisible();
  await expect(page.getByText("Nghĩa vụ hoàn đang chờ")).toBeVisible();
  await expect(page.getByText("70.00%")).toBeVisible();
  await page.getByRole("button", { name: "7 ngày" }).click();
  await expect(page.getByText("7 ngày", { exact: false }).first()).toBeVisible();
});
