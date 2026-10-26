import { ServiceEditor } from "@/features/services/[serviceId]/service-editor";
export default async function EditService({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <ServiceEditor serviceId={serviceId} />;
}
