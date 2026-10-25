"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiError, login, registerCustomer } from "@/lib/api-client";
import { Burst, Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/primitives";

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
      window.dispatchEvent(new Event("gobook:session"));
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
    <main className="page-wrap grid items-center gap-10 !py-10 lg:min-h-[80vh] lg:grid-cols-[1fr_1fr] lg:gap-20 lg:!py-16">
      <aside className="relative mx-auto max-w-lg lg:mx-0"><span className="badge bg-mint">Hẹn những điều thú vị</span><h2 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">{registering ? "Một tài khoản." : "Chào bạn,"}<br /><span className="inline-block bg-sun px-2">{registering ? "Nhiều niềm vui." : "lâu rồi không gặp!"}</span></h2><p className="mt-5 max-w-md text-sm leading-7 text-muted">Khám phá điều mới, đặt lịch bạn thích và giữ những chiếc vé đáng mong chờ — tất cả trong một tài khoản GoBookNow.</p><div className="panel relative mt-9 hidden rotate-[-3deg] !bg-lavender p-7 lg:block"><Burst className="absolute -right-4 -top-6 w-20 text-coral" /><Icon name="ticket" size={48} /><p className="mt-5 text-2xl font-extrabold">Cuộc hẹn tiếp theo<br />bắt đầu từ đây.</p><div className="ticket-edge mt-6 pt-4 text-xs font-semibold">Khám phá · Đặt chỗ · Tận hưởng</div></div></aside>
      <section className="panel mx-auto w-full max-w-md p-6 sm:p-9">
        <p className="eyebrow">{registering ? "Bắt đầu hành trình" : "Mừng bạn trở lại"}</p>
        <h1 className="mt-3 text-3xl font-extrabold">
          {created
            ? "Đăng ký thành công"
            : registering
              ? "Đăng ký khách hàng"
              : "Đăng nhập"}
        </h1>
        {created ? (
          <div className="mt-5" role="status">
            <span className="mb-5 inline-grid size-14 place-items-center rounded-full border-2 border-line bg-mint"><Icon name="check" size={30} /></span><p>Tài khoản khách hàng đã sẵn sàng để khám phá và đặt chỗ.</p>
            <Link href="/services" className="primary-button mt-6 inline-flex">
              Khám phá dịch vụ
            </Link>
            <Link href="/login" className="secondary-button mt-3 inline-flex">
              Đăng nhập
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-xs leading-6 text-muted">{registering ? "Các trường bên dưới là bắt buộc, trừ số điện thoại." : "Đăng nhập để xem đặt chỗ và những chiếc vé của bạn."}</p>
            <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={busy}>
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
              <PasswordField name="password" label="Mật khẩu" newPassword={registering} />
              {registering && <PasswordField name="confirmPassword" label="Xác nhận mật khẩu" newPassword invalid={Boolean(error?.includes("xác nhận"))} />}
              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <Button
                className="w-full"
                type="submit"
                loading={busy}
              >
                {busy
                  ? "Đang xử lý…"
                  : registering
                    ? "Tạo tài khoản"
                    : "Đăng nhập"}
              </Button>
            </form>
            <Link
              href={registering ? "/login" : "/register"}
              className="mt-5 inline-block text-sm text-info"
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

function PasswordField({ name, label, newPassword = false, invalid = false }: { name: string; label: string; newPassword?: boolean; invalid?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div><label htmlFor={id}>{label}</label><div className="relative mt-2"><input id={id} className="input pr-14" name={name} type={visible ? "text" : "password"} autoComplete={newPassword ? "new-password" : "current-password"} required minLength={newPassword ? 8 : undefined} maxLength={128} aria-invalid={invalid || undefined} /><button className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl" type="button" onClick={() => setVisible(!visible)} aria-label={`${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`} aria-pressed={visible}><Icon name="eye" size={19} /></button></div></div>;
}
