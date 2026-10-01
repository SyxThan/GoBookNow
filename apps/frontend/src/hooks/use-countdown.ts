"use client";

import { useEffect, useState } from "react";

export type Countdown = {
  remainingMs: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
};

export function calculateCountdown(expiresAt: string | null, now: number): Countdown {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  const remainingMs = Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
  const wholeSeconds = Math.ceil(remainingMs / 1_000);
  return {
    remainingMs,
    minutes: Math.floor(wholeSeconds / 60),
    seconds: wholeSeconds % 60,
    isExpired: remainingMs <= 0,
  };
}

export function useCountdown(expiresAt: string | null): Countdown {
  const [countdown, setCountdown] = useState(() =>
    calculateCountdown(expiresAt, Date.now()),
  );

  useEffect(() => {
    const update = () => setCountdown(calculateCountdown(expiresAt, Date.now()));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  return countdown;
}
