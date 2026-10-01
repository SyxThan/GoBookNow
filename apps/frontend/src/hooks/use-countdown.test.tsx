import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateCountdown, useCountdown } from "./use-countdown";

describe("useCountdown", () => {
  afterEach(() => vi.useRealTimers());

  it("calculates remaining time from the backend expiresAt", () => {
    expect(calculateCountdown("2026-10-03T09:10:00.000Z", Date.parse("2026-10-03T09:00:18.000Z"))).toMatchObject({
      minutes: 9,
      seconds: 42,
      isExpired: false,
    });
  });

  it("does not reset on rerender and reaches zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T09:00:00.000Z"));
    const expiresAt = "2026-10-03T09:00:02.000Z";
    const { result, rerender } = renderHook(() => useCountdown(expiresAt));
    expect(result.current.seconds).toBe(2);

    act(() => vi.advanceTimersByTime(1_000));
    rerender();
    expect(result.current.seconds).toBe(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toMatchObject({
      remainingMs: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    });
  });
});
