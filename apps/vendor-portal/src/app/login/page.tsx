import { Suspense } from "react";
import Link from "next/link";
import { PortalLogin } from "@gobook/auth/portal-login";
export default function Login() {
  return (
    <Suspense fallback={<p role="status">Đang tải…</p>}>
      <PortalLogin
        title="Chào mừng đối tác"
        description="Dùng tài khoản GoBookNow của bạn để đăng ký đối tác hoặc quản lý hoạt động kinh doanh. Cổng đối tác có phiên đăng nhập riêng; nếu đã đăng nhập ở trang khách hàng, bạn cần đăng nhập thêm tại đây."
        destination="/onboarding/application"
        footer={
          <p>
            Chưa có tài khoản?{" "}
            <Link
              className="font-semibold underline"
              href={`${process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000"}/register`}
            >
              Đăng ký khách hàng
            </Link>
            , sau đó dùng tài khoản đó để đăng ký đối tác.
          </p>
        }
      />
    </Suspense>
  );
}
