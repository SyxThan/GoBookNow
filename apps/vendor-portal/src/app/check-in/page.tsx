import type { Metadata } from "next";
import VendorCheckInClient from "@/features/check-in/vendor-check-in-client";

export const metadata: Metadata = {
  title: "Check-in vé | GoBook Vendor",
  description: "Quét, xác thực và check-in e-ticket tại điểm dịch vụ.",
};

export default function VendorCheckInPage() {
  return <VendorCheckInClient />;
}
