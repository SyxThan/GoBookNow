import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function review(page: Page, name: string) {
  if (process.env.E2E_REVIEW_SCREENSHOTS === "1") {
    await page.screenshot({
      path: test.info().outputPath(`review-${name}.png`),
      fullPage: true,
    });
  }
}

async function registerAndLogin(page: Page) {
  const email = `e2e-${randomUUID()}@example.invalid`;
  const password = "E2e-Customer-Password-2026";
  await page.goto("/");
  await page
    .getByRole("link", { name: "Đăng ký khách hàng", exact: true })
    .click();
  await page.getByLabel("Họ và tên", { exact: true }).fill("E2E Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await review(page, "register");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Đăng ký thành công" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await review(page, "login");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/services$/);
  return email;
}

async function selectAndHold(page: Page, title: string, voucherCode?: string) {
  await page.getByRole("searchbox").fill(title);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("radio").click();
  await expect(page.getByRole("radio")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Tăng số lượng" }).click();
  await expect(page.getByLabel("Số lượng", { exact: true })).toHaveValue("2");
  await review(page, "service");
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  if (voucherCode) {
    await page.getByLabel("Mã voucher", { exact: true }).fill(voucherCode);
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await expect(
      page.getByText(`Voucher ${voucherCode}`, { exact: true }),
    ).toBeVisible();
  }
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/bookings/hold") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Giữ chỗ", exact: true }).click();
  const held = await response;
  expect(held.status()).toBe(201);
  const { id } = (await held.json()) as { id: string };
  await expect(
    page.getByRole("heading", {
      name: "Booking của bạn đang được giữ tạm thời.",
    }),
  ).toBeVisible();
  await review(page, "hold");
  return id;
}

async function initiateAndReturn(page: Page) {
  await page
    .getByRole("button", { name: "Thanh toán với SePay", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Controlled checkout" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Quay lại GoBook" }).click();
  await expect(page).toHaveURL(/\/payment\/result\?paymentId=/);
}

function vnd(value: string) {
  return BigInt(value.replace(/[^0-9]/g, ""));
}
function seconds(value: string) {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}

test("Customer can register, login, book and pay, then view issued QR tickets", async ({
  page,
  domain,
  catalog,
  provider,
}) => {
  const email =
    await test.step("Register and login through real Customer UI", () =>
      registerAndLogin(page));
  const customer = await domain.prisma.user.findUniqueOrThrow({
    where: { email },
    include: { userRoles: { include: { role: true } }, profile: true },
  });
  expect(customer.status).toBe("ACTIVE");
  expect(customer.userRoles.map((r) => r.role.code)).toEqual(["CUSTOMER"]);
  expect(customer.profile?.fullName).toBe("E2E Customer");

  const id =
    await test.step("Search, select Slot, quantity two and create hold", () =>
      selectAndHold(page, catalog.title));
  const held = await domain.loadBooking(id);
  expect(held.customerId).toBe(customer.id);
  expect(held.status).toBe("PENDING_PAYMENT");
  expect(held.items).toHaveLength(1);
  const item = held.items[0];
  expect(item.quantity).toBe(2);
  expect(item.unitPriceAmount).toBe(275_000n);
  expect(item.subtotalAmount).toBe(item.unitPriceAmount * 2n);
  expect(item.reservation?.status).toBe("HELD");
  expect(item.reservation?.quantity).toBe(2);
  expect(held.totalAmount).toBe(550_000n);
  expect(held.subtotalAmount - held.voucherDiscountAmount).toBe(
    held.totalAmount,
  );
  expect(
    held.items.reduce(
      (total, row) => total + row.subtotalAmount - row.voucherDiscountAmount,
      0n,
    ),
  ).toBe(held.totalAmount);
  expect(held.platformFeeAmount! + held.vendorAmount!).toBe(held.totalAmount);
  expect(held.currency).toBe("VND");
  expect(await domain.available(catalog.slot.id)).toBe(3);
  expect(
    (
      await domain.prisma.slot.findUniqueOrThrow({
        where: { id: catalog.slot.id },
      })
    ).capacity,
  ).toBe(5);
  await expect(page.getByText(held.bookingCode, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Số lượng", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("2");
  const displayedTime = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  await expect(
    page.getByText(
      `${displayedTime.format(catalog.slot.startAt)} – ${displayedTime.format(catalog.slot.endAt)}`,
      { exact: true },
    ),
  ).toBeVisible();
  const total = page
    .getByText("Tổng chính thức", { exact: true })
    .locator("..")
    .locator("dd");
  expect(vnd(await total.innerText())).toBe(held.totalAmount);
  await expect(total).toContainText("₫");
  const countdown = page.getByLabel(/^Thời gian giữ chỗ còn lại/);
  await expect(countdown).toBeVisible();
  const remaining = seconds(await countdown.innerText());
  expect(
    Math.abs(remaining - (held.expiresAt!.getTime() - Date.now()) / 1000),
  ).toBeLessThan(5);
  await expect
    .poll(async () => seconds(await countdown.innerText()))
    .toBeLessThan(remaining);
  const beforeReload = seconds(await countdown.innerText());
  await page.reload();
  await expect(countdown).toBeVisible();
  expect(seconds(await countdown.innerText())).toBeLessThanOrEqual(
    beforeReload,
  );

  // Changing live price does not reprice the persisted hold or Payment.
  await domain.prisma.slot.update({
    where: { id: catalog.slot.id },
    data: { priceAmount: 999_000n },
  });
  await test.step("Submit real hosted checkout form; intercept only provider", () =>
    initiateAndReturn(page));
  const pending = await domain.loadBooking(id);
  expect(pending.payment?.amount).toBe(held.totalAmount);
  expect(pending.payment?.currency).toBe("VND");
  expect(pending.payment?.status).toBe("PENDING");
  expect(pending.payment?.attempts).toHaveLength(1);
  expect(pending.payment?.attempts[0].status).toBe("PENDING");
  expect(pending.payment?.attempts[0].amount).toBe(held.totalAmount);
  expect(provider).toEqual({
    posts: 1,
    invoice: pending.payment!.attempts[0].merchantReference,
    amount: held.totalAmount.toString(),
    currency: "VND",
  });
  await test.step("Deliver authenticated synthetic IPN to real webhook", () =>
    domain.success(id));
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toBeVisible();
  const paid = await domain.loadBooking(id);
  expect(paid.payment?.status).toBe("SUCCEEDED");
  expect(paid.payment?.attempts[0]?.status).toBe("SUCCEEDED");
  expect(paid.status).toBe("CONFIRMED");
  expect(paid.items[0].reservation?.status).toBe("CONFIRMED");
  expect(await domain.available(catalog.slot.id)).toBe(3);
  await review(page, "payment-result");
  const ticketRows = () =>
    domain.prisma.ticket.findMany({
      where: { bookingItem: { bookingId: id } },
      orderBy: { sequenceNo: "asc" },
      select: {
        id: true,
        ticketCode: true,
        status: true,
        sequenceNo: true,
        issuedAt: true,
        tokenVersion: true,
      },
    });
  const tickets = await ticketRows();
  expect(tickets).toHaveLength(2);
  expect(tickets.map((t) => t.status)).toEqual(["ISSUED", "ISSUED"]);
  await domain.success(id, paid.payment!.attempts[0].providerTransactionId!);
  expect(await ticketRows()).toEqual(tickets);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(paid.payment!.id, { exact: true })).toBeVisible();
  await expect(page.getByText("550.000 ₫", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Xem vé điện tử" }).click();
  await expect(
    page.getByRole("heading", { name: "Vé điện tử của bạn" }),
  ).toBeVisible();
  await expect(
    page.getByText(`Booking ${held.bookingCode}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Xem mã QR/ })).toHaveCount(2);
  async function viewQr() {
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes(`/tickets/${tickets[0].id}/qr`),
    );
    await page
      .getByRole("button", {
        name: `Xem mã QR ${tickets[0].ticketCode}`,
        exact: true,
      })
      .click();
    const qr = await response;
    expect(qr.status()).toBe(200);
    expect(qr.headers()["content-type"]).toContain("image/png");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(tickets[0].ticketCode, { exact: true }),
    ).toBeVisible();
    const image = dialog.getByRole("img", {
      name: `Mã QR vé ${tickets[0].ticketCode}`,
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(image).toHaveAttribute("src", /^blob:/);
    // Inspect the actual authenticated Blob consumed by the UI. Chromium's
    // network inspector can omit binary response bodies after cross-origin fetch.
    const magic = await image.evaluate(async (img: HTMLImageElement) => {
      const response = await fetch(img.src);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return Array.from(bytes.subarray(0, 8));
    });
    expect(magic).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await review(page, "qr");
    expect(new URL(page.url()).search).not.toMatch(/token|nonce|signature/i);
    await page.getByRole("button", { name: "Đóng mã QR", exact: true }).click();
  }
  await test.step("Open authenticated Blob QR and reload without issuing more tickets", async () => {
    await viewQr();
    await page.reload();
    await viewQr();
    expect(await ticketRows()).toEqual(tickets);
    expect(await domain.prisma.paymentAttempt.count()).toBe(1);
    expect(await domain.prisma.booking.count()).toBe(1);
  });
});

test("Pending payment survives forged returns and refresh, then delayed IPN updates UI", async ({
  page,
  domain,
  catalog,
}) => {
  await registerAndLogin(page);
  const voucher = await domain.voucher();
  const id = await selectAndHold(page, catalog.title, voucher.code);
  await initiateAndReturn(page); // Real success-like provider return, no IPN yet.
  await expect(
    page.getByRole("heading", {
      name: "Đang xác nhận thanh toán",
      exact: true,
    }),
  ).toBeVisible();
  const pending = await domain.loadBooking(id);
  expect(pending.subtotalAmount).toBe(550_000n);
  expect(pending.voucherDiscountAmount).toBe(10_000n);
  expect(pending.totalAmount).toBe(540_000n);
  expect(pending.payment?.amount).toBe(pending.totalAmount);
  expect(pending.voucherClaim?.status).toBe("RESERVED");
  const paymentId = pending.payment!.id;
  for (const hint of ["success", "error", "cancel"]) {
    await page.goto(`/payment/result?paymentId=${paymentId}&return=${hint}`);
    await expect(
      page.getByRole("heading", {
        name: "Đang xác nhận thanh toán",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Đang xác nhận thanh toán",
        exact: true,
      }),
    ).toBeVisible();
    const stillPending = await domain.loadBooking(id);
    expect(stillPending.status).toBe("PENDING_PAYMENT");
    expect(stillPending.payment?.status).toBe("PENDING");
    expect(stillPending.payment?.id).toBe(paymentId);
    await expect(
      page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
    ).toHaveCount(0);
    expect(await domain.prisma.ticket.count()).toBe(0);
    expect(await domain.prisma.payment.count()).toBe(1);
    expect(await domain.prisma.paymentAttempt.count()).toBe(1);
  }
  expect((await domain.loadBooking(id)).items[0].reservation?.status).toBe(
    "HELD",
  );
  await domain.success(id);
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toBeVisible();
  expect(await domain.prisma.ticket.count()).toBe(2);
  expect((await domain.loadBooking(id)).voucherClaim?.status).toBe("REDEEMED");
});

test("Expired hold releases capacity; late payment keeps booking expired with pending refund", async ({
  page,
  domain,
  catalog,
}) => {
  await registerAndLogin(page);
  const id = await selectAndHold(page, catalog.title);
  const held = await domain.loadBooking(id);
  await initiateAndReturn(page);
  const { once, twice } = await domain.expire(id);
  expect(once.status).toBe("EXPIRED");
  expect(once.items[0].reservation?.status).toBe("EXPIRED");
  expect(twice).toEqual(once);
  expect(await domain.available(catalog.slot.id)).toBe(5);
  expect(await domain.prisma.ticket.count()).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Phiên thanh toán đã hết hạn" }),
  ).toBeVisible();
  // Advance only the browser clock past its real original expiresAt; no session
  // snapshot or domain status is fabricated. The real expiration already ran.
  await page.clock.setFixedTime(new Date(held.expiresAt!.getTime() + 1000));
  await page.goto(`/bookings/checkout?service=${catalog.slug}`);
  await expect(
    page.getByRole("heading", { name: "Thời gian giữ chỗ đã hết." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Thanh toán không còn khả dụng" }),
  ).toBeDisabled();
  const payment = once.payment!;
  await domain.success(id);
  await domain.success(
    id,
    (await domain.loadBooking(id)).payment!.attempts[0].providerTransactionId!,
  );
  await page.goto(`/payment/result?paymentId=${payment.id}&return=success`);
  await expect(
    page.getByRole("heading", { name: "Đặt chỗ chưa thể xác nhận" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Khoản tiền đang chờ xử lý hoàn tiền/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công" }),
  ).toHaveCount(0);
  const late = await domain.loadBooking(id);
  expect(late.status).toBe("EXPIRED");
  expect(late.payment?.status).toBe("SUCCEEDED");
  expect(late.items[0].reservation?.status).toBe("EXPIRED");
  expect(await domain.prisma.ticket.count()).toBe(0);
  expect(await domain.available(catalog.slot.id)).toBe(5);
  const refunds = await domain.prisma.refund.findMany({
    where: { paymentId: payment.id },
  });
  expect(refunds).toHaveLength(1);
  expect(refunds[0].status).toBe("PENDING");
  expect(refunds[0].amount).toBe(held.totalAmount);
  expect(
    await domain.prisma.paymentReconciliation.count({
      where: { paymentId: payment.id },
    }),
  ).toBe(1);
});
