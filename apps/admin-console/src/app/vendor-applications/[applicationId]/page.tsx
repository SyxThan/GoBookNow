import ApplicationReview from "@/features/vendor-applications/application-review";
export default async function Page({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApplicationReview applicationId={applicationId} />;
}
