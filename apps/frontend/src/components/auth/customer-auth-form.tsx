"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, login, registerCustomer } from "@/lib/api-client";

export function CustomerAuthForm({ mode }: { mode: "register" | "login" }) {
  const router = useRouter();
  const registering = mode === "register";
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (registering && password !== data.get("confirmPassword")) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const email = String(data.get("email")).trim();
      const phone = String(data.get("phone") ?? "").trim();
      const token = registering
        ? await registerCustomer({
            email,
            password,
            fullName: String(data.get("fullName")).trim(),
            ...(phone ? { phone } : {}),
          })
        : await login(email, password);
      sessionStorage.setItem("gobook.accessToken", token);
      if (registering) setCreated(true);
      else router.replace("/services");
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 409
          ? "Email này đã được đăng ký. Vui lòng đăng nhập."
          : reason instanceof ApiError && reason.status === 401
            ? "Email hoặc mật khẩu không đúng."
            : (reason instanceof ApiError && reason.status === 429
                ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
                : "Không thể hoàn tất yêu cầu. Vui lòng kiểm tra thông tin và thử lại.") +
              (reason instanceof ApiError && reason.requestId
                ? ` Mã hỗ trợ: ${reason.requestId}`
                : ""),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-12 text-slate-100">
      <section className="panel w-full max-w-md p-7 sm:p-10">
        <Link href="/" className="text-sm text-teal-300">
          GoBookNow
        </Link>
        <h1 className="mt-5 text-3xl font-semibold">
          {created
            ? "Đăng ký thành công"
            : registering
              ? "Đăng ký khách hàng"
              : "Đăng nhập"}
        </h1>
        {created ? (
          <div className="mt-5" role="status">
            <p>Tài khoản khách hàng đã sẵn sàng để khám phá và đặt chỗ.</p>
            <Link href="/services" className="primary-button mt-6 inline-flex">
              Khám phá dịch vụ
            </Link>
            <Link href="/login" className="secondary-button mt-3 inline-flex">
              Đăng nhập
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {registering && (
                <label className="block">
                  <span>Họ và tên</span>
                  <input
                    className="input mt-2"
                    name="fullName"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </label>
              )}
              <label className="block">
                <span>Email</span>
                <input
                  className="input mt-2"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                />
              </label>
              {registering && (
                <label className="block">
                  <span>Số điện thoại (không bắt buộc)</span>
                  <input
                    className="input mt-2"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={20}
                  />
                </label>
              )}
              <label className="block">
                <span>Mật khẩu</span>
                <input
                  className="input mt-2"
                  name="password"
                  type="password"
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  required
                  minLength={registering ? 8 : undefined}
                  maxLength={128}
                />
              </label>
              {registering && (
                <label className="block">
                  <span>Xác nhận mật khẩu</span>
                  <input
                    className="input mt-2"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </label>
              )}
              {error && (
                <p className="text-sm text-rose-200" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary-button w-full"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Đang xử lý…"
                  : registering
                    ? "Tạo tài khoản"
                    : "Đăng nhập"}
              </button>
            </form>
            <Link
              href={registering ? "/login" : "/register"}
              className="mt-5 inline-block text-sm text-teal-300"
            >
              {registering
                ? "Đã có tài khoản? Đăng nhập"
                : "Chưa có tài khoản? Đăng ký"}
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
