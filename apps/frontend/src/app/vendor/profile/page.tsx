import type { Metadata } from "next";
import VendorProfileClient from "./vendor-profile-client";

export const metadata: Metadata = {
  title: "Hồ sơ Vendor | GoBook",
  description: "Tạo và quản lý hồ sơ tổ chức kinh doanh trên GoBook.",
};

export default function VendorProfilePage() {
  return <VendorProfileClient />;
}
