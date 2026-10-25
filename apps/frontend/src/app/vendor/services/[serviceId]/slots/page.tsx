import SlotsManager from "./slots-manager";
export const metadata = { title: "Lịch & sức chứa" };
export default async function Page({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <SlotsManager serviceId={serviceId} />;
}
