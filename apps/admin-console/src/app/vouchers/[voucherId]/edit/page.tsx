import VoucherEditor from "@/features/vouchers/voucher-editor";
export default async function EditVoucher({
  params,
}: {
  params: Promise<{ voucherId: string }>;
}) {
  const { voucherId } = await params;
  return <VoucherEditor voucherId={voucherId} />;
}
