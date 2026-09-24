import type { Metadata } from "next";
import AdminVendorApplicationsClient from "./admin-vendor-applications-client";

export const metadata: Metadata = {
  title: "Vendor Review | GoBook Admin",
  description: "Review Vendor onboarding applications.",
};

export default function AdminVendorApplicationsPage() {
  return <AdminVendorApplicationsClient />;
}
