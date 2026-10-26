import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@gobook/auth/providers";
import { AdminConsoleShell } from "@/components/shell";
export const metadata: Metadata = {
  title: { default: "GoBookNow Admin", template: "%s | GoBookNow Admin" },
  description: "Quản trị nền tảng GoBookNow",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="portal-admin antialiased">
        <Providers>
          <AdminConsoleShell>{children}</AdminConsoleShell>
        </Providers>
      </body>
    </html>
  );
}
