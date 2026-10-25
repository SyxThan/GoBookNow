import { CustomerAuthForm } from "@/components/auth/customer-auth-form";

export const metadata = { title: "Đăng nhập | GoBook" };

export default function LoginPage() {
  return <CustomerAuthForm mode="login" />;
}
