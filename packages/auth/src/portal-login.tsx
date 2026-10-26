"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, login } from "@gobook/api-client";
import { Button } from "@gobook/ui/primitives";
import { setPortalToken } from "./use-session";
import { safeReturnPath } from "./return-path";

export function PortalLogin({ title, description, destination }: { title: string; description: string; destination: string }) {
  const router = useRouter(), params = useSearchParams();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      setPortalToken(await login(String(data.get("email")).trim(), String(data.get("password"))));
      router.replace(safeReturnPath(params.get("next"), destination));
    } catch (reason) {
      setError((reason instanceof ApiError && reason.status === 401 ? "Email hoặc mật khẩu không đúng." : "Chưa thể đăng nhập. Vui lòng thử lại.") + (reason instanceof ApiError && reason.requestId ? ` Mã hỗ trợ: ${reason.requestId}` : ""));
    } finally { setBusy(false); }
  }
  return <main className="page-wrap grid min-h-[75vh] place-items-center"><section className="panel w-full max-w-md p-6 sm:p-9">
    <p className="eyebrow">Tài khoản GoBookNow</p><h1 className="mt-3 text-3xl">{title}</h1><p className="mt-3 text-sm text-muted">{description}</p>
    <form onSubmit={submit} className="mt-6 grid gap-5" aria-busy={busy}>
      <label>Email<input className="input mt-2" name="email" type="email" autoComplete="username" required /></label>
      <label>Mật khẩu<input className="input mt-2" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required /></label>
      <button type="button" className="justify-self-start text-sm underline" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}</button>
      {error && <p role="alert" className="status-note !bg-coral/20 text-danger">{error}</p>}
      <Button type="submit" loading={busy}>Đăng nhập</Button>
    </form>
  </section></main>;
}
