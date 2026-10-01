import type { BookingHoldResponse } from "./api-client";

export const HOLD_ATTEMPT_STORAGE_KEY = "gobook.bookingHold.attempt";
export const CHECKOUT_DRAFT_STORAGE_KEY = "gobook.bookingCheckout.draft";
export const HELD_BOOKING_STORAGE_KEY = "gobook.bookingCheckout.held";

export type HoldPayload = {
  slotId: string;
  quantity: number;
};

export type HoldAttempt = HoldPayload & {
  key: string;
};

export type CheckoutDraft = HoldPayload & {
  serviceId: string;
  serviceSlug: string;
};

export type HeldBookingSnapshot = {
  serviceSlug: string;
  booking: BookingHoldResponse;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readAttempt(storage: StorageLike): HoldAttempt | null {
  const value = parseJson(storage.getItem(HOLD_ATTEMPT_STORAGE_KEY));
  if (
    !isRecord(value) ||
    typeof value.slotId !== "string" ||
    !Number.isInteger(value.quantity) ||
    typeof value.quantity !== "number" ||
    value.quantity < 1 ||
    typeof value.key !== "string"
  ) {
    return null;
  }
  return { slotId: value.slotId, quantity: value.quantity, key: value.key };
}

export function ensureHoldAttempt(
  payload: HoldPayload,
  storage: StorageLike,
  createKey: () => string = () => crypto.randomUUID(),
): HoldAttempt {
  const existing = readAttempt(storage);
  if (
    existing &&
    existing.slotId === payload.slotId &&
    existing.quantity === payload.quantity
  ) {
    return existing;
  }
  return replaceHoldAttempt(payload, storage, createKey);
}

export function replaceHoldAttempt(
  payload: HoldPayload,
  storage: StorageLike,
  createKey: () => string = () => crypto.randomUUID(),
): HoldAttempt {
  const next = { ...payload, key: createKey() };
  storage.setItem(HOLD_ATTEMPT_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearHoldAttempt(storage: StorageLike): void {
  storage.removeItem(HOLD_ATTEMPT_STORAGE_KEY);
}

export function saveCheckoutDraft(
  draft: CheckoutDraft,
  storage: StorageLike,
): void {
  storage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function readCheckoutDraft(storage: StorageLike): CheckoutDraft | null {
  const value = parseJson(storage.getItem(CHECKOUT_DRAFT_STORAGE_KEY));
  if (
    !isRecord(value) ||
    typeof value.serviceId !== "string" ||
    typeof value.serviceSlug !== "string" ||
    typeof value.slotId !== "string" ||
    typeof value.quantity !== "number" ||
    !Number.isInteger(value.quantity) ||
    value.quantity < 1
  ) {
    return null;
  }
  return {
    serviceId: value.serviceId,
    serviceSlug: value.serviceSlug,
    slotId: value.slotId,
    quantity: value.quantity,
  };
}

export function clearCheckoutDraft(storage: StorageLike): void {
  storage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
}

export function saveHeldBooking(
  snapshot: HeldBookingSnapshot,
  storage: StorageLike,
): void {
  storage.setItem(HELD_BOOKING_STORAGE_KEY, JSON.stringify(snapshot));
}

export function readHeldBooking(storage: StorageLike): HeldBookingSnapshot | null {
  const value = parseJson(storage.getItem(HELD_BOOKING_STORAGE_KEY));
  if (
    !isRecord(value) ||
    typeof value.serviceSlug !== "string" ||
    !isRecord(value.booking) ||
    typeof value.booking.id !== "string" ||
    typeof value.booking.bookingCode !== "string" ||
    typeof value.booking.expiresAt !== "string" ||
    !Array.isArray(value.booking.items)
  ) {
    return null;
  }
  return value as HeldBookingSnapshot;
}

export function clearHeldBooking(storage: StorageLike): void {
  storage.removeItem(HELD_BOOKING_STORAGE_KEY);
}
