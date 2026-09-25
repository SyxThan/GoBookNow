import type { Metadata } from "next";
import AdminCategoriesClient from "./admin-categories-client";

export const metadata: Metadata = {
  title: "Category Management | GoBook Admin",
  description: "Manage service and event master categories.",
};

export default function AdminCategoriesPage() {
  return <AdminCategoriesClient />;
}
