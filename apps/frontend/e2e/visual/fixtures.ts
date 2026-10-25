import type { Page } from "@playwright/test";

// Synthetic contracts for visual/a11y tests only. Financial integration tests use
// the real Nest application and an isolated PostgreSQL database instead.
export const ids = {
  service: "11111111-1111-4111-8111-111111111111",
  booking: "22222222-2222-4222-8222-222222222222",
  payment: "33333333-3333-4333-8333-333333333333",
  slot: "44444444-4444-4444-8444-444444444444",
  vendor: "55555555-5555-4555-8555-555555555555",
  category: "66666666-6666-4666-8666-666666666666",
  user: "77777777-7777-4777-8777-777777777777",
  application: "88888888-8888-4888-8888-888888888888",
};
const date = "2099-10-26T03:00:00.000Z",
  end = "2099-10-26T05:00:00.000Z";
export const category = {
  id: ids.category,
  code: "WORKSHOP",
  name: "Workshop sáng tạo",
  slug: "workshop",
  scope: "EVENT",
  description: "Trải nghiệm thực hành",
  icon: null,
  isActive: true,
  sortOrder: 0,
};
const owner = {
  id: ids.user,
  email: "visual@example.test",
  profile: { fullName: "Nguyễn Ánh Dương" },
};
export const vendor = {
  id: ids.vendor,
  displayName: "Xưởng Gốm Mùa Nắng",
  slug: "xuong-gom-mua-nang",
  description: "Không gian sáng tạo và kết nối.",
  logoUrl: null,
  legalName: "Xưởng Gốm Mùa Nắng",
  vendorType: "HOUSEHOLD_BUSINESS",
  taxCode: "0123456789",
  businessRegistrationNumber: "TEST-001",
  legalRepresentativeName: "Nguyễn Ánh Dương",
  contactEmail: "visual@example.test",
  contactPhone: "0900000000",
  addressLine: "123 Đường Sáng Tạo",
  ward: "Phường Bến Thành",
  district: "Quận 1",
  province: "TP. Hồ Chí Minh",
  countryCode: "VN",
  status: "APPROVED",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  owner,
};
export const service = {
  id: ids.service,
  title: "Một buổi làm gốm, một chút bình yên",
  slug: "buoi-lam-gom",
  kind: "EVENT",
  categoryId: ids.category,
  category,
  vendor,
  summary:
    "Chạm tay vào đất, tự tạo một món đồ nhỏ và dành thời gian cho chính mình.",
  description:
    "Bạn sẽ được hướng dẫn từng bước, từ làm quen với đất đến tạo hình. Nguyên liệu và dụng cụ đã được chuẩn bị.\nMang theo sự tò mò; mọi trình độ đều được chào đón.",
  thumbnailUrl: null,
  priceAmount: "275000",
  currency: "VND",
  durationMinutes: 120,
  status: "PUBLISHED",
  images: [],
};
export const slot = {
  id: ids.slot,
  startAt: date,
  endAt: end,
  capacity: 12,
  status: "OPEN",
  priceAmount: null,
  price: { amount: "275000", currency: "VND", source: "SERVICE" },
  effectivePrice: { amount: "275000", currency: "VND", source: "SERVICE" },
};
export const hold = {
  id: ids.booking,
  bookingCode: "GBK-VISUAL",
  status: "PENDING_PAYMENT",
  currency: "VND",
  subtotalAmount: "550000",
  voucherDiscountAmount: "50000",
  voucherCode: "NGAYVUI",
  totalAmount: "500000",
  expiresAt: "2099-10-25T12:10:00Z",
  items: [
    {
      id: "item-visual",
      serviceId: ids.service,
      slotId: ids.slot,
      serviceTitle: service.title,
      startAt: date,
      endAt: end,
      quantity: 2,
      unitPriceAmount: "275000",
      subtotalAmount: "550000",
      voucherDiscountAmount: "50000",
      netAmount: "500000",
      pricingSource: "SERVICE",
      reservation: {
        id: "reservation-visual",
        status: "HELD",
        expiresAt: "2099-10-25T12:10:00Z",
      },
    },
  ],
};
export const ticketList = {
  bookingId: ids.booking,
  bookingCode: "GBK-VISUAL",
  bookingStatus: "CONFIRMED",
  cancellation: null,
  tickets: [1, 2].map((n) => ({
    id: `ticket-${n}`,
    ticketCode: `GBT-VISUAL-${n}`,
    sequenceNo: n,
    status: "ISSUED",
    issuedAt: "2026-10-26T03:00:00Z",
    checkedInAt: null,
    bookingItem: {
      serviceTitle: service.title,
      slotStartAt: date,
      slotEndAt: end,
      quantity: 2,
    },
  })),
};
export const application = {
  id: ids.application,
  applicationId: ids.application,
  vendorId: ids.vendor,
  status: "PENDING",
  submittedAt: "2026-10-25T03:00:00Z",
  reviewedAt: null,
  reviewNote: null,
  reviewedByUserId: null,
  reviewer: null,
  vendor: { ...vendor, status: "PENDING" },
  documents: [
    {
      id: "document-visual",
      documentType: "BUSINESS_REGISTRATION",
      originalName: "giay-dang-ky.pdf",
      fileUrl: "",
      mimeType: "application/pdf",
      fileSize: 204800,
      uploadedAt: "2026-10-25T03:00:00Z",
    },
  ],
  history: [
    {
      id: "history-visual",
      fromStatus: null,
      toStatus: "PENDING",
      note: null,
      createdAt: "2026-10-25T03:00:00Z",
    },
  ],
};
export const transaction = {
  id: ids.payment,
  bookingId: ids.booking,
  bookingCode: "GBK-VISUAL",
  bookingStatus: "CONFIRMED",
  customerId: ids.user,
  customerEmail: owner.email,
  vendor,
  status: "SUCCEEDED",
  amount: "500000",
  currency: "VND",
  createdAt: "2026-10-25T03:00:00Z",
  succeededAt: "2026-10-25T03:01:00Z",
  latestAttempt: {
    id: "attempt-visual",
    provider: "SEPAY",
    status: "SUCCEEDED",
    merchantReference: "VISUAL-REFERENCE",
    createdAt: "2026-10-25T03:00:00Z",
  },
  attemptCount: 1,
  refund: { state: "PARTIAL", succeededAmount: "50000", pendingAmount: "0" },
};
export const vendorBooking = {
  bookingId: ids.booking,
  bookingCode: "GBK-VISUAL",
  status: "CONFIRMED",
  operationalStatus: "UPCOMING",
  currency: "VND",
  grossAmount: "550000",
  discountAmount: "50000",
  totalAmount: "500000",
  netAmount: "500000",
  platformFeeAmount: "50000",
  vendorAmount: "450000",
  createdAt: "2026-10-25T03:00:00Z",
  itemCount: 1,
  totalQuantity: 2,
  itemsSummary: [
    {
      serviceId: ids.service,
      serviceTitle: service.title,
      startAt: date,
      endAt: end,
      quantity: 2,
    },
  ],
  commissionBps: 1000,
  commissionCovered: true,
  payment: {
    status: "SUCCEEDED",
    amount: "500000",
    succeededAt: "2026-10-25T03:01:00Z",
  },
  refunds: { succeededAmount: "0", pendingAmount: "0" },
  retained: {
    netAmount: "500000",
    projectedNetAfterPending: "500000",
    platformFeeAmount: "50000",
    vendorAmount: "450000",
  },
  cancellation: null,
  items: [
    {
      id: "item-visual",
      serviceId: ids.service,
      slotId: ids.slot,
      serviceTitle: service.title,
      startAt: date,
      endAt: end,
      quantity: 2,
      grossAmount: "550000",
      discountAmount: "50000",
      netAmount: "500000",
      platformFeeAmount: "50000",
      vendorAmount: "450000",
      tickets: { issued: 2, checkedIn: 0, voided: 0 },
    },
  ],
};
const paged = (items: unknown[]) => ({
  items,
  page: 1,
  limit: 20,
  total: items.length,
  totalPages: 1,
});
export async function installVisualFixtures(page: Page) {
  await page.addInitScript(
    ({ hold, user }) => {
      // Navigation hint only; never a real authentication token.
      sessionStorage.setItem(
        "gobook.accessToken",
        `test.${btoa(JSON.stringify({ sub: user, roles: ["CUSTOMER", "VENDOR", "ADMIN"] }))}.test`,
      );
      sessionStorage.setItem(
        "gobook.bookingCheckout.held",
        JSON.stringify({ serviceSlug: "buoi-lam-gom", booking: hold }),
      );
      sessionStorage.setItem(
        "gobook.bookingCheckout.draft",
        JSON.stringify({
          serviceId: hold.items[0].serviceId,
          serviceSlug: "buoi-lam-gom",
          slotId: hold.items[0].slotId,
          quantity: 2,
        }),
      );
      sessionStorage.setItem(
        `gobook.recentBookings.${user}`,
        JSON.stringify([hold.id]),
      );
    },
    { hold, user: ids.user },
  );
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let json: unknown;
    if (path === "/categories" || path === "/admin/categories")
      json = [category];
    else if (path === "/services")
      json = paged([
        {
          ...service,
          thumbnail: null,
          startingPrice: slot.price,
          nextAvailableSlot: slot,
        },
      ]);
    else if (path === `/services/${service.slug}`) json = service;
    else if (path === `/services/${ids.service}/slots`) json = paged([slot]);
    else if (path === `/vendors/${ids.vendor}/reviews`)
      json = {
        data: [
          {
            rating: 5,
            comment:
              "Một buổi chiều thư thái, hướng dẫn tận tình và rất nhiều niềm vui.",
            author: "Khách đã trải nghiệm",
            createdAt: "2026-10-20T03:00:00Z",
          },
        ],
        averageRating: 5,
        reviewCount: 1,
        pagination: { page: 1, totalPages: 1 },
      };
    else if (path === `/bookings/${ids.booking}/tickets`) json = ticketList;
    else if (path.endsWith("/review/eligibility"))
      json = {
        eligible: true,
        reason: "ELIGIBLE",
        reviewId: null,
        reviewDeleted: false,
      };
    else if (path.endsWith("/cancellation/preview"))
      json = {
        bookingId: ids.booking,
        cancellationAllowed: true,
        reason: "PARTIAL_REFUND",
        originalAmount: "500000",
        refundAmount: "400000",
        cancellationFeeAmount: "100000",
        currency: "VND",
        policyVersion: 1,
        items: [
          {
            bookingItemId: "item-visual",
            originalAmount: "500000",
            refundBps: 8000,
            refundAmount: "400000",
            cancellationFeeAmount: "100000",
            cancellationAllowed: true,
            reason: "PARTIAL_REFUND",
          },
        ],
      };
    else if (path === `/payments/${ids.payment}`)
      json = {
        id: ids.payment,
        status: "SUCCEEDED",
        amount: "500000",
        currency: "VND",
        booking: { id: ids.booking, status: "CONFIRMED" },
        expiresAt: null,
      };
    else if (path === "/vendors/me")
      json = page.url().includes("/vendor/application")
        ? { ...vendor, status: "PENDING" }
        : vendor;
    else if (path.endsWith("/applications/latest")) json = application;
    else if (path === "/vendor/services") json = paged([service]);
    else if (path === `/vendor/services/${ids.service}`) json = service;
    else if (path.endsWith("/images")) json = [];
    else if (path === `/vendor/services/${ids.service}/slots`)
      json = paged([slot]);
    else if (path === "/vendor/bookings")
      json = {
        data: [vendorBooking],
        pagination: { page: 1, total: 1, totalPages: 1, limit: 20 },
      };
    else if (path === `/vendor/bookings/${ids.booking}`) json = vendorBooking;
    else if (path === "/vendor/dashboard/overview")
      json = {
        period: { from: "2026-10-01T00:00:00Z", to: "2026-10-26T00:00:00Z" },
        bookings: {
          total: 1,
          confirmed: 1,
          cancelled: 0,
          paid: 1,
          paidCancelled: 0,
          cancellationRateBps: 0,
        },
        financial: {
          paidRevenue: "500000",
          succeededRefunds: "50000",
          pendingRefunds: "10000",
          netRetainedRevenue: "450000",
          estimatedPlatformFee: "45000",
          estimatedVendorEarnings: "405000",
          commissionCoveredBookingCount: 1,
          commissionUnknownBookingCount: 0,
        },
        occupancy: {
          confirmedQuantity: 7,
          activeHeldQuantity: 2,
          totalCapacity: 12,
          rateBps: 5833,
        },
        revenueTrend: [
          { day: "2026-10-25", paidRevenue: "500000", paymentCount: 1 },
          { day: "2026-10-26", paidRevenue: "275000", paymentCount: 1 },
        ],
      };
    else if (path === "/admin/vendor-applications") json = paged([application]);
    else if (path === `/admin/vendor-applications/${ids.application}`)
      json = application;
    else if (path === "/admin/audit-logs") json = paged([]);
    else if (path === "/admin/vouchers")
      json = [
        {
          id: "voucher-visual",
          code: "NGAYVUI",
          type: "FIXED",
          fixedAmount: "50000",
          percentageBps: null,
          minOrderAmount: "300000",
          maxDiscountAmount: null,
          validFrom: "2026-10-01T00:00:00Z",
          validUntil: "2099-10-31T00:00:00Z",
          usageLimit: 100,
          effectiveUsage: 12,
          isActive: true,
        },
      ];
    else if (path === "/admin/transactions/summary")
      json = {
        total: 1,
        byStatus: {
          PENDING: { count: 0, amount: "0" },
          SUCCEEDED: { count: 1, amount: "500000" },
          EXPIRED: { count: 0, amount: "0" },
          CANCELLED: { count: 0, amount: "0" },
        },
        refunds: {
          PENDING: { count: 0, amount: "0" },
          SUCCEEDED: { count: 1, amount: "50000" },
        },
      };
    else if (path === "/admin/transactions")
      json = {
        data: [transaction],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
    else if (path === `/admin/transactions/${ids.payment}`)
      json = {
        ...transaction,
        booking: {
          bookingCode: "GBK-VISUAL",
          status: "CONFIRMED",
          customerId: ids.user,
          customer: { email: owner.email },
          vendor,
        },
        updatedAt: transaction.succeededAt,
        expiredAt: null,
        cancelledAt: null,
        attempts: [
          {
            ...transaction.latestAttempt,
            amount: "500000",
            currency: "VND",
            succeededAt: transaction.succeededAt,
            providerTransactionId: "TEST-ONLY",
            failureCode: null,
          },
        ],
        refunds: [],
        timeline: [
          {
            at: transaction.createdAt,
            type: "PAYMENT_CREATED",
            reference: ids.payment,
          },
        ],
      };
    else
      return route.fulfill({
        status: 404,
        json: {
          code: "VISUAL_FIXTURE_MISSING",
          message: `Missing visual fixture: ${path}`,
        },
      });
    await route.fulfill({ json });
  });
}

export const routes = [
  ["home", "/", "Lên lịch cho niềm vui."],
  ["search", "/services", "Lịch trống của bạn. Trải nghiệm của riêng bạn."],
  ["service", `/services/${service.slug}`, service.title],
  ["register", "/register", "Đăng ký khách hàng"],
  ["login", "/login", "Đăng nhập"],
  [
    "checkout",
    "/bookings/checkout?service=buoi-lam-gom",
    "Booking của bạn đang được giữ tạm thời.",
  ],
  [
    "payment",
    `/payment/result?paymentId=${ids.payment}`,
    "Thanh toán thành công",
  ],
  ["bookings", "/bookings", "Đặt chỗ & vé của bạn"],
  ["tickets", `/bookings/${ids.booking}`, "Vé điện tử của bạn"],
  ["vendor-profile", "/vendor/profile", "Hồ sơ Vendor"],
  ["vendor-application", "/vendor/application", "Đăng ký Vendor"],
  ["vendor-dashboard", "/vendor/dashboard", "Tổng quan kinh doanh"],
  ["vendor-bookings", "/vendor/bookings", "Quản lý Booking"],
  ["vendor-booking", `/vendor/bookings/${ids.booking}`, "GBK-VISUAL"],
  ["vendor-check-in", "/vendor/check-in", "Check-in vé"],
  ["vendor-services", "/vendor/services", "Trải nghiệm bạn tạo ra"],
  ["vendor-service-new", "/vendor/services/new", "Tạo dịch vụ mới"],
  [
    "vendor-service-edit",
    `/vendor/services/${ids.service}`,
    "Nội dung dịch vụ",
  ],
  ["vendor-slots", `/vendor/services/${ids.service}/slots`, "Lịch & sức chứa"],
  ["admin-applications", "/admin/vendor-applications", "Duyệt hồ sơ đối tác"],
  ["admin-categories", "/admin/categories", "Danh mục trải nghiệm"],
  ["admin-vouchers", "/admin/vouchers", "Ưu đãi & mã giảm giá"],
  ["admin-transactions", "/admin/transactions", "Giao dịch & thanh toán"],
  [
    "admin-transaction",
    `/admin/transactions/${ids.payment}`,
    "Chi tiết giao dịch",
  ],
  [
    "not-found",
    "/trang-khong-ton-tai",
    "Trải nghiệm tiếp theo vẫn đang chờ bạn.",
  ],
] as const;
