import { Suspense } from "react";
import { PortalLogin } from "@gobook/auth/portal-login";
export default function Login() {
  return (
    <Suspense fallback={<p role="status">Đang tải…</p>}>
      <PortalLogin
        title="Đăng nhập GoBookNow Admin"
        description="Dành cho quản trị viên được cấp quyền ADMIN."
        destination="/vendor-applications"
      />
    </Suspense>
  );
}
