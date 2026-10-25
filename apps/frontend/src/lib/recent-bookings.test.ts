import { beforeEach, describe, expect, it, vi } from "vitest";
import { recentBookingIds, rememberBooking } from "./recent-bookings";
const customerA = "11111111-1111-4111-8111-111111111111",
  customerB = "22222222-2222-4222-8222-222222222222";
const booking = "33333333-3333-4333-8333-333333333333";
function signIn(sub: string) {
  sessionStorage.setItem(
    "gobook.accessToken",
    `test.${btoa(JSON.stringify({ sub }))}.test`,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
describe("recent booking references", () => {
  it("isolates references when accounts switch on the same device", () => {
    signIn(customerA);
    rememberBooking(booking);
    rememberBooking(booking);
    expect(recentBookingIds()).toEqual([booking]);
    signIn(customerB);
    expect(recentBookingIds()).toEqual([]);
    signIn(customerA);
    expect(recentBookingIds()).toEqual([booking]);
    sessionStorage.removeItem("gobook.accessToken");
    expect(recentBookingIds()).toEqual([]);
  });
  it("stores only valid UUID references and ignores malformed storage", () => {
    signIn(customerA);
    rememberBooking("not-an-id");
    expect(recentBookingIds()).toEqual([]);
    sessionStorage.setItem(
      `gobook.recentBookings.${customerA}`,
      JSON.stringify([booking, { amount: "100" }, "bad"]),
    );
    expect(recentBookingIds()).toEqual([booking]);
    sessionStorage.setItem(`gobook.recentBookings.${customerA}`, "broken");
    expect(recentBookingIds()).toEqual([]);
  });
  it("does not break successful booking actions when storage is blocked", () => {
    signIn(customerA);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded");
    });
    expect(() => rememberBooking(booking)).not.toThrow();
  });
});
