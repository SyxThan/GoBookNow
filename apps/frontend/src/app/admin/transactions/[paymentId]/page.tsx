import type { Metadata } from "next";
import TransactionDetailClient from "./transaction-detail-client";

export const metadata: Metadata = { title: "Transaction Detail | GoBook Admin" };
export default async function Page({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <TransactionDetailClient paymentId={paymentId} />;
}
