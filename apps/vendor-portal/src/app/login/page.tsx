import { Suspense } from "react";
import Link from "next/link";
import { PortalLogin } from "@gobook/auth/portal-login";
export default function Login() {
  return (
    <Suspense fallback={<p role="status">Đang tải…</p>}>
      <PortalLogin
        title="Đăng nhập GoBookNow Vendor"
        description="Dành cho đối tác và tài khoản đăng ký trở thành đối tác."
        destination="/dashboard"
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
