import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteShell } from "@/components/layout/site-shell";

export const metadata: Metadata = {
  title: { default: "GoBookNow — Lên lịch cho niềm vui", template: "%s | GoBookNow" },
  description: "Nền tảng đặt dịch vụ và sự kiện.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers><SiteShell>{children}</SiteShell></Providers>
      </body>
    </html>
  );
}
