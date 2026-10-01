import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHoldAttempt,
  ensureHoldAttempt,
  replaceHoldAttempt,
} from "./booking-storage";

describe("booking hold idempotency lifecycle", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("creates one key and reuses it for the same payload and network retry", () => {
    const createKey = vi.fn(() => "key-1");
    const first = ensureHoldAttempt(
      { slotId: "slot-a", quantity: 2 },
      window.sessionStorage,
      createKey,
    );
    const retry = ensureHoldAttempt(
      { slotId: "slot-a", quantity: 2 },
      window.sessionStorage,
      createKey,
    );

    expect(first.key).toBe("key-1");
    expect(retry.key).toBe("key-1");
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("uses a new key when quantity or Slot changes", () => {
    const createKey = vi
      .fn<() => string>()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2")
      .mockReturnValueOnce("key-3");

    expect(
      ensureHoldAttempt(
        { slotId: "slot-a", quantity: 1 },
        window.sessionStorage,
        createKey,
      ).key,
    ).toBe("key-1");
    expect(
      ensureHoldAttempt(
        { slotId: "slot-a", quantity: 2 },
        window.sessionStorage,
        createKey,
      ).key,
    ).toBe("key-2");
    expect(
      ensureHoldAttempt(
        { slotId: "slot-b", quantity: 2 },
        window.sessionStorage,
        createKey,
      ).key,
    ).toBe("key-3");
  });

  it("uses a new key for deliberate retry after expiration", () => {
    replaceHoldAttempt(
      { slotId: "slot-a", quantity: 1 },
      window.sessionStorage,
      () => "expired-key",
    );
    clearHoldAttempt(window.sessionStorage);
    const next = replaceHoldAttempt(
      { slotId: "slot-a", quantity: 1 },
      window.sessionStorage,
      () => "fresh-key",
    );
    expect(next.key).toBe("fresh-key");
  });
});
