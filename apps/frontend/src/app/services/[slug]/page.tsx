import type { Metadata } from "next";
import { ServiceDetailClient } from "./service-detail-client";

export const metadata: Metadata = {
  title: "Chọn lịch | GoBook",
  description: "Chọn khung giờ và số lượng cho dịch vụ hoặc sự kiện.",
};

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ServiceDetailClient slug={slug} />;
}
