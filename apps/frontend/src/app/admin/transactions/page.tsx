import type { Metadata } from "next";
import AdminTransactionsClient from "./transactions-client";

export const metadata: Metadata = { title: "Transactions | GoBook Admin" };
export default function Page() { return <AdminTransactionsClient />; }
