import type { Metadata } from "next";
import { VendorServicesClient } from "@/features/services/vendor-services-client";
export const metadata: Metadata = { title: "Quản lý dịch vụ" };
export default function Page() {
  return <VendorServicesClient />;
}
