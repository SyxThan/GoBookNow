import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function login(
  page: Page,
  origin: string,
  credentials: { email: string; password: string },
  next?: string,
) {
  await page.goto(
    `${origin}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`,
  );
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("Three browser origins retain independent identities through refresh and Vendor logout", async ({
  page,
  context,
  domain,
  catalog,
}) => {
  const vendor = await domain.operator("VENDOR", catalog.vendor.ownerUserId);
  const admin = await domain.operator("ADMIN");
  const applicant = await domain.pendingApplication();
  const customer = await domain.operator("VENDOR", applicant.owner.id);
  await login(page, process.env.E2E_BASE_URL!, customer);
  await expect(page).toHaveURL(/\/services$/);
  const vendorPage = await context.newPage(),
    adminPage = await context.newPage();
  try {
    await login(vendorPage, process.env.VENDOR_E2E_BASE_URL!, vendor);
    await expect(
      vendorPage.getByRole("heading", { name: "Tổng quan kinh doanh" }),
    ).toBeVisible();
    await login(adminPage, process.env.ADMIN_E2E_BASE_URL!, admin);
    await expect(
      adminPage.getByRole("heading", { name: "Hồ sơ đối tác", exact: true }),
    ).toBeVisible();
    const names = (
      await context.cookies(`${process.env.BACKEND_BASE_URL}/api/v1/auth`)
    )
      .filter((cookie) => cookie.httpOnly)
      .map((cookie) => cookie.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "gobook_refresh_token",
        "gobook_refresh_token_vendor",
        "gobook_refresh_token_admin",
      ]),
    );
    // Force each application to restore from its own HttpOnly refresh credential.
    for (const [tab, path] of [
      [vendorPage, "/dashboard"],
      [adminPage, "/transactions"],
    ] as const) {
      await tab.evaluate(() => sessionStorage.removeItem("gobook.accessToken"));
      await tab.goto(new URL(path, tab.url()).href);
      await expect
        .poll(() =>
          tab.evaluate(() =>
            Boolean(sessionStorage.getItem("gobook.accessToken")),
          ),
        )
        .toBe(true);
    }
    await vendorPage
      .getByRole("button", { name: "Đăng xuất", exact: true })
      .click();
    await expect(vendorPage).toHaveURL(/\/login$/);
    for (const tab of [adminPage]) {
      await tab.evaluate(() => sessionStorage.removeItem("gobook.accessToken"));
      await tab.reload();
      await expect
        .poll(() =>
          tab.evaluate(() =>
            Boolean(sessionStorage.getItem("gobook.accessToken")),
          ),
        )
        .toBe(true);
    }
    await expect(
      adminPage.getByRole("heading", { name: "Giao dịch & thanh toán" }),
    ).toBeVisible();
    const customerRefresh = await page.evaluate(async (api) => {
      const response = await fetch(`${api}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Portal": "customer" },
      });
      if (!response.ok) return { status: response.status, id: null };
      const { accessToken } = await response.json();
      const identity = await fetch(`${api}/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Portal": "customer",
        },
      });
      return { status: identity.status, id: (await identity.json()).id };
    }, `${process.env.BACKEND_BASE_URL}/api/v1`);
    expect(customerRefresh).toEqual({ status: 200, id: applicant.owner.id });
    // Applicant may complete onboarding, but cannot operate a Vendor business.
    await login(
      vendorPage,
      process.env.VENDOR_E2E_BASE_URL!,
      customer,
      "/onboarding/application",
    );
    await expect(
      vendorPage.getByRole("heading", { name: "Đăng ký Vendor", exact: true }),
    ).toBeVisible();
    await vendorPage.goto(`${process.env.VENDOR_E2E_BASE_URL}/dashboard`);
    await expect(
      vendorPage.getByRole("heading", { name: "Bạn chưa có quyền truy cập" }),
    ).toBeVisible();
    // Approval becomes operational without copying tokens or logging in again.
    const drawer = vendorPage.getByRole("button", {
      name: "Mở điều hướng",
      exact: true,
    });
    if (await drawer.isVisible()) await drawer.click();
    await vendorPage
      .getByRole("link", { name: "Hồ sơ xét duyệt", exact: true })
      .click();
    await expect(
      vendorPage.getByRole("heading", {
        name: "Trạng thái xét duyệt",
        exact: true,
      }),
    ).toBeVisible();
    await adminPage.goto(
      `${process.env.ADMIN_E2E_BASE_URL}/vendor-applications/${applicant.application.id}`,
    );
    await adminPage
      .getByRole("button", { name: "Phê duyệt đối tác", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Xác nhận phê duyệt", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await domain.prisma.vendor.findUniqueOrThrow({
              where: { id: applicant.vendor.id },
            })
          ).status,
      )
      .toBe("APPROVED");
    await vendorPage
      .getByRole("button", { name: "Kiểm tra cập nhật", exact: true })
      .click();
    await vendorPage
      .getByRole("link", { name: "Vào tổng quan", exact: true })
      .click();
    await expect(
      vendorPage.getByRole("heading", {
        name: "Tổng quan kinh doanh",
        exact: true,
      }),
    ).toBeVisible();
    // Switching Admin identity must immediately evict previously fetched data.
    await login(adminPage, process.env.ADMIN_E2E_BASE_URL!, customer);
    await expect(
      adminPage.getByRole("heading", { name: "Bạn chưa có quyền truy cập" }),
    ).toBeVisible();
    await expect(
      adminPage.getByText("E2E Partner Review", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await vendorPage.close();
    await adminPage.close();
  }
});
