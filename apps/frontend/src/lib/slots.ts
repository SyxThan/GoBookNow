import type { PublicSlot } from "./api-client";

export function isFutureOpenSlot(slot: PublicSlot): boolean {
  return slot.status === "OPEN" && new Date(slot.startAt).getTime() > Date.now();
}
