import type { Metadata } from "next";
import VendorDashboardClient from "@/features/dashboard/vendor-dashboard-client";

export const metadata: Metadata = { title: "Tổng quan | GoBook Vendor" };
export default function VendorDashboardPage() {
  return <VendorDashboardClient />;
}
