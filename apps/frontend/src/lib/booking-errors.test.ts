import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { toFriendlyBookingError } from "./booking-errors";

describe("booking hold errors", () => {
  it("maps insufficient capacity and requests a Slot refetch", () => {
    expect(
      toFriendlyBookingError(
        new ApiError(409, "raw backend text", "INSUFFICIENT_CAPACITY"),
      ),
    ).toMatchObject({ kind: "CAPACITY", refetchSlots: true });
  });

  it("maps unavailable Slot, auth, forbidden, and network failures", () => {
    expect(
      toFriendlyBookingError(
        new ApiError(409, "raw", "BOOKING_SLOT_UNAVAILABLE"),
      ).kind,
    ).toBe("SLOT_UNAVAILABLE");
    expect(toFriendlyBookingError(new ApiError(401, "raw")).kind).toBe("AUTH");
    expect(toFriendlyBookingError(new ApiError(403, "raw")).kind).toBe("FORBIDDEN");
    expect(toFriendlyBookingError(new TypeError("timeout")).kind).toBe("NETWORK");
  });
});
