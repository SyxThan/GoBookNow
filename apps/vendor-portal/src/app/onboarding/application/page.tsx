import type { Metadata } from "next";
import VendorApplicationClient from "@/features/onboarding/vendor-application-client";

export const metadata: Metadata = {
  title: "Đăng ký đối tác",
  description: "Gửi và theo dõi hồ sơ xét duyệt đối tác GoBookNow.",
};

export default function VendorApplicationPage() {
  return <VendorApplicationClient />;
}
