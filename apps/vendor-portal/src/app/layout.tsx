import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@gobook/auth/providers";
import { VendorPortalShell } from "@/components/shell";
export const metadata: Metadata = {
  title: { default: "GoBookNow Vendor", template: "%s | GoBookNow Vendor" },
  description: "Vận hành dịch vụ và đặt chỗ",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="portal-vendor antialiased">
        <Providers>
          <VendorPortalShell>{children}</VendorPortalShell>
        </Providers>
      </body>
    </html>
  );
}
