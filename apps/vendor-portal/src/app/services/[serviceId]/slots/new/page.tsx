import SlotEditor from "@/features/slots/slot-editor";
export default async function NewSlot({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <SlotEditor serviceId={serviceId} />;
}
