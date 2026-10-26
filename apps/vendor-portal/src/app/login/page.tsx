import { Suspense } from "react";
import { PortalLogin } from "@gobook/auth/portal-login";
export default function Login() {
  return (
    <Suspense fallback={<p role="status">Đang tải…</p>}>
      <PortalLogin
        title="Đăng nhập GoBookNow Vendor"
        description="Dành cho đối tác và tài khoản đăng ký trở thành đối tác."
        destination="/dashboard"
      />
    </Suspense>
  );
}
