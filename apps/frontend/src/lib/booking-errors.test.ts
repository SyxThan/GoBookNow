import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { toFriendlyBookingError } from "./booking-errors";

describe("booking hold errors", () => {
  it("keeps the support ID for unexpected errors without exposing backend details", () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const result = toFriendlyBookingError(
      new ApiError(
        500,
        "private backend exception",
        "INTERNAL_SERVER_ERROR",
        undefined,
        requestId,
      ),
    );
    expect(result.message).toContain(`Mã hỗ trợ: ${requestId}`);
    expect(result.message).not.toContain("private backend exception");
    expect(result.refetchSlots).toBe(false);
  });
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
