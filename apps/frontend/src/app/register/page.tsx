import { CustomerAuthForm } from "@/components/auth/customer-auth-form";

export const metadata = { title: "Đăng ký khách hàng | GoBook" };

export default function RegisterPage() {
  return <CustomerAuthForm mode="register" />;
}
