import { expect, test, type Page } from "@playwright/test";

const bookingId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";

function bookingSnapshot(expiresAt: string) {
  return {
    id: bookingId,
    bookingCode: "GBK-E2E",
    status: "PENDING_PAYMENT",
    currency: "VND",
    subtotalAmount: "250000",
    totalAmount: "250000",
    expiresAt,
    items: [
      {
        id: "item-e2e",
        serviceId: "service-e2e",
        slotId: "slot-e2e",
        serviceTitle: "Workshop thanh toán E2E",
        startAt: "2099-10-03T02:00:00.000Z",
        endAt: "2099-10-03T04:00:00.000Z",
        quantity: 1,
        unitPriceAmount: "250000",
        subtotalAmount: "250000",
        pricingSource: "SERVICE",
        reservation: {
          id: "reservation-e2e",
          status: "HELD",
          expiresAt,
        },
      },
    ],
  };
}

async function seedHeldCheckout(page: Page, expiresAt: string) {
  const booking = bookingSnapshot(expiresAt);
  await page.addInitScript(
    ({ held, draft }) => {
      sessionStorage.setItem("gobook.accessToken", "e2e-customer-token");
      sessionStorage.setItem("gobook.bookingCheckout.held", JSON.stringify(held));
      sessionStorage.setItem(
        "gobook.bookingCheckout.draft",
        JSON.stringify(draft),
      );
    },
    {
      held: { serviceSlug: "workshop-e2e", booking },
      draft: {
        serviceId: "service-e2e",
        serviceSlug: "workshop-e2e",
        slotId: "slot-e2e",
        quantity: 1,
      },
    },
  );
}

async function captureExternalForm(page: Page) {
  await page.addInitScript(() => {
    (
      window as Window & {
        __submittedPaymentForm?: {
          action: string;
          method: string;
          fields: Record<string, string>;
        };
      }
    ).__submittedPaymentForm = undefined;

    HTMLFormElement.prototype.submit = function submit() {
      const fields = Object.fromEntries(
        [...this.querySelectorAll("input")].map((input) => [
          input.name,
          input.value,
        ]),
      );
      (
        window as Window & {
          __submittedPaymentForm?: {
            action: string;
            method: string;
            fields: Record<string, string>;
          };
        }
      ).__submittedPaymentForm = {
        action: this.getAttribute("action") ?? "",
        method: this.getAttribute("method") ?? "",
        fields,
      };
    };
  });
}

function initiationResponse(expiresAt: string) {
  return {
    paymentId,
    attemptId: "33333333-3333-4333-8333-333333333333",
    provider: "SEPAY",
    status: "PENDING",
    amount: "250000",
    currency: "VND",
    merchantReference: "GBKE2ECHECKOUT",
    paymentUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
    method: "POST",
    formFields: {
      merchant: "test-merchant",
      operation: "PURCHASE",
      payment_method: "BANK_TRANSFER",
      order_invoice_number: "GBKE2ECHECKOUT",
      order_amount: "250000",
      currency: "VND",
      signature: "test-signature",
    },
    expiresAt,
  };
}

test("held booking -> SePay POST boundary -> authoritative confirmation", async ({
  page,
}) => {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await seedHeldCheckout(page, expiresAt);
  await captureExternalForm(page);

  let initiationBody: unknown;
  await page.route("**/api/v1/payments/sepay", async (route) => {
    initiationBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(initiationResponse(expiresAt)),
    });
  });

  await page.goto("/bookings/checkout?service=workshop-e2e");
  await expect(page.getByText("Workshop thanh toán E2E")).toBeVisible();
  await expect(page.getByText("250.000 ₫").first()).toBeVisible();
  await expect(page.getByText(/\d{2}:\d{2}/).first()).toBeVisible();
  await page.getByRole("button", { name: "Thanh toán với SePay" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __submittedPaymentForm?: { method: string };
            }
          ).__submittedPaymentForm,
      ),
    )
    .toMatchObject({
      action: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      method: "POST",
      fields: {
        order_amount: "250000",
        signature: "test-signature",
      },
    });
  expect(initiationBody).toEqual({ bookingId });

  let statusCalls = 0;
  await page.route(`**/api/v1/payments/${paymentId}`, async (route) => {
    statusCalls += 1;
    const confirmed = statusCalls > 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: paymentId,
        status: confirmed ? "SUCCEEDED" : "PENDING",
        amount: "250000",
        currency: "VND",
        booking: {
          id: bookingId,
          status: confirmed ? "CONFIRMED" : "PENDING_PAYMENT",
        },
        expiresAt,
      }),
    });
  });

  await page.goto(`/payment/result?paymentId=${paymentId}&return=success`);
  await expect(
    page.getByRole("heading", { name: "Đang xác nhận thanh toán" }),
  ).toBeVisible();
  await expect(page.getByText("Thanh toán thành công")).toBeVisible({
    timeout: 8_000,
  });
});

test("fake success URL cannot override PENDING backend state", async ({ page }) => {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await seedHeldCheckout(page, expiresAt);
  await page.route(`**/api/v1/payments/${paymentId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: paymentId,
        status: "PENDING",
        amount: "250000",
        currency: "VND",
        booking: { id: bookingId, status: "PENDING_PAYMENT" },
        expiresAt,
      }),
    }),
  );

  await page.goto(`/payment/result?paymentId=${paymentId}&return=success`);
  await expect(
    page.getByRole("heading", { name: "Đang xác nhận thanh toán" }),
  ).toBeVisible();
  await expect(page.getByText("Thanh toán thành công")).toHaveCount(0);
});

test("retry sends the same booking and accepts backend-controlled identity", async ({
  page,
}) => {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await seedHeldCheckout(page, expiresAt);
  await captureExternalForm(page);
  const bodies: unknown[] = [];

  await page.route("**/api/v1/payments/sepay", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(initiationResponse(expiresAt)),
    });
  });

  await page.goto("/bookings/checkout?service=workshop-e2e");
  await page.getByRole("button", { name: "Thanh toán với SePay" }).click();
  await page.getByRole("button", { name: "Thử thanh toán lại" }).click();

  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies).toEqual([{ bookingId }, { bookingId }]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __submittedPaymentForm?: { fields: Record<string, string> };
            }
          ).__submittedPaymentForm?.fields.order_invoice_number,
      ),
    )
    .toBe("GBKE2ECHECKOUT");
});
