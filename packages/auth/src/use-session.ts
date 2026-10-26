"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
const key = "gobook.accessToken";
function snapshot() {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function identity(token: string | null) {
  try {
    const value = JSON.parse(
      atob(token!.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
    );
    return JSON.stringify([value.sub, value.roles]);
  } catch {
    return null;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener("gobook:session", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("gobook:session", callback);
    window.removeEventListener("storage", callback);
  };
}
export function setPortalToken(token: string | null) {
  const before = snapshot();
  if (token) sessionStorage.setItem(key, token);
  else sessionStorage.removeItem(key);
  window.dispatchEvent(
    new CustomEvent("gobook:session", {
      detail: {
        sameIdentity: Boolean(
          token && identity(before) && identity(before) === identity(token),
        ),
      },
    }),
  );
}
export function usePortalSession() {
  const token = useSyncExternalStore(subscribe, snapshot, () => null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);
  const onToken = useCallback(setPortalToken, []);
  return { ready, token, onToken };
}
