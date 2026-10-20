import { expect, test } from "@playwright/test";

const paymentId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const transaction = { id: paymentId, bookingId, bookingCode: "GBK-ADMIN-E2E", bookingStatus: "CONFIRMED",
  customerId: "customer-a", customerEmail: "customer@example.com", vendor: { id: "vendor-a", displayName: "Test Vendor" },
  status: "SUCCEEDED", amount: "100000", currency: "VND", createdAt: "2026-10-20T00:00:00.000Z",
  succeededAt: "2026-10-20T00:05:00.000Z", latestAttempt: { id: "attempt-a", provider: "SEPAY",
    status: "SUCCEEDED", merchantReference: "MERCHANT-E2E", createdAt: "2026-10-20T00:01:00.000Z" },
  attemptCount: 1, refund: { state: "PARTIAL", succeededAmount: "25000", pendingAmount: "10000" } };

test("Admin filters Payment list and inspects Attempts, Refunds and timeline", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("gobook.accessToken", "admin-e2e-token"));
  await page.route("**/api/v1/admin/transactions/summary?**", (route) => route.fulfill({ json: {
    total: 1, byStatus: { PENDING: { count: 0, amount: "0" }, SUCCEEDED: { count: 1, amount: "100000" },
      EXPIRED: { count: 0, amount: "0" }, CANCELLED: { count: 0, amount: "0" } },
    refunds: { PENDING: { count: 1, amount: "10000" }, SUCCEEDED: { count: 1, amount: "25000" } },
  } }));
  await page.route("**/api/v1/admin/transactions?**", (route) => {
    const search = new URL(route.request().url()).searchParams.get("bookingCode");
    const data = search && search !== "GBK-ADMIN-E2E" ? [] : [transaction];
    return route.fulfill({ json: { data, total: data.length, page: 1, limit: 20, totalPages: data.length } });
  });
  await page.route(`**/api/v1/admin/transactions/${paymentId}`, (route) => route.fulfill({ json: {
    id: paymentId, bookingId, booking: { bookingCode: transaction.bookingCode, status: "CONFIRMED",
      customerId: transaction.customerId, customer: { email: transaction.customerEmail }, vendor: transaction.vendor },
    status: "SUCCEEDED", amount: "100000", currency: "VND", createdAt: transaction.createdAt,
    updatedAt: transaction.succeededAt, succeededAt: transaction.succeededAt,
    expiredAt: null, cancelledAt: null, refund: transaction.refund,
    attempts: [{ id: "attempt-a", provider: "SEPAY", status: "SUCCEEDED", amount: "100000", currency: "VND",
      merchantReference: "MERCHANT-E2E", providerTransactionId: "BANK-E2E", failureCode: null,
      createdAt: transaction.createdAt, succeededAt: transaction.succeededAt,
      failedAt: null, cancelledAt: null, expiresAt: null }],
    refunds: [{ id: "refund-a", status: "SUCCEEDED", kind: "PARTIAL", reason: "MANUAL_ADJUSTMENT",
      reasonNote: null, amount: "25000", currency: "VND", requestedAt: transaction.createdAt,
      succeededAt: transaction.succeededAt, cancelledAt: null }],
    timeline: [{ at: transaction.createdAt, type: "PAYMENT_CREATED", reference: paymentId }],
  } }));
  await page.goto("/admin/transactions");
  await expect(page.getByText("GBK-ADMIN-E2E")).toBeVisible();
  await page.getByRole("textbox", { name: "Mã Booking" }).fill("wrong");
  await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
  await expect(page.getByText("Không có giao dịch phù hợp.")).toBeVisible();
  await page.getByRole("textbox", { name: "Mã Booking" }).fill("GBK-ADMIN-E2E");
  await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
  await page.getByRole("link", { name: /11111111/ }).click();
  await expect(page.getByRole("heading", { name: "Attempts (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Refunds (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
});

test("Customer can create a verified Booking Review from Booking detail", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("gobook.accessToken", "customer-e2e-token"));
  let reviewId: string | null = null;
  await page.route(`**/api/v1/bookings/${bookingId}/tickets`, (route) => route.fulfill({ json: {
    bookingId, bookingCode: "GBK-REVIEW-E2E", bookingStatus: "CONFIRMED", tickets: [],
    cancellation: null,
  } }));
  await page.route(`**/api/v1/bookings/${bookingId}/review/eligibility`, (route) => route.fulfill({ json: {
    eligible: reviewId === null, reason: reviewId === null ? "ELIGIBLE" : "REVIEW_ALREADY_EXISTS",
    reviewId, reviewDeleted: false,
  } }));
  await page.route(`**/api/v1/bookings/${bookingId}/review`, (route) => {
    if (route.request().method() === "POST") { reviewId = "review-e2e";
      return route.fulfill({ status: 201, json: { id: reviewId, bookingId, rating: 5, comment: "Rất tốt",
        createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" } }); }
    return route.fulfill({ json: { id: reviewId, bookingId, rating: 5, comment: "Rất tốt",
      createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" } });
  });
  await page.goto(`/bookings/${bookingId}`);
  await page.getByRole("button", { name: "Đánh giá trải nghiệm" }).click();
  await page.getByRole("textbox", { name: /Nhận xét/ }).fill("Rất tốt");
  await page.getByRole("button", { name: "Lưu đánh giá" }).click();
  await expect(page.getByText("Đã lưu đánh giá.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Chỉnh sửa đánh giá" })).toBeVisible();
});
