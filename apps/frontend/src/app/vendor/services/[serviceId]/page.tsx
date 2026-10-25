import type { Metadata } from "next";
import { ServiceEditor } from "./service-editor";
export const metadata: Metadata = { title: "Nội dung dịch vụ" };
export default async function Page({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <ServiceEditor serviceId={serviceId} />;
}
