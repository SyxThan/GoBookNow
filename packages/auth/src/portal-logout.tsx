"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@gobook/api-client";
import { usePortalSession } from "./use-session";

export function PortalLogout() {
  const { token, onToken } = usePortalSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!token) return null;
  async function signOut() {
    setBusy(true); setError("");
    try { await logout(); onToken(null); router.replace("/login"); }
    catch { setError("Chưa thể đăng xuất. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  return <div><button className="secondary-button" onClick={signOut} disabled={busy}>{busy ? "Đang thoát…" : "Đăng xuất"}</button>{error && <p role="alert" className="text-sm text-danger">{error}</p>}</div>;
}
