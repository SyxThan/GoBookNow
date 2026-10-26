import type { Metadata } from "next";
import VendorApplicationClient from "@/features/onboarding/vendor-application-client";

export const metadata: Metadata = {
  title: "Đăng ký Vendor | GoBook",
  description: "Gửi và theo dõi hồ sơ xét duyệt Vendor.",
};

export default function VendorApplicationPage() {
  return <VendorApplicationClient />;
}
