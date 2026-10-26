import { test, expect } from "./fixtures";

test("Approved Vendor creates a real service and slot, publishes and closes availability", async ({
  page,
  domain,
  catalog,
}) => {
  const operator = await domain.operator("VENDOR", catalog.vendor.ownerUserId);
  await page.goto(`${process.env.VENDOR_E2E_BASE_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(operator.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(operator.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${process.env.VENDOR_E2E_BASE_URL}/services/new`);
  await page
    .getByLabel("Tên dịch vụ", { exact: false })
    .fill("Buổi sáng sáng tạo E2E");
  await page
    .getByLabel("Loại trải nghiệm", { exact: false })
    .selectOption("EVENT");
  await page
    .getByLabel("Danh mục", { exact: false })
    .selectOption(catalog.categoryId);
  await page.getByLabel("Giá dịch vụ", { exact: false }).fill("180000");
  await page
    .getByLabel("Giới thiệu ngắn")
    .fill("Một trải nghiệm thử nghiệm có kiểm chứng.");
  await page.getByRole("button", { name: "Lưu bản nháp" }).click();
  await expect(page).toHaveURL(/\/services\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1)!;
  const saved = await domain.prisma.service.findUniqueOrThrow({
    where: { id },
  });
  expect(saved.status).toBe("DRAFT");
  expect(saved.priceAmount).toBe(180000n);
  expect(saved.vendorId).toBe(catalog.vendor.id);
  await page
    .getByRole("link", { name: "Chỉnh sửa dịch vụ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/edit$/);
  await page
    .getByLabel("Tên dịch vụ", { exact: false })
    .fill("Buổi sáng sáng tạo E2E — đã cập nhật");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/services/${id}$`));
  expect(
    (await domain.prisma.service.findUniqueOrThrow({ where: { id } })).title,
  ).toBe("Buổi sáng sáng tạo E2E — đã cập nhật");
  await page.getByRole("link", { name: "Quản lý lịch trống" }).click();
  await page.getByRole("link", { name: "+ Thêm lịch", exact: true }).click();
  const dialog = page.locator("form");
  const future = new Date(Date.now() + 3 * 86400000);
  const local = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  await dialog.getByLabel("Bắt đầu").fill(local(future));
  await dialog
    .getByLabel("Kết thúc")
    .fill(local(new Date(future.getTime() + 3600000)));
  await dialog.getByLabel("Số chỗ").fill("8");
  await dialog.getByRole("button", { name: "Lưu lịch" }).click();
  await expect(page).toHaveURL(/\/slots$/);
  let slots = await domain.prisma.slot.findMany({ where: { serviceId: id } });
  expect(slots).toHaveLength(1);
  expect(slots[0].capacity).toBe(8);
  expect(slots[0].priceAmount).toBeNull();
  await page.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
  await page.getByLabel("Số chỗ", { exact: true }).fill("9");
  await page.getByLabel("Giá riêng", { exact: false }).fill("185000");
  await page.getByRole("button", { name: "Lưu lịch", exact: true }).click();
  await expect(page).toHaveURL(/\/slots$/);
  const editedSlot = await domain.prisma.slot.findUniqueOrThrow({
    where: { id: slots[0].id },
  });
  expect(editedSlot.capacity).toBe(9);
  expect(editedSlot.priceAmount).toBe(185000n);
  await page.getByRole("button", { name: "Đóng lịch", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận đóng lịch" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  slots = await domain.prisma.slot.findMany({ where: { serviceId: id } });
  expect(slots[0].status).toBe("CLOSED");
  await page.goto(`${process.env.VENDOR_E2E_BASE_URL}/services/${id}`);
  await page.getByRole("button", { name: "Xuất bản dịch vụ" }).click();
  await expect(page.getByText("Dịch vụ đã được xuất bản.")).toBeVisible();
  expect(
    (await domain.prisma.service.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("PUBLISHED");
  await page.goto(`${process.env.VENDOR_E2E_BASE_URL}/dashboard`);
  await expect(
    page.getByText("Doanh thu đã thu", { exact: true }),
  ).toBeVisible();
  await page.goto(`${process.env.VENDOR_E2E_BASE_URL}/bookings`);
  await expect(
    page.getByText("Không có Booking nào trong bộ lọc này."),
  ).toBeVisible();
});

test("Admin creates an exact fractional voucher, deactivates it and opens transaction investigation", async ({
  page,
  domain,
  catalog,
}) => {
  expect(catalog.id).toBeTruthy(); // fixture owns reset/cleanup of this isolated database
  const operator = await domain.operator("ADMIN");
  const pending = await domain.pendingApplication();
  await page.goto(`${process.env.ADMIN_E2E_BASE_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(operator.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(operator.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/vendor-applications$/);
  await page.goto(`${process.env.ADMIN_E2E_BASE_URL}/vouchers`);
  await page.getByRole("link", { name: "+ Tạo ưu đãi" }).click();
  const dialog = page.locator("form");
  await dialog.getByLabel("Mã ưu đãi").fill("E2E1234");
  await dialog.getByLabel("Cách giảm").selectOption("PERCENTAGE");
  await dialog.getByLabel("Mức giảm (%)").fill("12.34");
  await dialog.getByLabel("Giá trị đơn tối thiểu").fill("300000");
  await dialog.getByLabel("Giảm tối đa").fill("80000");
  await dialog.getByLabel("Bắt đầu").fill("2026-01-01T00:00");
  await dialog.getByLabel("Kết thúc").fill("2099-12-31T23:59");
  await dialog.getByRole("button", { name: "Lưu ưu đãi" }).click();
  await expect(page).toHaveURL(/\/vouchers$/);
  const voucher = await domain.prisma.voucher.findUniqueOrThrow({
    where: { code: "E2E1234" },
  });
  expect(voucher.percentageBps).toBe(1234);
  expect(voucher.fixedAmount).toBeNull();
  expect(voucher.minOrderAmount).toBe(300000n);
  expect(voucher.maxDiscountAmount).toBe(80000n);
  await page.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
  await page.getByLabel("Mức giảm", { exact: false }).fill("13.25");
  await page.getByRole("button", { name: "Lưu ưu đãi", exact: true }).click();
  await expect(page).toHaveURL(/\/vouchers$/);
  expect(
    (
      await domain.prisma.voucher.findUniqueOrThrow({
        where: { id: voucher.id },
      })
    ).percentageBps,
  ).toBe(1325);

  await page
    .getByRole("button", { name: "Ngừng áp dụng", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận ngừng áp dụng" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await domain.prisma.voucher.findUniqueOrThrow({
        where: { id: voucher.id },
      })
    ).isActive,
  ).toBe(false);
  await page.goto(`${process.env.ADMIN_E2E_BASE_URL}/transactions`);
  await expect(
    page.getByRole("heading", { name: "Giao dịch & thanh toán" }),
  ).toBeVisible();
  await expect(page.getByText("Không có giao dịch phù hợp.")).toBeVisible();
  await page.goto(`${process.env.ADMIN_E2E_BASE_URL}/categories`);
  await expect(
    page.getByRole("heading", { name: "Danh mục trải nghiệm" }),
  ).toBeVisible();
  await page.getByLabel("Mã", { exact: true }).fill("E2E_ART");
  await page.getByLabel("Tên", { exact: true }).fill("Nghệ thuật E2E");
  await page
    .locator("form")
    .filter({
      has: page.getByRole("heading", { name: "Tạo danh mục", exact: true }),
    })
    .getByRole("combobox")
    .selectOption("EVENT");
  await page.getByRole("button", { name: "Tạo danh mục", exact: true }).click();
  await expect(
    page.getByText("Đã tạo danh mục.", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await domain.prisma.category.findUniqueOrThrow({
        where: { code: "E2E_ART" },
      })
    ).scope,
  ).toBe("EVENT");
  await page.goto(`${process.env.ADMIN_E2E_BASE_URL}/vendor-applications`);
  await expect(
    page.getByRole("heading", { name: "Hồ sơ đối tác", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /E2E Partner Review/ }).click();
  await page
    .getByRole("button", { name: "Phê duyệt đối tác", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận phê duyệt", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await domain.prisma.vendorApplication.findUniqueOrThrow({
            where: { id: pending.application.id },
          })
        ).status,
    )
    .toBe("APPROVED");
  expect(
    (
      await domain.prisma.vendor.findUniqueOrThrow({
        where: { id: pending.vendor.id },
      })
    ).status,
  ).toBe("APPROVED");
  const roles = await domain.prisma.userRole.findMany({
    where: { userId: pending.owner.id },
    include: { role: true },
  });
  expect(roles.map((row) => row.role.code).sort()).toEqual([
    "CUSTOMER",
    "VENDOR",
  ]);
});
