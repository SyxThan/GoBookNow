import SlotEditor from "@/features/slots/slot-editor";
export default async function EditSlot({
  params,
}: {
  params: Promise<{ serviceId: string; slotId: string }>;
}) {
  const { serviceId, slotId } = await params;
  return <SlotEditor serviceId={serviceId} slotId={slotId} />;
}
