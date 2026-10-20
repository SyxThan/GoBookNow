"use client";

import { useCallback, useEffect, useState } from "react";

export function useVendorToken() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((value: string | null) => {
    setToken(value);
    if (value) sessionStorage.setItem("gobook.accessToken", value);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToken(sessionStorage.getItem("gobook.accessToken"));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return { ready, token, onToken };
}
